// Proposte di modifica a bozze e piani applicati: gare intermedie, settimana
// saltata e test VR. Funzioni pure; nulla viene applicato senza conferma.
import { addDays, daysBetween, isIsoDate } from '../core/date-utils.js';

const DAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const RUNNING_SPORTS = Object.freeze(['run', 'trail']);
const DERIVED_LABEL = "Regola derivata, da confermare dall'atleta";

// Regola derivata (non stampata nel libro): proposta per ogni gara secondaria
// nel periodo della bozza; l'atleta la applica gara per gara.
export const INTERMEDIATE_RACE_RULE = Object.freeze({
    id: 'intermediate_race_adjustment',
    version: '1.0.0',
    ruleStatus: 'derived_pending_athlete_confirmation',
    label: DERIVED_LABEL,
    easyRunMaxKm: 5,
    explanation:
        'Regola derivata, da confermare dall\'atleta: la gara intermedia prende il posto della gara della tabella in quella settimana (tabella 11 "Gara maratona", tabella 13 "Gara"), altrimenti della seduta di quel giorno o del lungo della settimana; il giorno prima diventa riposo o corsa facile breve, il giorno dopo corsa facile/DAU o riposo.'
});

// Regola derivata (non stampata nel libro) per una settimana non svolta.
export const MISSED_WEEK_RULE = Object.freeze({
    id: 'missed_week_adjustment',
    version: '1.0.0',
    ruleStatus: 'derived_pending_athlete_confirmation',
    label: DERIVED_LABEL,
    maxLongIncrease: 0.25,
    taperDays: 21,
    explanation:
        "Regola derivata, da confermare dall'atleta: i km della settimana saltata non si recuperano; il lungo della settimana successiva cresce al massimo del 25% sull'ultimo lungo completato; le sedute di qualità restano; a meno di 3 settimane dalla gara lo scarico resta invariato."
});

// Protocolli VR supportati (training-reference-pace.js).
export const REFERENCE_TEST_PROTOCOLS = Object.freeze({
    three_km_plus_10: Object.freeze({
        label: 'Test 3 km + 10%',
        distanceKm: 3,
        description:
            '3 km al massimo sostenibile e regolare, su percorso piano e misurato (pista o strada piana). VR = tempo dei 3 km aumentato del 10% e diviso per 3.'
    }),
    ten_km: Object.freeze({
        label: 'Test 10 km',
        distanceKm: 10,
        description: '10 km al massimo sostenibile e regolare, su percorso piano e misurato. VR = tempo diviso per 10.'
    })
});

// Indicazione generale (stessi km del riscaldamento approvato per la variante
// a 3 corse), non una prescrizione del libro per il test.
const TEST_WARMUP_KM = 2;
const TEST_COOLDOWN_KM = 1;

export function proposeIntermediateRaces(draft, secondaryRaces = []) {
    if (!draft?.weeks?.length) return [];
    const goalDate = draft.endDate;
    return (secondaryRaces || [])
        .filter(race => isIsoDate(race?.event_date) && race.event_date >= draft.startDate && race.event_date < goalDate)
        .sort((left, right) => left.event_date.localeCompare(right.event_date))
        .map(race => {
            const week = draft.weeks.find(item => item.startDate <= race.event_date && item.endDate >= race.event_date);
            const target = findReplacementTarget(week, race.event_date);
            const distanceKm = Number(race.distance_km) > 0 ? Number(race.distance_km) : null;
            return {
                rule_id: INTERMEDIATE_RACE_RULE.id,
                rule_status: INTERMEDIATE_RACE_RULE.ruleStatus,
                race_id: race.id ?? null,
                race_name: race.name || 'Gara intermedia',
                event_date: race.event_date,
                distance_km: distanceKm,
                week_number: week?.weekNumber ?? null,
                target: target
                    ? { kind: target.kind, date: target.session.date, raw: target.session.raw }
                    : { kind: 'none', date: null, raw: null },
                description: describeProposal(race, target),
                applied: false
            };
        });
}

function findReplacementTarget(week, date) {
    if (!week) return null;
    const sessions = (week.sessions || []).filter(session => session.derivedRule !== INTERMEDIATE_RACE_RULE.id);
    const inTable = sessions.find(
        session =>
            session.type === 'race_training' ||
            session.type === 'time_trial' ||
            (session.derivedRule === 'trail_block_repetition' && session.raceDistanceKm)
    );
    if (inTable) return { kind: 'in_table_race', session: inTable };
    const sameDay = sessions.find(session => session.date === date);
    if (sameDay) return { kind: 'same_day', session: sameDay };
    const longRun = sessions
        .filter(session => session.type === 'run' && !session.quality && session.distanceKm)
        .reduce((best, session) => (!best || session.distanceKm >= best.distanceKm ? session : best), null);
    return longRun ? { kind: 'long_run', session: longRun } : null;
}

