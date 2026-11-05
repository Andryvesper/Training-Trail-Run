import {
    assessTrainingMethodology,
    TRAINING_METHOD_SOURCE_EXAMPLES
} from './training-methodology-rules.js';
import {
    TrainingPlannerService,
    getPlanningReadiness,
    getTenKmPrototypeReadiness
} from './training-planner.js';
import { TrainingRacesService } from './training-races.js';
import { formatPace } from './training-reference-pace.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export async function initTrainingPlannerModule(supabaseClient, userId) {
    const form = document.getElementById('planner-form');
    const status = document.getElementById('planner-status');
    const readinessMessage = document.getElementById('planner-readiness');
    const methodologyPreview = document.getElementById('planner-methodology-preview');
    const referenceVrPreview = document.getElementById('planner-reference-vr');
    const createDraftButton = document.getElementById('planner-create-draft');
    const raceSelect = document.getElementById('planner-primary-race');
    const secondaryRaceContainer = document.getElementById('planner-secondary-races');
    const draftsList = document.getElementById('planner-drafts-list');
    if (!form || !status || !readinessMessage || !methodologyPreview || !createDraftButton
        || !raceSelect || !secondaryRaceContainer || !draftsList) return;

    const plannerService = new TrainingPlannerService(supabaseClient);
    const racesService = new TrainingRacesService(supabaseClient);
    let races = [];

    try {
        races = await racesService.listRaces(userId);
        renderRaceOptions(raceSelect, races);
        renderSecondaryRaceOptions(secondaryRaceContainer, races, [], raceSelect.value);
    } catch (error) {
        console.error('Errore nel caricamento delle gare per la pianificazione:', error);
        showStatus(status, `Impossibile caricare le gare: ${error.message}`, 'error');
    }

    try {
        const savedProfile = await plannerService.loadProfile(userId);
        if (savedProfile?.questionnaire) {
            preserveUnavailableRaceOption(raceSelect, savedProfile.questionnaire.primary_race_id);
            fillForm(form, savedProfile.questionnaire);
            renderSecondaryRaceOptions(
                secondaryRaceContainer,
                races,
                savedProfile.questionnaire.secondary_race_ids || [],
                savedProfile.questionnaire.secondary_race_intents || {},
                raceSelect.value
            );
        }
    } catch (error) {
        console.error('Errore nel caricamento del questionario di pianificazione:', error);
        showStatus(status, `Impossibile caricare il questionario: ${error.message}`, 'error');
    }

    try {
        renderDrafts(draftsList, await plannerService.listDraftRequests(userId));
    } catch (error) {
        console.error('Errore nel caricamento delle richieste di bozza:', error);
        draftsList.replaceChildren(makeElement(
            'p',
            'text-sm text-rose-300',
            `Impossibile caricare le richieste: ${error.message}`
        ));
    }

    form.querySelectorAll('input[name="available_days"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const minutesInput = form.querySelector(`[data-day-minutes="${checkbox.value}"]`);
            minutesInput.disabled = !checkbox.checked;
            if (!checkbox.checked) minutesInput.value = '';
            updateReadiness();
        });
    });
    form.addEventListener('input', updateReadiness);
    form.addEventListener('change', event => {
        if (event.target === raceSelect) {
            renderSecondaryRaceOptions(
                secondaryRaceContainer,
                races,
                collectForm(form).secondary_race_ids,
                collectForm(form).secondary_race_intents,
                raceSelect.value
            );
        }
        updateReadiness();
    });
    document.addEventListener('training-races:changed', async event => {
        try {
            const selectedRaceId = raceSelect.value;
            races = Array.isArray(event.detail?.races)
                ? event.detail.races
                : await racesService.listRaces(userId);
            renderRaceOptions(raceSelect, races, selectedRaceId);
            preserveUnavailableRaceOption(raceSelect, selectedRaceId);
            renderSecondaryRaceOptions(
                secondaryRaceContainer,
                races,
                collectForm(form).secondary_race_ids,
                collectForm(form).secondary_race_intents,
                selectedRaceId
            );
            updateReadiness();
        } catch (error) {
            console.error('Errore nell’aggiornamento delle gare del motore piani:', error);
            showStatus(status, `Impossibile aggiornare le gare: ${error.message}`, 'error');
        }
    });
    updateReadiness();

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const action = event.submitter?.value || 'save';
        const submitButtons = [...form.querySelectorAll('button[type="submit"]')];
        submitButtons.forEach(button => { button.disabled = true; });

        try {
            const profile = collectForm(form);
            await plannerService.saveProfile(userId, profile);
            if (action === 'draft') {
                const draft = await plannerService.createDraftRequest(userId, profile, races);
                showStatus(status, 'Richiesta di bozza salvata. Il piano non è attivo e non sono state create sedute.', 'success');
                const drafts = await plannerService.listDraftRequests(userId);
                renderDrafts(draftsList, drafts);
                draftsList.querySelector(`[data-draft-id="${CSS.escape(draft.id)}"]`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            } else {
                showStatus(status, 'Questionario salvato. Puoi riprendere la compilazione in seguito.', 'success');
            }
        } catch (error) {
            console.error('Errore nel salvataggio del questionario o della richiesta:', error);
            showStatus(status, error.message, 'error');
        } finally {
            submitButtons.forEach(button => { button.disabled = false; });
            updateReadiness();
        }
    });

    function updateReadiness() {
        try {
            const profile = collectForm(form);
            const readiness = getPlanningReadiness(profile, races);
            renderMethodologyPreview(methodologyPreview, profile, races);
            renderReferenceVrPreview(referenceVrPreview, readiness.profile);
            createDraftButton.disabled = !readiness.ready;
            if (readiness.ready) {
                readinessMessage.className = 'rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200';
                readinessMessage.textContent = 'Dati minimi presenti. Puoi salvare una richiesta di bozza; il piano non verrà generato né attivato in questa fase.';
            } else {
                readinessMessage.className = 'rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300';
                readinessMessage.replaceChildren(makeElement('p', 'font-semibold', 'Per preparare la richiesta manca:'));
                const list = makeElement('ul', 'mt-2 list-disc space-y-1 pl-5 text-slate-400');
                readiness.missing.forEach(item => list.append(makeElement('li', '', item)));
                readinessMessage.append(list);
            }
            if (readiness.warnings.length) {
                const warnings = makeElement('ul', 'mt-2 list-disc space-y-1 pl-5 text-amber-200');
                readiness.warnings.forEach(item => warnings.append(makeElement('li', '', item)));
                readinessMessage.append(warnings);
            }
        } catch (error) {
            createDraftButton.disabled = true;
            renderMethodologyError(methodologyPreview, error);
            readinessMessage.className = 'rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200';
            readinessMessage.textContent = error.message;
        }
    }
}

