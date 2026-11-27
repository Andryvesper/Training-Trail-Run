import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adaptWeekToFrequency,
    BLOCK_REPETITION_RULE,
    buildWeeklyCyclePattern,
    draftToCalendarSessions,
    elevationGuidance,
    expandRepeatedBlock,
    NIGHT_SESSION_NOTE,
    parseCycleCell,
    scheduleCycleDraft
} from '../js/modules/training-cycle-engine.js';
import {
    assessTrainingMethodology,
    CYCLE_RULE_APPROVALS,
    recommendUltraTable,
    TRAINING_METHOD_RULES
} from '../js/modules/training-methodology-rules.js';
import { describeBreathing } from '../js/modules/training-pace-zones.js';

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const t11Options = (overrides = {}) => ({
    pattern: buildWeeklyCyclePattern('ultra_100km_passatore'),
    raceDate: '2027-05-29',
    availableDays: ['mon', 'tue', 'thu', 'sat', 'sun'],
    targetSessions: 4,
    today: '2026-11-14',
    vrSecondsPerKm: 285,
    goalDistanceKm: 100,
    raceElevationM: 1700,
    experience: 'amatore',
    ...overrides
});

const runCount = week => week.sessions.filter(session => ['run', 'race', 'race_training'].includes(session.type)).length;

test('tabelle 11 e 13 approvate dall’atleta, tabella 12 no', () => {
    const approval = { approvedBy: 'Andrea Baron', approvedAt: '2026-11-14' };
    assert.deepEqual({ ...CYCLE_RULE_APPROVALS.ultra_100km_passatore }, approval);
    assert.deepEqual({ ...CYCLE_RULE_APPROVALS.trail_15_50km }, approval);
    assert.equal(CYCLE_RULE_APPROVALS.ultra_pistoia_abetone, undefined);
    const t11 = TRAINING_METHOD_RULES.find(rule => rule.id === 'ultra_100km_passatore');
    const t13 = TRAINING_METHOD_RULES.find(rule => rule.id === 'trail_15_50km');
    [t11, t13].forEach(rule => {
        assert.equal(rule.ruleStatus, 'approved_for_drafts');
        assert.equal(rule.requiresValidReferenceTest, false);
        assert.ok(!rule.requiredProfileFields.includes('reference_vr_seconds_per_km'));
        assert.deepEqual([...rule.supportedRunningSessionsPerWeek], [3, 4, 5]);
    });
    assert.equal(t11.sessionPattern.weeks.length, 15);
    assert.equal(t13.sessionPattern.weeks.length, 4);
    assert.deepEqual([...t13.requiredTerrains], ['trail']);
});

test('le tabelle respiratorie non richiedono il test VR', () => {
    const profile = {
        goal_mode: 'race',
        preferred_terrains: ['trail'],
        consistency_status: 'consistent',
        target_running_sessions_per_week: 4
    };
    const t13 = assessTrainingMethodology(profile, { distance_km: 25, event_date: '2027-03-01' }, TRAINING_METHOD_RULES, { asOfDate: '2026-11-14' });
    assert.deepEqual(t13.generation_pattern_ids, ['trail_15_50km']);
    const road = assessTrainingMethodology({ ...profile, preferred_terrains: ['road'] }, { distance_km: 25, event_date: '2027-03-01' }, TRAINING_METHOD_RULES, { asOfDate: '2026-11-14' });
    assert.ok(!road.approved_pattern_ids.includes('trail_15_50km'));
    const t11 = assessTrainingMethodology({ ...profile, preferred_terrains: ['road'] }, { distance_km: 100, event_date: '2027-05-29' }, TRAINING_METHOD_RULES, { asOfDate: '2026-11-14' });
    assert.deepEqual(t11.generation_pattern_ids, ['ultra_100km_passatore']);
});

test('tra tabella 10 evoluti e tabella 11 si propone la tabella in base all’esperienza, senza applicarla', () => {
    const profile = {
        goal_mode: 'race',
        preferred_terrains: ['trail'],
        consistency_status: 'consistent',
        target_running_sessions_per_week: 4,
        reference_test_date: '2026-11-01',
        reference_vr_seconds_per_km: 285
    };
    const race = { distance_km: 100, event_date: '2027-06-04' };
    const amateur = assessTrainingMethodology(profile, race, TRAINING_METHOD_RULES, { asOfDate: '2026-11-14' });
    assert.equal(amateur.generation_enabled, false);
    assert.equal(amateur.method_recommendation.pattern_id, 'ultra_100km_passatore');
    assert.equal(amateur.method_recommendation.preferred_cycle_method, 'breathing');
    assert.equal(amateur.method_recommendation.rule_status, 'derived_pending_athlete_confirmation');
    assert.ok(amateur.blockers.some(item => item.includes('regola derivata, da confermare dall\'atleta')));

    const expert = assessTrainingMethodology({ ...profile, self_profile: 'structured_experienced' }, race, TRAINING_METHOD_RULES, { asOfDate: '2026-11-14' });
    assert.equal(expert.method_recommendation.pattern_id, 'ultra_100km_evoluto');
    assert.equal(expert.method_recommendation.preferred_cycle_method, 'distance_time');

    const chosen = assessTrainingMethodology({ ...profile, preferred_cycle_method: 'breathing' }, race, TRAINING_METHOD_RULES, { asOfDate: '2026-11-14' });
    assert.deepEqual(chosen.generation_pattern_ids, ['ultra_100km_passatore']);
    assert.equal(recommendUltraTable(profile, [TRAINING_METHOD_RULES.find(rule => rule.id === 'ultra_100km_passatore')]), null);
});

