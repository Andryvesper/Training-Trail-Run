import { TrainingRacesService } from './training-races.js';

export async function initRacesModule(supabaseClient, userId) {
    const form = document.getElementById('race-form');
    const list = document.getElementById('races-list');
    const status = document.getElementById('races-status');
    const resultFields = document.getElementById('race-result-fields');
    const cancelButton = document.getElementById('race-cancel-edit');
    if (!form || !list || !status || !resultFields || !cancelButton) return;

    const racesService = new TrainingRacesService(supabaseClient);
    let races = [];
    let editingRaceId = null;
    const raceStatus = form.elements.namedItem('status');

    const showStatus = (message, kind) => {
        status.textContent = message;
        status.className = `rounded-xl border p-3 text-sm ${kind === 'error'
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            : kind === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-300'}`;
        status.classList.remove('hidden');
    };

    const render = () => {
        const hasResultDetails = [...resultFields.querySelectorAll('input')]
            .some(input => input.value.trim() !== '');
        resultFields.classList.toggle('hidden', raceStatus.value !== 'completed' && !hasResultDetails);
        cancelButton.classList.toggle('hidden', !editingRaceId);
        list.replaceChildren();

        if (!races.length) {
            list.append(makeElement('p', 'rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400',
                'Nessuna gara o risultato registrato.'));
            return;
        }

        races.forEach(race => list.append(renderRace(race)));
    };

    const resetForm = () => {
        form.reset();
        form.elements.namedItem('race_id').value = '';
        editingRaceId = null;
        render();
    };

    const fillForm = race => {
        editingRaceId = race.id;
        form.elements.namedItem('race_id').value = race.id;
        form.elements.namedItem('name').value = race.name;
        form.elements.namedItem('event_date').value = race.event_date || '';
        form.elements.namedItem('target_period').value = race.target_period || '';
        form.elements.namedItem('distance_km').value = race.distance_km;
        form.elements.namedItem('elevation_gain_m').value = race.elevation_gain_m ?? '';
        form.elements.namedItem('priority').value = race.priority ?? 2;
        form.elements.namedItem('goal').value = race.goal || '';
        raceStatus.value = race.status;
        form.elements.namedItem('official_time').value = formatDuration(race.official_time_seconds);
        form.elements.namedItem('chip_time').value = formatDuration(race.chip_time_seconds);
        form.elements.namedItem('overall_position').value = race.overall_position ?? '';
        form.elements.namedItem('gender_position').value = race.gender_position ?? '';
        form.elements.namedItem('category_position').value = race.category_position ?? '';
        form.elements.namedItem('category').value = race.category || '';
        form.elements.namedItem('bib_number').value = race.bib_number || '';
        form.elements.namedItem('result_source_url').value = race.result_source_url || '';
        render();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    try {
        races = await racesService.listRaces(userId);
        render();
    } catch (error) {
        console.error('Errore nel caricamento di gare e risultati:', error);
        showStatus(`Impossibile caricare gare e risultati: ${error.message}`, 'error');
    }

    raceStatus.addEventListener('change', render);
    cancelButton.addEventListener('click', resetForm);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(form);
        const race = Object.fromEntries(formData.entries());
        race.id = editingRaceId;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const saved = await racesService.saveRace(userId, race);
            races = editingRaceId
                ? races.map(item => item.id === saved.id ? saved : item)
                : [...races, saved];
            resetForm();
            showStatus('Gara salvata.', 'success');
            notifyRaceChanges(races);
        } catch (error) {
            console.error('Errore durante il salvataggio della gara:', error);
            showStatus(`Impossibile salvare la gara: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });

    list.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const race = races.find(item => item.id === button.dataset.raceId);
        if (!race) return;

        if (button.dataset.action === 'edit') {
            fillForm(race);
            return;
        }
        if (button.dataset.action !== 'delete'
            || !window.confirm(`Vuoi eliminare "${race.name}"?`)) return;

        button.disabled = true;
        try {
            await racesService.deleteRace(userId, race.id);
            races = races.filter(item => item.id !== race.id);
            render();
            showStatus('Gara eliminata.', 'success');
            notifyRaceChanges(races);
        } catch (error) {
            console.error('Errore durante l’eliminazione della gara:', error);
            showStatus(`Impossibile eliminare la gara: ${error.message}`, 'error');
            button.disabled = false;
        }
    });
}

function notifyRaceChanges(races) {
    document.dispatchEvent(new CustomEvent('training-races:changed', {
        detail: { races }
    }));
}

function renderRace(race) {
    const card = makeElement('article', 'space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5');
    const heading = makeElement('div', 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between');
    const information = makeElement('div', 'min-w-0 space-y-1');
    information.append(makeElement('h3', 'break-words text-base font-bold text-white', race.name));
    information.append(makeElement('p', 'text-sm text-slate-400',
        `${race.status === 'completed' ? 'Completata' : 'Obiettivo'} · Priorità ${race.priority} · ${formatRaceDate(race)} · ${race.distance_km} km`));
    heading.append(information);

    const actions = makeElement('div', 'flex shrink-0 gap-4');
    actions.append(actionButton('Modifica', 'edit', race.id, 'text-sm font-semibold text-emerald-300'));
    actions.append(actionButton('Elimina', 'delete', race.id, 'text-sm font-semibold text-rose-300'));
    heading.append(actions);
    card.append(heading);

    const details = [];
    if (race.elevation_gain_m !== null && race.elevation_gain_m !== '') details.push(`D+ ${race.elevation_gain_m} m`);
    if (race.status === 'completed') {
        if (race.chip_time_seconds) details.push(`Real time ${formatDuration(race.chip_time_seconds)}`);
        if (race.official_time_seconds) details.push(`Tempo ufficiale ${formatDuration(race.official_time_seconds)}`);
        if (race.overall_position) details.push(`${race.overall_position}° assoluto`);
        if (race.gender_position) details.push(`${race.gender_position}° di genere`);
        if (race.category_position) details.push(`${race.category_position}° ${race.category || 'di categoria'}`);
        if (race.bib_number) details.push(`Pettorale ${race.bib_number}`);
    }
    if (details.length) card.append(makeElement('p', 'text-sm text-slate-300', details.join(' · ')));
    if (race.goal) card.append(makeElement('p', 'whitespace-pre-wrap text-sm text-slate-400', race.goal));
    if (race.result_source_url) {
        const source = makeElement('a', 'text-sm text-emerald-300 underline underline-offset-2', 'Fonte del risultato');
        source.href = race.result_source_url;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        card.append(source);
    }
    return card;
}

function actionButton(label, action, raceId, className) {
    const button = makeElement('button', `min-h-11 ${className}`, label);
    button.type = 'button';
    button.dataset.action = action;
    button.dataset.raceId = raceId;
    return button;
}

function makeElement(tag, className, text = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

function formatRaceDate(race) {
    if (race.event_date) {
        return new Date(`${race.event_date}T12:00:00`).toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
    return race.target_period || 'Periodo da definire';
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = seconds % 60;
    return [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':');
}
