import { TrainingCalendarService } from './calendar.js';
import { IntervalsService } from './intervals.js';
import { TrainingPlanService } from './training-plan.js';
import { formatPace, parsePace } from './training-plan-sharing.js';
import { initTrainingPlanSharingModule } from './training-plan-sharing-ui.js';
import { createActivitySnapshot, getMatchingSessions, normalizeActivityId } from './activity-matching.js';

const SESSION_TYPES = [
    ['run', 'Corsa'],
    ['trail', 'Trail'],
    ['swim', 'Nuoto'],
    ['strength', 'Forza'],
    ['recovery', 'Recupero'],
    ['other', 'Altro']
];

export async function initCalendarModule(supabaseClient, userId) {
    const container = document.getElementById('calendar-multi-container');
    if (!container) return;

    const planService = new TrainingPlanService(supabaseClient);
    const weeks = new TrainingCalendarService().generateMultiWeekPlan(new Date(), 1, 4);
    const weekLabel = document.getElementById('calendar-week-label');
    const previousButton = document.getElementById('calendar-prev-week');
    const nextButton = document.getElementById('calendar-next-week');
    const status = createStatusElement(container);
    container.setAttribute('aria-busy', 'true');
    container.append(createElement('p', 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400', 'Caricamento del tuo piano…'));
    let sessions = [];
    let editingSession = null;
    let pendingAssociation = null;
    let selectedWeekIndex = weeks.findIndex(week => week.isCurrent);

    try {
        sessions = await planService.listSessions(userId, weeks[0].startDate, weeks[weeks.length - 1].endDate);
    } catch (error) {
        console.error('Errore nel caricamento del piano di allenamento:', error);
        showStatus(status, `Impossibile caricare le sedute pianificate: ${error.message}`, 'error');
    }

    const render = () => {
        container.setAttribute('aria-busy', 'false');
        renderSelectedWeek(
            container,
            weeks,
            selectedWeekIndex,
            sessions,
            editingSession,
            pendingAssociation,
            weekLabel
        );
        previousButton.disabled = selectedWeekIndex === 0;
        nextButton.disabled = selectedWeekIndex === weeks.length - 1;
    };

    const refreshActivities = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;
            const athleteId = data?.intervals_id || data?.intervals_athlete_id;
            const apiKey = data?.intervals_key || data?.intervals_api_key;

            weeks.forEach(week => week.days.forEach(day => {
                day.intervalsActivities = [];
            }));

            if (!athleteId || !apiKey) {
                showStatus(status, 'Collega Intervals.icu per visualizzare le attività svolte. Il piano resta disponibile.', 'info');
                render();
                return;
            }

            const activities = await new IntervalsService(athleteId, apiKey)
                .getActivities(weeks[0].startDate, weeks[weeks.length - 1].endDate);
            activities.forEach(activity => {
                if (!activity.start_date_local) return;
                const date = activity.start_date_local.slice(0, 10);
                const day = weeks.flatMap(week => week.days).find(item => item.date === date);
                if (day) day.intervalsActivities.push(activity);
            });
            render();
        } catch (error) {
            console.error('Errore nel caricamento delle attività Intervals per il calendario:', error);
            showStatus(status, `Attività Intervals non disponibili: ${error.message}`, 'error');
            render();
        }
    };

    previousButton.addEventListener('click', () => {
        if (selectedWeekIndex === 0) return;
        selectedWeekIndex -= 1;
        editingSession = null;
        pendingAssociation = null;
        render();
    });
    nextButton.addEventListener('click', () => {
        if (selectedWeekIndex >= weeks.length - 1) return;
        selectedWeekIndex += 1;
        editingSession = null;
        pendingAssociation = null;
        render();
    });
    document.addEventListener('intervals:sync', refreshActivities);

    await refreshActivities();
    render();
    await initTrainingPlanSharingModule(supabaseClient, userId);

    container.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const { action, sessionId, date } = button.dataset;
        if (action === 'add-session') {
            editingSession = { scheduled_date: date };
            render();
        } else if (action === 'edit-session') {
            editingSession = sessions.find(session => session.id === sessionId) || null;
            render();
        } else if (action === 'cancel-edit') {
            editingSession = null;
            render();
        } else if (action === 'assess-activity') {
            const activity = weeks
                .flatMap(week => week.days)
                .flatMap(day => day.intervalsActivities)
                .find(item => normalizeActivityId(item.id) === button.dataset.activityId);
            const session = sessions.find(item => item.id === sessionId);
            if (!activity || !session) {
                showStatus(status, 'Attività o seduta non più disponibili. Aggiorna Intervals e riprova.', 'error');
                return;
            }
            pendingAssociation = {
                activityId: normalizeActivityId(activity.id),
                sessionId: session.id,
                score: session.adherence_score,
                isEditing: Boolean(session.intervals_activity_id)
            };
            render();
        } else if (action === 'cancel-association') {
            pendingAssociation = null;
            render();
        } else if (action === 'unlink-activity') {
            if (!window.confirm('Vuoi rimuovere l’associazione con questa attività?')) return;
            button.disabled = true;
            try {
                await planService.unlinkActivity(userId, sessionId);
                sessions = sessions.map(session => session.id === sessionId
                    ? {
                        ...session,
                        intervals_activity_id: null,
                        completed_at: null,
                        adherence_score: null,
                        completed_activity: null
                    }
                    : session);
                showStatus(status, 'Associazione rimossa. L’attività resta in Intervals.icu.', 'success');
                render();
            } catch (error) {
                console.error('Errore durante la rimozione dell’associazione:', error);
                showStatus(status, `Impossibile rimuovere l’associazione: ${error.message}`, 'error');
                button.disabled = false;
            }
        } else if (action === 'delete-session') {
            if (!window.confirm('Vuoi eliminare questa seduta pianificata?')) return;
            button.disabled = true;
            try {
                await planService.deleteSession(userId, sessionId);
                sessions = sessions.filter(session => session.id !== sessionId);
                showStatus(status, 'Seduta eliminata.', 'success');
                render();
            } catch (error) {
                console.error('Errore durante l’eliminazione della seduta:', error);
                showStatus(status, `Impossibile eliminare la seduta: ${error.message}`, 'error');
                button.disabled = false;
            }
        }
    });

    container.addEventListener('submit', async event => {
        const associationForm = event.target.closest('form[data-activity-association]');
        if (associationForm) {
            event.preventDefault();
            const formData = new FormData(associationForm);
            if (!pendingAssociation?.isEditing && formData.get('confirm-association') !== 'on') {
                showStatus(status, 'Conferma che l’attività corrisponde alla seduta prima di salvarla.', 'error');
                return;
            }
            const score = Number(formData.get('adherence_score'));
            const selectedSession = sessions.find(session => session.id === pendingAssociation?.sessionId);
            const selectedActivity = weeks
                .flatMap(week => week.days)
                .flatMap(day => day.intervalsActivities)
                .find(activity => normalizeActivityId(activity.id) === pendingAssociation?.activityId);
            if (!selectedSession || !selectedActivity) {
                pendingAssociation = null;
                showStatus(status, 'Attività o seduta non più disponibili. Aggiorna i dati e riprova.', 'error');
                render();
                return;
            }

            const submitButton = associationForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            try {
                const snapshot = createActivitySnapshot(selectedActivity);
                const savedSession = await planService.confirmActivity(
                    userId,
                    selectedSession.id,
                    snapshot,
                    score
                );
                sessions = sessions.map(session => session.id === savedSession.id ? savedSession : session);
                pendingAssociation = null;
                showStatus(status, 'Attività associata e valutazione salvate.', 'success');
                render();
            } catch (error) {
                console.error('Errore durante il salvataggio dell’attività svolta:', error);
                showStatus(status, `Impossibile salvare l’attività: ${error.message}`, 'error');
                submitButton.disabled = false;
            }
            return;
        }

        const form = event.target.closest('form[data-session-form]');
        if (!form) return;
        event.preventDefault();

        const formData = new FormData(form);
        let targetPace;
        try {
            targetPace = parsePace(formData.get('target_pace'));
        } catch (error) {
            showStatus(status, error.message, 'error');
            return;
        }
        const date = form.dataset.date;
        const existing = editingSession?.id
            ? sessions.find(session => session.id === editingSession.id)
            : null;
        const sessionOrder = existing?.session_order || (
            sessions
                .filter(session => session.scheduled_date === date)
                .reduce((maximum, session) => Math.max(maximum, session.session_order), 0) + 1
        );
        const session = {
            id: existing?.id,
            scheduled_date: date,
            session_order: sessionOrder,
            title: formData.get('title'),
            sport_type: formData.get('sport_type'),
            distance_km: formData.get('distance_km'),
            duration_minutes: formData.get('duration_minutes'),
            target_pace_seconds_per_km: targetPace,
            notes: formData.get('notes')
        };
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const savedSession = await planService.saveSession(userId, session);
            sessions = existing
                ? sessions.map(item => item.id === savedSession.id ? savedSession : item)
                : [...sessions, savedSession];
            editingSession = null;
            showStatus(status, 'Seduta salvata nel piano.', 'success');
            render();
        } catch (error) {
            console.error('Errore durante il salvataggio della seduta:', error);
            showStatus(status, `Impossibile salvare la seduta: ${error.message}`, 'error');
            submitButton.disabled = false;
        }
    });
}

