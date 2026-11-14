import { CYCLE_TRANSCRIPTIONS } from './training-cycle-transcriptions.js';
import { describeBands, paceBandsForCell, singleTargetPace } from './training-pace-zones.js';

const DAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const QUALITY_MEANS = Object.freeze(['B', 'T', 'P', 'MLSS', 'VAM', 'SB', 'RMA', 'RME', 'LLM', 'RG']);
const NON_SESSION_KINDS = Object.freeze(['rest', 'rest_or_exercises']);
const PINNED_KINDS = Object.freeze(['race']);
const LONG_RUN_MEANS = Object.freeze(['L', 'M', 'LLM']);

// Regole di adattamento della frequenza dettate e approvate dall'atleta il
// 13 novembre 2026. Valgono solo per i cicli a metodo distanza-tempo, dove le
// sedute sono espresse in km; il ciclo respiratorio (minuti) resta a 4 sedute.
export const FREQUENCY_ADAPTATION_RULES = Object.freeze({
    three_sessions: Object.freeze({
        id: 'three_sessions_athlete_variant',
        version: '1.0.0',
        ruleStatus: 'approved_for_drafts',
        approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }),
        appliesToMethods: Object.freeze(['distance_time']),
        warmupKm: 2,
        cooldownKm: 1,
        explanation: 'Si omette la seduta meno impegnativa (in genere la più breve); le altre due sedute non lunghe ricevono circa 2 km di riscaldamento e 1 km di defaticamento; il lungo del fine settimana aumenta della distanza omessa.'
    }),
    five_sessions_spread: Object.freeze({
        id: 'five_sessions_spread_plus_10',
        version: '1.0.0',
        ruleStatus: 'approved_for_drafts',
        approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }),
        appliesToMethods: Object.freeze(['distance_time']),
        volumeIncrease: 0.10,
        explanation: 'Le quattro sedute del modello restano invariate; una quinta corsa facile (L) aggiunge il 10% dei km settimanali.'
    }),
    five_sessions_extra: Object.freeze({
        id: 'five_sessions_extra_quality_or_strength',
        version: '1.0.0',
        ruleStatus: 'approved_for_drafts',
        approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }),
        appliesToMethods: Object.freeze(['distance_time']),
        explanation: 'Le quattro sedute del modello restano invariate; si aggiunge una seduta di qualità o in palestra, il cui contenuto va scelto dall\'atleta.'
    })
});

export const FIVE_SESSION_OPTIONS = Object.freeze(['spread_plus_10', 'extra_quality_or_strength']);

export function getCycleTranscription(ruleId) {
    return CYCLE_TRANSCRIPTIONS[ruleId] || null;
}

export function parseCycleCell(raw) {
    const text = String(raw ?? '').split('/').join(' ').replace(/\s+/g, ' ').trim();
    const base = { raw: String(raw ?? ''), text, distanceKm: null, means: [], quality: false, optional: false };
    if (!text) return { ...base, kind: 'unparsed' };
    if (/^riposo$/i.test(text)) return { ...base, kind: 'rest' };
    if (/^riposo o esercizi$/i.test(text)) return { ...base, kind: 'rest_or_exercises' };
    if (/test di verifica/i.test(text)) {
        return { ...base, kind: 'reference_test', raceAlternative: /\bo gara\b/i.test(text) };
    }
    if (/^gara$/i.test(text)) return { ...base, kind: 'race' };
    if (/mezza maratona/i.test(text)) return { ...base, kind: 'time_trial' };

    const optional = /^riposo o /i.test(text);
    const body = optional ? text.replace(/^riposo o /i, '') : text;
    const means = [...new Set(body.match(/\b(?:MLSS|VAM|SB|RMA|RME|LLM|L|M|B|T|P)\b/g) || [])];
    if (/ritmo gara/i.test(body)) means.push('RG');

    let remaining = body.replace(/gara\s+(?:di\s+)?\d+(?:-\d+)?\s*km/gi, ' ');
    let distance = 0;
    remaining = remaining.replace(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(km|m)\b/gi, (match, reps, size, unit) => {
        const value = Number(size.replace(',', '.'));
        distance += Number(reps) * (unit.toLowerCase() === 'km' ? value : value / 1000);
        return ' ';
    });
    for (const match of remaining.matchAll(/(\d+(?:[.,]\d+)?)\s*km/gi)) {
        distance += Number(match[1].replace(',', '.'));
    }
    if (!distance && !means.length) return { ...base, kind: 'unparsed', optional };
    return {
        ...base,
        kind: 'run',
        distanceKm: distance ? round1(distance) : null,
        means,
        quality: means.some(mean => QUALITY_MEANS.includes(mean)),
        optional
    };
}

