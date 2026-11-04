import { TrainingCalendarService } from './calendar.js';
import { IntervalsService } from './intervals.js';
import { TrainingPlanService } from './training-plan.js';

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

    const calendarService = new TrainingCalendarService();
    const planService = new TrainingPlanService(supabaseClient);
    const weeks = calendarService.generateMultiWeekPlan(new Date(), 1, 4);
    const startDate = weeks[0].startDate;
    const endDate = weeks[weeks.length - 1].endDate;
    const status = createStatusElement(container);
    let sessions = [];
    let editingSession = null;

    try {
        sessions = await planService.listSessions(userId, startDate, endDate);
    } catch (error) {
        console.error('Errore nel caricamento del piano di allenamento:', error);
        showStatus(status, `Impossibile caricare le sedute pianificate: ${error.message}`, true);
    }

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
            .eq('id', userId)
            .single();

        if (error) throw error;
        if (data) {
            const athleteId = data.intervals_id || data.intervals_athlete_id;
            const apiKey = data.intervals_key || data.intervals_api_key;

            if (athleteId && apiKey) {
                const service = new IntervalsService(athleteId, apiKey);
                const activities = await service.getActivities(startDate, endDate);
                if (activities) {
                    weeks.forEach(week => week.days.forEach(day => {
                        const activity = activities.find(item =>
                            item.start_date_local && item.start_date_local.startsWith(day.date)
                        );
                        if (activity) {
                            day.intervalsActivity = activity;
                            day.completed = true;
                        }
                    }));
                }
            }
        }
    } catch (error) {
        console.error('Errore nel caricamento delle attività Intervals per il calendario:', error);
        showStatus(status, `Impossibile caricare le attività Intervals: ${error.message}`, true);
    }

    const render = () => renderMultiWeekView(container, weeks, sessions, editingSession);
    render();

    container.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const sessionId = button.dataset.sessionId;
        const date = button.dataset.date;

        if (action === 'add-session') {
            editingSession = { scheduled_date: date };
            render();
        } else if (action === 'edit-session') {
            editingSession = sessions.find(session => session.id === sessionId) || null;
            render();
        } else if (action === 'cancel-edit') {
            editingSession = null;
            render();
        } else if (action === 'delete-session') {
            if (!window.confirm('Vuoi eliminare questa seduta pianificata?')) return;
            button.disabled = true;
            try {
                await planService.deleteSession(userId, sessionId);
                sessions = sessions.filter(session => session.id !== sessionId);
                showStatus(status, 'Seduta eliminata.', false);
                render();
            } catch (error) {
                console.error('Errore durante l’eliminazione della seduta:', error);
                showStatus(status, `Impossibile eliminare la seduta: ${error.message}`, true);
                button.disabled = false;
            }
        } else if (action === 'confirm-activity') {
            window.confirmActivity(date);
        }
    });

    container.addEventListener('submit', async event => {
        const form = event.target.closest('form[data-session-form]');
        if (!form) return;
        event.preventDefault();

        const formData = new FormData(form);
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
            showStatus(status, 'Seduta salvata nel piano.', false);
            render();
        } catch (error) {
            console.error('Errore durante il salvataggio della seduta:', error);
            showStatus(status, `Impossibile salvare la seduta: ${error.message}`, true);
            submitButton.disabled = false;
        }
    });
}

