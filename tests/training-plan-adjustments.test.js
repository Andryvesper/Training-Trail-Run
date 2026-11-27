import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAINING_METHOD_RULES } from '../js/modules/training-methodology-rules.js';
import { draftToCalendarSessions } from '../js/modules/training-cycle-engine.js';
import {
    TrainingPlannerService,
    applyIntermediateRaces,
    explainMissingProgram,
    generateCycleDraft,
    getPlanningReadiness,
    getReferenceTestProposal,
    normalizePlanningProfile,
    previewMissedWeek,
    proposeReferenceTest
} from '../js/modules/training-planner.js';
import { INTERMEDIATE_RACE_RULE, MISSED_WEEK_RULE, planWeekFromTitle } from '../js/modules/training-plan-adjustments.js';

const TODAY = '2026-11-14';
const availability = {
    mon: { available: false, max_minutes: null },
    tue: { available: true, max_minutes: 90 },
    wed: { available: true, max_minutes: 90 },
    thu: { available: true, max_minutes: 90 },
    fri: { available: false, max_minutes: null },
    sat: { available: true, max_minutes: 240 },
    sun: { available: true, max_minutes: 300 }
};

function profileInput(overrides = {}) {
    return {
        goal_mode: 'race',
        primary_race_id: 'goal',
        self_profile: 'regular_recreational',
        consistency_status: 'consistent',
        target_running_sessions_per_week: 4,
        peak_week_proposal_mode: 'disabled',
        preferred_terrains: ['trail'],
        trail_experience: 'some',
        weekly_availability: availability,
        ...overrides
    };
}

const trail30 = {
    id: 'goal', name: 'Trail del lago', event_date: '2027-02-28', target_period: null,
    distance_km: 30, elevation_gain_m: 1500, elevation_loss_m: 1200, priority: 1, goal: 'trail', status: 'planned'
};
const passatore = {
    id: 'goal', name: 'Passatore', event_date: '2027-05-29', target_period: null,
    distance_km: 100, elevation_gain_m: 1000, elevation_loss_m: null, priority: 1, goal: null, status: 'planned'
};
const rule = id => TRAINING_METHOD_RULES.find(item => item.id === id);

function mockClient(results) {
    const calls = [];
    return {
        calls,
        client: {
            from(table) {
                calls.push(['from', table]);
                const result = results.shift();
                const query = {};
                ['select', 'eq', 'gte', 'lte', 'is', 'insert', 'update', 'order', 'limit'].forEach(method => {
                    query[method] = (...args) => { calls.push([method, ...args]); return query; };
                });
                query.single = () => Promise.resolve(result);
                query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
                return query;
            }
        }
    };
}

test('tabelle 13 e 11 generano la bozza senza test VR e passano il D- della gara', async () => {
    const mock = mockClient([{ data: { id: 'd1', status: 'draft_generated' }, error: null }]);
    await new TrainingPlannerService(mock.client).createDraftRequest('user-1', profileInput(), [trail30], { today: TODAY });
    const insert = mock.calls.find(call => call[0] === 'insert')[1];
    assert.equal(insert.status, 'draft_generated');
    const draft = insert.profile_snapshot.generated_draft;
    assert.equal(draft.rule_id, 'trail_15_50km');
    assert.equal(draft.intensity, 'breathing');
    assert.equal(draft.vrSecondsPerKm, null);
    assert.equal(insert.profile_snapshot.primary_race.elevation_loss_m, 1200);
    const withLoss = draft.weeks.flatMap(week => week.sessions).find(session => session.elevation?.lossMeters > 0);
    assert.ok(withLoss, 'almeno una seduta con D-');
    assert.notEqual(withLoss.elevation.lossMeters, withLoss.elevation.meters);
    assert.ok(!explainMissingProgram(insert.profile_snapshot).some(reason => reason.includes('test VR')));

    const ultra = mockClient([{ data: { id: 'd2' }, error: null }]);
    await new TrainingPlannerService(ultra.client).createDraftRequest('user-1', profileInput({ preferred_terrains: ['road'] }), [passatore], { today: TODAY });
    const ultraInsert = ultra.calls.find(call => call[0] === 'insert')[1];
    assert.equal(ultraInsert.profile_snapshot.generated_draft.rule_id, 'ultra_100km_passatore');
    assert.equal(ultraInsert.profile_snapshot.generated_draft.weeks.length, 15);
});

