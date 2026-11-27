import { TrainingCalendarService } from './calendar.js';
import { IntervalsService } from './intervals.js';
import { TrainingPlanService } from './training-plan.js';
import { formatPace, parsePace } from './training-plan-sharing.js';
import { initTrainingPlanSharingModule } from './training-plan-sharing-ui.js';
import { createActivitySnapshot, getMatchingSessions, normalizeActivityId } from './activity-matching.js';
import {
    comparePlannedVsDone,
    describeIncreases,
    formatDeltaElevation,
    formatDeltaKm,
    formatDeltaMinutes,
    formatDeltaPace,
    LOAD_RULE_LABEL,
    loadIncreaseWarnings,
    plannedLoadEntries,
    STATUS_LABELS,
    weeklyLoad
} from './training-load.js';
import { openActivityDetail } from './activity-detail-ui.js';
import { buildIcsCalendar, downloadIcs, EXPORT_RANGES, exportFileName, selectSessionsForExport } from './calendar-export.js';

const PAST_WEEKS = 26;
const VISIBLE_FUTURE_WEEKS = 3;
const LATER_WEEKS = 26;

const SESSION_TYPES = [
    ['run', 'Corsa'],
    ['trail', 'Trail'],
    ['swim', 'Nuoto'],
    ['strength', 'Forza'],
    ['recovery', 'Recupero'],
    ['other', 'Altro']
];

let exportToolbar = null;

export async function initCalendarModule(supabaseClient, userId) {
    const container = document.getElementById('calendar-multi-container');
    if (!container) return;

    const planService = new TrainingPlanService(supabaseClient);
    // Sei mesi di storico, settimana corrente, 3 settimane in vista e altre
    // 26 future raccolte in un menù (i cicli generati arrivano a 15 settimane).
    const weeks = new TrainingCalendarService().generateMultiWeekPlan(new Date(), PAST_WEEKS, VISIBLE_FUTURE_WEEKS + LATER_WEEKS);
    const openGroups = new Set();
    const status = createStatusElement(container);
    container.setAttribute('aria-busy', 'true');
    container.append(createElement('p', 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400', 'Caricamento del tuo piano…'));
    let sessions = [];
    let editingSession = null;
    let pendingAssociation = null;
    exportToolbar?.remove();
    // "Tutto il piano futuro" va oltre la finestra del calendario: si legge dal database al clic.
    exportToolbar = createExportToolbar(() => sessions, status, today => planService.listSessions(userId, today, '9999-12-31'));
    status.before(exportToolbar);

    try {
        sessions = await planService.listSessions(userId, weeks[0].startDate, weeks[weeks.length - 1].endDate);
    } catch (error) {
        console.error('Errore nel caricamento del piano di allenamento:', error);
        showStatus(status, `Impossibile caricare le sedute pianificate: ${error.message}`, 'error');
    }

    const render = () => {
        container.setAttribute('aria-busy', 'false');
        renderCalendar(container, weeks, sessions, editingSession, pendingAssociation, openGroups);
    };

    let activitiesRequestId = 0;
    let intervalsService = null;
    const refreshActivities = async () => {
        const requestId = ++activitiesRequestId;
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;
            const athleteId = data?.intervals_id || data?.intervals_athlete_id;
            const apiKey = data?.intervals_key || data?.intervals_api_key;

            if (requestId !== activitiesRequestId) return;
            if (!athleteId || !apiKey) {
                intervalsService = null;
                weeks.forEach(week => week.days.forEach(day => {
                    day.intervalsActivities = [];
                }));
                showStatus(status, 'Collega Intervals.icu per visualizzare le attività svolte. Il piano resta disponibile.', 'info');
                render();
                return;
            }

            intervalsService = new IntervalsService(athleteId, apiKey);
            const activities = await intervalsService
                .getActivities(weeks[0].startDate, weeks[weeks.length - 1].endDate);
            if (requestId !== activitiesRequestId) return;
            const byDate = new Map();
            activities.forEach(activity => {
                if (!activity.start_date_local) return;
                const date = activity.start_date_local.slice(0, 10);
                if (!byDate.has(date)) byDate.set(date, []);
                byDate.get(date).push(activity);
            });
            weeks.forEach(week => week.days.forEach(day => {
                day.intervalsActivities = byDate.get(day.date) || [];
            }));
            render();
        } catch (error) {
            if (requestId !== activitiesRequestId) return;
            console.error('Errore nel caricamento delle attività Intervals per il calendario:', error);
            showStatus(status, `Attività Intervals non disponibili: ${error.message}`, 'error');
            render();
        }
    };

    document.addEventListener('intervals:sync', refreshActivities);
    document.addEventListener('training-sessions:changed', async () => {
        try {
            sessions = await planService.listSessions(userId, weeks[0].startDate, weeks[weeks.length - 1].endDate);
            editingSession = null;
            pendingAssociation = null;
            render();
        } catch (error) {
            console.error('Errore nel ricaricamento delle sedute:', error);
            showStatus(status, `Impossibile aggiornare le sedute: ${error.message}`, 'error');
        }
    });

    await refreshActivities();
    render();
    await initTrainingPlanSharingModule(supabaseClient, userId);

    container.addEventListener('calendar:expand', render);
    container.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const { action, sessionId, date } = button.dataset;
        if (action === 'activity-detail') {
            const activity = weeks
                .flatMap(week => week.days)
                .flatMap(day => day.intervalsActivities || [])
                .find(item => normalizeActivityId(item.id) === button.dataset.activityId);
            if (!activity) {
                showStatus(status, 'Attività non più disponibile. Aggiorna Intervals e riprova.', 'error');
                return;
            }
            openActivityDetail({ activity, intervalsService, trigger: button });
        } else if (action === 'add-session') {
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
                notifySessionsUpdated();
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
                // Il form della seduta eliminata si chiude: un invio creerebbe un duplicato.
                if (editingSession?.id === sessionId) editingSession = null;
                showStatus(status, 'Seduta eliminata.', 'success');
                render();
                notifySessionsUpdated();
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
                notifySessionsUpdated();
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
            notifySessionsUpdated();
        } catch (error) {
            console.error('Errore durante il salvataggio della seduta:', error);
            showStatus(status, `Impossibile salvare la seduta: ${error.message}`, 'error');
            submitButton.disabled = false;
        }
    });
}