function describeProposal(race, target) {
    const name = race.name || 'la gara';
    const what = !target
        ? 'si aggiunge alla settimana'
        : target.kind === 'in_table_race'
          ? `prende il posto della gara della tabella ("${clean(target.session.raw)}")`
          : target.kind === 'same_day'
            ? `prende il posto della seduta di quel giorno ("${clean(target.session.raw)}")`
            : `prende il posto del lungo della settimana ("${clean(target.session.raw)}")`;
    return `${name} del ${race.event_date} ${what}; il giorno prima riposo o corsa facile breve, il giorno dopo corsa facile/DAU o riposo. ${DERIVED_LABEL}.`;
}

// Applica le proposte scelte dall'atleta. Restituisce una nuova bozza.
export function applyIntermediateRaces(draft, proposals = []) {
    let result = draft;
    proposals.forEach(proposal => {
        result = applyOneRace(result, proposal);
    });
    return result;
}

function applyOneRace(draft, proposal) {
    if (!isIsoDate(proposal?.event_date) || proposal.event_date >= draft.endDate || proposal.event_date < draft.startDate) {
        throw new Error('La gara intermedia non cade nel periodo della bozza.');
    }
    const date = proposal.event_date;
    const before = addDays(date, -1);
    const after = addDays(date, 1);
    const name = proposal.race_name || 'Gara intermedia';
    const breathingDraft = draft.intensity === 'breathing' || draft.method === 'breathing_km';
    if (!draft.weeks.some(week => week.startDate <= date && week.endDate >= date)) {
        throw new Error('Nessuna settimana della bozza contiene la data della gara intermedia.');
    }
    const weeks = draft.weeks.map(week => {
        const inWeek = week.startDate <= date && week.endDate >= date;
        let sessions = week.sessions.slice();
        if (inWeek) {
            const target = findReplacementTarget(week, date);
            const removed = sessions.filter(session => session === target?.session || session.date === date);
            sessions = sessions.filter(session => !removed.includes(session));
            const tableRace = target?.kind === 'in_table_race' ? target.session : null;
            const km = proposal.distance_km ?? null;
            sessions.push({
                day: 'gara',
                bookDay: null,
                type: 'race_training',
                raw: `Gara: ${name}${km ? ` (${formatKm(km)} km)` : ''}`,
                distanceKm: km,
                means: [],
                breathing: tableRace?.breathing || [],
                breathingText: tableRace?.breathingText ?? null,
                quality: true,
                optional: false,
                night: false,
                climb: false,
                terrain: null,
                surface: null,
                uncertain: false,
                date,
                fixedDate: date,
                paceBands: [],
                targetPaceSecondsPerKm: null,
                elevation: null,
                derivedRule: INTERMEDIATE_RACE_RULE.id,
                adaptations: removed.map(session => `Al posto di: ${clean(session.raw)}.`),
                practicalNotes: [
                    tableRace
                        ? `Gara reale al posto della gara della tabella ("${clean(tableRace.raw)}"): mantieni il ritmo indicato dalla tabella.`
                        : 'Gara intermedia in calendario.',
                    `${DERIVED_LABEL}.`
                ]
            });
        }
        sessions = sessions.map(session => {
            if (session.derivedRule === INTERMEDIATE_RACE_RULE.id && session.date === date) return session;
            if (session.type !== 'run' || (session.date !== before && session.date !== after)) return session;
            const isBefore = session.date === before;
            const maxKm = INTERMEDIATE_RACE_RULE.easyRunMaxKm;
            return {
                ...session,
                raw: isBefore ? 'Riposo o corsa facile breve' : 'Corsa facile/DAU o riposo',
                distanceKm: Math.min(session.distanceKm ?? maxKm, maxKm),
                means: [],
                breathing: breathingDraft ? ['CRMF'] : [],
                breathingText: null,
                quality: false,
                optional: true,
                paceBands: [],
                targetPaceSecondsPerKm: null,
                elevation: null,
                derivedRule: INTERMEDIATE_RACE_RULE.id,
                adaptations: [...(session.adaptations || []), `Era: ${clean(session.raw)}.`],
                practicalNotes: [
                    `${isBefore ? 'Giorno prima' : 'Giorno dopo'} della gara ${name}: ${isBefore ? 'riposo o corsa facile breve' : 'corsa facile/DAU o riposo'} (max ${maxKm} km). ${DERIVED_LABEL}.`
                ]
            };
        });
        sessions.sort((left, right) => String(left.date ?? '9999').localeCompare(String(right.date ?? '9999')));
        return { ...week, sessions };
    });
    return {
        ...draft,
        weeks,
        derivedRules: [...(draft.derivedRules || []).filter(rule => rule.id !== INTERMEDIATE_RACE_RULE.id), { ...INTERMEDIATE_RACE_RULE }],
        notes: [...new Set([...(draft.notes || []), INTERMEDIATE_RACE_RULE.explanation])],
        appliedIntermediateRaces: [...(draft.appliedIntermediateRaces || []), proposal.race_id ?? date]
    };
}