test('legge le celle della tabella 11: test Conconi, km senza unità, terreno e gare di allenamento', () => {
    const conconi = parseCycleCell('Test / Conconi');
    assert.equal(conconi.kind, 'reference_test');
    assert.equal(conconi.protocol, 'conconi');
    const flat = parseCycleCell('12 CRF / p');
    assert.equal(flat.kind, 'run');
    assert.equal(flat.distanceKm, 12);
    assert.equal(flat.terrain, 'pianeggiante');
    assert.deepEqual(flat.breathing, ['CRF']);
    assert.equal(parseCycleCell('28 CRF / ss').terrain, 'saliscendi');
    assert.equal(parseCycleCell('Riposo o / esercizio').kind, 'rest_or_exercises');
    const hills = parseCycleCell('14 x 100 / in salita / CRI rec. / 100 / CRMI + / rec. 3\' / + 10 km / CRF');
    assert.equal(hills.distanceKm, 11.4);
    assert.ok(hills.quality && hills.climb);

    const pattern = buildWeeklyCyclePattern('ultra_100km_passatore');
    assert.equal(pattern.method, 'breathing_km');
    assert.equal(pattern.weeks[0].sessions[0].type, 'reference_test');
    const marathon = pattern.weeks[7].sessions.find(session => session.bookDay === 7);
    assert.equal(marathon.type, 'race_training');
    assert.equal(marathon.distanceKm, 42.195);
    const half = pattern.weeks[9].sessions.find(session => session.bookDay === 7);
    assert.equal(half.type, 'race_training');
    assert.equal(half.distanceKm, 21.1);
    assert.equal(pattern.weeks.at(-1).sessions.at(-1).type, 'race');
    assert.equal(pattern.maxLongKm, 65);
});

test('tabella 11 a 4, 3 e 5 corse con le regole approvate', () => {
    const four = scheduleCycleDraft(t11Options());
    assert.equal(four.status, 'draft_ready_for_confirmation');
    assert.equal(four.weeks.length, 15);
    assert.ok(four.weeks.slice(0, 14).every(week => runCount(week) === 4));
    assert.equal(four.weeks[0].sessions[0].type, 'reference_test');

    const pattern = buildWeeklyCyclePattern('ultra_100km_passatore');
    const three = adaptWeekToFrequency(pattern.weeks[0], pattern.method, 3);
    assert.equal(three.sessions.filter(session => session.type === 'run').length, 3);
    assert.ok(three.sessions.some(session => session.quality));
    const long = three.sessions.find(session => session.bookDay === 7);
    assert.equal(long.distanceKm, 30);
    assert.ok(three.notes.some(note => note.includes('+25%')));
    const easy = three.sessions.find(session => session.bookDay === 6);
    assert.equal(easy.distanceKm, 15);

    // Tetto approvato: il lungo non supera il lungo massimo della tabella (65 km).
    const week11 = adaptWeekToFrequency(pattern.weeks[10], pattern.method, 3);
    assert.equal(week11.sessions.find(session => session.bookDay === 7).distanceKm, 65);

    const fiveSpread = scheduleCycleDraft(t11Options({ targetSessions: 5, fiveSessionOption: 'spread_plus_10', availableDays: ALL_DAYS }));
    assert.equal(fiveSpread.status, 'draft_ready_for_confirmation');
    assert.ok(fiveSpread.weeks.slice(0, 14).every(week => runCount(week) === 5));
    const added = fiveSpread.weeks[0].sessions.find(session => session.day === 'aggiunta');
    assert.match(added.raw, /km CRF$/);
    assert.equal(runCount(fiveSpread.weeks.at(-1)), 3);

    const fiveExtra = scheduleCycleDraft(t11Options({ targetSessions: 5, fiveSessionOption: 'extra_quality_or_strength', availableDays: ALL_DAYS }));
    assert.equal(fiveExtra.requiresSelection, true);
    assert.throws(() => adaptWeekToFrequency(pattern.weeks[0], pattern.method, 5), /scegli/);
});