export function buildWeeklyCyclePattern(ruleId) {
    const transcription = getCycleTranscription(ruleId);
    if (!transcription) return null;
    return deepFreeze({
        kind: 'explicit_weekly_cycle',
        method: transcription.method,
        durationWeeks: transcription.durationWeeks,
        runningSessionsPerWeek: 4,
        source: { ...transcription.source, table: transcription.table },
        weeks: transcription.weeks.map(week => ({
            weekNumber: week.weekNumber,
            sessions: week.days
                .map(day => ({ day: `giorno_${day.day}`, bookDay: day.day, cell: parseCycleCell(day.raw), uncertain: Boolean(day.uncertain) }))
                .filter(({ cell }) => !NON_SESSION_KINDS.includes(cell.kind))
                .map(({ day, bookDay, cell, uncertain }) => ({
                    day,
                    bookDay,
                    type: cell.kind,
                    raw: cell.raw,
                    distanceKm: cell.distanceKm,
                    means: cell.means,
                    quality: cell.quality,
                    optional: cell.optional,
                    uncertain
                }))
        }))
    });
}

export function adaptWeekToFrequency(week, method, targetSessions, { fiveSessionOption = null, isRaceWeek = false } = {}) {
    const sessions = week.sessions.map(session => ({ ...session, adaptations: [] }));
    if (targetSessions === 4) {
        return { weekNumber: week.weekNumber, sessions, notes: [] };
    }
    if (method !== 'distance_time' || ![3, 5].includes(targetSessions)) {
        throw new Error(`Nessuna regola approvata adatta questo ciclo a ${targetSessions} corse settimanali.`);
    }

    const runs = sessions.filter(session => session.type === 'run');
    const longRun = findLongRun(sessions);
    if (targetSessions === 3) {
        return adaptToThreeSessions(week.weekNumber, sessions, runs, longRun);
    }
    if (!FIVE_SESSION_OPTIONS.includes(fiveSessionOption)) {
        throw new Error('Per 5 corse settimanali scegli tra la variante +10% km e la seduta di qualità o palestra.');
    }
    if (isRaceWeek) {
        return {
            weekNumber: week.weekNumber,
            sessions,
            notes: ['Settimana di gara: la quinta seduta non viene aggiunta per non aumentare il carico prima della gara.']
        };
    }
    if (fiveSessionOption === 'spread_plus_10') {
        const weeklyKm = runs.reduce((total, session) => total + (session.distanceKm || 0), 0);
        const extraKm = roundHalf(weeklyKm * FREQUENCY_ADAPTATION_RULES.five_sessions_spread.volumeIncrease);
        if (!extraKm) {
            return { weekNumber: week.weekNumber, sessions, notes: ['Km settimanali non determinabili: nessuna quinta seduta aggiunta.'] };
        }
        return {
            weekNumber: week.weekNumber,
            sessions: insertBeforeLong(sessions, longRun, {
                day: 'aggiunta',
                bookDay: null,
                type: 'run',
                raw: `${formatKm(extraKm)} km L`,
                distanceKm: extraKm,
                means: ['L'],
                quality: false,
                optional: false,
                uncertain: false,
                adaptations: [`Seduta aggiunta: +10% dei ${formatKm(round1(weeklyKm))} km settimanali del modello.`]
            }),
            notes: [FREQUENCY_ADAPTATION_RULES.five_sessions_spread.explanation]
        };
    }
    return {
        weekNumber: week.weekNumber,
        sessions: insertBeforeLong(sessions, longRun, {
            day: 'aggiunta',
            bookDay: null,
            type: 'extra_choice',
            raw: 'Seduta di qualità o in palestra (da scegliere)',
            distanceKm: null,
            means: [],
            quality: true,
            optional: false,
            uncertain: false,
            options: ['quality', 'strength'],
            requiresSelection: true,
            adaptations: ['Contenuto non prescritto dalla fonte: l\'atleta sceglie la seduta di qualità o di palestra prima della conferma.']
        }),
        notes: [FREQUENCY_ADAPTATION_RULES.five_sessions_extra.explanation]
    };
}