function renderMethodologyPreview(container, profile, races) {
    if (!container) return;
    container.replaceChildren(makeElement('p', 'font-semibold text-white', 'Stato delle regole metodologiche'));
    if (!profile.goal_mode) {
        container.append(makeElement('p', 'text-slate-400', 'Seleziona un obiettivo per vedere i riferimenti pertinenti.'));
        return;
    }

    const race = races.find(item => item.id === profile.primary_race_id && item.status === 'planned') || null;
    const assessment = assessTrainingMethodology(profile, race);
    const candidateCount = assessment.candidate_pattern_ids.length;
    const exampleCount = assessment.source_example_ids.length;
    const exampleLabel = exampleCount === 1 ? 'esempio fonte pertinente' : 'esempi fonte pertinenti';
    container.append(makeElement(
        'p',
        'text-slate-300',
        `${candidateCount} pattern candidati e ${exampleCount} ${exampleLabel} al contesto selezionato.`
    ));

    if (assessment.candidate_pattern_ids.length) {
        const list = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-slate-400');
        assessment.candidate_pattern_ids.forEach(id => {
            list.append(makeElement('li', '', getMethodRuleLabel(id)));
        });
        container.append(list);
    }

    const sourceExamples = TRAINING_METHOD_SOURCE_EXAMPLES.filter(example =>
        assessment.source_example_ids.includes(example.id)
    );
    sourceExamples.forEach(example => {
        const card = makeElement('article', 'space-y-1 rounded-lg border border-slate-800 bg-slate-900/70 p-3');
        card.append(makeElement('p', 'text-xs font-semibold text-slate-200', example.label));
        card.append(makeElement(
            'p',
            'text-xs text-slate-400',
            `Tipi che corrono, pp. ${example.source.printedPages} · scansione ${example.source.scanPages}`
        ));
        card.append(makeElement('p', 'text-xs text-slate-300', describeSourceExample(example)));
        card.append(makeElement(
            'p',
            'text-xs font-medium text-amber-200',
            'Esempio non personalizzato; non utilizzabile per creare sedute.'
        ));
        if (example.limitations?.length) {
            const limitations = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-amber-200');
            example.limitations.forEach(limitation => {
                limitations.append(makeElement('li', '', limitation));
            });
            card.append(limitations);
        }
        container.append(card);
    });

    container.append(makeElement(
        'p',
        'text-xs text-amber-200',
        'Generazione non disponibile: gli esempi sono consultivi e le regole non sono approvate per piani personalizzati.'
    ));

    if (profile.goal_mode === 'race' && Number(race?.distance_km) === 10) {
        const prototype = getTenKmPrototypeReadiness(profile, races);
        const gate = makeElement('aside', 'space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3');
        gate.append(makeElement('p', 'text-xs font-semibold text-amber-100', 'Prototipo 10 km: prerequisiti e blocchi attuali'));
        const list = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-amber-200');
        prototype.blockers.forEach(blocker => list.append(makeElement('li', '', blocker)));
        gate.append(list);
        container.append(gate);
    }
}