// Settimana del piano da un titolo "Tab. X · S3 · ...".
export function planWeekFromTitle(title) {
    const match = /·\s*S(\d+)\s*·/.exec(String(title ?? ''));
    return match ? Number(match[1]) : null;
}

export function isPlanSessionTitle(title, table) {
    return String(title ?? '').startsWith(`Tab. ${table} · S`);
}

// Anteprima per una settimana saltata. planSessions: sedute del piano nel
// calendario ({ id, scheduled_date, title, sport_type, distance_km, notes,
// intervals_activity_id, completed_activity }).
export function previewMissedWeek({ draft, weekNumber, planSessions = [], today }) {
    if (!isIsoDate(today)) throw new Error('La data di oggi non è valida.');
    const week = draft?.weeks?.find(item => item.weekNumber === weekNumber);
    if (!week) throw new Error('Settimana del piano non trovata.');
    if (week.startDate > today) {
        throw new Error('Puoi segnare come saltata solo una settimana passata o in corso.');
    }
    const base = {
        rule: { ...MISSED_WEEK_RULE },
        week_number: weekNumber,
        next_week_number: weekNumber + 1,
        changes: [],
        notes: ['I km della settimana saltata non si recuperano.', 'Le sedute di qualità restano invariate.']
    };
    const raceDate = draft.endDate;
    if (daysBetween(today, raceDate) < MISSED_WEEK_RULE.taperDays) {
        return {
            ...base,
            status: 'taper_kept',
            notes: [...base.notes, 'Gara a meno di 3 settimane: lo scarico resta come previsto.']
        };
    }
    const nextWeek = draft.weeks.find(item => item.weekNumber === weekNumber + 1);
    if (!nextWeek) return { ...base, status: 'no_changes', notes: [...base.notes, 'Nessuna settimana successiva nel piano.'] };

    const sessions = planSessions.map(session => ({ ...session, week: planWeekFromTitle(session.title) }));
    const isRun = session => RUNNING_SPORTS.includes(session.sport_type) && !/\bgara\b/i.test(session.title || '');
    // Le sedute di qualità (dalla bozza, per data) non fanno da lungo né da riferimento.
    const isQuality = session => {
        const draftWeek = draft.weeks.find(item => item.weekNumber === session.week);
        return Boolean(draftWeek?.sessions?.find(item => item.date === session.scheduled_date && item.type === 'run')?.quality);
    };
    const done = sessions.filter(
        session =>
            session.week !== null && session.week < weekNumber && session.intervals_activity_id && isRun(session) && !isQuality(session)
    );
    const lastWeekDone = done.reduce((max, session) => Math.max(max, session.week), 0);
    const referenceKm = lastWeekDone ? Math.max(...done.filter(session => session.week === lastWeekDone).map(doneKm)) : null;
    const nextLong = sessions
        .filter(
            session =>
                session.week === weekNumber + 1 &&
                isRun(session) &&
                session.scheduled_date >= today &&
                !session.intervals_activity_id &&
                !session.completed_activity &&
                !isQuality(session) &&
                Number(session.distance_km) > 0
        )
        .reduce((best, session) => (!best || Number(session.distance_km) > Number(best.distance_km) ? session : best), null);

    if (!nextLong) {
        return { ...base, status: 'no_changes', notes: [...base.notes, `Nessun lungo da modificare nella settimana ${weekNumber + 1}.`] };
    }
    if (!referenceKm) {
        return {
            ...base,
            status: 'no_changes',
            notes: [
                ...base.notes,
                'Nessun lungo completato prima della settimana saltata: il lungo successivo resta invariato, valuta tu se ridurlo.'
            ]
        };
    }
    const capKm = Math.floor(referenceKm * (1 + MISSED_WEEK_RULE.maxLongIncrease));
    const fromKm = Number(nextLong.distance_km);
    if (fromKm <= capKm) {
        return {
            ...base,
            status: 'no_changes',
            notes: [
                ...base.notes,
                `Il lungo della settimana ${weekNumber + 1} (${formatKm(fromKm)} km) resta entro +25% dell'ultimo lungo completato (${formatKm(referenceKm)} km).`
            ]
        };
    }
    const note = `Settimana ${weekNumber} saltata: lungo ridotto da ${formatKm(fromKm)} a ${formatKm(capKm)} km (max +25% sull'ultimo lungo completato, ${formatKm(referenceKm)} km). D+ e tempi scritti sopra si riferiscono al lungo originale. ${DERIVED_LABEL}.`;
    const newTitle = retitleKm(nextLong.title, fromKm, capKm);
    return {
        ...base,
        status: 'changes_proposed',
        reference_long_km: referenceKm,
        changes: [
            {
                session_id: nextLong.id,
                scheduled_date: nextLong.scheduled_date,
                title: nextLong.title,
                new_title: newTitle,
                from_km: fromKm,
                to_km: capKm,
                note,
                notes: [nextLong.notes, note].filter(Boolean).join(' ')
            }
        ],
        notes: [...base.notes, note]
    };
}