function adaptToThreeSessions(weekNumber, sessions, runs, longRun) {
    const rule = FREQUENCY_ADAPTATION_RULES.three_sessions;
    const candidates = runs.filter(session => session !== longRun);
    if (!candidates.length) {
        throw new Error(`Settimana ${weekNumber}: nessuna seduta omissibile per la variante a 3 corse.`);
    }
    const optional = candidates.filter(session => session.optional);
    const easy = candidates.filter(session => !session.quality);
    const pool = optional.length ? optional : easy.length ? easy : candidates;
    const skipped = pool.reduce((shortest, session) =>
        (session.distanceKm ?? Infinity) < (shortest.distanceKm ?? Infinity) ? session : shortest);
    const notes = [rule.explanation];
    if (!easy.length) {
        notes.push('Tutte le sedute omissibili sono di qualità: verifica la scelta prima di confermare.');
    }
    const result = sessions
        .filter(session => session !== skipped)
        .map(session => {
            if (session === longRun) {
                const added = skipped.distanceKm || 0;
                return {
                    ...session,
                    distanceKm: session.distanceKm === null ? null : round1(session.distanceKm + added),
                    adaptations: [`Lungo aumentato di ${formatKm(added)} km (seduta omessa: ${skipped.raw}).`]
                };
            }
            if (session.type === 'run') {
                return {
                    ...session,
                    distanceKm: session.distanceKm === null ? null : round1(session.distanceKm + rule.warmupKm + rule.cooldownKm),
                    warmupKm: rule.warmupKm,
                    cooldownKm: rule.cooldownKm,
                    adaptations: [`Aggiunti ${rule.warmupKm} km di riscaldamento prima del lavoro e ${rule.cooldownKm} km di defaticamento.`]
                };
            }
            return session;
        });
    if (!longRun) {
        notes.push(`Settimana senza lungo facile nel fine settimana (test, gara o lavoro di qualità): i ${formatKm(skipped.distanceKm || 0)} km omessi non vengono riassegnati.`);
    }
    return { weekNumber, sessions: result, skipped, notes };
}

function findLongRun(sessions) {
    // Con test, gara o prova al giorno 7 la settimana non ha un lungo da
    // allungare: i km omessi non vengono spostati a ridosso della prova.
    const lastDay = sessions.find(session => session.bookDay === 7);
    if (lastDay && lastDay.type !== 'run') return null;
    // Solo una corsa facile (L, M, LLM) fa da lungo: i km omessi non si
    // sommano a tempo run, progressivi, bis o lavori a ritmo gara.
    const weekend = sessions.filter(session => session.type === 'run' && !session.optional && session.bookDay >= 6
        && session.means.length > 0 && session.means.every(mean => LONG_RUN_MEANS.includes(mean)));
    if (!weekend.length) return null;
    return weekend.reduce((longest, session) =>
        (session.distanceKm || 0) >= (longest.distanceKm || 0) ? session : longest);
}