test('ultra su trail: senza metodo scelto mostra il suggerimento e non chiede il test VR', () => {
    const profile = normalizePlanningProfile(profileInput());
    const mock = { goal_mode: 'race', primary_race: passatore, ...profile };
    const assessment = { approved_pattern_ids: ['ultra_100km_evoluto', 'ultra_100km_passatore'], blockers: [
        'Più cicli sono applicabili: scegli il metodo (respiratorio o distanza-tempo) nel questionario.',
        'Suggerimento (regola derivata, da confermare dall\'atleta): da amatore usa la tabella 11 (metodo respiratorio, km e sensazioni).'
    ] };
    const reasons = explainMissingProgram({ ...mock, methodology_assessment: assessment });
    assert.ok(reasons.some(reason => reason.includes('tabella 11')));
    assert.ok(!reasons.some(reason => reason.includes('test VR')));
    // Con metodo distanza-tempo (tabella 10 evoluti) il test VR serve.
    const withVr = explainMissingProgram({ ...mock, preferred_cycle_method: 'distance_time', methodology_assessment: assessment });
    assert.ok(withVr.some(reason => reason.includes('test VR')));
    const none = explainMissingProgram({ goal_mode: 'race', primary_race: { name: 'Corsa', distance_km: 60 }, methodology_assessment: { approved_pattern_ids: [] } });
    assert.ok(none[0].includes('trail 15-50 km'));
});

test('la variante a 5 corse non viene chiesta per la tabella 13 (base 5 corse)', () => {
    const five = getPlanningReadiness(profileInput({
        target_running_sessions_per_week: 5,
        weekly_availability: { ...availability, mon: { available: true, max_minutes: 60 } }
    }), [trail30], { today: TODAY });
    assert.ok(!five.warnings.some(item => item.includes('scegli la variante')));
});

test('propone il test VR solo se il metodo scelto lo richiede, nel primo giorno libero', () => {
    const road10 = { id: 'goal', name: 'Dieci', event_date: '2027-03-21', distance_km: 10, elevation_gain_m: 0, priority: 1, status: 'planned' };
    const input = profileInput({
        preferred_terrains: ['road'],
        preferred_cycle_method: 'distance_time',
        weekly_other_sports: [{ sport: 'swimming', day: 'tue', duration_minutes: 60, schedule_type: 'fixed' }]
    });
    const proposal = getReferenceTestProposal(input, [road10], { today: TODAY });
    assert.ok(proposal);
    assert.equal(proposal.protocol, 'three_km_plus_10');
    // Oggi è sabato: domenica 15 è disponibile.
    assert.equal(proposal.proposedDate, '2026-11-15');
    assert.equal(proposal.calendarSession.distance_km, 6);
    assert.match(proposal.calendarSession.notes, /Riscaldamento/);

    const tenKm = proposeReferenceTest(normalizePlanningProfile({ ...input, weekly_availability: { ...availability, sun: { available: false, max_minutes: null } } }), { today: TODAY, protocol: 'ten_km' });
    // Martedì bloccato dal nuoto fisso: mercoledì 18.
    assert.equal(tenKm.proposedDate, '2026-11-18');
    assert.equal(tenKm.totalKm, 13);

    const valid = getReferenceTestProposal({
        ...input,
        reference_test_protocol: 'ten_km',
        reference_test_date: '2026-11-01',
        reference_test_time: '45:00',
        reference_test_conditions: 'pista'
    }, [road10], { today: TODAY });
    assert.equal(valid, null);
    assert.equal(getReferenceTestProposal(profileInput(), [trail30], { today: TODAY }), null);
});

test('aggiunge il test VR al calendario dopo le sedute dello stesso giorno', async () => {
    const proposal = proposeReferenceTest(normalizePlanningProfile(profileInput()), { today: TODAY });
    const mock = mockClient([
        { data: [{ scheduled_date: proposal.proposedDate, session_order: 2 }], error: null },
        { data: [{ id: 'new' }], error: null }
    ]);
    const result = await new TrainingPlannerService(mock.client).addReferenceTestToCalendar('user-1', proposal, { today: TODAY });
    assert.equal(result.session_count, 1);
    const rows = mock.calls.find(call => call[0] === 'insert')[1];
    assert.equal(rows[0].session_order, 3);
    assert.equal(rows[0].user_id, 'user-1');
});

