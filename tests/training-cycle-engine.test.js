import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adaptWeekToFrequency,
    buildWeeklyCyclePattern,
    draftToCalendarSessions,
    parseCycleCell,
    resolveExtraSession,
    scheduleCycleDraft
} from '../js/modules/training-cycle-engine.js';
import { CYCLE_TRANSCRIPTIONS } from '../js/modules/training-cycle-transcriptions.js';
import { assessReferenceTestValidity, REFERENCE_TEST_VALIDITY_RULE } from '../js/modules/training-reference-pace.js';

test('le trascrizioni coprono tutte le settimane e i sette giorni delle tabelle 5, 6, 8 e 10', () => {
    const expected = {
        ten_km_breathing_cycle: ['5', 9],
        ten_km_distance_time_cycle: ['6', 9],
        half_marathon_distance_time_cycle: ['8', 12],
        marathon_distance_time_cycle: ['10', 15]
    };
    Object.entries(expected).forEach(([id, [table, weeks]]) => {
        const transcription = CYCLE_TRANSCRIPTIONS[id];
        assert.equal(transcription.table, table);
        assert.equal(transcription.weeks.length, weeks);
        transcription.weeks.forEach((week, index) => {
            assert.equal(week.weekNumber, index + 1);
            assert.deepEqual(week.days.map(day => day.day), [1, 2, 3, 4, 5, 6, 7]);
        });
        assert.equal(transcription.weeks.at(-1).days[6].raw, 'Gara');
    });
    assert.equal(CYCLE_TRANSCRIPTIONS.marathon_distance_time_cycle.source.scanPages, '30-31');
});

test('il parser riconosce riposi, test, gare e somma i km senza contare la distanza della gara citata', () => {
    assert.equal(parseCycleCell('Riposo').kind, 'rest');
    assert.equal(parseCycleCell('Riposo o / esercizi').kind, 'rest_or_exercises');
    assert.equal(parseCycleCell('Test di / verifica / della VR').kind, 'reference_test');
    assert.equal(parseCycleCell('Gara').kind, 'race');

    const repeats = parseCycleCell('10 x / 100 m / in salita / SB rec. / 2\' + rec. / 3\' + 6 / km L.');
    assert.equal(repeats.kind, 'run');
    assert.equal(repeats.distanceKm, 7);
    assert.ok(repeats.quality);
    assert.deepEqual(repeats.means.sort(), ['L', 'SB']);

    const racePace = parseCycleCell('7 km / ritmo / gara 10 / km');
    assert.equal(racePace.distanceKm, 7);
    assert.ok(racePace.means.includes('RG'));

    const optional = parseCycleCell('Riposo o / 4 km L');
    assert.equal(optional.kind, 'run');
    assert.equal(optional.optional, true);
    assert.equal(optional.distanceKm, 4);
});

test('variante a 3 corse: omette la seduta facile più breve, aggiunge 2+1 km e allunga il lungo', () => {
    const pattern = buildWeeklyCyclePattern('ten_km_distance_time_cycle');
    const week1 = pattern.weeks[0];
    const adapted = adaptWeekToFrequency(week1, pattern.method, 3);

    assert.equal(adapted.sessions.length, 3);
    assert.equal(adapted.skipped.raw, '10 km L');
    assert.deepEqual(adapted.sessions.map(session => session.distanceKm), [10, 13, 22]);
    assert.equal(adapted.sessions[0].warmupKm, 2);
    assert.equal(adapted.sessions[0].cooldownKm, 1);
    assert.equal(adapted.sessions[2].warmupKm, undefined);
});

test('variante a 3 corse: con test o gara al giorno 7 i km omessi non finiscono a ridosso della prova', () => {
    const pattern = buildWeeklyCyclePattern('marathon_distance_time_cycle');
    const raceWeek = adaptWeekToFrequency(pattern.weeks[14], pattern.method, 3);
    assert.equal(raceWeek.skipped.raw, 'Riposo o / 4 km L');
    assert.equal(raceWeek.sessions.at(-1).type, 'race');
    assert.ok(raceWeek.notes.some(note => note.includes('non vengono riassegnati')));

    const testWeek = adaptWeekToFrequency(pattern.weeks[2], pattern.method, 3);
    assert.equal(testWeek.sessions.at(-1).type, 'reference_test');
    assert.ok(testWeek.notes.some(note => note.includes('non vengono riassegnati')));
});

test('variante a 5 corse: +10% km con quinta corsa facile oppure seduta extra da scegliere', () => {
    const pattern = buildWeeklyCyclePattern('ten_km_distance_time_cycle');
    const spread = adaptWeekToFrequency(pattern.weeks[0], pattern.method, 5, { fiveSessionOption: 'spread_plus_10' });
    assert.equal(spread.sessions.length, 5);
    const added = spread.sessions.find(session => session.day === 'aggiunta');
    assert.equal(added.distanceKm, 4);
    assert.equal(spread.sessions.at(-1).raw, '12 km L');

    const extra = adaptWeekToFrequency(pattern.weeks[0], pattern.method, 5, { fiveSessionOption: 'extra_quality_or_strength' });
    const choice = extra.sessions.find(session => session.type === 'extra_choice');
    assert.equal(choice.requiresSelection, true);
    assert.equal(choice.distanceKm, null);

    const raceWeek = adaptWeekToFrequency(pattern.weeks[8], pattern.method, 5, { fiveSessionOption: 'spread_plus_10', isRaceWeek: true });
    assert.equal(raceWeek.sessions.length, 4);

    assert.throws(() => adaptWeekToFrequency(pattern.weeks[0], pattern.method, 5), /scegli/);
    assert.throws(() => adaptWeekToFrequency(pattern.weeks[0], pattern.method, 6), /Nessuna regola approvata/);
    const breathing = buildWeeklyCyclePattern('ten_km_breathing_cycle');
    assert.throws(() => adaptWeekToFrequency(breathing.weeks[0], breathing.method, 3), /Nessuna regola approvata/);
});