// Pulsante di esportazione .ics delle sedute future.
function createExportToolbar(getSessions, status, loadFutureSessions) {
    const toolbar = createElement('div', 'flex flex-wrap items-center gap-2');
    const select = createElement('select', 'min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200');
    select.setAttribute('aria-label', 'Periodo da esportare');
    Object.entries(EXPORT_RANGES).forEach(([value, { label }]) => {
        const option = createElement('option', '', label);
        option.value = value;
        select.append(option);
    });
    const button = createButton('Esporta calendario (.ics)', null, {}, 'min-h-10 rounded-xl border border-brand-500/40 px-4 text-sm font-medium text-brand-300 hover:bg-brand-500/10');
    button.addEventListener('click', async () => {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        button.disabled = true;
        try {
            const source = select.value === 'all' ? await loadFutureSessions(today) : getSessions();
            const selected = selectSessionsForExport(source, { today, range: select.value });
            if (!selected.length) {
                showStatus(status, 'Nessuna seduta futura da esportare nel periodo scelto.', 'info');
                return;
            }
            downloadIcs(buildIcsCalendar(selected, { now }), exportFileName(today, select.value));
            showStatus(status, `Esportate ${selected.length} sedute in formato .ics.`, 'success');
        } catch (error) {
            console.error('Errore nell\'esportazione del calendario:', error);
            showStatus(status, `Esportazione non riuscita: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    });
    toolbar.append(select, button);
    return toolbar;
}

// Avvisa la dashboard (aderenza) senza far ricaricare il calendario.
function notifySessionsUpdated() {
    document.dispatchEvent(new CustomEvent('training-sessions:updated'));
}

function renderCalendar(container, weeks, sessions, editingSession, pendingAssociation, openGroups) {
    container.replaceChildren();
    const currentIndex = weeks.findIndex(week => week.isCurrent);
    const past = weeks.slice(0, currentIndex);
    const visible = weeks.slice(currentIndex, currentIndex + 1 + VISIBLE_FUTURE_WEEKS);
    const later = weeks.slice(currentIndex + 1 + VISIBLE_FUTURE_WEEKS);
    // Carico pianificato per settimana, con avviso oltre +10% (non dal libro).
    const plannedLoad = loadIncreaseWarnings(weeklyLoad(plannedLoadEntries(sessions), {
        fromWeek: weeks[0].startDate,
        toWeek: weeks[weeks.length - 1].startDate
    }));
    const context = {
        sessions,
        editingSession,
        pendingAssociation,
        openGroups,
        currentWeekStart: weeks[currentIndex]?.startDate,
        loadByWeek: new Map(plannedLoad.map(week => [week.weekStart, week]))
    };

    visible.forEach((week, offset) => container.append(renderWeek(week, offset, context)));
    if (later.length) {
        container.append(renderWeekArchive('future', 'Settimane successive', later, context));
    }
    if (past.length) {
        container.append(renderWeekArchive('past', 'Settimane precedenti', past.slice().reverse(), context));
    }
}

function renderWeek(week, offset, context) {
    const section = createElement('section', 'calendar-week space-y-3');
    const relative = offset === 0
        ? 'Questa settimana'
        : offset === 1 ? 'Prossima settimana' : offset > 1 ? `Tra ${offset} settimane` : '';
    const heading = createElement('div', 'flex flex-wrap items-center gap-x-3 gap-y-1');
    heading.append(createElement('h3', 'text-sm font-semibold text-slate-200',
        `${formatDateIt(week.startDate)} – ${formatDateIt(week.endDate)}${relative ? ` · ${relative}` : ''}`));
    appendPlannedLoad(heading, context.loadByWeek?.get(week.startDate), week.startDate >= (context.currentWeekStart || ''));
    const daysGrid = createElement('div', 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7');
    week.days.forEach(day => {
        day.plannedSessions = context.sessions.filter(session => session.scheduled_date === day.date);
        daysGrid.append(renderDayCard(day, context.editingSession, context.pendingAssociation, context.sessions));
    });
    section.append(heading, daysGrid);
    return section;
}

// Totali pianificati di corsa/trail e, per le settimane future, l'avviso
// di aumento oltre il 10% sulla settimana precedente.
function appendPlannedLoad(heading, load, isFuture) {
    if (!load || !load.count) return;
    const parts = [`${formatKmIt(load.km)} km`];
    if (load.elevationM > 0) parts.push(`${load.elevationM} m D+`);
    if (load.seconds > 0) parts.push(formatDurationIt(load.seconds));
    heading.append(createElement('span', 'text-xs text-slate-400', `Pianificato: ${parts.join(' · ')}`));
    if (!isFuture || !load.warning) return;
    const badge = createElement('span', 'rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200',
        `Carico in aumento: ${describeIncreases(load.increases)}`);
    badge.title = `Aumento oltre il 10% rispetto alla settimana precedente pianificata (${LOAD_RULE_LABEL}).`;
    heading.append(badge, createElement('span', 'text-[11px] text-slate-500', LOAD_RULE_LABEL));
}

// Menù a tendina per anno e mese; lo stato aperto/chiuso sopravvive ai
// ridisegni, così modificare una seduta non richiude il gruppo.
function renderWeekArchive(kind, title, weeks, context) {
    const root = collapsible(`${kind}`, title, summarizeWeeks(weeks, context.sessions), context.openGroups,
        'rounded-2xl border border-slate-800 bg-slate-900/70');
    const byYear = groupBy(weeks, week => week.startDate.slice(0, 4));
    byYear.forEach((yearWeeks, year) => {
        const yearNode = collapsible(`${kind}-${year}`, year, summarizeWeeks(yearWeeks, context.sessions), context.openGroups,
            'rounded-xl border border-slate-800 bg-slate-950/40');
        groupBy(yearWeeks, week => week.startDate.slice(0, 7)).forEach((monthWeeks, month) => {
            const monthName = new Date(`${month}-01T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
            const label = monthName.charAt(0).toUpperCase() + monthName.slice(1);
            const monthNode = collapsible(`${kind}-${month}`, label, summarizeWeeks(monthWeeks, context.sessions), context.openGroups,
                'rounded-xl border border-slate-800');
            if (monthNode.open) {
                monthWeeks.forEach(week => monthNode.body.append(renderWeek(week, -1, context)));
            }
            yearNode.body.append(monthNode.element);
        });
        root.body.append(yearNode.element);
    });
    return root.element;
}