function renderSelectedWeek(container, weeks, weekIndex, sessions, editingSession, pendingAssociation, weekLabel) {
    container.replaceChildren();
    const week = weeks[weekIndex];
    weekLabel.textContent = `${formatDateIt(week.startDate)} – ${formatDateIt(week.endDate)}${week.isCurrent ? ' · Questa settimana' : ''}`;

    const daysGrid = createElement('div', 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3');
    week.days.forEach(day => {
        day.plannedSessions = sessions.filter(session => session.scheduled_date === day.date);
        daysGrid.append(renderDayCard(day, editingSession, pendingAssociation, sessions));
    });
    const weekSection = createElement('section', 'calendar-week', '');
    weekSection.append(daysGrid);
    container.append(weekSection);
}

function renderDayCard(day, editingSession, pendingAssociation, allSessions) {
    const isToday = day.date === formatDateKey(new Date());
    const card = createElement(
        'article',
        `day-card border ${isToday ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-slate-800 bg-slate-900/70'} rounded-2xl p-4 flex flex-col gap-3`
    );
    const dayLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
    const heading = createElement('div', 'flex items-center justify-between gap-2');
    heading.append(createElement('h3', 'text-sm font-bold text-white capitalize', dayLabel));
    if (isToday) heading.append(createElement('span', 'shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300', 'Oggi'));
    card.append(heading);

    if (day.intervalsActivities.length) {
        const activityHeading = createElement('p', 'text-xs font-semibold uppercase tracking-wide text-emerald-300', 'Attività svolte');
        card.append(activityHeading);
        day.intervalsActivities.forEach(activity => card.append(renderActivity(
            activity,
            day.plannedSessions,
            allSessions,
            pendingAssociation
        )));
    }

    const sessionsSection = createElement('div', 'space-y-2');
    if (day.plannedSessions.length) {
        sessionsSection.append(createElement('p', 'text-xs font-semibold uppercase tracking-wide text-slate-400', 'Allenamenti pianificati'));
        day.plannedSessions.forEach(session => sessionsSection.append(renderSession(session)));
    } else if (!day.intervalsActivities.length) {
        sessionsSection.append(createElement('p', 'text-sm text-slate-500', 'Nessuna seduta pianificata.'));
    }

    if (editingSession?.scheduled_date === day.date) {
        sessionsSection.append(renderSessionForm(editingSession));
    } else {
        sessionsSection.append(createButton(
            day.plannedSessions.length ? 'Aggiungi seduta' : 'Pianifica allenamento',
            'add-session',
            { date: day.date },
            'min-h-11 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20'
        ));
    }
    card.append(sessionsSection);
    return card;
}

function renderActivity(activity, daySessions, allSessions, pendingAssociation) {
    const section = createElement('div', 'rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1');
    section.append(createElement('p', 'text-sm font-semibold text-white', activity.name || activity.type || 'Attività'));
    const details = [];
    const distance = Number(activity.distance);
    const duration = Number(activity.moving_time || activity.elapsed_time);
    if (Number.isFinite(distance) && distance > 0) details.push(`${(distance / 1000).toFixed(1)} km`);
    if (Number.isFinite(duration) && duration > 0) details.push(`${Math.round(duration / 60)} min`);
    if (details.length) section.append(createElement('p', 'text-xs text-slate-400', details.join(' · ')));

    const activityId = normalizeActivityId(activity.id);
    const linkedSession = activityId
        ? allSessions.find(session => session.intervals_activity_id === activityId)
        : null;
    if (linkedSession) {
        if (pendingAssociation?.activityId === activityId
            && pendingAssociation?.sessionId === linkedSession.id) {
            section.append(renderAssociationForm(
                activity,
                linkedSession,
                pendingAssociation.score,
                true
            ));
            return section;
        }
        section.append(createElement(
            'p',
            'text-xs text-emerald-200',
            `Associata a: ${linkedSession.title} · aderenza personale ${linkedSession.adherence_score}/5`
        ));
        const actions = createElement('div', 'flex flex-wrap gap-3 pt-1');
        actions.append(createButton(
            'Modifica valutazione',
            'assess-activity',
            { activityId, sessionId: linkedSession.id },
            'min-h-10 text-xs font-medium text-emerald-300'
        ));
        actions.append(createButton(
            'Rimuovi associazione',
            'unlink-activity',
            { sessionId: linkedSession.id },
            'min-h-10 text-xs font-medium text-rose-300'
        ));
        section.append(actions);
        return section;
    }

    const matches = getMatchingSessions(activity, daySessions);
    if (!matches.length) {
        section.append(createElement(
            'p',
            'text-xs text-slate-400',
            activityId
                ? 'Nessuna seduta dello stesso giorno e sport da proporre.'
                : 'Intervals non ha fornito un ID: non è possibile salvare un’associazione.'
        ));
        return section;
    }

    section.append(createElement(
        'p',
        'pt-1 text-xs font-medium text-amber-200',
        'Possibile corrispondenza: verifica prima di associare.'
    ));
    matches.forEach(session => {
        const isPending = pendingAssociation?.activityId === activityId
            && pendingAssociation?.sessionId === session.id;
        if (isPending) {
            section.append(renderAssociationForm(activity, session, pendingAssociation.score, false));
            return;
        }
        section.append(createButton(
            `Verifica: ${session.title}`,
            'assess-activity',
            { activityId, sessionId: session.id },
            'min-h-10 w-full rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/10'
        ));
    });
    return section;
}

function renderAssociationForm(activity, session, currentScore, isEditing) {
    const form = createElement('form', 'mt-2 space-y-3 rounded-xl border border-amber-400/30 bg-slate-950 p-3');
    form.dataset.activityAssociation = 'true';
    form.append(createElement(
        'p',
        'text-sm font-medium text-white',
        isEditing
            ? `Aggiorna la valutazione per "${session.title}".`
            : `Confermi che "${activity.name || activity.type || 'questa attività'}" è la seduta "${session.title}"?`
    ));

    if (!isEditing) {
        const confirmationLabel = createElement('label', 'flex min-h-11 items-center gap-3 text-sm text-slate-200');
        const confirmation = createElement('input', 'h-5 w-5 accent-emerald-400');
        confirmation.type = 'checkbox';
        confirmation.name = 'confirm-association';
        confirmation.required = true;
        confirmationLabel.append(confirmation, createElement('span', '', 'Sì, confermo questa associazione'));
        form.append(confirmationLabel);
    }

    const fieldset = createElement('fieldset', 'space-y-2');
    fieldset.append(createElement('legend', 'text-sm font-medium text-white', 'Quanto hai rispettato la seduta? (voto personale)'));
    const choices = createElement('div', 'grid grid-cols-5 gap-1');
    const scoreLabels = ['Per nulla', 'Poco', 'In parte', 'Quasi', 'Completamente'];
    scoreLabels.forEach((label, index) => {
        const score = index + 1;
        const choice = createElement(
            'label',
            'flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 px-1 text-center text-[10px] text-slate-300 has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-400/10'
        );
        const radio = createElement('input', 'h-4 w-4 accent-emerald-400');
        radio.type = 'radio';
        radio.name = 'adherence_score';
        radio.value = String(score);
        radio.required = true;
        radio.checked = Number(currentScore) === score;
        choice.append(radio, createElement('span', 'font-semibold', String(score)), createElement('span', '', label));
        choices.append(choice);
    });
    fieldset.append(choices);
    form.append(fieldset);
    form.append(createElement(
        'p',
        'text-xs text-slate-400',
        'Il voto è personale: il confronto automatico con ritmi e ripetute non è ancora attivo.'
    ));

    const actions = createElement('div', 'grid grid-cols-2 gap-2');
    actions.append(createButton(
        'Annulla',
        'cancel-association',
        {},
        'min-h-11 rounded-xl border border-slate-700 px-3 text-sm text-slate-300'
    ));
    actions.append(createButton(
        'Conferma e salva',
        null,
        {},
        'min-h-11 rounded-xl bg-emerald-500 px-3 text-sm font-bold text-slate-950',
        'submit'
    ));
    form.append(actions);
    return form;
}

function renderSession(session) {
    const section = createElement('div', 'rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2');
    const heading = createElement('div', 'flex items-start justify-between gap-2');
    const details = createElement('div', 'min-w-0');
    details.append(createElement('p', 'text-sm font-semibold text-white break-words', session.title));
    details.append(createElement('p', 'text-xs text-slate-400', sessionTypeLabel(session.sport_type)));
    heading.append(details);

    const actions = createElement('div', 'flex shrink-0 gap-3');
    actions.append(createButton('Modifica', 'edit-session', { sessionId: session.id }, 'min-h-10 text-xs font-medium text-emerald-300'));
    actions.append(createButton('Elimina', 'delete-session', { sessionId: session.id }, 'min-h-10 text-xs font-medium text-rose-300'));
    heading.append(actions);
    section.append(heading);

    const metrics = [];
    if (session.distance_km !== null && session.distance_km !== '') metrics.push(`${session.distance_km} km`);
    if (session.duration_minutes !== null && session.duration_minutes !== '') metrics.push(`${session.duration_minutes} min`);
    if (session.target_pace_seconds_per_km !== null && session.target_pace_seconds_per_km !== '') {
        metrics.push(`${formatPace(session.target_pace_seconds_per_km)} min/km obiettivo`);
    }
    if (metrics.length) section.append(createElement('p', 'text-xs text-slate-300', metrics.join(' · ')));
    if (session.notes) section.append(createElement('p', 'text-sm text-slate-400 whitespace-pre-wrap break-words', session.notes));
    if (session.completed_at && session.completed_activity) {
        section.append(createElement(
            'p',
            'text-xs font-medium text-emerald-300',
            `Completata · aderenza personale ${session.adherence_score}/5`
        ));
        const completedDetails = [];
        if (session.completed_activity.distance !== null) {
            completedDetails.push(`${(session.completed_activity.distance / 1000).toFixed(1)} km effettivi`);
        }
        const completedDuration = session.completed_activity.moving_time
            ?? session.completed_activity.elapsed_time;
        if (completedDuration !== null) completedDetails.push(`${Math.round(completedDuration / 60)} min effettivi`);
        if (completedDetails.length) {
            section.append(createElement('p', 'text-xs text-slate-400', completedDetails.join(' · ')));
        }
        if (session.completed_activity.name) {
            section.append(createElement('p', 'text-xs text-slate-400', session.completed_activity.name));
        }
    }
    return section;
}

function renderSessionForm(session) {
    const form = createElement('form', 'space-y-3 rounded-xl border border-emerald-500/30 bg-slate-950 p-3');
    form.dataset.sessionForm = 'true';
    form.dataset.date = session.scheduled_date;

    const title = createInput('title', 'Titolo della seduta', session.title || '', true);
    title.maxLength = 120;
    form.append(title);

    const type = createElement('select', 'min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200');
    type.name = 'sport_type';
    type.required = true;
    type.setAttribute('aria-label', 'Tipo di attività');
    SESSION_TYPES.forEach(([value, label]) => {
        const option = createElement('option', '', label);
        option.value = value;
        option.selected = session.sport_type === value;
        type.append(option);
    });
    form.append(type);

    const metrics = createElement('div', 'grid grid-cols-2 gap-2');
    const distance = createInput('distance_km', 'Distanza (km)', session.distance_km ?? '', false, 'number');
    distance.min = '0';
    distance.step = '0.1';
    distance.inputMode = 'decimal';
    const duration = createInput('duration_minutes', 'Durata (min)', session.duration_minutes ?? '', false, 'number');
    duration.min = '0';
    duration.step = '1';
    duration.inputMode = 'numeric';
    metrics.append(distance, duration);
    form.append(metrics);

    const targetPace = createInput(
        'target_pace',
        'Passo obiettivo (min/km)',
        session.target_pace_seconds_per_km == null ? '' : formatPace(session.target_pace_seconds_per_km),
        false
    );
    targetPace.inputMode = 'decimal';
    targetPace.placeholder = 'es. 5:20';
    targetPace.pattern = '^\\d{1,2}:[0-5]\\d$';
    targetPace.setAttribute('aria-label', 'Passo obiettivo in minuti e secondi per chilometro, facoltativo');
    targetPace.title = 'Facoltativo. Per la condivisione, questo valore può essere riparametrizzato usando i riferimenti dichiarati da entrambi gli atleti.';
    form.append(targetPace);

    const notes = createElement('textarea', 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200');
    notes.name = 'notes';
    notes.placeholder = 'Note facoltative';
    notes.maxLength = 2000;
    notes.rows = 3;
    notes.value = session.notes || '';
    form.append(notes);

    const actions = createElement('div', 'grid grid-cols-2 gap-2');
    actions.append(createButton('Annulla', 'cancel-edit', {}, 'min-h-11 rounded-xl border border-slate-700 px-3 text-sm text-slate-300'));
    actions.append(createButton(session.id ? 'Salva modifiche' : 'Salva seduta', null, {}, 'min-h-11 rounded-xl bg-emerald-500 px-3 text-sm font-bold text-slate-950', 'submit'));
    form.append(actions);
    return form;
}

function createInput(name, placeholder, value, required, type = 'text') {
    const input = createElement('input', 'min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200');
    input.name = name;
    input.type = type;
    input.placeholder = placeholder;
    input.value = value;
    input.required = required;
    if (type !== 'text') input.setAttribute('aria-label', placeholder);
    return input;
}

function createButton(text, action, data, className, type = 'button') {
    const button = createElement('button', className, text);
    button.type = type;
    if (action) button.dataset.action = action;
    Object.entries(data).forEach(([key, value]) => {
        button.dataset[key] = value;
    });
    return button;
}

function createElement(tag, className, text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function createStatusElement(container) {
    const status = createElement('p', 'hidden rounded-xl p-3 text-sm');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    container.before(status);
    return status;
}

function showStatus(status, message, state) {
    const classes = {
        error: 'bg-rose-500/10 text-rose-300 border border-rose-500/20',
        info: 'bg-slate-900 text-slate-300 border border-slate-800',
        success: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
    };
    status.textContent = message;
    status.className = `rounded-xl border p-3 text-sm ${classes[state]}`;
}

function sessionTypeLabel(type) {
    return SESSION_TYPES.find(([value]) => value === type)?.[1] || type;
}

function formatDateIt(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day))
        .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