test('gare intermedie: proposte non applicate, applicate solo su scelta', () => {
    const profile = normalizePlanningProfile(profileInput());
    const secondary = [
        { id: 's1', name: 'Mezza in collina', event_date: '2027-01-30', distance_km: 21 },
        { id: 's2', name: 'Cross', event_date: '2027-02-07', distance_km: 8 },
        { id: 's3', name: 'Dopo', event_date: '2027-03-10', distance_km: 10 }
    ];
    const draft = generateCycleDraft(profile, trail30, rule('trail_15_50km'), { today: TODAY, secondaryRaces: secondary });
    assert.equal(draft.intermediateRaceProposals.length, 2);
    const [inTable, sameDay] = draft.intermediateRaceProposals;
    assert.equal(inTable.target.kind, 'in_table_race');
    assert.match(inTable.target.raw, /Gara o lungo/);
    assert.equal(sameDay.target.kind, 'same_day');
    assert.ok(draft.intermediateRaceProposals.every(item => item.applied === false && /Regola derivata/.test(item.description)));
    // Non applicate di default: la bozza resta quella della tabella.
    assert.ok(!draft.weeks.flatMap(week => week.sessions).some(session => session.derivedRule === INTERMEDIATE_RACE_RULE.id));

    const applied = applyIntermediateRaces(draft, [inTable]);
    const sessions = applied.weeks.flatMap(week => week.sessions);
    const race = sessions.find(session => session.date === '2027-01-30');
    assert.equal(race.type, 'race_training');
    assert.equal(race.distanceKm, 21);
    assert.ok(!sessions.some(session => /Gara o lungo/.test(session.raw) && session.date === '2027-01-31'));
    const dayBefore = sessions.find(session => session.date === '2027-01-29');
    if (dayBefore) assert.ok(dayBefore.distanceKm <= INTERMEDIATE_RACE_RULE.easyRunMaxKm);
    assert.ok(applied.derivedRules.some(item => item.id === INTERMEDIATE_RACE_RULE.id));
    assert.deepEqual(applied.appliedIntermediateRaces, ['s1']);
    assert.ok(draftToCalendarSessions(applied).some(row => row.scheduled_date === '2027-01-30' && /Mezza in collina/.test(row.title)));

    const second = applyIntermediateRaces(draft, [sameDay]).weeks.flatMap(week => week.sessions);
    const before = second.find(session => session.date === '2027-02-06');
    assert.equal(before.raw, 'Riposo o corsa facile breve');
    assert.equal(before.quality, false);
    assert.ok(before.distanceKm <= 5);
    const after = second.find(session => session.date === '2027-02-08');
    if (after) assert.equal(after.raw, 'Corsa facile/DAU o riposo');
});

test('tabella 11: la gara reale nella settimana della maratona prende il suo posto', () => {
    const profile = normalizePlanningProfile(profileInput({ preferred_terrains: ['road'] }));
    const draft = generateCycleDraft(profile, passatore, rule('ultra_100km_passatore'), {
        today: TODAY,
        secondaryRaces: [{ id: 'm', name: 'Maratona di primavera', event_date: '2027-04-09', distance_km: 42.195 }]
    });
    const [proposal] = draft.intermediateRaceProposals;
    assert.equal(proposal.target.kind, 'in_table_race');
    assert.match(proposal.target.raw, /maratona/i);
    const sessions = applyIntermediateRaces(draft, [proposal]).weeks.flatMap(week => week.sessions);
    assert.ok(!sessions.some(session => /^Gara\s*\/?\s*maratona/i.test(session.raw)));
    assert.equal(sessions.filter(session => session.derivedRule === INTERMEDIATE_RACE_RULE.id && session.type === 'race_training').length, 1);
});

function planDraft() {
    const weeks = [1, 2, 3, 4, 5, 6].map(weekNumber => ({
        weekNumber,
        startDate: addDays('2026-11-02', (weekNumber - 1) * 7),
        endDate: addDays('2026-11-08', (weekNumber - 1) * 7),
        sessions: []
    }));
    return { startDate: '2026-11-02', endDate: '2026-12-13', source: { table: '6' }, weeks };
}

function addDays(dateKey, days) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