function collapsible(key, title, detail, openGroups, className) {
    const element = createElement('details', className);
    element.open = openGroups.has(key);
    const summary = createElement('summary', 'flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-white');
    summary.append(createElement('span', '', title), createElement('span', 'text-xs font-normal normal-case text-slate-400', detail));
    const body = createElement('div', 'space-y-3 px-3 pb-3');
    element.append(summary, body);
    element.addEventListener('toggle', () => {
        const wasOpen = openGroups.has(key);
        if (element.open) openGroups.add(key);
        else openGroups.delete(key);
        // I mesi disegnano le settimane solo da aperti: al primo apertura si ridisegna.
        if (element.open && !wasOpen && !body.querySelector('.calendar-week') && !body.querySelector('details')) {
            element.dispatchEvent(new CustomEvent('calendar:expand', { bubbles: true }));
        }
    });
    return { element, body, open: element.open };
}

function summarizeWeeks(weeks, sessions) {
    const dates = new Set(weeks.flatMap(week => week.days.map(day => day.date)));
    const planned = sessions.filter(session => dates.has(session.scheduled_date)).length;
    const done = weeks.reduce((total, week) => total + week.days.reduce((sum, day) => sum + day.intervalsActivities.length, 0), 0);
    return `${weeks.length} settimane · ${planned} sedute · ${done} attività`;
}

