import { CYCLE_TRANSCRIPTIONS } from './training-cycle-transcriptions.js';
import { TRAIL_CYCLE_TRANSCRIPTIONS } from './training-trail-transcriptions.js';
import { describeBands, describeBreathing, paceBandsForBreathing, paceBandsForCell, singleTargetPace } from './training-pace-zones.js';
import { addDays, daysBetween, isIsoDate } from '../core/date-utils.js';

const DAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const QUALITY_MEANS = Object.freeze(['B', 'T', 'P', 'MLSS', 'VAM', 'SB', 'SL', 'RMA', 'RME', 'LLM', 'RG']);
const NON_SESSION_KINDS = Object.freeze(['rest', 'rest_or_exercises']);
const LONG_RUN_MEANS = Object.freeze(['L', 'M', 'LLM', 'LLU']);
const EASY_BREATHING = Object.freeze(['CRMF', 'CRF']);
const HARD_BREATHING = Object.freeze(['CRLI', 'CRI', 'CRMI']);
const RACE_LIKE_KINDS = Object.freeze(['race', 'race_training', 'time_trial']);
// Metodi delle tabelle trail/ultra (10 evoluti, 11, 13): riduzione a 3-4 corse
// con la regola ultra approvata e indicazioni su dislivello e salite.
const TRAIL_METHODS = Object.freeze(['ultra_distance', 'breathing_km']);

// Velocità ascensionale in ultratrail, p. 266: evoluto 800-900 m/h,
// amatore 500-600 m/h. Si usa il valore prudente (più basso) della fascia.
export const CLIMB_RATE_M_PER_HOUR = Object.freeze({ evoluto: 800, amatore: 500 });

// Consiglio generale di sicurezza, non dal libro: il libro chiede solo di
// abituarsi a correre con poca luce (pp. 215, 266).
export const NIGHT_SESSION_NOTE = 'Seduta serale dopo le 21: lampada frontale, abbigliamento riflettente, percorso conosciuto.';

// Opzioni per tabella delle sezioni trail/ultra. baseRunningSessions = corse
// tipiche della tabella; il test Conconi della tabella 11 è suggerito, non
// richiesto (tabelle a ritmo respiratorio, nessun passo dalla VR).
const TRAIL_TABLE_OPTIONS = Object.freeze({
    ultra_100km_evoluto: Object.freeze({ baseRunningSessions: 5, paceBands: true }),
    // Tabella 11: con una VR valida i ritmi respiratori diventano passi (modello
    // VR chiesto e approvato dall'atleta il 27 novembre 2026); senza VR resta a respiro.
    ultra_100km_passatore: Object.freeze({ baseRunningSessions: 4, paceBands: false, referenceTestOptional: true, vrPaceModel: true }),
    ultra_pistoia_abetone: Object.freeze({ baseRunningSessions: 4, paceBands: false }),
    trail_15_50km: Object.freeze({ baseRunningSessions: 5, paceBands: false, blockRepetition: true })
});

// Regola derivata dal motore (non stampata nel libro): la tabella 13 è un
// blocco di 4 settimane per chi gareggia con regolarità; per arrivare alla
// gara obiettivo il blocco si ripete a ritroso. Ripetizione approvata
// dall'atleta il 27 novembre 2026.
export const BLOCK_REPETITION_RULE = Object.freeze({
    id: 'trail_block_repetition',
    version: '1.1.0',
    ruleStatus: 'approved_for_drafts',
    approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-27' }),
    label: 'Regola derivata dal motore, approvata dall\'atleta',
    appliesTo: Object.freeze(['trail_15_50km']),
    maxWeeks: 12,
    longGoalThresholdKm: 26,
    explanation: 'Regola derivata dal motore e approvata dall\'atleta (27 novembre 2026): il blocco di 4 settimane della tabella 13 si ripete a ritroso dalla gara obiettivo (al massimo 12 settimane e non prima di oggi). L\'ultima settimana è quella del blocco con la gara più vicina alla distanza obiettivo (settimana 1 "Gara 30 km" da 26 km in su, altrimenti settimana 3 "Gara 22 km"); le gare dei blocchi precedenti diventano "Gara o lungo su sterrato di X km a CRF", salvo gare reali in calendario.'
});

// Regole di adattamento della frequenza dettate e approvate dall'atleta il
// 13 novembre 2026 (per le tabelle a distanza/tempo). L'estensione a
// "breathing_km" (tabelle 11 e 13) è approvata dall'atleta il 27 novembre 2026
// (campo breathingKmExtension); la quinta corsa "X km CRF" non è in nessuna
// tabella. Il ciclo respiratorio in minuti (tabella 5) resta a 4
// sedute; le tabelle trail/ultra in km usano la variante ultra.
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
    // Tabelle trail/ultra (10 evoluti, 11, 13) ridotte a 3 o 4 corse con lo
    // stesso modello dell'atleta. Tetto approvato: il lungo cresce al massimo
    // del 25% e mai oltre il lungo più lungo della tabella.
    ultra_reduced_sessions: Object.freeze({
        id: 'ultra_reduced_sessions_athlete_variant',
        version: '1.1.0',
        ruleStatus: 'approved_for_drafts',
        approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-14' }),
        appliesToMethods: Object.freeze(['ultra_distance', 'breathing_km']),
        warmupKm: 2,
        cooldownKm: 1,
        maxLongIncrease: 0.25,
        explanation: 'Si omettono le corse facili più brevi (non le notturne né la qualità); le altre corse non lunghe ricevono 2 km di riscaldamento e 1 km di defaticamento; il lungo del fine settimana cresce dei km omessi, al massimo del 25% e senza superare il lungo massimo della tabella.'
    }),
    five_sessions_spread: Object.freeze({
        id: 'five_sessions_spread_plus_10',
        version: '1.0.0',
        ruleStatus: 'approved_for_drafts',
        approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }),
        appliesToMethods: Object.freeze(['distance_time', 'breathing_km']),
        breathingKmExtension: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-27' }),
        volumeIncrease: 0.10,
        explanation: 'Le quattro sedute del modello restano invariate; una quinta corsa facile aggiunge il 10% dei km settimanali.'
    }),
    five_sessions_extra: Object.freeze({
        id: 'five_sessions_extra_quality_or_strength',
        version: '1.0.0',
        ruleStatus: 'approved_for_drafts',
        approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }),
        appliesToMethods: Object.freeze(['distance_time', 'breathing_km']),
        breathingKmExtension: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-27' }),
        explanation: 'Le quattro sedute del modello restano invariate; si aggiunge una seduta di qualità o in palestra, il cui contenuto va scelto dall\'atleta.'
    })
});