const planSessions = [
    { id: 'a', scheduled_date: '2026-11-08', title: 'Tab. 6 · S1 · 12 km L', sport_type: 'run', distance_km: 12, intervals_activity_id: 'i1', completed_activity: { distance: 12300 } },
    { id: 'b', scheduled_date: '2026-11-15', title: 'Tab. 6 · S2 · 14 km L', sport_type: 'run', distance_km: 14, intervals_activity_id: null },
    { id: 'c', scheduled_date: '2026-11-18', title: 'Tab. 6 · S3 · 6 x 1 km B', sport_type: 'run', distance_km: 8, intervals_activity_id: null, notes: 'Qualità' },
    { id: 'd', scheduled_date: '2026-11-22', title: 'Tab. 6 · S3 · 18 km L', sport_type: 'run', distance_km: 18, intervals_activity_id: null, notes: 'Lungo' }
];

test('settimana saltata: anteprima con lungo limitato a +25% e qualità invariata', () => {
    assert.equal(planWeekFromTitle('Tab. 13 · S11 · 8 km CRF'), 11);
    const draft = { ...planDraft(), endDate: '2027-01-31' };
    const preview = previewMissedWeek({ draft, weekNumber: 2, planSessions, today: '2026-11-15' });
    assert.equal(preview.status, 'changes_proposed');
    assert.equal(preview.rule.ruleStatus, MISSED_WEEK_RULE.ruleStatus);
    assert.equal(preview.changes.length, 1);
    assert.equal(preview.changes[0].session_id, 'd');
    // Ultimo lungo completato 12,3 km: tetto floor(15,375) = 15 km.
    assert.equal(preview.changes[0].to_km, 15);
    assert.match(preview.changes[0].notes, /^Lungo Settimana 2 saltata/);
    assert.ok(preview.notes.some(note => note.includes('non si recuperano')));

    const taper = previewMissedWeek({ draft: planDraft(), weekNumber: 2, planSessions, today: '2026-11-25' });
    assert.equal(taper.status, 'taper_kept');
    assert.equal(taper.changes.length, 0);

    assert.throws(() => previewMissedWeek({ draft, weekNumber: 4, planSessions, today: '2026-11-15' }), /passata o in corso/);
    const noReference = previewMissedWeek({ draft, weekNumber: 1, planSessions, today: '2026-11-08' });
    assert.equal(noReference.status, 'no_changes');
});

test('settimana saltata: applica le modifiche solo con conferma', async () => {
    const draft = { ...planDraft(), endDate: '2027-01-31' };
    const preview = previewMissedWeek({ draft, weekNumber: 2, planSessions, today: '2026-11-15' });
    const mock = mockClient([{ data: [{ id: 'd' }], error: null }]);
    const service = new TrainingPlannerService(mock.client);
    await assert.rejects(service.applyMissedWeek('user-1', preview), /conferma esplicita/);
    assert.deepEqual(mock.calls, []);
    const result = await service.applyMissedWeek('user-1', preview, { confirmed: true, today: '2026-11-15' });
    assert.equal(result.updated_count, 1);
    const update = mock.calls.find(call => call[0] === 'update');
    assert.equal(update[1].distance_km, 15);
    assert.match(update[1].title, /18 km|15 km/);
    assert.ok(!/18 km/.test(update[1].title));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});

test('due gare intermedie nella stessa settimana: la seconda non cancella la prima', () => {
    const profile = normalizePlanningProfile(profileInput());
    const secondary = [
        { id: 'a', name: 'Gara A', event_date: '2027-01-13', distance_km: 10 },
        { id: 'b', name: 'Gara B', event_date: '2027-01-14', distance_km: 5 }
    ];
    const draft = generateCycleDraft(profile, trail30, rule('trail_15_50km'), { today: TODAY, secondaryRaces: secondary });
    const applied = applyIntermediateRaces(draft, draft.intermediateRaceProposals);
    const races = applied.weeks.flatMap(week => week.sessions).filter(session => session.derivedRule === INTERMEDIATE_RACE_RULE.id && session.type === 'race_training');
    assert.equal(races.length, 2);
    assert.throws(() => applyIntermediateRaces(draft, [{ event_date: '2030-01-01' }]), /periodo della bozza/);
});

test('ultima settimana della tabella 13: la gara porta la distanza reale', () => {
    const profile = normalizePlanningProfile(profileInput());
    const race = { ...trail30, distance_km: 50 };
    const draft = generateCycleDraft(profile, race, rule('trail_15_50km'), { today: TODAY });
    const last = draft.weeks[draft.weeks.length - 1].sessions.find(session => session.type === 'race');
    assert.equal(last.raceDistanceKm, 50);
    assert.equal(last.raw, 'Gara 50 km');
});