test('la bozza colloca le settimane a ritroso dalla gara sui giorni disponibili', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2027-03-21',
        availableDays: ['tue', 'thu', 'sat', 'sun'],
        targetSessions: 4
    });

    assert.equal(draft.status, 'draft_ready_for_confirmation');
    assert.equal(draft.startDate, '2027-01-18');
    assert.equal(draft.endDate, '2027-03-21');
    assert.equal(draft.weeks.length, 9);
    const raceWeek = draft.weeks.at(-1);
    assert.deepEqual(raceWeek.sessions.map(session => session.date), ['2027-03-16', '2027-03-18', '2027-03-20', '2027-03-21']);
    assert.equal(raceWeek.sessions.at(-1).type, 'race');

    const calendar = draftToCalendarSessions(draft);
    assert.equal(calendar.length, 36);
    assert.ok(calendar.every(session => session.title.length <= 120 && session.sport_type === 'run'));
    assert.ok(calendar[0].notes.includes('tabella 6, settimana 1, giorno 2'));
});

test('il lungo da allungare è solo una corsa facile; altrimenti i km omessi non vengono spostati', () => {
    const marathon = buildWeeklyCyclePattern('marathon_distance_time_cycle');
    const week2 = adaptWeekToFrequency(marathon.weeks[1], marathon.method, 3);
    const tempo = week2.sessions.find(session => session.raw === '15 km T');
    assert.equal(tempo.distanceKm, 18);
    assert.ok(!tempo.adaptations.some(item => item.includes('Lungo aumentato')));

    const half = buildWeeklyCyclePattern('half_marathon_distance_time_cycle');
    const week1 = adaptWeekToFrequency(half.weeks[0], half.method, 3);
    const bis = week1.sessions.find(session => session.raw === '12 km B');
    assert.ok(!bis.adaptations.some(item => item.includes('Lungo aumentato')));
});

test('la quinta seduta e le sedute adattate restano vicine al loro giorno nel libro', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2027-03-21',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        targetSessions: 5,
        fiveSessionOption: 'spread_plus_10'
    });
    const week3 = draft.weeks[2];
    const test = week3.sessions.find(session => session.type === 'reference_test');
    assert.equal(test.date, week3.endDate);
    assert.ok(week3.sessions.every(session => session.date <= test.date));

    const threeRuns = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2027-03-21',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        targetSessions: 3
    });
    const raceWeek = threeRuns.weeks.at(-1);
    const vam = raceWeek.sessions.find(session => session.raw.includes('VAM'));
    assert.equal(vam.date, '2027-03-18');
});

test('la bozza è bloccata se il ciclo dovrebbe iniziare prima di oggi', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2026-11-29',
        availableDays: ['tue', 'thu', 'sat', 'sun'],
        today: '2026-11-14'
    });
    assert.equal(draft.status, 'needs_availability_review');
    assert.ok(draft.issues[0].includes('troppo vicina'));
    assert.throws(() => draftToCalendarSessions(draft), /conflitti/);
});

test('la bozza segnala disponibilità insufficiente e blocca la conferma', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2027-03-21',
        availableDays: ['tue', 'thu', 'sat', 'sun'],
        blockedDays: ['thu'],
        targetSessions: 4
    });
    assert.equal(draft.status, 'needs_availability_review');
    assert.ok(draft.issues.length > 0);
    assert.throws(() => draftToCalendarSessions(draft), /conflitti di disponibilità/);
});

test('la seduta extra va scelta dall’atleta prima della conferma', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2027-03-21',
        availableDays: ['mon', 'tue', 'thu', 'sat', 'sun'],
        targetSessions: 5,
        fiveSessionOption: 'extra_quality_or_strength'
    });
    assert.equal(draft.requiresSelection, true);
    assert.throws(() => draftToCalendarSessions(draft), /Scegli il contenuto/);

    let resolved = draft;
    draft.weeks.forEach(week => {
        if (week.sessions.some(session => session.type === 'extra_choice')) {
            resolved = resolveExtraSession(resolved, week.weekNumber, { kind: 'strength', description: 'Palestra 45 minuti' });
        }
    });
    assert.equal(resolved.requiresSelection, false);
    const sessions = draftToCalendarSessions(resolved);
    assert.ok(sessions.some(session => session.sport_type === 'strength'));
});

test('il test VR resta valido per 6 settimane, poi scade', () => {
    assert.equal(REFERENCE_TEST_VALIDITY_RULE.maxAgeDays, 42);
    assert.equal(REFERENCE_TEST_VALIDITY_RULE.ruleStatus, 'approved_for_drafts');
    assert.equal(assessReferenceTestValidity('2026-10-02', '2026-11-13').status, 'valid');
    const expired = assessReferenceTestValidity('2026-10-01', '2026-11-13');
    assert.equal(expired.status, 'expired');
    assert.equal(expired.valid_until, '2026-11-12');
    assert.equal(assessReferenceTestValidity('2026-11-20', '2026-11-13').status, 'future');
    assert.equal(assessReferenceTestValidity(null, '2026-11-13').status, 'missing');
});