function renderMultiWeekView(container, weeks, sessions, editingSession) {
    container.querySelectorAll('.calendar-week').forEach(element => element.remove());

    weeks.forEach(week => {
        const weekSection = createElement(
            'section',
            `calendar-week border ${week.isCurrent ? 'border-emerald-500/50 bg-slate-900/80 shadow-xl' : 'border-slate-800/80 bg-slate-900/30'} rounded-2xl p-5 space-y-4`
        );
        const header = createElement('div', 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-800/80');
        const weekInfo = createElement('div', 'flex items-center gap-3');
        const weekLabel = createElement('span', `text-xs font-bold px-3 py-1 rounded-lg ${week.isCurrent ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`, week.weekNumber);
        const dates = createElement('span', 'text-xs text-slate-400', `${formatDateIt(week.startDate)} - ${formatDateIt(week.endDate)}`);
        weekInfo.append(weekLabel, dates);
        if (week.isCurrent) {
            weekInfo.append(createElement('span', 'text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold', 'In corso'));
        }
        header.append(weekInfo, createElement('div', 'text-[11px] text-slate-400', `Carico settimanale: ${week.stats.load} · Fitness (CTL): ${week.stats.fitness} · Forma (TSB): +${week.stats.form}`));

        const daysGrid = createElement('div', 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3');
        week.days.forEach(day => {
            day.plannedSessions = sessions.filter(session => session.scheduled_date === day.date);
            daysGrid.append(renderDayCard(day, editingSession));
        });

        weekSection.append(header, daysGrid);
        container.append(weekSection);
    });
}

function renderDayCard(day, editingSession) {
    const isFixed = day.rule.fixed;
    const isToday = day.date === formatDateKey(new Date());
    const card = createElement(
        'article',
        `day-card border ${isFixed ? 'border-cyan-500/30 bg-cyan-950/10' : (isToday ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-slate-800/80 bg-slate-950/50')} rounded-xl p-3 flex flex-col gap-3`
    );
    card.append(createElement(
        'h3',
        'text-[11px] font-bold text-slate-300 uppercase',
        new Date(`${day.date}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
    ));
    card.append(createElement('p', 'text-xs font-semibold text-white', day.rule.label));

    if (day.intervalsActivity) card.append(renderActivity(day));

    const sessionsSection = createElement('div', 'space-y-2 pt-2 border-t border-slate-900');
    day.plannedSessions.forEach(session => sessionsSection.append(renderSession(session)));

    if (editingSession?.scheduled_date === day.date) {
        sessionsSection.append(renderSessionForm(editingSession));
    } else {
        sessionsSection.append(createButton(
            day.plannedSessions.length ? 'Aggiungi seduta' : 'Pianifica seduta',
            'add-session',
            { date: day.date },
            'text-xs text-emerald-400 hover:underline font-medium'
        ));
    }
    card.append(sessionsSection);
    return card;
}

function renderActivity(day) {
    const activity = day.intervalsActivity;
    const section = createElement('div', 'bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-lg text-[10px] space-y-1');
    const row = createElement('div', 'flex justify-between items-center text-emerald-400 font-bold');
    row.append(createElement('span', '', 'Rilevato da Intervals ✓'));
    row.append(createButton('Conferma', 'confirm-activity', { date: day.date }, 'bg-emerald-500 text-slate-950 px-2 py-0.5 rounded font-bold hover:bg-emerald-400'));
    section.append(row);
    section.append(createElement('div', 'text-slate-300', `${activity.name || 'Attività'} (${Math.round((activity.moving_time || 0) / 60)} min)`));
    return section;
}

function renderSession(session) {
    const section = createElement('div', 'bg-slate-900/80 border border-slate-800 p-2 rounded-lg space-y-1');
    const heading = createElement('div', 'flex justify-between items-start gap-2');
    const details = createElement('div', 'min-w-0');
    details.append(createElement('p', 'text-xs font-semibold text-white break-words', session.title));
    details.append(createElement('p', 'text-[10px] text-slate-400', sessionTypeLabel(session.sport_type)));
    heading.append(details);

    const actions = createElement('div', 'flex gap-2 shrink-0');
    actions.append(createButton('Modifica', 'edit-session', { sessionId: session.id }, 'text-[10px] text-emerald-400 hover:underline'));
    actions.append(createButton('Elimina', 'delete-session', { sessionId: session.id }, 'text-[10px] text-rose-400 hover:underline'));
    heading.append(actions);
    section.append(heading);

    const metrics = [];
    if (session.distance_km !== null && session.distance_km !== '') metrics.push(`${session.distance_km} km`);
    if (session.duration_minutes !== null && session.duration_minutes !== '') metrics.push(`${session.duration_minutes} min`);
    if (metrics.length) section.append(createElement('p', 'text-[10px] text-slate-300', metrics.join(' · ')));
    if (session.notes) section.append(createElement('p', 'text-[10px] text-slate-400 whitespace-pre-wrap break-words', session.notes));
    return section;
}

function renderSessionForm(session) {
    const form = createElement('form', 'space-y-2 bg-slate-900/80 border border-emerald-500/30 p-2 rounded-lg');
    form.dataset.sessionForm = 'true';
    form.dataset.date = session.scheduled_date;

    const title = createInput('title', 'Titolo', session.title || '', true);
    title.maxLength = 120;
    form.append(title);

    const type = createElement('select', 'w-full bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-xs text-slate-200');
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
    const duration = createInput('duration_minutes', 'Durata (min)', session.duration_minutes ?? '', false, 'number');
    duration.min = '0';
    duration.step = '1';
    metrics.append(distance, duration);
    form.append(metrics);

    const notes = createElement('textarea', 'w-full bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-xs text-slate-200');
    notes.name = 'notes';
    notes.placeholder = 'Note (facoltative)';
    notes.maxLength = 2000;
    notes.rows = 2;
    notes.value = session.notes || '';
    form.append(notes);

    const actions = createElement('div', 'flex justify-end gap-2');
    actions.append(createButton('Annulla', 'cancel-edit', {}, 'text-xs text-slate-400 hover:text-white'));
    actions.append(createButton(session.id ? 'Salva modifiche' : 'Salva seduta', null, {}, 'bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold', 'submit'));
    form.append(actions);
    return form;
}

function createInput(name, placeholder, value, required, type = 'text') {
    const input = createElement('input', 'w-full bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-xs text-slate-200');
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
    const status = createElement('p', 'hidden text-xs p-3 rounded-xl');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    container.before(status);
    return status;
}

function showStatus(status, message, isError) {
    status.textContent = message;
    status.className = `text-xs p-3 rounded-xl ${isError ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'}`;
}

function sessionTypeLabel(type) {
    return SESSION_TYPES.find(([value]) => value === type)?.[1] || type;
}

function formatDateIt(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

window.confirmActivity = function(date) {
    alert(`Attività del giorno ${date} confermata e validata con successo!`);
};
