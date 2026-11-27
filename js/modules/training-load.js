// Confronto pianificato/svolto e carico settimanale. Funzioni pure.
import { addDays, mondayOf } from './dashboard-stats.js';

export const COMPARISON_TOLERANCE = 0.1;

// Avviso di aumento settimanale: non viene dal libro e non modifica il piano.
export const LOAD_INCREASE_THRESHOLD = 0.1;
export const LOAD_RULE_LABEL = 'regola generale di prudenza, non dal libro';

export const STATUS_LABELS = Object.freeze({
    in_linea: 'in linea',
    sotto: 'sotto',
    sopra: 'sopra',
    piu_lento: 'più lento',
    piu_veloce: 'più veloce'
});

const RUN_TYPES = new Set(['run', 'trail']);
const NUMBER = String.raw`(?<![\d.,'’])(?<!\bogni\s)(?<![x×]\s?)(\d{1,3}(?:[.'’]\d{3})+|\d+)`;
const ELEVATION_PATTERNS = [
    // "circa 600 m D+", "1.200m D+", "600 D+"
    new RegExp(String.raw`${NUMBER}\s*(?:m|metri)?\s*(?:di\s+)?D\s*\+`, 'i'),
    // "D+ 600 m", "D+: circa 600", "D+600"
    new RegExp(String.raw`D\s*\+\s*(?:[:=~]|di|circa)?\s*(?:circa\s*)?${NUMBER}(?!\s*(?:m\s*)?\/|[\d,])`, 'i'),
    // "dislivello positivo di 600 m"
    new RegExp(String.raw`dislivello[^\d\n]{0,30}?${NUMBER}\s*(?:m|metri)\b(?!\s*\/)`, 'i')
];