export const FIVE_SESSION_OPTIONS = Object.freeze(['spread_plus_10', 'extra_quality_or_strength']);

export function getCycleTranscription(ruleId) {
    if (CYCLE_TRANSCRIPTIONS[ruleId]) return CYCLE_TRANSCRIPTIONS[ruleId];
    const trail = TRAIL_CYCLE_TRANSCRIPTIONS[ruleId];
    if (!trail) return null;
    return { ...trail, method: trail.intensity === 'vr_based' ? 'ultra_distance' : 'breathing_km' };
}

export function parseCycleCell(raw) {
    const text = String(raw ?? '').split('/').join(' ').replace(/\s+/g, ' ').trim();
    const base = { raw: String(raw ?? ''), text, distanceKm: null, means: [], breathing: [], quality: false, optional: false };
    if (!text) return { ...base, kind: 'unparsed' };
    if (/^riposo$/i.test(text)) return { ...base, kind: 'rest' };
    if (/^riposo o esercizi[o]?$/i.test(text)) return { ...base, kind: 'rest_or_exercises' };
    if (/test di verifica/i.test(text)) {
        return { ...base, kind: 'reference_test', protocol: null, raceAlternative: /\bo gara\b/i.test(text) };
    }
    if (/^test\b.*\bconconi\b/i.test(text)) {
        return { ...base, kind: 'reference_test', protocol: 'conconi', raceAlternative: false };
    }
    if (/^gara(\s|$)/i.test(text)) return { ...base, kind: 'race', raceDistanceKm: raceDistanceFromText(text) };
    if (/^esercizi$/i.test(text)) return { ...base, kind: 'strength' };
    if (/mezza maratona/i.test(text)) {
        return { ...base, kind: 'time_trial', raceDistanceKm: 21.1, breathing: breathingCodes(text) };
    }

    const optional = /^riposo o /i.test(text);
    const body = optional ? text.replace(/^riposo o /i, '') : text;
    const means = [...new Set(body.match(/\b(?:MLSS|VAM|SB|SL|RMA|RME|LLM|LLU|DAU|L|M|B|T|P)\b/g) || [])];
    if (/ritmo gara/i.test(body)) means.push('RG');
    const breathing = breathingCodes(body);

    let remaining = body.replace(/gara\s+(?:di\s+)?\d+(?:-\d+)?\s*km/gi, ' ');
    let distance = 0;
    remaining = remaining.replace(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(km|m)\b/gi, (match, reps, size, unit) => {
        const value = Number(size.replace(',', '.'));
        distance += Number(reps) * (unit.toLowerCase() === 'km' ? value : value / 1000);
        return ' ';
    });
    // Ripetute stampate senza unità ("10 x 400 VAM"): misura in metri.
    remaining = remaining.replace(/(\d+)\s*x\s*(\d{3,4})\b(?!\s*['’])/g, (match, reps, size) => {
        distance += Number(reps) * Number(size) / 1000;
        return ' ';
    });
    for (const match of remaining.matchAll(/(\d+(?:[.,]\d+)?)\s*km/gi)) {
        distance += Number(match[1].replace(',', '.'));
    }
    // Ripetute brevi senza unità ("2 x 3 rec. 3' MLSS"): misura in km.
    remaining = remaining.replace(/(\d+)\s*x\s*(\d{1,2})\b(?!\s*(?:km|m\b|['’"]))/g, (match, reps, size) => {
        distance += Number(reps) * Number(size);
        return ' ';
    });
    // Lunghi stampati senza "km" ("20 LLU").
    for (const match of remaining.matchAll(/(?:^|\s)(\d+)\s+(?=LLU|DAU)/g)) {
        distance += Number(match[1]);
    }
    // Tabelle in km e respiro stampate senza "km" ("12 CRF / p").
    const bareBreathingKm = !distance && !/['’"]/.test(remaining) ? remaining.trim().match(/^(\d+)\s+CR(?:MF|MI|LI|F|I)\b/) : null;
    if (bareBreathingKm) distance += Number(bareBreathingKm[1]);
    if (!distance && !means.length && !breathing.length) return { ...base, kind: 'unparsed', optional };
    const climb = /in salita|\bSB\b/i.test(body);
    return {
        ...base,
        kind: 'run',
        distanceKm: distance ? round1(distance) : null,
        means,
        breathing,
        // Nelle celle solo a respiro la qualità è data da CRLI/CRI/CRMI o salite.
        quality: means.some(mean => QUALITY_MEANS.includes(mean))
            || (!means.length && (breathing.some(code => HARD_BREATHING.includes(code)) || climb || /più forte/i.test(body))),
        optional,
        night: /sera|notte/i.test(body),
        climb,
        terrain: terrainFromText(body),
        surface: /sterrato/i.test(body) ? 'sterrato' : null
    };
}

function breathingCodes(text) {
    return [...new Set(String(text).match(/\bCR(?:MF|MI|LI|F|I)\b/g) || [])];
}

// "p" = pianeggiante, "ss" = saliscendi (tabelle 11-13).
function terrainFromText(text) {
    if (/(?:^|\s)ss\.?(?=\s|$)/.test(text)) return 'saliscendi';
    if (/(?:^|\s)p\.?(?=\s|$)/.test(text)) return 'pianeggiante';
    if (/in salita/i.test(text)) return 'salita';
    return null;
}

function raceDistanceFromText(text) {
    const km = text.match(/gara\s+(?:di\s+)?(\d+(?:[.,]\d+)?)\s*km/i);
    if (km) return Number(km[1].replace(',', '.'));
    if (/mezza maratona/i.test(text)) return 21.1;
    if (/maratona/i.test(text)) return 42.195;
    return null;
}

export const TERRAIN_LABELS = Object.freeze({
    pianeggiante: 'pianeggiante (p)',
    saliscendi: 'saliscendi (ss)',
    salita: 'in salita'
});

export function buildWeeklyCyclePattern(ruleId) {
    const transcription = getCycleTranscription(ruleId);
    if (!transcription) return null;
    const options = TRAIL_TABLE_OPTIONS[ruleId] || null;
    const limits = options ? { baseSessions: options.baseRunningSessions, maxLongKm: tableMaxLongKm(transcription) } : null;
    const lastWeek = transcription.durationWeeks;
    return deepFreeze({
        kind: 'explicit_weekly_cycle',
        ruleId,
        method: transcription.method,
        durationWeeks: transcription.durationWeeks,
        runningSessionsPerWeek: options?.baseRunningSessions ?? 4,
        paceBands: options ? options.paceBands : true,
        referenceTestOptional: Boolean(options?.referenceTestOptional),
        vrPaceModel: Boolean(options?.vrPaceModel),
        blockRepetition: options?.blockRepetition ? { ...BLOCK_REPETITION_RULE } : null,
        maxLongKm: limits?.maxLongKm ?? null,
        source: { ...transcription.source, table: transcription.table },
        weeks: transcription.weeks.map(week => ({
            weekNumber: week.weekNumber,
            ...(limits ? { limits } : {}),
            sessions: week.days
                .map(day => ({ day: `giorno_${day.day}`, bookDay: day.day, cell: parseCycleCell(day.raw), uncertain: Boolean(day.uncertain) }))
                .filter(({ cell }) => !NON_SESSION_KINDS.includes(cell.kind))
                .map(({ day, bookDay, cell, uncertain }) => {
                    // Gare e mezze dentro le tabelle trail (non l'ultima settimana)
                    // sono gare di allenamento.
                    const inTableRace = options && !options.blockRepetition && week.weekNumber !== lastWeek
                        && RACE_LIKE_KINDS.includes(cell.kind);
                    return {
                        day,
                        bookDay,
                        type: inTableRace ? 'race_training' : cell.kind,
                        raw: cell.raw,
                        distanceKm: inTableRace ? cell.raceDistanceKm ?? null : cell.distanceKm,
                        means: cell.means,
                        breathing: cell.breathing,
                        quality: cell.quality,
                        optional: cell.optional,
                        night: Boolean(cell.night),
                        climb: Boolean(cell.climb),
                        terrain: cell.terrain ?? null,
                        surface: cell.surface ?? null,
                        ...(cell.kind === 'reference_test' ? { protocol: cell.protocol } : {}),
                        ...(cell.raceDistanceKm ? { raceDistanceKm: cell.raceDistanceKm } : {}),
                        uncertain
                    };
                })
        }))
    });
}

// Lungo massimo della tabella (tetto approvato della riduzione): corse e gare
// di allenamento, esclusa la gara obiettivo.
function tableMaxLongKm(transcription) {
    const cells = transcription.weeks.flatMap(week => week.days.map(day => parseCycleCell(day.raw)));
    const goal = transcription.goalDistanceKm ?? Infinity;
    const values = cells.flatMap(cell => {
        if (cell.kind === 'run' && cell.distanceKm) return [cell.distanceKm];
        if (cell.kind === 'race' && cell.raceDistanceKm && cell.raceDistanceKm < goal) return [cell.raceDistanceKm];
        return [];
    });
    return values.length ? Math.max(...values) : null;
}

export function adaptWeekToFrequency(week, method, targetSessions, { fiveSessionOption = null, isRaceWeek = false } = {}) {
    const sessions = week.sessions.map(session => ({ ...session, adaptations: [] }));
    if (TRAIL_METHODS.includes(method)) {
        return adaptTrailWeek(week, sessions, method, targetSessions, { fiveSessionOption, isRaceWeek });
    }
    if (targetSessions === 4) {
        return { weekNumber: week.weekNumber, sessions, notes: [] };
    }
    if (method !== 'distance_time' || ![3, 5].includes(targetSessions)) {
        throw new Error(`Nessuna regola approvata adatta questo ciclo a ${targetSessions} corse settimanali.`);
    }

    const runs = sessions.filter(session => session.type === 'run');
    const longRun = findLongRun(sessions, method);
    if (targetSessions === 3) {
        return adaptToThreeSessions(week.weekNumber, sessions, runs, longRun);
    }
    return addFifthSession(week.weekNumber, sessions, runs, longRun, { fiveSessionOption, isRaceWeek, method });
}

function addFifthSession(weekNumber, sessions, runs, longRun, { fiveSessionOption, isRaceWeek, method }) {
    if (!FIVE_SESSION_OPTIONS.includes(fiveSessionOption)) {
        throw new Error('Per 5 corse settimanali scegli tra la variante +10% km e la seduta di qualità o palestra.');
    }
    if (isRaceWeek) {
        return {
            weekNumber,
            sessions,
            notes: ['Settimana di gara: la quinta seduta non viene aggiunta per non aumentare il carico prima della gara.']
        };
    }
    if (fiveSessionOption === 'spread_plus_10') {
        const weeklyKm = runs.reduce((total, session) => total + (session.distanceKm || 0), 0);
        const extraKm = roundHalf(weeklyKm * FREQUENCY_ADAPTATION_RULES.five_sessions_spread.volumeIncrease);
        if (!extraKm) {
            return { weekNumber, sessions, notes: ['Km settimanali non determinabili: nessuna quinta seduta aggiunta.'] };
        }
        const breathing = method === 'breathing_km';
        return {
            weekNumber,
            sessions: insertBeforeLong(sessions, longRun, {
                day: 'aggiunta',
                bookDay: null,
                type: 'run',
                raw: breathing ? `${formatKm(extraKm)} km CRF` : `${formatKm(extraKm)} km L`,
                distanceKm: extraKm,
                means: breathing ? [] : ['L'],
                breathing: breathing ? ['CRF'] : [],
                quality: false,
                optional: false,
                uncertain: false,
                adaptations: [`Seduta aggiunta: +10% dei ${formatKm(round1(weeklyKm))} km settimanali del modello.`]
            }),
            notes: [FREQUENCY_ADAPTATION_RULES.five_sessions_spread.explanation]
        };
    }
    return {
        weekNumber,
        sessions: insertBeforeLong(sessions, longRun, {
            day: 'aggiunta',
            bookDay: null,
            type: 'extra_choice',
            raw: 'Seduta di qualità o in palestra (da scegliere)',
            distanceKm: null,
            means: [],
            breathing: [],
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

// Default per settimane costruite a mano (tabella 10 evoluti).
const DEFAULT_TRAIL_LIMITS = Object.freeze({
    ultra_distance: Object.freeze({ baseSessions: 5, maxLongKm: tableMaxLongKm(TRAIL_CYCLE_TRANSCRIPTIONS.ultra_100km_evoluto) }),
    breathing_km: Object.freeze({ baseSessions: 4, maxLongKm: tableMaxLongKm(TRAIL_CYCLE_TRANSCRIPTIONS.ultra_100km_passatore) })
});

// Tabelle 10 evoluti, 11 e 13: riduzione a 3-4 corse con la regola ultra
// approvata; con 5 corse e tabella a 4 si usano le due varianti approvate.
function adaptTrailWeek(week, sessions, method, targetSessions, { fiveSessionOption, isRaceWeek }) {
    const weekNumber = week.weekNumber;
    const rule = FREQUENCY_ADAPTATION_RULES.ultra_reduced_sessions;
    const limits = week.limits || DEFAULT_TRAIL_LIMITS[method];
    if (![3, 4, 5].includes(targetSessions)) {
        throw new Error(`Nessuna regola approvata adatta questo ciclo a ${targetSessions} corse settimanali.`);
    }
    const runs = sessions.filter(session => session.type === 'run');
    // Gare (anche di allenamento) contano tra le corse; il test no.
    const raceCount = sessions.filter(session => RACE_LIKE_KINDS.includes(session.type)).length;
    const longRun = findLongRun(sessions, method);
    const toRemove = runs.length + raceCount - targetSessions;
    if (toRemove < 0 && targetSessions === 5 && limits.baseSessions < 5) {
        return addFifthSession(weekNumber, sessions, runs, longRun, { fiveSessionOption, isRaceWeek, method });
    }
    if (toRemove <= 0) return { weekNumber, sessions, notes: [] };

    const candidates = runs.filter(session => session !== longRun);
    const priority = session => (session.optional ? 0 : 1) + (session.quality ? 4 : 0) + (session.night ? 2 : 0);
    const removed = candidates
        .slice()
        .sort((left, right) => priority(left) - priority(right) || (left.distanceKm ?? Infinity) - (right.distanceKm ?? Infinity))
        .slice(0, toRemove);
    const removedKm = removed.reduce((total, session) => total + (session.distanceKm || 0), 0);
    const maxLong = limits.maxLongKm ?? Infinity;
    const notes = [rule.explanation];
    if (removed.some(session => session.quality || session.night)) {
        notes.push('Restano da omettere solo sedute di qualità o notturne: verifica la scelta prima di confermare.');
    }
    let addedKm = 0;
    if (longRun?.distanceKm) {
        addedKm = Math.floor(Math.min(removedKm, longRun.distanceKm * rule.maxLongIncrease, Math.max(0, maxLong - longRun.distanceKm)));
        if (addedKm < removedKm) {
            notes.push(`Riassegnati al lungo ${formatKm(addedKm)} km su ${formatKm(round1(removedKm))} omessi, per non superare +25% o il lungo massimo della tabella (${formatKm(maxLong)} km).`);
        }
    } else {
        notes.push(`Settimana senza lungo facile nel fine settimana: i ${formatKm(round1(removedKm))} km omessi non vengono riassegnati.`);
    }
    const result = sessions
        .filter(session => !removed.includes(session))
        .map(session => {
            if (session === longRun) {
                return {
                    ...session,
                    distanceKm: session.distanceKm === null ? null : round1(session.distanceKm + addedKm),
                    adaptations: addedKm ? [`Lungo aumentato di ${formatKm(addedKm)} km (sedute omesse: ${removed.map(item => cleanRaw(item.raw)).join('; ')}).`] : []
                };
            }
            if (session.type === 'run' && !session.quality) {
                return {
                    ...session,
                    distanceKm: session.distanceKm === null ? null : round1(session.distanceKm + rule.warmupKm + rule.cooldownKm),
                    warmupKm: rule.warmupKm,
                    cooldownKm: rule.cooldownKm,
                    adaptations: [`Aggiunti ${rule.warmupKm} km di riscaldamento e ${rule.cooldownKm} km di defaticamento.`]
                };
            }
            return session;
        });
    return { weekNumber, sessions: result, skipped: removed[0] || null, removed, notes };
}

// Indicazioni sul percorso per le tabelle trail/ultra. I lunghi del fine
// settimana si fanno su percorsi simili alla gara (p. 210): stessa pendenza
// media della gara (D+ e D-), limitata a quanto si sale in metà del tempo
// stimato alla velocità ascensionale del libro (p. 266). In salita si va a
// sforzo: il passo al km vale solo per i tratti pianeggianti.
export function elevationGuidance(session, {
    raceKm,
    raceElevationM,
    raceElevationLossM = null,
    climbRate = CLIMB_RATE_M_PER_HOUR.amatore,
    paceSecondsPerKm = null
} = {}) {
    if (session.type !== 'run' || !session.distanceKm) return null;
    const vertical = verticalTimeText(climbRate);
    if (session.climb) {
        return {
            meters: null,
            lossMeters: null,
            climbByEffort: true,
            verticalMinutesPer100m: 6000 / climbRate,
            text: `Salite a sforzo, non a passo: tempo verticale indicativo ${vertical} ogni 100 m D+ (${climbRate} m/h, p. 266); il passo al km vale solo per i tratti pianeggianti.`
        };
    }
    if (session.terrain === 'pianeggiante') {
        return { meters: 0, lossMeters: 0, text: 'Percorso pianeggiante (p nella tabella).' };
    }
    const weekendLong = session.bookDay >= 6 && !session.quality && isEasyLongCandidate(session, true);
    if (!weekendLong && session.terrain !== 'saliscendi') {
        return { meters: 0, lossMeters: 0, text: 'Percorso pianeggiante o ondulato (seduta infrasettimanale o di qualità).' };
    }
    if (raceElevationM === 0) {
        return { meters: 0, lossMeters: 0, text: 'Gara in pianura: sostituisci i saliscendi con tratti in pianura (p. 211).' };
    }
    if (!raceKm || !raceElevationM) {
        return { meters: null, lossMeters: null, text: 'Percorso simile alla gara: inserisci il dislivello della gara per calcolare quello della seduta.' };
    }
    const density = raceElevationM / raceKm;
    const rawLoss = raceElevationLossM === null || raceElevationLossM === undefined || raceElevationLossM === '' ? NaN : Number(raceElevationLossM);
    const lossEstimated = !Number.isFinite(rawLoss) || rawLoss < 0;
    const lossDensity = lossEstimated ? density : rawLoss / raceKm;
    let meters = session.distanceKm * density;
    let ratio = 1;
    if (paceSecondsPerKm) {
        const hours = session.distanceKm * paceSecondsPerKm / 3600;
        const maxMeters = hours * 0.5 * climbRate;
        if (meters > maxMeters) {
            ratio = maxMeters / meters;
            meters = maxMeters;
        }
    }
    const capped = ratio < 1;
    const uncapped = !paceSecondsPerKm;
    meters = round50(meters);
    const lossMeters = lossEstimated ? meters : round50(session.distanceKm * lossDensity * ratio);
    const climbHours = meters / climbRate;
    return {
        meters,
        lossMeters,
        lossEstimated,
        climbByEffort: true,
        verticalMinutesPer100m: 6000 / climbRate,
        text: `Dislivello da inserire nella traccia: circa ${meters} m D+ e ${lossMeters} m D- (gara ${Math.round(density)} m/km${capped ? ', ridotto a metà del tempo in salita' : ''}).`
            + (lossEstimated ? ' D- stimato uguale al D+ (percorso ad anello).' : '')
            + (uncapped ? ' Senza VR né passo di riferimento il D+ non è limitato a metà del tempo in salita: se la salita supera metà del tempo di corsa, riducilo.' : '')
            + ` In salita vai a sforzo, non a passo: tempo verticale indicativo ${vertical} ogni 100 m D+ (${climbRate} m/h), circa ${formatHours(climbHours)} di salita; il passo al km vale solo per i tratti pianeggianti.`
    };
}

function verticalTimeText(climbRate) {
    const seconds = Math.round(360000 / climbRate);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}'${String(rest).padStart(2, '0')}"` : `${minutes}'`;
}

function round50(value) {
    return Math.round(value / 50) * 50;
}

function formatHours(hours) {
    const total = Math.round(hours * 60);
    return total >= 60 ? `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}'` : `${total}'`;
}

// Corsa facile adatta a fare da lungo: L/M/LLM/LLU, CRMF/CRF o, nelle
// tabelle in km e respiro, una corsa senza sigle ("10 km sterrato ss").
function isEasyLongCandidate(session, allowBare) {
    if (session.quality) return false;
    const means = session.means || [];
    const breathing = session.breathing || [];
    if (means.length) return means.every(mean => LONG_RUN_MEANS.includes(mean)) && breathing.every(code => EASY_BREATHING.includes(code));
    if (breathing.length) return breathing.every(code => EASY_BREATHING.includes(code));
    return allowBare;
}

function findLongRun(sessions, method) {
    // Con test, gara o prova al giorno 7 la settimana non ha un lungo da
    // allungare: i km omessi non vengono spostati a ridosso della prova.
    const lastDay = sessions.find(session => session.bookDay === 7);
    if (lastDay && lastDay.type !== 'run') return null;
    // Solo una corsa facile fa da lungo: i km omessi non si sommano a tempo
    // run, progressivi, bis, salite o lavori a ritmo gara.
    const weekend = sessions.filter(session => session.type === 'run' && !session.optional && session.bookDay >= 6
        && isEasyLongCandidate(session, method === 'breathing_km'));
    if (!weekend.length) return null;
    return weekend.reduce((longest, session) =>
        (session.distanceKm || 0) >= (longest.distanceKm || 0) ? session : longest);
}

function insertBeforeLong(sessions, longRun, extra) {
    const lastDay = sessions.findIndex(session => session.bookDay === 7);
    const index = longRun ? sessions.indexOf(longRun) : lastDay >= 0 ? lastDay : sessions.length;
    return [...sessions.slice(0, index), extra, ...sessions.slice(index)];
}

// Tabella 13 (regola derivata BLOCK_REPETITION_RULE): ripete il blocco di 4
// settimane a ritroso dalla gara. Restituisce un pattern con le settimane del
// piano (weekNumber progressivo, blockWeek = settimana della tabella).
export function expandRepeatedBlock(pattern, { goalDistanceKm, raceDate, today = null, secondaryRaces = [] }) {
    if (!pattern?.blockRepetition) return pattern;
    if (!isIsoDate(raceDate)) throw new Error('La data della gara non è valida.');
    const rule = pattern.blockRepetition;
    const blockLength = pattern.weeks.length;
    const alignedBlockWeek = Number(goalDistanceKm) >= rule.longGoalThresholdKm ? 1 : 3;
    const availableWeeks = today ? Math.floor((daysBetween(today, raceDate) + 1) / 7) : rule.maxWeeks;
    const totalWeeks = Math.max(1, Math.min(rule.maxWeeks, availableWeeks));
    const races = (secondaryRaces || []).filter(race => isIsoDate(race?.event_date) && race.event_date < raceDate);
    const weeks = Array.from({ length: totalWeeks }, (_, index) => {
        const weekNumber = index + 1;
        const blockWeek = ((alignedBlockWeek - 1 - (totalWeeks - weekNumber)) % blockLength + blockLength) % blockLength + 1;
        const source = pattern.weeks.find(week => week.weekNumber === blockWeek);
        const isFinal = weekNumber === totalWeeks;
        const weekEnd = addDays(raceDate, -7 * (totalWeeks - weekNumber));
        const weekStart = addDays(weekEnd, -6);
        const realRace = races.find(race => race.event_date >= weekStart && race.event_date <= weekEnd);
        const sessions = source.sessions.map(session => {
            if (session.type !== 'race' || isFinal) return session;
            const km = session.raceDistanceKm;
            if (realRace) {
                const realKm = Number(realRace.distance_km) || null;
                return {
                    ...session,
                    type: 'race_training',
                    raw: `Gara: ${realRace.name || 'gara in calendario'}${realKm ? ` (${formatKm(realKm)} km)` : ''}`,
                    distanceKm: realKm,
                    fixedDate: realRace.event_date,
                    derivedRule: rule.id,
                    derivedNote: `Al posto della "${cleanRaw(session.raw)}" della tabella: gara reale in calendario.`
                };
            }
            return {
                ...session,
                type: 'run',
                raw: `Gara o lungo su sterrato di ${formatKm(km)} km a CRF`,
                distanceKm: km,
                means: [],
                breathing: ['CRF'],
                quality: false,
                surface: 'sterrato',
                derivedRule: rule.id,
                derivedNote: `Tabella: "${cleanRaw(session.raw)}". ${rule.label}: blocco ripetuto, la gara diventa gara o lungo a CRF.`
            };
        });
        return { weekNumber, blockWeek, ...(source.limits ? { limits: source.limits } : {}), sessions };
    });
    return {
        ...pattern,
        durationWeeks: totalWeeks,
        alignedBlockWeek,
        weeks,
        notes: [rule.explanation]
    };
}

export function scheduleCycleDraft({
    pattern: basePattern,
    raceDate,
    availableDays,
    blockedDays = [],
    targetSessions = 4,
    fiveSessionOption = null,
    today = null,
    vrSecondsPerKm = null,
    goalDistanceKm = null,
    raceElevationM = null,
    raceElevationLossM = null,
    experience = 'amatore',
    secondaryRaces = []
}) {
    if (!basePattern || basePattern.kind !== 'explicit_weekly_cycle') {
        throw new Error('Serve un ciclo con sedute trascritte e approvate.');
    }
    if (!isIsoDate(raceDate)) throw new Error('La data della gara non è valida.');
    const pattern = basePattern.blockRepetition
        ? expandRepeatedBlock(basePattern, { goalDistanceKm, raceDate, today, secondaryRaces })
        : basePattern;
    const usableDays = new Set(availableDays.filter(day => DAY_KEYS.includes(day) && !blockedDays.includes(day)));
    const totalWeeks = pattern.durationWeeks;
    const issues = [];
    const usePaceBands = pattern.paceBands !== false && pattern.method !== 'breathing_km';
    const useVrModel = Boolean(pattern.vrPaceModel) && Number.isInteger(vrSecondsPerKm) && vrSecondsPerKm > 0;
    const climbRate = CLIMB_RATE_M_PER_HOUR[experience] || CLIMB_RATE_M_PER_HOUR.amatore;

    const weeks = pattern.weeks.map(week => {
        const isRaceWeek = week.weekNumber === totalWeeks;
        const adapted = adaptWeekToFrequency(week, pattern.method, targetSessions, { fiveSessionOption, isRaceWeek });
        const weekEnd = addDays(raceDate, -7 * (totalWeeks - week.weekNumber));
        const weekStart = addDays(weekEnd, -6);
        const windowDates = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
        const pinned = adapted.sessions.filter(session => session.fixedDate || (session.type === 'race' && isRaceWeek));
        const pinnedDates = new Set(pinned.map(session => session.fixedDate ?? raceDate));
        // Esercizi e test facoltativo occupano un giorno solo se ne avanzano.
        const usableCount = windowDates.filter(date => usableDays.has(dayKey(date))).length;
        const flexible = adapted.sessions.filter(session => session.type === 'strength'
            || (session.type === 'reference_test' && pattern.referenceTestOptional));
        const core = adapted.sessions.filter(session => !pinned.includes(session) && !flexible.includes(session));
        let spare = usableCount - core.length;
        const keptFlexible = flexible
            .slice()
            .sort((left, right) => (left.type === 'reference_test' ? 0 : 1) - (right.type === 'reference_test' ? 0 : 1))
            .filter(session => {
                if (spare > 0) {
                    spare -= 1;
                    return true;
                }
                adapted.notes = [...adapted.notes, session.type === 'strength'
                    ? 'Giorni insufficienti per il giorno di esercizi di forza: fai gli esercizi a fine seduta (p. 269).'
                    : 'Giorni insufficienti per il test Conconi: non è richiesto per la bozza; se vuoi, fallo al posto della prima corsa facile della settimana.'];
                return false;
            });
        const free = adapted.sessions.filter(session => !pinned.includes(session)
            && (!flexible.includes(session) || keptFlexible.includes(session)));
        const candidateDates = windowDates
            .filter(date => usableDays.has(dayKey(date)))
            .filter(date => !pinnedDates.has(date))
            .filter(date => !(isRaceWeek && pinned.some(session => session.type === 'race') && date >= raceDate));
        if (candidateDates.length < free.length) {
            issues.push(`Settimana ${week.weekNumber}: servono ${free.length} giorni disponibili, ne risultano ${candidateDates.length}.`);
        }
        const chosenDates = pickDatesByBookDay(candidateDates, free, weekStart);
        const scheduled = [
            ...free.map((session, index) => ({ ...session, date: chosenDates[index] ?? null })),
            ...pinned.map(session => ({ ...withGoalRaceLabel(session, isRaceWeek, goalDistanceKm), date: session.fixedDate ?? raceDate }))
        ]
            .sort((left, right) => String(left.date ?? '9999').localeCompare(String(right.date ?? '9999')))
            .map(session => enrichSession(session, {
                method: pattern.method,
                usePaceBands,
                useVrModel,
                vrSecondsPerKm,
                goalDistanceKm,
                raceElevationM,
                raceElevationLossM,
                climbRate
            }));
        return {
            weekNumber: week.weekNumber,
            ...(week.blockWeek ? { blockWeek: week.blockWeek } : {}),
            startDate: weekStart,
            endDate: weekEnd,
            sessions: scheduled,
            skipped: adapted.skipped || null,
            notes: [
                ...(week.blockWeek ? [`Settimana ${week.blockWeek} del blocco della tabella ${pattern.source.table} (${BLOCK_REPETITION_RULE.label.toLowerCase()}).`] : []),
                ...adapted.notes
            ]
        };
    });

    if (today && weeks[0].startDate < today) {
        issues.unshift(`Il ciclo di ${totalWeeks} settimane dovrebbe iniziare il ${weeks[0].startDate}, prima di oggi: la gara è troppo vicina per questa tabella.`);
    }

    return {
        status: issues.length ? 'needs_availability_review' : 'draft_ready_for_confirmation',
        startDate: weeks[0].startDate,
        endDate: weeks[weeks.length - 1].endDate,
        durationWeeks: totalWeeks,
        targetSessions,
        fiveSessionOption: targetSessions === 5 ? fiveSessionOption : null,
        vrSecondsPerKm: usePaceBands || useVrModel ? vrSecondsPerKm : null,
        method: pattern.method,
        intensity: useVrModel ? 'breathing_vr' : pattern.method === 'breathing_km' ? 'breathing' : 'pace',
        source: pattern.source,
        ...(pattern.alignedBlockWeek ? { alignedBlockWeek: pattern.alignedBlockWeek } : {}),
        derivedRules: pattern.blockRepetition ? [{ ...BLOCK_REPETITION_RULE }] : [],
        notes: [
            ...(useVrModel
                ? ['Modello a passo dalla VR approvato dall\'atleta: ogni ritmo respiratorio della tabella diventa la fascia di passo del libro (CRMF VR+60-90", CRF VR+40-50", CRLI VR+15-25", CRI VR+5-10", pp. 174-177). Il respiro resta il controllo: se non corrisponde, rallenta.']
                : pattern.method === 'breathing_km' ? ['Tabella a ritmo respiratorio: chilometri e sensazioni, nessun passo al km (p. 211).'] : []),
            ...(pattern.notes || [])
        ],
        weeks,
        issues,
        requiresSelection: weeks.some(week => week.sessions.some(session => session.requiresSelection)),
        requiresConfirmation: true
    };
}

// Ultima settimana: la gara fissata è quella reale, non la cella della tabella
// (es. "Gara 30 km" della tabella 13 con una gara di 50 km).
function withGoalRaceLabel(session, isRaceWeek, goalDistanceKm) {
    const goal = Number(goalDistanceKm);
    if (!isRaceWeek || session.type !== 'race' || session.fixedDate || !session.raceDistanceKm
        || !(goal > 0) || Math.abs(goal - session.raceDistanceKm) < 0.05) return session;
    return {
        ...session,
        raw: `Gara ${formatKm(goal)} km`,
        raceDistanceKm: goal,
        adaptations: [...(session.adaptations || []), `Gara reale di ${formatKm(goal)} km al posto della cella della tabella ("${cleanRaw(session.raw)}").`]
    };
}

function enrichSession(session, { method, usePaceBands, useVrModel = false, vrSecondsPerKm, goalDistanceKm, raceElevationM, raceElevationLossM, climbRate }) {
    const bands = usePaceBands && session.type === 'run'
        ? paceBandsForCell(session.raw, vrSecondsPerKm, goalDistanceKm)
        : useVrModel && ['run', 'race_training', 'time_trial'].includes(session.type)
            ? paceBandsForBreathing(session, vrSecondsPerKm)
            : [];
    const targetPace = singleTargetPace(bands);
    const elevation = TRAIL_METHODS.includes(method)
        ? elevationGuidance(session, {
            raceKm: goalDistanceKm,
            raceElevationM,
            raceElevationLossM,
            climbRate,
            // Stima interna solo per il tetto del D+: mai mostrata come passo.
            paceSecondsPerKm: targetPace ?? (vrSecondsPerKm ? vrSecondsPerKm + 90 : null)
        })
        : null;
    const practicalNotes = [];
    if (session.night) practicalNotes.push(NIGHT_SESSION_NOTE);
    if (session.type === 'reference_test' && session.protocol === 'conconi') {
        practicalNotes.push('Test Conconi suggerito dalla tabella come riferimento iniziale: non è richiesto per la bozza; va eseguito e interpretato con un professionista (pp. 163-169).');
    }
    if (session.type === 'race_training' && !session.fixedDate) {
        practicalNotes.push('Gara di allenamento prevista dalla tabella: in gara o da sola, al ritmo indicato.');
    }
    if (session.derivedNote) practicalNotes.push(session.derivedNote);
    const breathingText = method === 'breathing_km' && session.breathing?.length ? describeBreathing(session.breathing) : null;
    return { ...session, paceBands: bands, targetPaceSecondsPerKm: targetPace, elevation, breathingText, practicalNotes };
}

export function draftToCalendarSessions(draft) {
    if (draft.status !== 'draft_ready_for_confirmation') {
        throw new Error('La bozza ha conflitti di disponibilità da risolvere prima della conferma.');
    }
    if (draft.requiresSelection) {
        throw new Error('Scegli il contenuto delle sedute di qualità o palestra prima di confermare la bozza.');
    }
    return draft.weeks.flatMap(week => week.sessions.map(session => {
        const offRoad = draft.method === 'ultra_distance'
            || session.terrain === 'saliscendi' || session.surface === 'sterrato';
        const onClimb = session.climb || (session.elevation?.meters ?? 0) > 0;
        return {
            scheduled_date: session.date,
            title: `Tab. ${draft.source.table} · S${week.weekNumber} · ${cleanRaw(session.raw)}`.slice(0, 120),
            sport_type: session.type === 'strength' || (session.type === 'extra_choice' && session.selected === 'strength')
                ? 'strength'
                : session.type === 'run' && offRoad && ['ultra_distance', 'breathing_km'].includes(draft.method) ? 'trail' : 'run',
            distance_km: session.distanceKm,
            duration_minutes: null,
            target_pace_seconds_per_km: session.targetPaceSecondsPerKm ?? null,
            notes: [
                `Fonte: Tipi che corrono, tabella ${draft.source.table}, settimana ${week.blockWeek ?? week.weekNumber}${session.bookDay ? `, giorno ${session.bookDay}` : ''}.`,
                ...(week.blockWeek ? [`Settimana ${week.weekNumber} del piano: ${BLOCK_REPETITION_RULE.label.toLowerCase()} (blocco ripetuto).`] : []),
                ...(session.adaptations || []),
                ...(session.terrain && TERRAIN_LABELS[session.terrain] ? [`Terreno: ${TERRAIN_LABELS[session.terrain]}.`] : []),
                ...(session.breathingText ? [session.paceBands?.length ? `Ritmo respiratorio: ${session.breathingText}.` : `Ritmo respiratorio, senza passo al km: ${session.breathingText}.`] : []),
                ...(session.elevation ? [session.elevation.text] : []),
                ...(session.paceBands?.length ? [`Passi dalla tua VR ${formatVr(draft.vrSecondsPerKm)}${onClimb ? ' (solo tratti pianeggianti)' : ''}: ${describeBands(session.paceBands)}.`] : []),
                ...(session.practicalNotes || []),
                ...(session.uncertain ? ['Cella con lettura incerta nella scansione: verifica prima di seguirla.'] : [])
            ].join(' ')
        };
    }));
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

function formatVr(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km`;
}

function cleanRaw(raw) {
    return String(raw ?? '').split('/').join(' ').replace(/\s+/g, ' ').trim();
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