function insertBeforeLong(sessions, longRun, extra) {
    const lastDay = sessions.findIndex(session => session.bookDay === 7);
    const index = longRun ? sessions.indexOf(longRun) : lastDay >= 0 ? lastDay : sessions.length;
    return [...sessions.slice(0, index), extra, ...sessions.slice(index)];
}

export function scheduleCycleDraft({
    pattern,
    raceDate,
    availableDays,
    blockedDays = [],
    targetSessions = 4,
    fiveSessionOption = null,
    today = null,
    vrSecondsPerKm = null,
    goalDistanceKm = null
}) {
    if (!pattern || pattern.kind !== 'explicit_weekly_cycle') {
        throw new Error('Serve un ciclo con sedute trascritte e approvate.');
    }
    if (!isIsoDate(raceDate)) throw new Error('La data della gara non è valida.');
    const usableDays = new Set(availableDays.filter(day => DAY_KEYS.includes(day) && !blockedDays.includes(day)));
    const totalWeeks = pattern.durationWeeks;
    const issues = [];

    const weeks = pattern.weeks.map(week => {
        const isRaceWeek = week.weekNumber === totalWeeks;
        const adapted = adaptWeekToFrequency(week, pattern.method, targetSessions, { fiveSessionOption, isRaceWeek });
        const weekEnd = addDays(raceDate, -7 * (totalWeeks - week.weekNumber));
        const weekStart = addDays(weekEnd, -6);
        const windowDates = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
        const pinned = adapted.sessions.filter(session => PINNED_KINDS.includes(session.type) && isRaceWeek);
        const free = adapted.sessions.filter(session => !pinned.includes(session));
        const candidateDates = windowDates
            .filter(date => usableDays.has(dayKey(date)))
            .filter(date => !(isRaceWeek && pinned.length && date >= raceDate));
        if (candidateDates.length < free.length) {
            issues.push(`Settimana ${week.weekNumber}: servono ${free.length} giorni disponibili, ne risultano ${candidateDates.length}.`);
        }
        const chosenDates = pickDatesByBookDay(candidateDates, free, weekStart);
        const scheduled = [
            ...free.map((session, index) => ({ ...session, date: chosenDates[index] ?? null })),
            ...pinned.map(session => ({ ...session, date: raceDate }))
        ].map(session => {
            const bands = session.type === 'run' ? paceBandsForCell(session.raw, vrSecondsPerKm, goalDistanceKm) : [];
            return { ...session, paceBands: bands, targetPaceSecondsPerKm: singleTargetPace(bands) };
        });
        return {
            weekNumber: week.weekNumber,
            startDate: weekStart,
            endDate: weekEnd,
            sessions: scheduled,
            skipped: adapted.skipped || null,
            notes: adapted.notes
        };
    });

    if (today && weeks[0].startDate < today) {
        issues.unshift(`Il ciclo di ${totalWeeks} settimane dovrebbe iniziare il ${weeks[0].startDate}, prima di oggi: la gara è troppo vicina per questa tabella.`);
    }

    return {
        status: issues.length ? 'needs_availability_review' : 'draft_ready_for_confirmation',
        startDate: weeks[0].startDate,
        endDate: weeks[weeks.length - 1].endDate,
        targetSessions,
        fiveSessionOption: targetSessions === 5 ? fiveSessionOption : null,
        vrSecondsPerKm,
        source: pattern.source,
        weeks,
        issues,
        requiresSelection: weeks.some(week => week.sessions.some(session => session.requiresSelection)),
        requiresConfirmation: true
    };
}