function renderReferenceVrPreview(container, profile) {
    if (!container) return;
    if (profile.reference_vr_seconds_per_km === null) {
        container.textContent = profile.reference_test_protocol
            ? 'VR non calcolata: il protocollo selezionato non è supportato per il calcolo automatico oppure manca il tempo misurato.'
            : 'La VR verrà calcolata solo da un protocollo supportato e dal suo tempo dichiarato.';
        return;
    }
    const protocol = profile.reference_test_protocol === 'three_km_plus_10'
        ? '3 km + 10%'
        : '10 km';
    const testDate = profile.reference_test_date
        ? ` del ${profile.reference_test_date}`
        : ' senza data registrata';
    container.textContent = `VR ricavata dal test ${protocol}${testDate}: ${formatPace(profile.reference_vr_seconds_per_km)} min/km. È un riferimento derivato dal risultato dichiarato, non una raccomandazione di passo né una verifica automatica del test.`;
}

function describeSourceExample(example) {
    if (example.id === 'bis_time_p175') {
        const blocks = example.structure.blocks
            .map(block => `${block.duration}′ ${block.effort}`)
            .join(' → ');
        return `${blocks} (${example.structure.totalDuration} minuti; riscaldamento separato).`;
    }
    if (example.id === 'ten_km_breathing_cycle_outline') {
        return `Tabella ${example.source.table}: ${example.structure.durationWeeks} settimane, ${example.structure.runningSessionsPerWeek} sedute/settimana; test di verifica alla settimana ${example.structure.referenceTestWeek} (protocollo non specificato nella tabella), gara alla settimana ${example.structure.raceWeek}; riscaldamento di riferimento pp. ${example.structure.warmup.sourcePrintedPages} (non prescritto come schema universale).`;
    }
    return 'Riferimento fonte catalogato; dettagli non disponibili.';
}

function renderMethodologyError(container, error) {
    if (!container) return;
    container.replaceChildren(
        makeElement('p', 'font-semibold text-white', 'Stato delle regole metodologiche'),
        makeElement('p', 'text-sm text-rose-300', error.message)
    );
}