test('tabella 11 con VR valida: ritmi respiratori convertiti in passi (modello VR approvato)', () => {
    const draft = scheduleCycleDraft(t11Options());
    assert.equal(draft.vrSecondsPerKm, 285);
    assert.equal(draft.intensity, 'breathing_vr');
    const calendar = draftToCalendarSessions(draft);
    const easy = calendar.find(session => session.title.includes('12 CRF'));
    assert.equal(easy.target_pace_seconds_per_km, 330);
    assert.match(easy.notes, /CRF \(respirazione facile\) 5:25-5:35\/km/);
    const quality = calendar.find(session => session.title.includes('CRLI'));
    assert.match(quality.notes, /CRLI \(respirazione leggermente impegnata\) 5:00-5:10\/km/);
    const marathon = calendar.find(session => session.title.includes('Gara maratona'));
    assert.match(marathon.notes, /ritmo maratona 5:15-5:25\/km/);
});

test('le tabelle respiratorie senza VR valida non hanno fasce di passo', () => {
    const draft = scheduleCycleDraft(t11Options({ vrSecondsPerKm: null }));
    assert.equal(draft.vrSecondsPerKm, null);
    assert.equal(draft.intensity, 'breathing');
    const sessions = draft.weeks.flatMap(week => week.sessions);
    assert.ok(sessions.every(session => session.paceBands.length === 0 && session.targetPaceSecondsPerKm === null));
    const calendar = draftToCalendarSessions(draft);
    assert.ok(calendar.every(session => session.target_pace_seconds_per_km === null));
    assert.ok(calendar.every(session => !session.notes.includes('Passi dalla tua VR')));
    const easy = calendar.find(session => session.title.includes('12 CRF'));
    assert.match(easy.notes, /CRF = respirazione facile/);
    assert.match(easy.notes, /Terreno: pianeggiante \(p\)/);
    assert.match(describeBreathing(['CRMF', 'CRI']), /CRMF = respirazione molto facile.*CRI = respirazione impegnata/);
});

test('con giorni insufficienti il test Conconi non blocca la bozza', () => {
    const draft = scheduleCycleDraft(t11Options({ availableDays: ['tue', 'thu', 'sat', 'sun'] }));
    assert.equal(draft.status, 'draft_ready_for_confirmation');
    assert.ok(!draft.weeks[0].sessions.some(session => session.type === 'reference_test'));
    assert.ok(draft.weeks[0].notes.some(note => note.includes('test Conconi')));
});

test('il dislivello indica D+ e D-, con D- stimato se manca', () => {
    const long = { type: 'run', bookDay: 7, distanceKm: 65, means: ['LLU'], breathing: [], quality: false };
    const estimated = elevationGuidance(long, { raceKm: 100, raceElevationM: 5000, climbRate: 500, paceSecondsPerKm: 375 });
    assert.match(estimated.text, /circa 1700 m D\+ e 1700 m D-/);
    assert.match(estimated.text, /D- stimato uguale al D\+ \(percorso ad anello\)/);
    assert.equal(estimated.lossMeters, 1700);
    const known = elevationGuidance({ ...long, distanceKm: 20 }, { raceKm: 100, raceElevationM: 2000, raceElevationLossM: 3000, climbRate: 500 });
    assert.equal(known.meters, 400);
    assert.equal(known.lossMeters, 600);
    assert.ok(!known.text.includes('stimato'));
    const flat = elevationGuidance({ ...long, distanceKm: 20, terrain: 'pianeggiante' }, { raceKm: 100, raceElevationM: 2000, climbRate: 500 });
    assert.equal(flat.meters, 0);
});