export function draftToCalendarSessions(draft) {
    if (draft.status !== 'draft_ready_for_confirmation') {
        throw new Error('La bozza ha conflitti di disponibilità da risolvere prima della conferma.');
    }
    if (draft.requiresSelection) {
        throw new Error('Scegli il contenuto delle sedute di qualità o palestra prima di confermare la bozza.');
    }
    return draft.weeks.flatMap(week => week.sessions.map(session => ({
        scheduled_date: session.date,
        title: `Tab. ${draft.source.table} · S${week.weekNumber} · ${session.raw.split('/').join(' ').replace(/\s+/g, ' ').trim()}`.slice(0, 120),
        sport_type: session.type === 'extra_choice' && session.selected === 'strength' ? 'strength' : 'run',
        distance_km: session.distanceKm,
        duration_minutes: null,
        target_pace_seconds_per_km: session.targetPaceSecondsPerKm ?? null,
        notes: [
            `Fonte: Tipi che corrono, tabella ${draft.source.table}, settimana ${week.weekNumber}${session.bookDay ? `, giorno ${session.bookDay}` : ''}.`,
            ...(session.adaptations || []),
            ...(session.paceBands?.length ? [`Passi dalla tua VR ${formatVr(draft.vrSecondsPerKm)}: ${describeBands(session.paceBands)}.`] : []),
            ...(session.uncertain ? ['Cella con lettura incerta nella scansione: verifica prima di seguirla.'] : [])
        ].join(' ')
    })));
}

// Colloca ogni seduta sul giorno disponibile più vicino al suo giorno nel
// libro (giorno 7 = ultimo giorno della finestra), mantenendo l'ordine e
// lasciando spazio alle sedute successive.
function pickDatesByBookDay(dates, sessions, weekStart) {
    if (dates.length < sessions.length) return pickSpreadDates(dates, sessions.length);
    const offsets = dates.map(date => daysBetween(weekStart, date));
    const targets = sessions.map(session => session.bookDay ? session.bookDay - 1 : null);
    targets.forEach((target, index) => {
        if (target !== null) return;
        const previous = targets.slice(0, index).reverse().find(value => value !== null) ?? 0;
        const next = targets.slice(index + 1).find(value => value !== null) ?? 6;
        targets[index] = (previous + next) / 2;
    });
    const chosen = [];
    let from = 0;
    sessions.forEach((session, index) => {
        const lastAllowed = dates.length - (sessions.length - index);
        let best = from;
        for (let candidate = from; candidate <= lastAllowed; candidate += 1) {
            if (Math.abs(offsets[candidate] - targets[index]) < Math.abs(offsets[best] - targets[index])) best = candidate;
        }
        chosen.push(dates[best]);
        from = best + 1;
    });
    return chosen;
}

function daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function formatVr(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km`;
}

function pickSpreadDates(dates, count) {
    if (count <= 0) return [];
    if (dates.length <= count) return dates.slice();
    // Distribuisce le sedute sui giorni disponibili e tiene l'ultima
    // (lungo, test o gara) sull'ultimo giorno utile della settimana.
    if (count === 1) return [dates[dates.length - 1]];
    const step = (dates.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, index) => dates[Math.round(index * step)]);
}

function dayKey(dateKey) {
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    return DAY_KEYS[(weekday + 6) % 7];
}

function addDays(dateKey, days) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function roundHalf(value) {
    return Math.round(value * 2) / 2;
}

function formatKm(value) {
    return String(value).replace('.', ',');
}

function deepFreeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

export function resolveExtraSession(draft, weekNumber, { kind, description }) {
    if (!['quality', 'strength'].includes(kind)) {
        throw new Error('Scegli tra seduta di qualità e seduta in palestra.');
    }
    const text = String(description ?? '').trim();
    if (!text || text.length > 100) {
        throw new Error('Descrivi la seduta scelta (massimo 100 caratteri).');
    }
    const weeks = draft.weeks.map(week => week.weekNumber !== weekNumber ? week : {
        ...week,
        sessions: week.sessions.map(session => session.type !== 'extra_choice' ? session : {
            ...session,
            raw: text,
            selected: kind,
            requiresSelection: false,
            adaptations: [...session.adaptations, `Scelta dell'atleta: ${kind === 'strength' ? 'palestra' : 'qualità'}.`]
        })
    });
    return {
        ...draft,
        weeks,
        requiresSelection: weeks.some(week => week.sessions.some(session => session.requiresSelection))
    };
}