function getMethodRuleLabel(id) {
    const labels = {
        easy_effort: 'Corsa facile o molto facile',
        rhythm_variation: 'Variazioni di ritmo (bis/tris)',
        steady_or_progressive: 'Medio o progressivo',
        long_run: 'Lungo o lunghissimo',
        trail_specificity: 'Specificità trail',
        recovery_and_cycle: 'Riposo, recupero e scarico',
        field_test_reference: 'Test di campo e riferimento di forma',
        ten_km_breathing_cycle: 'Esempio ciclico 10 km, metodo respiratorio'
    };
    return labels[id] || id;
}

function collectForm(form) {
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    values.preferred_terrains = formData.getAll('preferred_terrains');
    values.secondary_race_ids = formData.getAll('secondary_race_ids');
    values.secondary_race_intents = Object.fromEntries(values.secondary_race_ids.map(raceId => {
        const select = form.querySelector(`[name="secondary_race_intent_${CSS.escape(raceId)}"]`);
        return [raceId, select?.value || 'undecided'];
    }));
    values.weekly_availability = Object.fromEntries(DAYS.map(day => {
        const checkbox = form.querySelector(`input[name="available_days"][value="${day}"]`);
        const minutes = form.querySelector(`[data-day-minutes="${day}"]`);
        return [day, {
            available: checkbox.checked,
            max_minutes: checkbox.checked ? minutes.value : null
        }];
    }));
    return values;
}

function fillForm(form, profile) {
    for (const [name, value] of Object.entries(profile)) {
        const control = form.elements.namedItem(name);
        if (!control || Array.isArray(value) || typeof value === 'object' && value !== null) continue;
        control.value = value ?? '';
    }

    const terrains = new Set(profile.preferred_terrains || []);
    form.querySelectorAll('input[name="preferred_terrains"]').forEach(input => {
        input.checked = terrains.has(input.value);
    });

    for (const day of DAYS) {
        const availability = profile.weekly_availability?.[day] || {};
        const checkbox = form.querySelector(`input[name="available_days"][value="${day}"]`);
        const minutesInput = form.querySelector(`[data-day-minutes="${day}"]`);
        checkbox.checked = availability.available === true;
        minutesInput.disabled = !checkbox.checked;
        minutesInput.value = availability.max_minutes ?? '';
    }
}

function renderRaceOptions(select, races, selectedRaceId = select.value) {
    const placeholder = makeElement('option', '', races.length ? 'Nessuna gara selezionata' : 'Nessuna gara pianificata disponibile');
    placeholder.value = '';
    select.replaceChildren(placeholder);

    races.filter(race => race.status === 'planned').forEach(race => {
        const option = makeElement('option', '', `${race.name} · ${formatRaceDate(race)} · ${race.distance_km} km`);
        option.value = race.id;
        select.append(option);
    });
    if (selectedRaceId && [...select.options].some(option => option.value === selectedRaceId)) {
        select.value = selectedRaceId;
    }
}