function groupBy(items, keyOf) {
    const groups = new Map();
    items.forEach(item => {
        const key = keyOf(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    });
    return groups;
}

function renderDayCard(day, editingSession, pendingAssociation, allSessions) {
    const todayKey = formatDateKey(new Date());
    const isToday = day.date === todayKey;
    const isPast = day.date < todayKey;
    const card = createElement(
        'article',
        `day-card border ${isToday ? 'border-brand-500/60 bg-brand-950/10' : 'border-slate-800 bg-slate-900/70'} rounded-2xl p-3 flex flex-col gap-3`
    );
    card.dataset.date = day.date;
    const dayLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
    const heading = createElement('div', 'flex items-center justify-between gap-2');
    heading.append(createElement('h3', 'text-sm font-bold text-white capitalize', dayLabel));
    if (isToday) heading.append(createElement('span', 'shrink-0 rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] font-semibold text-brand-300', 'Oggi'));
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
        day.plannedSessions.forEach(session => sessionsSection.append(renderSession(session, day.intervalsActivities)));
    } else if (!day.intervalsActivities.length) {
        sessionsSection.append(createElement('p', 'text-sm text-slate-500', 'Nessuna seduta pianificata.'));
    }

    if (editingSession?.scheduled_date === day.date) {
        sessionsSection.append(renderSessionForm(editingSession));
    } else if (!isPast) {
        // Nei giorni passati non si pianifica.
        const addButton = createButton(
            day.plannedSessions.length ? '+ Seduta' : '+ Pianifica',
            'add-session',
            { date: day.date },
            'inline-flex min-h-9 items-center rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/20'
        );
        addButton.setAttribute('aria-label', `${day.plannedSessions.length ? 'Aggiungi seduta' : 'Pianifica allenamento'}: ${dayLabel}`);
        sessionsSection.append(addButton);
    }
    card.append(sessionsSection);
    return card;
}

function renderActivity(activity, daySessions, allSessions, pendingAssociation) {
    const section = createElement('div', 'rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1');
    const activityName = activity.name || activity.type || 'Attività';
    const detailId = normalizeActivityId(activity.id);
    if (detailId) {
        // Il nome apre il dettaglio dell'attività.
        const open = createButton('', 'activity-detail', { activityId: detailId }, 'group flex w-full items-start justify-between gap-2 text-left text-sm font-semibold text-white hover:text-brand-200');
        open.setAttribute('aria-label', `Dettaglio attività: ${activityName}`);
        open.append(createElement('span', 'underline decoration-slate-600 underline-offset-2 group-hover:decoration-brand-300', activityName), createElement('span', 'shrink-0 text-brand-300', '›'));
        section.append(open);
    } else {
        section.append(createElement('p', 'text-sm font-semibold text-white', activityName));
    }
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
            'min-h-10 text-xs font-medium text-brand-300'
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
        const message = !activityId
            ? 'Intervals non ha fornito un ID: non è possibile salvare un’associazione.'
            : daySessions.length
                ? 'Attività sincronizzata da Intervals.icu; non c’è una seduta pianificata dello stesso giorno e sport da associare.'
                : 'Attività sincronizzata da Intervals.icu; non hai una seduta pianificata per questo giorno.';
        section.append(createElement(
            'p',
            'text-xs text-slate-400',
            message
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
        const confirmation = createElement('input', 'h-5 w-5 accent-brand-400');
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
            'flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 px-1 text-center text-[10px] text-slate-300 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-400/10'
        );
        const radio = createElement('input', 'h-4 w-4 accent-brand-400');
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
        'Il voto è personale. Dopo il salvataggio la seduta mostra il confronto con km, D+, tempo e passo pianificati.'
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
        'min-h-11 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white',
        'submit'
    ));
    form.append(actions);
    return form;
}