// Sostituisce nel titolo i km originali con quelli ridotti.
function retitleKm(title, fromKm, toKm) {
    const text = String(title ?? '');
    const from = String(fromKm).replace('.', '[.,]');
    const pattern = new RegExp(String.raw`(?<![\d.,])${from}(\s*km\b)`);
    return pattern.test(text) ? text.replace(pattern, `${formatKm(toKm)}$1`) : `${text} (ridotto a ${formatKm(toKm)} km)`;
}

function doneKm(session) {
    const meters = Number(session.completed_activity?.distance);
    if (Number.isFinite(meters) && meters > 0) return Math.round(meters / 100) / 10;
    return Number(session.distance_km) || 0;
}

// Scelte per la proposta del test VR: serve solo se tutte le tabelle in gioco
// richiedono la VR e il test non è valido.
export function referenceTestNeeded(rules, validityStatus, vrSecondsPerKm) {
    if (!rules.length || !rules.every(rule => rule.requiresValidReferenceTest)) return false;
    return validityStatus !== 'valid' || !vrSecondsPerKm;
}

export function proposeReferenceTest(profile, { today, protocol = null } = {}) {
    if (!isIsoDate(today)) throw new Error('La data di oggi non è valida.');
    const chosen = REFERENCE_TEST_PROTOCOLS[protocol]
        ? protocol
        : REFERENCE_TEST_PROTOCOLS[profile?.reference_test_protocol]
          ? profile.reference_test_protocol
          : 'three_km_plus_10';
    const definition = REFERENCE_TEST_PROTOCOLS[chosen];
    const proposedDate = nextRunningDay(profile, today);
    const totalKm = TEST_WARMUP_KM + definition.distanceKm + TEST_COOLDOWN_KM;
    const warmup = `Riscaldamento: ${TEST_WARMUP_KM} km di corsa facile e qualche allungo.`;
    const cooldown = `Defaticamento: ${TEST_COOLDOWN_KM} km di corsa facile.`;
    const afterTest = 'Dopo il test inserisci nel questionario protocollo, data del test e tempo: la VR resta valida 6 settimane.';
    return {
        protocol: chosen,
        label: definition.label,
        description: definition.description,
        warmup,
        cooldown,
        totalKm,
        proposedDate,
        afterTest,
        calendarSession: proposedDate
            ? {
                  scheduled_date: proposedDate,
                  title: `${definition.label} (VR)`,
                  sport_type: 'run',
                  distance_km: totalKm,
                  duration_minutes: null,
                  target_pace_seconds_per_km: null,
                  notes: [
                      definition.description,
                      warmup,
                      cooldown,
                      'Riscaldamento e defaticamento: indicazione generale, non dalla tabella.',
                      afterTest
                  ].join(' ')
              }
            : null
    };
}

// Primo giorno da domani disponibile per la corsa e libero da sport fissi.
function nextRunningDay(profile, today) {
    const availability = profile?.weekly_availability || {};
    const blocked = new Set(
        (profile?.weekly_other_sports || []).filter(session => session.schedule_type === 'fixed').map(session => session.day)
    );
    for (let offset = 1; offset <= 14; offset += 1) {
        const date = addDays(today, offset);
        const day = dayKey(date);
        if (availability[day]?.available && !blocked.has(day)) return date;
    }
    return null;
}

function clean(raw) {
    return String(raw ?? '')
        .split('/')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatKm(value) {
    return String(Math.round(Number(value) * 10) / 10).replace('.', ',');
}

function dayKey(dateKey) {
    return DAY_KEYS[(new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7];
}