test('salite a sforzo con tempo verticale indicativo', () => {
    const climb = { type: 'run', bookDay: 4, distanceKm: 6, means: [], breathing: ['CRF'], quality: true, climb: true };
    const amateur = elevationGuidance(climb, { raceKm: 100, raceElevationM: 1700, climbRate: 500 });
    assert.match(amateur.text, /a sforzo, non a passo/);
    assert.match(amateur.text, /12' ogni 100 m D\+/);
    assert.equal(amateur.verticalMinutesPer100m, 12);
    const expert = elevationGuidance(climb, { raceKm: 100, raceElevationM: 1700, climbRate: 800 });
    assert.match(expert.text, /7'30" ogni 100 m D\+/);

    const long = { type: 'run', bookDay: 7, distanceKm: 30, means: ['LLU'], breathing: [], quality: false };
    assert.match(elevationGuidance(long, { raceKm: 100, raceElevationM: 3000, climbRate: 800 }).text, /7'30" ogni 100 m D\+.*solo per i tratti pianeggianti/);

    const draft = scheduleCycleDraft(t11Options());
    const hillSession = draftToCalendarSessions(draft).find(session => session.title.includes('14 x 100'));
    assert.match(hillSession.notes, /Salite a sforzo, non a passo: tempo verticale indicativo 12'/);
});

test('le sedute serali hanno la nota pratica', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ultra_100km_evoluto'),
        raceDate: '2027-06-04',
        availableDays: ALL_DAYS,
        targetSessions: 5,
        vrSecondsPerKm: 285,
        goalDistanceKm: 100,
        raceElevationM: 5000,
        today: '2026-11-14'
    });
    const calendar = draftToCalendarSessions(draft);
    const night = calendar.filter(session => session.title.includes('sera'));
    assert.ok(night.length > 0);
    assert.ok(night.every(session => session.notes.includes(NIGHT_SESSION_NOTE)));
    assert.ok(calendar.filter(session => !session.title.includes('sera')).every(session => !session.notes.includes(NIGHT_SESSION_NOTE)));
    const longest = calendar.find(session => session.title.includes('65 km'));
    assert.match(longest.notes, /circa 1700 m D\+ e 1700 m D-/);
    assert.match(longest.notes, /Passi dalla tua VR 4:45\/km \(solo tratti pianeggianti\)/);
});

test('tabella 13: blocco ripetuto a ritroso, allineato sulla gara più vicina alla distanza obiettivo', () => {
    const pattern = buildWeeklyCyclePattern('trail_15_50km');
    assert.ok(pattern.blockRepetition);
    assert.equal(pattern.maxLongKm, 30);

    const long = expandRepeatedBlock(pattern, { goalDistanceKm: 42, raceDate: '2027-06-06', today: '2026-11-14' });
    assert.equal(long.durationWeeks, 12);
    assert.equal(long.alignedBlockWeek, 1);
    assert.deepEqual(long.weeks.map(week => week.blockWeek), [2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1]);
    const lastLong = long.weeks.at(-1);
    assert.equal(lastLong.blockWeek, 1);
    assert.equal(lastLong.sessions.at(-1).type, 'race');

    const short = expandRepeatedBlock(pattern, { goalDistanceKm: 18, raceDate: '2027-01-31', today: '2026-11-14' });
    assert.equal(short.alignedBlockWeek, 3);
    assert.equal(short.durationWeeks, 11);
    assert.equal(short.weeks.at(-1).blockWeek, 3);
    assert.equal(short.weeks[0].blockWeek, 1);
    const replaced = short.weeks[0].sessions.at(-1);
    assert.equal(replaced.type, 'run');
    assert.equal(replaced.raw, 'Gara o lungo su sterrato di 30 km a CRF');
    assert.equal(replaced.distanceKm, 30);
    assert.equal(replaced.derivedRule, BLOCK_REPETITION_RULE.id);
    assert.equal(BLOCK_REPETITION_RULE.ruleStatus, 'approved_for_drafts');
});

test('tabella 13: bozza fino al giorno della gara, gare reali al posto delle gare del blocco', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('trail_15_50km'),
        raceDate: '2027-01-31',
        availableDays: ['tue', 'wed', 'thu', 'sat', 'sun'],
        targetSessions: 5,
        today: '2026-11-14',
        vrSecondsPerKm: 285,
        goalDistanceKm: 18,
        raceElevationM: 900,
        secondaryRaces: [{ event_date: '2027-01-03', distance_km: 20, name: 'Trail della Befana' }]
    });
    assert.equal(draft.status, 'draft_ready_for_confirmation');
    assert.equal(draft.weeks.length, 11);
    assert.ok(draft.startDate >= '2026-11-14');
    assert.equal(draft.endDate, '2027-01-31');
    assert.equal(draft.derivedRules[0].id, 'trail_block_repetition');
    assert.ok(draft.notes.some(note => note.includes('approvata dall\'atleta')));
    assert.ok(draft.weeks.every(week => week.notes[0].includes('regola derivata dal motore, approvata dall\'atleta')));
    const real = draft.weeks[6].sessions.find(session => session.type === 'race_training');
    assert.equal(real.date, '2027-01-03');
    assert.match(real.raw, /Trail della Befana/);
    const calendar = draftToCalendarSessions(draft);
    assert.equal(calendar.at(-1).scheduled_date, '2027-01-31');
    assert.ok(calendar.every(session => session.target_pace_seconds_per_km === null));
    const trailLong = calendar.find(session => session.title.includes('10 km sterrato ss'));
    assert.equal(trailLong.sport_type, 'trail');
    assert.match(trailLong.notes, /m D\+ e \d+ m D-/);

    const three = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('trail_15_50km'),
        raceDate: '2027-01-31',
        availableDays: ['tue', 'thu', 'sun'],
        targetSessions: 3,
        today: '2026-11-14',
        goalDistanceKm: 18
    });
    assert.equal(three.status, 'draft_ready_for_confirmation');
    assert.ok(three.weeks.every(week => runCount(week) <= 3));
});
