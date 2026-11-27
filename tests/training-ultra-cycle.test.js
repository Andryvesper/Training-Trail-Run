import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adaptWeekToFrequency,
    buildWeeklyCyclePattern,
    draftToCalendarSessions,
    elevationGuidance,
    parseCycleCell,
    scheduleCycleDraft
} from '../js/modules/training-cycle-engine.js';
import { assessTrainingMethodology, TRAINING_METHOD_RULES } from '../js/modules/training-methodology-rules.js';

const options = {
    pattern: buildWeeklyCyclePattern('ultra_100km_evoluto'),
    raceDate: '2027-06-04',
    availableDays: ['tue', 'fri', 'sun'],
    blockedDays: ['mon', 'thu'],
    targetSessions: 3,
    vrSecondsPerKm: 285,
    goalDistanceKm: 102,
    raceElevationM: 5000,
    experience: 'amatore',
    today: '2026-11-14'
};

test('legge le celle della tabella ultra: esercizi, gara, ripetute e lunghi senza unità', () => {
    assert.equal(parseCycleCell('Esercizi').kind, 'strength');
    assert.equal(parseCycleCell('Gara / 100 km').kind, 'race');
    assert.equal(parseCycleCell("2 x 3 / rec. 3' / MLSS").distanceKm, 6);
    assert.equal(parseCycleCell("10 x 400 / VAM rec. 1'").distanceKm, 4);
    assert.equal(parseCycleCell('20 LLU').distanceKm, 20);
    assert.equal(parseCycleCell('15 km / LLU da / fare la / sera').night, true);
});

test('riduce la tabella ultra a 3 corse senza togliere qualità e notturne, con tetto sul lungo', () => {
    const pattern = buildWeeklyCyclePattern('ultra_100km_evoluto');
    const week5 = adaptWeekToFrequency(pattern.weeks[4], pattern.method, 3);
    const runs = week5.sessions.filter(session => session.type === 'run');
    assert.equal(runs.length, 3);
    assert.ok(runs.some(session => session.quality));
    assert.ok(runs.some(session => session.night));
    const long = runs.find(session => session.raw.includes('55 km'));
    assert.equal(long.distanceKm, 65);
    assert.ok(week5.notes.some(note => note.includes('+25%')));
    assert.ok(week5.sessions.some(session => session.type === 'strength'));
});

test('in settimana di gara la gara conta tra le corse', () => {
    const pattern = buildWeeklyCyclePattern('ultra_100km_evoluto');
    const raceWeek = adaptWeekToFrequency(pattern.weeks[11], pattern.method, 3);
    assert.equal(raceWeek.sessions.filter(session => session.type === 'run').length, 2);
    assert.equal(raceWeek.sessions.filter(session => session.type === 'race').length, 1);
});

test('il dislivello consigliato segue la pendenza della gara con il tetto della velocità di salita', () => {
    const long = { type: 'run', bookDay: 7, distanceKm: 20, means: ['LLU'], quality: false };
    const guidance = elevationGuidance(long, { raceKm: 100, raceElevationM: 2000, climbRate: 500, paceSecondsPerKm: 375 });
    assert.equal(guidance.meters, 400);
    assert.equal(elevationGuidance(long, { raceKm: 100, raceElevationM: 5000, climbRate: 500, paceSecondsPerKm: 375 }).meters, 500);
    const capped = elevationGuidance(
        { ...long, distanceKm: 65 },
        { raceKm: 100, raceElevationM: 5000, climbRate: 500, paceSecondsPerKm: 375 }
    );
    assert.equal(capped.meters, 1700);
    assert.match(capped.text, /ridotto a metà del tempo in salita/);
    const quality = elevationGuidance({ ...long, quality: true }, { raceKm: 100, raceElevationM: 5000, climbRate: 500 });
    assert.equal(quality.meters, 0);
    assert.equal(elevationGuidance(long, { raceKm: 100, raceElevationM: null, climbRate: 500 }).meters, null);
});

test('la bozza della 102K è completa, in trail, con passi e dislivello nelle note', () => {
    const draft = scheduleCycleDraft(options);
    assert.equal(draft.status, 'draft_ready_for_confirmation');
    assert.equal(draft.weeks.length, 12);
    const sessions = draftToCalendarSessions(draft);
    const longest = sessions.find(session => session.title.includes('65 km'));
    assert.equal(longest.sport_type, 'trail');
    assert.match(longest.notes, /circa 1700 m D\+/);
    assert.match(longest.notes, /RUM\) 6:15\/km/);
    assert.equal(sessions.at(-1).scheduled_date, '2027-06-04');
});

test('la regola ultra è approvata e si applica solo a gare trail tra 75 e 125 km', () => {
    const rule = TRAINING_METHOD_RULES.find(item => item.id === 'ultra_100km_evoluto');
    assert.equal(rule.ruleStatus, 'approved_for_drafts');
    const profile = {
        goal_mode: 'race',
        preferred_terrains: ['road', 'trail'],
        consistency_status: 'returning',
        target_running_sessions_per_week: 3,
        reference_test_date: '2026-11-01',
        reference_vr_seconds_per_km: 285
    };
    // Con anche la tabella 11 applicabile serve la scelta del metodo.
    const undecided = assessTrainingMethodology(profile, { distance_km: 102, event_date: '2027-06-04' }, TRAINING_METHOD_RULES, {
        asOfDate: '2026-11-14'
    });
    assert.equal(undecided.generation_enabled, false);
    const ultra = assessTrainingMethodology(
        { ...profile, preferred_cycle_method: 'distance_time' },
        { distance_km: 102, event_date: '2027-06-04' },
        TRAINING_METHOD_RULES,
        { asOfDate: '2026-11-14' }
    );
    assert.deepEqual(ultra.generation_pattern_ids, ['ultra_100km_evoluto']);
    // Su sola strada vale solo la tabella 11.
    const roadOnly = assessTrainingMethodology(
        { ...profile, preferred_terrains: ['road'] },
        { distance_km: 102, event_date: '2027-06-04' },
        TRAINING_METHOD_RULES,
        { asOfDate: '2026-11-14' }
    );
    assert.ok(!roadOnly.approved_pattern_ids.includes('ultra_100km_evoluto'));
    assert.deepEqual(roadOnly.generation_pattern_ids, ['ultra_100km_passatore']);
    const tooShort = assessTrainingMethodology(profile, { distance_km: 73, event_date: '2027-03-20' }, TRAINING_METHOD_RULES, {
        asOfDate: '2026-11-14'
    });
    assert.ok(!tooShort.approved_pattern_ids.includes('ultra_100km_evoluto'));
});