function renderSecondaryRaceOptions(container, races, selectedRaceIds = [], selectedIntents = {}, primaryRaceId = '') {
    container.replaceChildren();
    const options = races.filter(race => race.status === 'planned' && race.id !== primaryRaceId);
    const optionIds = new Set(options.map(race => race.id));
    const unavailableIds = selectedRaceIds.filter(id => id !== primaryRaceId && !optionIds.has(id));
    if (!options.length && !unavailableIds.length) {
        container.append(makeElement('p', 'text-xs text-slate-500', 'Non ci sono altre gare pianificate da aggiungere.'));
        return;
    }

    const selected = new Set(selectedRaceIds);
    options.forEach(race => {
        const label = makeElement('label', 'flex min-h-11 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300');
        const checkbox = makeElement('input', 'h-4 w-4 accent-emerald-500');
        checkbox.type = 'checkbox';
        checkbox.name = 'secondary_race_ids';
        checkbox.value = race.id;
        checkbox.checked = selected.has(race.id);
        label.append(checkbox);
        label.append(makeElement('span', '', `${race.name} · ${formatRaceDate(race)} · ${race.distance_km} km · priorità ${race.priority}`));
        container.append(label);
        const intentLabel = makeElement('label', 'block space-y-1 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400');
        intentLabel.append(makeElement('span', 'block', 'Obiettivo per questa gara'));
        const intentSelect = makeElement('select', 'min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200');
        intentSelect.name = `secondary_race_intent_${race.id}`;
        [
            ['undecided', 'Da definire'],
            ['time_goal', 'Obiettivo di tempo'],
            ['controlled', 'Corsa controllata, senza tempo obiettivo'],
            ['social', 'Partecipazione senza obiettivo di prestazione']
        ].forEach(([value, text]) => {
            const option = makeElement('option', '', text);
            option.value = value;
            intentSelect.append(option);
        });
        intentSelect.value = selectedIntents[race.id] || 'undecided';
        intentLabel.append(intentSelect);
        container.append(intentLabel);
    });
    unavailableIds.forEach(id => {
        const label = makeElement('label', 'flex min-h-11 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200');
        const checkbox = makeElement('input', 'h-4 w-4 accent-amber-500');
        checkbox.type = 'checkbox';
        checkbox.name = 'secondary_race_ids';
        checkbox.value = id;
        checkbox.checked = true;
        label.append(checkbox);
        label.append(makeElement('span', '', 'Gara secondaria non più pianificata: deselezionala o aggiornala.'));
        container.append(label);
    });
}

function preserveUnavailableRaceOption(select, raceId) {
    if (!raceId || [...select.options].some(option => option.value === raceId)) return;
    const option = makeElement('option', '', 'Gara salvata non più disponibile: seleziona un obiettivo valido');
    option.value = raceId;
    select.append(option);
}

function renderDrafts(container, drafts) {
    container.replaceChildren();
    if (!drafts.length) {
        container.append(makeElement('p', 'text-sm text-slate-500', 'Non hai ancora salvato richieste di bozza.'));
        return;
    }

    drafts.forEach(draft => {
        const card = makeElement('article', 'space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3');
        card.dataset.draftId = draft.id;
        const snapshot = draft.profile_snapshot || {};
        const race = snapshot.primary_race;
        card.append(makeElement('h4', 'text-sm font-semibold text-white', getGoalLabel(draft.goal_mode, snapshot, race)));
        card.append(makeElement('p', 'text-xs text-amber-200', 'Richiesta salvata · in attesa di regole verificate · non attiva'));
        const methodologyAssessment = snapshot.methodology_assessment;
        const candidateCount = methodologyAssessment?.candidate_pattern_ids?.length;
        const sourceExampleCount = methodologyAssessment?.source_example_ids?.length;
        if (Number.isInteger(candidateCount) && Number.isInteger(sourceExampleCount)) {
            card.append(makeElement(
                'p',
                'text-xs text-slate-400',
                `${candidateCount} pattern pertinenti e ${sourceExampleCount} esempi fonte solo consultivi; nessuno genera sedute.`
            ));
        }
        card.append(makeElement('p', 'text-xs text-slate-500', `Salvata il ${formatDateTime(draft.created_at)}`));
        container.append(card);
    });
}

function getGoalLabel(goalMode, profile, race) {
    if (goalMode === 'race') return race ? `Preparazione: ${race.name}` : 'Preparazione gara';
    if (goalMode === 'improve') return `Miglioramento: ${profile.goal_focus || 'da definire'}`;
    if (goalMode === 'maintain') return 'Mantenimento della forma';
    return profile.goal_description || 'Altro obiettivo';
}

function formatRaceDate(race) {
    if (!race.event_date) return race.target_period || 'Periodo da definire';
    return new Date(`${race.event_date}T12:00:00`).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'data non disponibile';
    return date.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

function showStatus(element, message, kind) {
    element.textContent = message;
    element.className = `rounded-xl border p-3 text-sm ${kind === 'error'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`;
    element.classList.remove('hidden');
}

function makeElement(tag, className, text = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}
