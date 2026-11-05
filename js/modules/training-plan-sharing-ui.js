import {
    TrainingPlanSharingService,
    formatPace,
    parsePace,
    scaleTrainingPace
} from './training-plan-sharing.js';

export async function initTrainingPlanSharingModule(supabaseClient, userId) {
    const container = document.getElementById('training-plan-sharing-container');
    if (!container) return;

    const service = new TrainingPlanSharingService(supabaseClient);
    const shareForm = container.querySelector('#training-plan-share-form');
    const importForm = container.querySelector('#training-plan-import-form');
    const revokeForm = container.querySelector('#training-plan-revoke-form');
    const status = container.querySelector('#training-plan-sharing-status');
    const created = container.querySelector('#training-plan-share-created');
    const preview = container.querySelector('#training-plan-share-preview');
    const sourcePaceInput = shareForm.elements.source_reference_pace;
    const targetPaceInput = importForm.elements.target_reference_pace;
    let activePreview = null;

    const today = formatDateKey(new Date());
    const inTwoWeeks = new Date();
    inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
    shareForm.elements.start_date.value = today;
    shareForm.elements.end_date.value = formatDateKey(inTwoWeeks);
    importForm.elements.new_start_date.value = today;

    shareForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submitButton = shareForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        created.replaceChildren();
        try {
            const sessions = await service.listSessions(
                userId,
                shareForm.elements.start_date.value,
                shareForm.elements.end_date.value
            );
            if (!sessions.length) throw new Error('Nessuna seduta trovata nell’intervallo selezionato.');
            const sourcePace = parsePace(sourcePaceInput.value);
            if (sessions.some(session => session.target_pace_seconds_per_km != null) && sourcePace === null) {
                throw new Error('Per condividere sedute con passi obiettivo, dichiara il tuo passo di riferimento.');
            }
            if (!window.confirm(`Condividere ${sessions.length} sedute comprese tra ${shareForm.elements.start_date.value} e ${shareForm.elements.end_date.value}? Chi riceve il codice potrà importarle fino alla scadenza.`)) {
                return;
            }
            const result = await service.createShare({
                title: shareForm.elements.title.value,
                sessionIds: sessions.map(session => session.id),
                expiresInDays: Number(shareForm.elements.expires_in_days.value),
                sourceReferencePace: sourcePace
            });
            renderCreatedShare(created, result);
            showStatus(status, `Condivisione creata per ${result.session_count} sedute.`, 'success');
        } catch (error) {
            console.error('Errore durante la creazione della condivisione del programma:', error);
            showStatus(status, `Impossibile creare la condivisione: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });

    importForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submitButton = importForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        activePreview = null;
        preview.replaceChildren();
        try {
            const result = await service.previewShare(importForm.elements.share_code.value);
            activePreview = {
                code: importForm.elements.share_code.value.trim(),
                data: result
            };
            const hasReferencePace = result.source_reference_pace_seconds_per_km != null;
            targetPaceInput.required = false;
            targetPaceInput.disabled = !hasReferencePace;
            renderSharePreview(preview, result, hasReferencePace, importForm.elements.new_start_date.value, targetPaceInput.value);
            showStatus(status, 'Anteprima caricata. Verifica le sedute e conferma solo se vuoi importarle.', 'info');
        } catch (error) {
            console.error('Errore durante il caricamento dell’anteprima del programma:', error);
            showStatus(status, `Impossibile caricare l’anteprima: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });

    importForm.addEventListener('input', event => {
        if (event.target.name === 'share_code') {
            activePreview = null;
            preview.replaceChildren();
        } else if (activePreview && ['new_start_date', 'target_reference_pace'].includes(event.target.name)) {
            renderSharePreview(
                preview,
                activePreview.data,
                activePreview.data.source_reference_pace_seconds_per_km != null,
                importForm.elements.new_start_date.value,
                targetPaceInput.value
            );
        }
    });

    revokeForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submitButton = revokeForm.querySelector('button[type="submit"]');
        if (!window.confirm('Revocare il codice? Non sarà più possibile visualizzare o importare il programma con questa condivisione.')) return;
        submitButton.disabled = true;
        try {
            await service.revokeShare(revokeForm.elements.share_code.value);
            showStatus(status, 'Condivisione revocata.', 'success');
            revokeForm.reset();
        } catch (error) {
            console.error('Errore durante la revoca della condivisione:', error);
            showStatus(status, `Impossibile revocare la condivisione: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });

    preview.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action="import-share"]');
        if (!button) return;
        if (!activePreview || activePreview.code !== importForm.elements.share_code.value.trim()) {
            showStatus(status, 'Ricarica l’anteprima prima di importare.', 'error');
            return;
        }
        const confirmation = preview.querySelector('[name="confirm-import"]');
        if (!confirmation?.checked) {
            showStatus(status, 'Conferma di aver verificato il programma prima di importarlo.', 'error');
            return;
        }
        button.disabled = true;
        try {
            const targetPace = targetPaceInput.disabled ? null : parsePace(targetPaceInput.value);
            if (activePreview.data.source_reference_pace_seconds_per_km != null && targetPace === null) {
                throw new Error('Inserisci il tuo passo di riferimento per adattare i passi obiettivo.');
            }
            const mappedDates = activePreview.data.sessions.map(session => shiftDate(
                session.scheduled_date,
                activePreview.data.first_date || activePreview.data.sessions
                    .map(item => item.scheduled_date)
                    .sort()[0],
                importForm.elements.new_start_date.value
            ));
            const sortedMappedDates = mappedDates.slice().sort();
            const firstMappedDate = sortedMappedDates[0];
            const lastMappedDate = sortedMappedDates[sortedMappedDates.length - 1];
            const existingSessions = await service.listSessions(userId, firstMappedDate, lastMappedDate);
            const overlappingDates = [...new Set(existingSessions
                .map(session => session.scheduled_date)
                .filter(date => mappedDates.includes(date)))];
            const confirmOverlaps = overlappingDates.length > 0;
            if (confirmOverlaps && !window.confirm(
                `Hai già sedute nel calendario il ${overlappingDates.join(', ')}. Vuoi aggiungere comunque la copia senza spostarle o sovrascriverle?`
            )) {
                showStatus(status, 'Importazione annullata: le sedute esistenti non sono state modificate.', 'info');
                button.disabled = false;
                return;
            }
            const result = await service.importShare({
                shareCode: activePreview.code,
                newStartDate: importForm.elements.new_start_date.value,
                targetReferencePace: targetPace,
                confirmOverlaps
            });
            activePreview = null;
            preview.replaceChildren();
            importForm.reset();
            targetPaceInput.disabled = true;
            showStatus(status, `Importate ${result.session_count} sedute nel tuo calendario. Verifica carichi e ritmi prima di seguirle.`, 'success');
        } catch (error) {
            console.error('Errore durante l’importazione del programma condiviso:', error);
            showStatus(status, `Impossibile importare il programma: ${error.message}`, 'error');
            button.disabled = false;
        }
    });
}

function renderCreatedShare(container, result) {
    const wrapper = createElement('div', 'space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3');
    wrapper.append(createElement('p', 'text-sm font-semibold text-emerald-200', `Codice: ${result.share_code}`));
    wrapper.append(createElement('p', 'text-xs text-slate-400', `Scade il ${new Date(result.expires_at).toLocaleString('it-IT')}. Comunicalo solo alla persona che deve ricevere il programma.`));
    const actions = createElement('div', 'flex flex-wrap gap-2');
    const copy = createElement('button', 'min-h-11 rounded-xl border border-slate-700 px-3 text-sm text-slate-200', 'Copia codice');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(result.share_code);
            copy.textContent = 'Codice copiato';
        } catch (error) {
            console.error('Errore durante la copia del codice di condivisione:', error);
            copy.textContent = 'Copia non riuscita';
        }
    });
    const useForRevoke = createElement('button', 'min-h-11 rounded-xl border border-slate-700 px-3 text-sm text-slate-200', 'Prepara revoca');
    useForRevoke.type = 'button';
    useForRevoke.addEventListener('click', () => {
        const revokeInput = document.querySelector('#training-plan-revoke-form [name="share_code"]');
        revokeInput.value = result.share_code;
        revokeInput.focus();
    });
    actions.append(copy, useForRevoke);
    wrapper.append(actions);
    container.replaceChildren(wrapper);
}

function renderSharePreview(container, result, hasReferencePace, newStartDate, targetReferencePaceInput) {
    const wrapper = createElement('div', 'space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-3');
    wrapper.append(createElement('p', 'text-sm font-semibold text-white', `${result.title} · ${result.session_count} sedute`));
    if (result.source_reference_pace_seconds_per_km != null) {
        wrapper.append(createElement(
            'p',
            'text-xs text-slate-400',
            `Passo di riferimento dichiarato dall’atleta: ${formatPace(result.source_reference_pace_seconds_per_km)} min/km. L’adattamento è proporzionale e va verificato, non è una prescrizione sportiva validata.`
        ));
    } else {
        wrapper.append(createElement('p', 'text-xs text-amber-200', 'Il programma non include un passo di riferimento: le sedute saranno copiate senza adattamento dei ritmi.'));
    }

    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    const targetReferencePace = tryParsePace(targetReferencePaceInput);
    const sourceReferencePace = result.source_reference_pace_seconds_per_km;
    const firstSourceDate = result.first_date
        || sessions.map(session => session.scheduled_date).sort()[0];
    const list = createElement('ol', 'max-h-64 space-y-2 overflow-y-auto');
    sessions.forEach(session => {
        const sourcePace = session.target_pace_seconds_per_km;
        const adaptedPace = sourcePace != null
            && sourceReferencePace != null
            && targetReferencePace != null
            ? scaleTrainingPace(sourcePace, sourceReferencePace, targetReferencePace)
            : null;
        const pace = sourcePace == null
            ? ''
            : adaptedPace == null
                ? ` · ${formatPace(sourcePace)} min/km`
                : ` · ${formatPace(sourcePace)} → ${formatPace(adaptedPace)} min/km`;
        const details = [
            shiftDate(session.scheduled_date, firstSourceDate, newStartDate),
            session.distance_km == null ? null : `${session.distance_km} km`,
            session.duration_minutes == null ? null : `${session.duration_minutes} min`
        ].filter(Boolean).join(' · ');
        list.append(createElement(
            'li',
            'rounded-lg border border-slate-800 p-2 text-xs text-slate-300',
            `${details} · ${session.title}${pace}`
        ));
    });
    wrapper.append(list);

    const confirmation = createElement('label', 'flex items-start gap-2 text-xs text-slate-300');
    const checkbox = createElement('input', 'mt-0.5 h-4 w-4 accent-emerald-500');
    checkbox.type = 'checkbox';
    checkbox.name = 'confirm-import';
    confirmation.append(checkbox, document.createTextNode('Ho verificato le sedute e desidero aggiungerne una copia al mio calendario.'));
    wrapper.append(confirmation);
    const button = createElement('button', 'min-h-11 w-full rounded-xl bg-emerald-500 px-3 text-sm font-bold text-slate-950', 'Conferma importazione');
    button.type = 'button';
    button.dataset.action = 'import-share';
    wrapper.append(button);
    if (hasReferencePace) {
        wrapper.append(createElement('p', 'text-xs text-amber-200', 'L’importazione non sostituisce una valutazione individuale: controlla la progressione, il recupero e ogni passo adattato.'));
    }
    container.replaceChildren(wrapper);
}

function tryParsePace(value) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) return null;
    const pace = Number(match[1]) * 60 + Number(match[2]);
    return pace >= 120 && pace <= 1800 ? pace : null;
}

function shiftDate(dateKey, firstDateKey, newFirstDateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')
        || !/^\d{4}-\d{2}-\d{2}$/.test(firstDateKey || '')
        || !/^\d{4}-\d{2}-\d{2}$/.test(newFirstDateKey || '')) {
        return dateKey || '';
    }
    const date = new Date(`${dateKey}T00:00:00Z`);
    const first = new Date(`${firstDateKey}T00:00:00Z`);
    const newFirst = new Date(`${newFirstDateKey}T00:00:00Z`);
    const offsetDays = Math.round((date - first) / 86400000);
    newFirst.setUTCDate(newFirst.getUTCDate() + offsetDays);
    return newFirst.toISOString().slice(0, 10);
}

function showStatus(status, message, state) {
    const classes = {
        error: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
        info: 'border-slate-700 bg-slate-950 text-slate-300',
        success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    };
    status.textContent = message;
    status.className = `rounded-xl border p-3 text-sm ${classes[state]}`;
}

function createElement(tag, className, text = '') {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