function renderSession(session, dayActivities = []) {
    const section = createElement('div', 'rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2');
    // Titolo sopra, azioni sotto: nelle colonne strette i pulsanti non schiacciano il titolo.
    const heading = createElement('div', 'flex flex-col gap-1');
    const details = createElement('div', 'min-w-0');
    details.append(createElement('p', 'text-sm font-semibold text-white break-words', session.title));
    details.append(createElement('p', 'text-xs text-slate-400', sessionTypeLabel(session.sport_type)));
    heading.append(details);

    const actions = createElement('div', 'flex shrink-0 gap-3');
    actions.append(createButton('Modifica', 'edit-session', { sessionId: session.id }, 'min-h-10 text-xs font-medium text-brand-300'));
    actions.append(createButton('Elimina', 'delete-session', { sessionId: session.id }, 'min-h-10 text-xs font-medium text-rose-300'));
    heading.append(actions);
    section.append(heading);

    const metrics = [];
    if (session.distance_km != null && session.distance_km !== '') metrics.push(`${session.distance_km} km`);
    if (session.duration_minutes != null && session.duration_minutes !== '') metrics.push(`${session.duration_minutes} min`);
    if (session.target_pace_seconds_per_km != null && session.target_pace_seconds_per_km !== '') {
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
        // Lo snapshot salvato prima del D+ viene completato con l'attività del giorno.
        const liveActivity = dayActivities.find(activity =>
            normalizeActivityId(activity.id) === session.intervals_activity_id) || null;
        section.append(renderComparison(comparePlannedVsDone(session, session.completed_activity, liveActivity)));
        if (session.completed_activity.name) {
            section.append(createElement('p', 'text-xs text-slate-400', session.completed_activity.name));
        }
    }
    return section;
}

const STATUS_CLASSES = {
    in_linea: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    sotto: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    sopra: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    piu_lento: 'border-slate-600 bg-slate-800 text-slate-200',
    piu_veloce: 'border-slate-600 bg-slate-800 text-slate-200'
};

// Pianificato vs svolto: km, D+, tempo e passo con delta e stato (±10%).
function renderComparison(comparison) {
    const box = createElement('div', 'space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-2');
    const title = createElement('div', 'flex flex-wrap items-center justify-between gap-2');
    title.append(createElement('p', 'text-[11px] font-semibold uppercase tracking-wide text-slate-400', 'Pianificato → svolto'));
    if (comparison.status) title.append(statusChip(comparison.status));
    box.append(title);
    const rows = [
        ['Km', comparison.km, value => `${formatKmIt(value)} km`, formatDeltaKm],
        ['D+', comparison.elevationM, value => `${Math.round(value)} m`, formatDeltaElevation],
        ['Tempo', comparison.seconds, formatDurationIt, formatDeltaMinutes],
        ['Passo', comparison.paceSecondsPerKm, value => `${formatPace(Math.round(value))} /km`, formatDeltaPace]
    ];
    const list = createElement('dl', 'grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs');
    rows.forEach(([label, metric, format, formatDelta]) => {
        if (metric.done === null) return;
        list.append(createElement('dt', 'text-slate-500', label));
        const value = createElement('dd', 'flex flex-wrap items-center gap-x-1.5 tabular-nums text-slate-200');
        value.append(document.createTextNode(metric.planned === null
            ? `${format(metric.done)} svolti`
            : `${format(metric.planned)} → ${format(metric.done)}`));
        if (metric.delta !== null) value.append(createElement('span', 'text-slate-400', `(${formatDelta(metric.delta)})`));
        if (metric.status) value.append(statusChip(metric.status, true));
        list.append(value);
    });
    if (!list.children.length) {
        box.append(createElement('p', 'text-xs text-slate-500', 'Dati dell’attività non disponibili.'));
        return box;
    }
    box.append(list);
    return box;
}

function statusChip(status, small = false) {
    return createElement('span',
        `rounded-full border px-2 ${small ? 'py-0 text-[10px]' : 'py-0.5 text-[11px] font-semibold'} ${STATUS_CLASSES[status] || ''}`,
        STATUS_LABELS[status] || status);
}

function formatKmIt(value) {
    return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');
}

function formatDurationIt(seconds) {
    const minutes = Math.round(seconds / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

function renderSessionForm(session) {
    const form = createElement('form', 'space-y-3 rounded-xl border border-brand-500/30 bg-slate-950 p-3');
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
    actions.append(createButton(session.id ? 'Salva modifiche' : 'Salva seduta', null, {}, 'min-h-11 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white', 'submit'));
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