// Legge il D+ pianificato dalle note ("circa N m D+" scritto dal motore).
export function parsePlannedElevation(notes) {
    if (typeof notes !== 'string' || !notes.trim()) return null;
    for (const pattern of ELEVATION_PATTERNS) {
        const match = notes.match(pattern);
        if (match) {
            const value = Number(match[1].replace(/[.'’]/g, ''));
            if (Number.isFinite(value) && value >= 0 && value <= 20000) return value;
        }
    }
    return null;
}

export function isRunSession(session) {
    return RUN_TYPES.has(String(session?.sport_type || '').toLowerCase());
}

export function plannedSessionMetrics(session) {
    const km = positive(session?.distance_km);
    const pace = positive(session?.target_pace_seconds_per_km);
    const minutes = positive(session?.duration_minutes);
    const seconds = minutes ? minutes * 60 : km && pace ? km * pace : null;
    return {
        km,
        elevationM: parsePlannedElevation(session?.notes),
        seconds,
        paceSecondsPerKm: pace ?? (km && seconds ? seconds / km : null)
    };
}

// Accetta uno snapshot salvato o un'attività Intervals; il secondo argomento
// completa i campi mancanti negli snapshot più vecchi (es. D+).
export function doneActivityMetrics(activity, fallback = null) {
    const read = key => finite(activity?.[key]) ?? finite(fallback?.[key]);
    const distance = positive(read('distance'));
    const seconds = positive(read('moving_time')) ?? positive(read('elapsed_time'));
    const speed = positive(read('average_speed'));
    const km = distance ? distance / 1000 : null;
    const elevation = read('total_elevation_gain');
    return {
        km,
        elevationM: elevation !== null && elevation >= 0 ? elevation : null,
        seconds,
        paceSecondsPerKm: km && seconds ? seconds / km : speed ? 1000 / speed : null
    };
}

export function compareMetric(planned, done, { tolerance = COMPARISON_TOLERANCE, lowerIsFaster = false } = {}) {
    const p = finite(planned);
    const d = finite(done);
    if (d === null) return { planned: p, done: null, delta: null, status: null };
    if (p === null) return { planned: null, done: d, delta: null, status: null };
    const delta = d - p;
    let status;
    if (p === 0) status = d === 0 ? 'in_linea' : 'sopra';
    else if (Math.abs(delta) <= p * tolerance) status = 'in_linea';
    else if (lowerIsFaster) status = delta > 0 ? 'piu_lento' : 'piu_veloce';
    else status = delta > 0 ? 'sopra' : 'sotto';
    return { planned: p, done: d, delta, status };
}

export function comparePlannedVsDone(session, activity, fallback = null) {
    const planned = plannedSessionMetrics(session);
    const done = doneActivityMetrics(activity, fallback);
    const comparison = {
        km: compareMetric(planned.km, done.km),
        elevationM: compareMetric(planned.elevationM, done.elevationM),
        seconds: compareMetric(planned.seconds, done.seconds),
        paceSecondsPerKm: compareMetric(planned.paceSecondsPerKm, done.paceSecondsPerKm, { lowerIsFaster: true })
    };
    const main = [comparison.km, comparison.seconds, comparison.elevationM].find(item => item.status);
    return { ...comparison, status: main?.status ?? null };
}

export function formatDeltaKm(delta) {
    const value = round1(delta);
    return `${sign(value)}${Math.abs(value).toFixed(1).replace('.', ',')} km`;
}

export function formatDeltaElevation(delta) {
    const value = Math.round(delta);
    return `${sign(value)}${Math.abs(value)} m D+`;
}

export function formatDeltaMinutes(deltaSeconds) {
    const value = Math.round(deltaSeconds / 60);
    return `${sign(value)}${Math.abs(value)} min`;
}

export function formatDeltaPace(deltaSeconds) {
    const value = Math.round(deltaSeconds);
    const total = Math.abs(value);
    return `${sign(value)}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
}

// Somma km, D+ e tempo per settimana (lunedì–domenica), riempiendo le
// settimane vuote tra la prima e l'ultima.
export function weeklyLoad(entries, { fromWeek = null, toWeek = null } = {}) {
    const byWeek = new Map();
    (Array.isArray(entries) ? entries : []).forEach(entry => {
        if (!isDateKey(entry?.date)) return;
        const weekStart = mondayOf(entry.date);
        if (!byWeek.has(weekStart)) byWeek.set(weekStart, emptyWeek(weekStart));
        const week = byWeek.get(weekStart);
        week.count += 1;
        week.km += finite(entry.km) || 0;
        week.elevationM += finite(entry.elevationM) || 0;
        week.seconds += finite(entry.seconds) || 0;
    });
    const starts = [...byWeek.keys()].sort();
    const first = fromWeek ? mondayOf(fromWeek) : starts[0];
    const last = toWeek ? mondayOf(toWeek) : starts[starts.length - 1];
    if (!first || !last) return [];
    const weeks = [];
    for (let start = first; start <= last; start = addDays(start, 7)) {
        const week = byWeek.get(start) || emptyWeek(start);
        weeks.push({ ...week, km: round1(week.km), elevationM: Math.round(week.elevationM), seconds: Math.round(week.seconds) });
    }
    return weeks;
}

// Segnala le settimane che crescono più del 10% sulla precedente.
// Senza settimana precedente o con valore precedente a zero non si confronta.
export function loadIncreaseWarnings(weeks, { threshold = LOAD_INCREASE_THRESHOLD } = {}) {
    return weeks.map((week, index) => {
        const previous = index > 0 ? weeks[index - 1] : null;
        const increases = [];
        if (previous) {
            ['km', 'elevationM', 'seconds'].forEach(metric => {
                const before = previous[metric];
                const now = week[metric];
                if (before > 0 && now > before * (1 + threshold)) {
                    increases.push({ metric, previous: before, current: now, ratio: now / before - 1 });
                }
            });
        }
        return { ...week, increases, warning: increases.length > 0 };
    });
}

export const LOAD_METRIC_LABELS = Object.freeze({ km: 'km', elevationM: 'D+', seconds: 'tempo' });

export function describeIncreases(increases) {
    return increases.map(item => `${LOAD_METRIC_LABELS[item.metric]} +${Math.round(item.ratio * 100)}%`).join(', ');
}

// Carico pianificato: solo corsa e trail.
export function plannedLoadEntries(sessions) {
    return (Array.isArray(sessions) ? sessions : []).filter(isRunSession).map(session => {
        const metrics = plannedSessionMetrics(session);
        return { date: session.scheduled_date, km: metrics.km, elevationM: metrics.elevationM, seconds: metrics.seconds };
    });
}

// Carico svolto da attività normalizzate (dashboard-stats): solo corsa e trail.
export function doneLoadEntries(activities) {
    return (Array.isArray(activities) ? activities : [])
        .filter(activity => activity?.sport === 'run')
        .map(activity => ({
            date: activity.date,
            km: activity.distanceM ? activity.distanceM / 1000 : 0,
            elevationM: activity.elevationM || 0,
            seconds: activity.movingS || activity.elapsedS || 0
        }));
}

// Ultime `count` settimane di carico svolto fino a `today`, con avvisi.
// Si calcola una settimana in più per confrontare anche la prima mostrata.
export function recentDoneLoad(activities, today, count = 8) {
    if (!isDateKey(today) || count < 1) return [];
    const toWeek = mondayOf(today);
    const fromWeek = addDays(toWeek, -7 * count);
    return loadIncreaseWarnings(weeklyLoad(doneLoadEntries(activities), { fromWeek, toWeek })).slice(1);
}

// Lunedì delle ultime `count` settimane, dalla più vecchia alla corrente.
export function recentWeekStarts(today, count = 4) {
    if (!isDateKey(today)) return [];
    const current = mondayOf(today);
    return Array.from({ length: count }, (_, index) => addDays(current, -7 * (count - 1 - index)));
}

// Aderenza settimanale: sedute, km e D+ svolti rispetto al pianificato.
// Lo svolto conta solo le sedute associate a un'attività Intervals.
export function weeklyAdherence(sessions, weekStarts, activityById = new Map()) {
    return weekStarts.map(weekStart => {
        const end = addDays(weekStart, 6);
        const inWeek = (Array.isArray(sessions) ? sessions : []).filter(
            session => session?.scheduled_date >= weekStart && session.scheduled_date <= end
        );
        const row = {
            weekStart,
            plannedCount: inWeek.length,
            doneCount: 0,
            plannedKm: 0,
            doneKm: 0,
            plannedElevationM: 0,
            doneElevationM: 0,
            elevationPlannedSessions: 0
        };
        inWeek.forEach(session => {
            const planned = plannedSessionMetrics(session);
            const runSession = isRunSession(session);
            if (runSession) row.plannedKm += planned.km || 0;
            if (runSession && planned.elevationM !== null) {
                row.plannedElevationM += planned.elevationM;
                row.elevationPlannedSessions += 1;
            }
            if (!session.completed_at || !session.completed_activity) return;
            const fallback = activityById.get(String(session.intervals_activity_id ?? session.completed_activity.id ?? '')) || null;
            const done = doneActivityMetrics(session.completed_activity, fallback);
            row.doneCount += 1;
            if (runSession) {
                row.doneKm += done.km || 0;
                row.doneElevationM += done.elevationM || 0;
            }
        });
        return {
            ...row,
            plannedKm: round1(row.plannedKm),
            doneKm: round1(row.doneKm),
            plannedElevationM: Math.round(row.plannedElevationM),
            doneElevationM: Math.round(row.doneElevationM)
        };
    });
}

function emptyWeek(weekStart) {
    return { weekStart, count: 0, km: 0, elevationM: 0, seconds: 0 };
}

function isDateKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sign(value) {
    return value > 0 ? '+' : value < 0 ? '-' : '±';
}

function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function positive(value) {
    const number = finite(value);
    return number !== null && number > 0 ? number : null;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}
