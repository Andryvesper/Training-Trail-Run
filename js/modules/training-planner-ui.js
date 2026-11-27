import {
    assessTrainingMethodology,
    TRAINING_METHOD_SOURCE_EXAMPLES
} from './training-methodology-rules.js';
import {
    TrainingPlannerService,
    applyIntermediateRaces,
    explainMissingProgram,
    getPlanningReadiness,
    getReferenceTestProposal,
    getTenKmPrototypeReadiness,
    localDateKey
} from './training-planner.js';
import { TrainingRacesService } from './training-races.js';
import { formatPace } from './training-reference-pace.js';
import { resolveExtraSession } from './training-cycle-engine.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
    mon: 'Lunedì',
    tue: 'Martedì',
    wed: 'Mercoledì',
    thu: 'Giovedì',
    fri: 'Venerdì',
    sat: 'Sabato',
    sun: 'Domenica'
};

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
    const otherSportsList = document.getElementById('planner-other-sports-list');
    const addOtherSportButton = document.getElementById('planner-add-other-sport');
    const referenceTestPanel = document.getElementById('planner-reference-test');
    if (!form || !status || !readinessMessage || !methodologyPreview || !createDraftButton
        || !raceSelect || !secondaryRaceContainer || !draftsList
        || !otherSportsList || !addOtherSportButton) return;

    const plannerService = new TrainingPlannerService(supabaseClient);
    const racesService = new TrainingRacesService(supabaseClient);
    let races = [];
    renderOtherSportRows(otherSportsList, []);

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
            renderOtherSportRows(otherSportsList, savedProfile.questionnaire.weekly_other_sports || []);
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
    updatePeakWeekControls(form);

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
    draftsList.addEventListener('click', async event => {
        const missedButton = event.target.closest('button[data-action="missed-week-preview"], button[data-action="missed-week-apply"]');
        if (missedButton) {
            await handleMissedWeek(missedButton);
            return;
        }
        const button = event.target.closest('button[data-action="apply-draft"]');
        if (!button) return;
        const card = button.closest('[data-draft-id]');
        const draft = DRAFTS_BY_ID.get(card?.dataset.draftId);
        if (!draft) return;
        const confirmation = card.querySelector('input[name="confirm_draft"]');
        if (!confirmation?.checked) {
            showStatus(status, 'Spunta la conferma per scrivere le sedute nel calendario.', 'error');
            return;
        }
        button.disabled = true;
        try {
            let generated = draft.profile_snapshot.generated_draft;
            // Gare intermedie: solo quelle spuntate dall'atleta.
            const chosenRaces = [...card.querySelectorAll('input[name="apply_intermediate_race"]:checked')]
                .map(input => (generated.intermediateRaceProposals || [])[Number(input.value)])
                .filter(Boolean);
            if (chosenRaces.length) generated = applyIntermediateRaces(generated, chosenRaces);
            card.querySelectorAll('[data-extra-week]').forEach(row => {
                generated = resolveExtraSession(generated, Number(row.dataset.extraWeek), {
                    kind: row.querySelector('select').value,
                    description: row.querySelector('input').value
                });
            });
            const result = await plannerService.applyDraftToCalendar(
                userId,
                { ...draft, profile_snapshot: { ...draft.profile_snapshot, generated_draft: generated } },
                { confirmed: true }
            );
            document.dispatchEvent(new CustomEvent('training-sessions:changed'));
            const overlap = result.overlapping_dates.length
                ? ` Nelle date ${result.overlapping_dates.join(', ')} c'erano già sedute: non sono state modificate.`
                : '';
            showStatus(status, `Scritte ${result.session_count} sedute nel calendario.${overlap}`, 'success');
            renderDrafts(draftsList, await plannerService.listDraftRequests(userId));
        } catch (error) {
            console.error('Errore nella conferma della bozza:', error);
            showStatus(status, `Impossibile confermare la bozza: ${error.message}`, 'error');
            button.disabled = false;
        }
    });
    async function handleMissedWeek(button) {
        const card = button.closest('[data-draft-id]');
        const draft = DRAFTS_BY_ID.get(card?.dataset.draftId);
        const generated = draft?.profile_snapshot?.generated_draft;
        const output = card?.querySelector('[data-missed-week-output]');
        if (!generated || !output) return;
        button.disabled = true;
        try {
            if (button.dataset.action === 'missed-week-preview') {
                const weekNumber = Number(card.querySelector('select[name="missed_week"]').value);
                const preview = await plannerService.previewMissedWeek(userId, generated, weekNumber);
                MISSED_WEEK_PREVIEWS.set(draft.id, preview);
                renderMissedWeekPreview(output, preview);
            } else {
                const preview = MISSED_WEEK_PREVIEWS.get(draft.id);
                const selectedWeek = Number(card.querySelector('select[name="missed_week"]').value);
                if (preview && preview.week_number !== selectedWeek) {
                    MISSED_WEEK_PREVIEWS.delete(draft.id);
                    output.replaceChildren();
                    showStatus(status, 'La settimana selezionata è cambiata: genera di nuovo l\'anteprima.', 'error');
                    return;
                }
                const confirmation = card.querySelector('input[name="confirm_missed_week"]');
                if (!preview || !confirmation?.checked) {
                    showStatus(status, 'Spunta la conferma per aggiornare le sedute future.', 'error');
                    return;
                }
                const result = await plannerService.applyMissedWeek(userId, preview, { confirmed: true });
                MISSED_WEEK_PREVIEWS.delete(draft.id);
                output.replaceChildren(makeElement('p', 'text-xs text-emerald-300', `Aggiornate ${result.updated_count} sedute future.`));
                document.dispatchEvent(new CustomEvent('training-sessions:changed'));
                showStatus(status, `Settimana saltata registrata: aggiornate ${result.updated_count} sedute.`, 'success');
            }
        } catch (error) {
            console.error('Errore nella gestione della settimana saltata:', error);
            showStatus(status, error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    methodologyPreview.addEventListener('click', event => {
        const button = event.target.closest('button[data-action="use-recommendation"]');
        if (!button) return;
        const select = form.elements.namedItem('preferred_cycle_method');
        if (!select) return;
        select.value = button.dataset.method;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    referenceTestPanel?.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        if (button.dataset.action === 'test-done-today') {
            const protocol = referenceTestPanel.querySelector('select[name="reference_test_proposal_protocol"]')?.value;
            form.elements.namedItem('reference_test_protocol').value = protocol || 'three_km_plus_10';
            form.elements.namedItem('reference_test_date').value = localDateKey();
            const time = form.elements.namedItem('reference_test_time');
            time.focus();
            form.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (button.dataset.action !== 'add-reference-test') return;
        button.disabled = true;
        try {
            const protocol = referenceTestPanel.querySelector('select[name="reference_test_proposal_protocol"]')?.value;
            const proposal = getReferenceTestProposal(collectForm(form), races, { protocol });
            if (!proposal) throw new Error('Il test VR non è più necessario per il metodo scelto.');
            await plannerService.addReferenceTestToCalendar(userId, proposal);
            document.dispatchEvent(new CustomEvent('training-sessions:changed'));
            showStatus(status, `Test VR aggiunto al calendario il ${proposal.proposedDate}. Dopo il test inserisci qui il tempo.`, 'success');
        } catch (error) {
            console.error('Errore nell’aggiunta del test VR:', error);
            showStatus(status, `Impossibile aggiungere il test: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    });

    addOtherSportButton.addEventListener('click', () => {
        const sessions = collectOtherSportRows(otherSportsList);
        sessions.push({});
        renderOtherSportRows(otherSportsList, sessions);
        updateReadiness();
    });
    form.addEventListener('input', () => {
        updatePeakWeekControls(form);
        updateReadiness();
    });
    form.addEventListener('change', event => {
        updatePeakWeekControls(form);
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
                showStatus(status, draft.status === 'draft_generated'
                    ? 'Bozza generata: rivedila qui sotto e confermala per scriverla nel calendario.'
                    : 'Richiesta salvata, ma il programma non è stato generato: leggi sotto il motivo nella richiesta.', draft.status === 'draft_generated' ? 'success' : 'error');
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
            renderReferenceTestPanel(referenceTestPanel, profile, races);
            createDraftButton.disabled = !readiness.ready;
            if (readiness.ready) {
                readinessMessage.className = 'rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200';
                readinessMessage.textContent = `Dati minimi presenti. Settimana tipo: ${readiness.profile.target_running_sessions_per_week} corse${readiness.profile.peak_week_proposal_mode === 'suggest_with_reason'
                    ? `; settimane candidate fino a ${readiness.profile.peak_week_max_running_sessions} corse`
                    : ''}; altri sport: ${readiness.profile.weekly_other_sports.length} sedute. Puoi salvare una richiesta di bozza; il piano non verrà generato né attivato in questa fase.`;
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
            if (referenceTestPanel) referenceTestPanel.classList.add('hidden');
            renderMethodologyError(methodologyPreview, error);
            readinessMessage.className = 'rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200';
            readinessMessage.textContent = error.message;
        }
    }
}

function updatePeakWeekControls(form) {
    const frequency = form.elements.namedItem('target_running_sessions_per_week');
    const fiveOption = form.elements.namedItem('five_session_option');
    if (frequency && fiveOption) {
        fiveOption.disabled = frequency.value !== '5';
        if (fiveOption.disabled) fiveOption.value = '';
    }
    const mode = form.elements.namedItem('peak_week_proposal_mode');
    const maxSessions = form.elements.namedItem('peak_week_max_running_sessions');
    if (!mode || !maxSessions) return;
    const proposalsEnabled = mode.value === 'suggest_with_reason';
    maxSessions.disabled = !proposalsEnabled;
    if (!proposalsEnabled) maxSessions.value = '';
}

function renderOtherSportRows(container, sessions) {
    container.replaceChildren();
    if (!sessions.length) {
        container.append(makeElement('p', 'text-xs text-slate-500', 'Nessuna seduta di altri sport indicata.'));
        return;
    }

    sessions.forEach(session => {
        const row = makeElement('div', 'grid grid-cols-1 gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:grid-cols-2');
        row.dataset.otherSportRow = 'true';
        const sport = createSelectField('Sport', 'other-sport', [
            ['', 'Seleziona'],
            ['swimming', 'Nuoto'],
            ['cycling', 'Ciclismo'],
            ['strength', 'Forza / palestra'],
            ['other', 'Altro']
        ], session.sport || '');
        const customSport = makeElement('input', 'min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200');
        customSport.dataset.otherSportField = 'custom_sport';
        customSport.type = 'text';
        customSport.maxLength = 60;
        customSport.placeholder = 'Specifica lo sport';
        customSport.value = session.custom_sport || '';
        const customSportLabel = makeElement('label', 'space-y-1 text-xs text-slate-400');
        customSportLabel.append(makeElement('span', 'block', 'Nome dello sport'));
        customSportLabel.append(customSport);
        customSportLabel.hidden = sport.value !== 'other';
        sport.addEventListener('change', () => {
            customSportLabel.hidden = sport.value !== 'other';
            if (sport.value !== 'other') customSport.value = '';
        });

        const day = createSelectField('Giorno', 'day', [
            ['', 'Seleziona'],
            ...DAYS.map(dayKey => [dayKey, DAY_LABELS[dayKey]])
        ], session.day || '');
        const durationLabel = makeElement('label', 'space-y-1 text-xs text-slate-400');
        durationLabel.append(makeElement('span', 'block', 'Durata (minuti)'));
        const duration = makeElement('input', 'min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200');
        duration.dataset.otherSportField = 'duration_minutes';
        duration.type = 'number';
        duration.min = '10';
        duration.max = '1440';
        duration.step = '5';
        duration.value = session.duration_minutes ?? '';
        durationLabel.append(duration);

        const schedule = createSelectField('Flessibilità', 'schedule_type', [
            ['', 'Seleziona'],
            ['fixed', 'Giorno fisso'],
            ['movable', 'Spostabile']
        ], session.schedule_type || '');
        const remove = makeElement('button', 'min-h-10 self-end rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800', 'Rimuovi');
        remove.type = 'button';
        remove.addEventListener('click', () => {
            row.remove();
            if (!container.querySelector('[data-other-sport-row]')) {
                container.append(makeElement('p', 'text-xs text-slate-500', 'Nessuna seduta di altri sport indicata.'));
            }
            container.dispatchEvent(new Event('input', { bubbles: true }));
        });

        row.append(sport.parentElement, customSportLabel, day.parentElement, durationLabel, schedule.parentElement, remove);
        container.append(row);
    });
}

function createSelectField(labelText, field, options, value) {
    const label = makeElement('label', 'space-y-1 text-xs text-slate-400');
    label.append(makeElement('span', 'block', labelText));
    const select = makeElement('select', 'min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200');
    select.dataset.otherSportField = field;
    options.forEach(([optionValue, text]) => {
        const option = makeElement('option', '', text);
        option.value = optionValue;
        select.append(option);
    });
    select.value = value;
    label.append(select);
    return select;
}

function collectOtherSportRows(container) {
    return [...container.querySelectorAll('[data-other-sport-row="true"]')].map(row => {
        const getValue = field => row.querySelector(`[data-other-sport-field="${field}"]`).value;
        return {
            sport: getValue('other-sport'),
            custom_sport: getValue('custom_sport'),
            day: getValue('day'),
            duration_minutes: getValue('duration_minutes'),
            schedule_type: getValue('schedule_type')
        };
    });
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
    container.append(makeElement(
        'p',
        'text-xs text-slate-400',
        `Stato pipeline: ${getRulePipelineLabel(assessment.status)}. Regole pronte: ${assessment.ready_pattern_ids.length}.`
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

    if (assessment.blockers.length) {
        const blockers = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-amber-200');
        assessment.blockers.forEach(blocker => blockers.append(makeElement('li', '', blocker)));
        container.append(blockers);
    }

    // Suggerimento tabella 10 evoluti / 11 (regola derivata): proposto, mai applicato.
    const recommendation = assessment.method_recommendation;
    if (recommendation && profile.preferred_cycle_method !== recommendation.preferred_cycle_method) {
        const box = makeElement('div', 'flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3');
        box.append(makeElement('p', 'flex-1 text-xs text-sky-100', recommendation.message));
        const button = makeElement('button', 'min-h-10 rounded-lg border border-sky-400/50 px-3 text-xs font-semibold text-sky-100 hover:bg-sky-500/10', 'Usa il suggerimento');
        button.type = 'button';
        button.dataset.action = 'use-recommendation';
        button.dataset.method = recommendation.preferred_cycle_method;
        box.append(button);
        container.append(box);
    }

    // Test VR scaduto o mancante: metodo alternativo già pronto, senza VR.
    const alternative = assessment.reference_test_alternative;
    const recommendationShown = recommendation && profile.preferred_cycle_method !== recommendation.preferred_cycle_method;
    if (alternative && !(recommendationShown && recommendation.preferred_cycle_method === alternative.preferred_cycle_method)) {
        const box = makeElement('div', 'flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3');
        box.append(makeElement('p', 'flex-1 text-xs text-sky-100', alternative.message));
        const button = makeElement('button', 'min-h-10 rounded-lg border border-sky-400/50 px-3 text-xs font-semibold text-sky-100 hover:bg-sky-500/10', 'Usa questo metodo');
        button.type = 'button';
        button.dataset.action = 'use-recommendation';
        button.dataset.method = alternative.preferred_cycle_method;
        box.append(button);
        container.append(box);
    }

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

function getRulePipelineLabel(status) {
    const labels = {
        awaiting_approved_rules: 'in attesa di regole approvate',
        awaiting_rule_contract: 'contratto delle regole incompleto',
        awaiting_required_inputs: 'input richiesti mancanti',
        rules_ready: 'regole pronte'
    };
    return labels[status] || 'stato non disponibile';
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

// Seduta di test VR pronta quando il metodo scelto la richiede.
function renderReferenceTestPanel(container, profile, races) {
    if (!container) return;
    const previous = container.querySelector('select[name="reference_test_proposal_protocol"]')?.value || null;
    let proposal = null;
    try {
        proposal = getReferenceTestProposal(profile, races, { protocol: previous });
    } catch {
        proposal = null;
    }
    if (!proposal) {
        container.classList.add('hidden');
        container.replaceChildren();
        return;
    }
    container.classList.remove('hidden');
    container.replaceChildren(makeElement('p', 'font-semibold text-sky-100', 'Test VR da fare'));
    container.append(makeElement('p', 'text-xs text-sky-200', proposal.reason));
    const label = makeElement('label', 'block space-y-1 text-xs text-slate-400');
    label.append(makeElement('span', 'block', 'Protocollo'));
    const select = makeElement('select', 'min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200');
    select.name = 'reference_test_proposal_protocol';
    [['three_km_plus_10', 'Test 3 km + 10%'], ['ten_km', 'Test 10 km']].forEach(([value, text]) => {
        const option = makeElement('option', '', text);
        option.value = value;
        select.append(option);
    });
    select.value = proposal.protocol;
    label.append(select);
    container.append(label);
    const list = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-slate-300');
    [proposal.warmup, proposal.description, proposal.cooldown, `Totale circa ${proposal.totalKm} km. Riscaldamento e defaticamento: indicazione generale, non dalla tabella.`]
        .forEach(item => list.append(makeElement('li', '', item)));
    container.append(list);
    container.append(makeElement('p', 'text-xs text-slate-300', proposal.proposedDate
        ? `Data proposta: ${formatDay(proposal.proposedDate)} (primo giorno disponibile per la corsa, senza sport fissi).`
        : 'Nessun giorno disponibile nelle prossime due settimane: rivedi la disponibilità.'));
    container.append(makeElement('p', 'text-xs text-slate-400', proposal.afterTest));
    const actions = makeElement('div', 'flex flex-wrap gap-2');
    const add = makeElement('button', 'min-h-10 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white disabled:opacity-40', 'Aggiungi il test al calendario');
    add.type = 'button';
    add.dataset.action = 'add-reference-test';
    add.disabled = !proposal.proposedDate;
    const done = makeElement('button', 'min-h-10 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800', 'Ho fatto il test oggi: inserisco il tempo');
    done.type = 'button';
    done.dataset.action = 'test-done-today';
    actions.append(add, done);
    container.append(actions);
}

function formatDay(dateKey) {
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
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
    if (example.structure.kind === 'distance_time_cycle_outline') {
        return `Tabella ${example.source.table}: ${example.structure.goalDistanceKm} km, ${example.structure.durationWeeks} settimane, ${example.structure.runningSessionsPerWeek} sedute/settimana. Sedute trascritte cella per cella e approvate dall’atleta.`;
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
        ten_km_breathing_cycle: 'Esempio ciclico 10 km, metodo respiratorio',
        ten_km_distance_time_cycle: 'Esempio ciclico 10 km, metodo distanza-tempo',
        half_marathon_distance_time_cycle: 'Esempio ciclico mezza maratona, metodo distanza-tempo',
        marathon_distance_time_cycle: 'Esempio ciclico maratona, metodo distanza-tempo',
        ultra_100km_evoluto: 'Ultra 100 km / ultratrail, tabella 10 evoluti (distanza-tempo)',
        ultra_100km_passatore: 'Ultra 100 km per amatori, tabella 11 (respiratorio, km)',
        ultra_pistoia_abetone: 'Pistoia-Abetone, tabella 12 (non approvata)',
        trail_15_50km: 'Trail 15-50 km, tabella 13 (respiratorio, km)'
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
    values.weekly_other_sports = collectOtherSportRows(document.getElementById('planner-other-sports-list'));
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
        const checkbox = makeElement('input', 'h-4 w-4 accent-brand-500');
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

const DRAFTS_BY_ID = new Map();

function renderDrafts(container, drafts) {
    container.replaceChildren();
    DRAFTS_BY_ID.clear();
    drafts.forEach(draft => DRAFTS_BY_ID.set(draft.id, draft));
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
        const generated = snapshot.generated_draft;
        if (draft.status === 'confirmed') {
            card.append(makeElement('p', 'text-xs text-emerald-300', 'Bozza confermata e scritta nel calendario.'));
            if (generated) renderMissedWeekControls(card, generated);
        } else if (draft.status === 'draft_generated' && generated) {
            renderGeneratedDraft(card, generated);
        } else {
            card.append(makeElement('p', 'text-xs text-amber-200', 'Programma non generato. Motivi:'));
            const reasons = explainMissingProgram(snapshot);
            const list = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-amber-100');
            reasons.forEach(reason => list.append(makeElement('li', '', reason)));
            card.append(list);
        }
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

const MISSED_WEEK_PREVIEWS = new Map();

// "Settimana saltata" per settimane passate o in corso di un piano applicato.
function renderMissedWeekControls(card, generated) {
    const today = localDateKey();
    const weeks = generated.weeks.filter(week => week.startDate <= today && week.weekNumber < generated.weeks.length);
    if (!weeks.length) return;
    const box = makeElement('div', 'space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3');
    box.append(makeElement('p', 'text-xs font-semibold text-slate-200', 'Settimana saltata'));
    box.append(makeElement('p', 'text-xs text-slate-400', 'Calcola un’anteprima: i km saltati non si recuperano, il lungo successivo cresce al massimo del 25% sull’ultimo lungo completato, la qualità resta; a meno di 3 settimane dalla gara lo scarico non cambia. Regola derivata, da confermare dall’atleta.'));
    const row = makeElement('div', 'flex flex-wrap gap-2');
    const select = makeElement('select', 'min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200');
    select.name = 'missed_week';
    weeks.forEach(week => {
        const option = makeElement('option', '', `Settimana ${week.weekNumber} (${week.startDate} → ${week.endDate})`);
        option.value = String(week.weekNumber);
        select.append(option);
    });
    select.value = String(weeks[weeks.length - 1].weekNumber);
    const button = makeElement('button', 'min-h-10 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800', 'Settimana saltata: anteprima');
    button.type = 'button';
    button.dataset.action = 'missed-week-preview';
    row.append(select, button);
    box.append(row);
    const output = makeElement('div', 'space-y-2');
    output.dataset.missedWeekOutput = 'true';
    box.append(output);
    card.append(box);
}

function renderMissedWeekPreview(output, preview) {
    output.replaceChildren();
    const notes = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-slate-300');
    preview.notes.forEach(note => notes.append(makeElement('li', '', note)));
    output.append(notes);
    if (!preview.changes.length) {
        output.append(makeElement('p', 'text-xs text-slate-400', 'Nessuna seduta futura da modificare.'));
        return;
    }
    const changes = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-amber-100');
    preview.changes.forEach(change => changes.append(makeElement(
        'li',
        '',
        `${change.scheduled_date} · ${change.title}: ${String(change.from_km).replace('.', ',')} → ${String(change.to_km).replace('.', ',')} km`
    )));
    output.append(changes);
    const confirmLabel = makeElement('label', 'flex items-start gap-2 text-xs text-slate-300');
    const checkbox = makeElement('input', 'mt-0.5');
    checkbox.type = 'checkbox';
    checkbox.name = 'confirm_missed_week';
    confirmLabel.append(checkbox, makeElement('span', '', 'Applica queste modifiche alle sedute future del calendario (regola derivata, da confermare).'));
    const apply = makeElement('button', 'min-h-10 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white', 'Conferma e aggiorna il calendario');
    apply.type = 'button';
    apply.dataset.action = 'missed-week-apply';
    output.append(confirmLabel, apply);
}

function renderGeneratedDraft(card, generated) {
    const sessionCount = generated.weeks.reduce((total, week) => total + week.sessions.length, 0);
    card.append(makeElement(
        'p',
        'text-xs text-sky-200',
        `Bozza generata dalla tabella ${generated.source.table}: ${generated.weeks.length} settimane, ${sessionCount} sedute dal ${generated.startDate} al ${generated.endDate}. Non è ancora nel calendario.`
    ));
    if (generated.intensity === 'breathing') {
        card.append(makeElement('p', 'text-xs text-slate-300', 'Tabella a ritmo respiratorio: km e sensazioni, senza passo al km; non serve il test VR.'));
    } else if (generated.intensity === 'breathing_vr') {
        card.append(makeElement('p', 'text-xs text-slate-300', 'Tabella a ritmo respiratorio con i passi dalla tua VR (test valido): il respiro resta il controllo.'));
    }
    (generated.derivedRules || []).forEach(rule => {
        card.append(makeElement('p', 'rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-100', `${rule.label}: ${rule.explanation}`));
    });
    const draftNotes = (generated.notes || []).filter(note => !(generated.derivedRules || []).some(rule => rule.explanation === note));
    if (draftNotes.length) {
        const list = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-slate-300');
        draftNotes.forEach(note => list.append(makeElement('li', '', note)));
        card.append(list);
    }
    renderIntermediateRaceProposals(card, generated);
    const notes = [...new Set(generated.weeks.flatMap(week => week.notes))];
    if (notes.length) {
        const list = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-slate-400');
        notes.forEach(note => list.append(makeElement('li', '', note)));
        card.append(list);
    }
    if (generated.issues.length) {
        const issues = makeElement('ul', 'list-disc space-y-1 pl-5 text-xs text-rose-300');
        generated.issues.forEach(issue => issues.append(makeElement('li', '', issue)));
        card.append(issues);
        return;
    }
    generated.weeks
        .filter(week => week.sessions.some(session => session.requiresSelection))
        .forEach(week => {
            const row = makeElement('div', 'flex flex-wrap gap-2 text-xs text-slate-300');
            row.dataset.extraWeek = String(week.weekNumber);
            row.append(makeElement('span', 'self-center', `Settimana ${week.weekNumber}: seduta extra`));
            const select = makeElement('select', 'min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200');
            [['quality', 'Qualità'], ['strength', 'Palestra']].forEach(([value, label]) => {
                const option = makeElement('option', '', label);
                option.value = value;
                select.append(option);
            });
            const input = makeElement('input', 'min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200');
            input.maxLength = 100;
            input.placeholder = 'Descrivi la seduta scelta';
            row.append(select, input);
            card.append(row);
        });
    const confirmLabel = makeElement('label', 'flex items-start gap-2 text-xs text-slate-300');
    const checkbox = makeElement('input', 'mt-0.5');
    checkbox.type = 'checkbox';
    checkbox.name = 'confirm_draft';
    confirmLabel.append(checkbox, makeElement('span', '', 'Ho rivisto la bozza e voglio scrivere queste sedute nel mio calendario. Le sedute già presenti non vengono modificate.'));
    const button = makeElement('button', 'min-h-11 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white', 'Conferma e scrivi nel calendario');
    button.type = 'button';
    button.dataset.action = 'apply-draft';
    card.append(confirmLabel, button);
}

// Gare secondarie nel periodo della bozza: una spunta per gara, non applicata
// di default (regola derivata, da confermare).
function renderIntermediateRaceProposals(card, generated) {
    const proposals = generated.intermediateRaceProposals || [];
    if (!proposals.length) return;
    const box = makeElement('div', 'space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3');
    box.append(makeElement('p', 'text-xs font-semibold text-amber-100', 'Gare intermedie nel periodo della bozza (regola derivata, da confermare)'));
    proposals.forEach((proposal, index) => {
        const label = makeElement('label', 'flex items-start gap-2 text-xs text-slate-200');
        const checkbox = makeElement('input', 'mt-0.5');
        checkbox.type = 'checkbox';
        checkbox.name = 'apply_intermediate_race';
        checkbox.value = String(index);
        label.append(checkbox, makeElement('span', '', `Applica: ${proposal.description}${proposal.week_number ? ` (settimana ${proposal.week_number})` : ''}`));
        box.append(label);
    });
    box.append(makeElement('p', 'text-xs text-slate-400', 'Senza spunta la gara resta solo un promemoria e la bozza segue la tabella.'));
    card.append(box);
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
