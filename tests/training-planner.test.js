import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TrainingPlannerService,
    getTenKmPrototypeReadiness,
    getPlanningReadiness,
    normalizePlanningProfile
} from '../js/modules/training-planner.js';

function createSupabaseMock(result) {
    const calls = [];
    const query = {};

    ['select', 'eq', 'upsert', 'insert', 'order', 'limit'].forEach(method => {
        query[method] = (...args) => {
            calls.push([method, ...args]);
            return query;
        };
    });
    query.single = () => Promise.resolve(result);
    query.maybeSingle = () => Promise.resolve(result);
    query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);

    return {
        calls,
        client: {
            from(table) {
                calls.push(['from', table]);
                return query;
            }
        }
    };
}

function readyProfile(overrides = {}) {
    return {
        goal_mode: 'improve',
        goal_horizon_weeks: 8,
        goal_focus: 'continuity',
        self_profile: 'regular_recreational',
        consistency_status: 'consistent',
        target_running_sessions_per_week: 2,
        peak_week_proposal_mode: 'suggest_with_reason',
        peak_week_max_running_sessions: 4,
        weekly_availability: {
            mon: { available: true, max_minutes: 45 },
            tue: { available: false, max_minutes: null },
            wed: { available: true, max_minutes: 60 },
            thu: { available: false, max_minutes: null },
            fri: { available: false, max_minutes: null },
            sat: { available: false, max_minutes: null },
            sun: { available: false, max_minutes: null }
        },
        ...overrides
    };
}

const plannedRace = {
    id: 'race-1',
    name: 'Trail test',
    event_date: '2027-06-01',
    target_period: null,
    distance_km: 25,
    elevation_gain_m: 1200,
    priority: 1,
    goal: 'Obiettivo principale',
    status: 'planned'
};

const secondaryRace = {
    ...plannedRace,
    id: 'race-2',
    name: 'Road race',
    distance_km: 10,
    elevation_gain_m: 100,
    goal: 'Gara secondaria'
};

test('normalizza profilo incompleto lasciando i campi non compilati espliciti', () => {
    const profile = normalizePlanningProfile({
        preferred_terrains: ['trail', 'trail', 'road'],
        weekly_availability: { mon: { available: true, max_minutes: '' } }
    });

    assert.equal(profile.goal_mode, null);
    assert.deepEqual(profile.preferred_terrains, ['trail', 'road']);
    assert.equal(profile.weekly_availability.mon.available, true);
    assert.equal(profile.weekly_availability.mon.max_minutes, null);
    assert.equal(profile.weekly_availability.sun.available, false);
    assert.deepEqual(profile.secondary_race_ids, []);
});

test('rifiuta profili con valori fuori dai limiti o protocolli non validi', () => {
    assert.throws(() => normalizePlanningProfile({
        weekly_availability: { mon: { available: true, max_minutes: 5 } }
    }), /tra 10 e 1440 minuti/);
    assert.throws(() => normalizePlanningProfile({
        goal_mode: 'automatic'
    }), /obiettivo del piano/);
    assert.throws(() => normalizePlanningProfile({
        reference_test_protocol: 'three_km',
        reference_test_date: '2027-02-30'
    }), /data del test/);
    assert.throws(() => normalizePlanningProfile({
        secondary_race_ids: Array.from({ length: 11 }, (_, index) => `race-${index}`)
    }), /al massimo 10 gare secondarie/);
    assert.throws(() => normalizePlanningProfile({
        target_running_sessions_per_week: 8
    }), /comprese tra 1 e 7/);
    assert.throws(() => normalizePlanningProfile({
        target_running_sessions_per_week: 3,
        peak_week_proposal_mode: 'suggest_with_reason',
        peak_week_max_running_sessions: 3
    }), /deve superare la frequenza settimanale di base/);
});

test('normalizza frequenza base e limite delle proposte di picco', () => {
    const profile = normalizePlanningProfile(readyProfile());
    assert.equal(profile.target_running_sessions_per_week, 2);
    assert.equal(profile.peak_week_proposal_mode, 'suggest_with_reason');
    assert.equal(profile.peak_week_max_running_sessions, 4);
    assert.equal(profile.weekly_availability_mode, 'typical_week_with_exceptions');
    assert.equal(profile.schedule_overflow_policy, 'ask_before_reduce');

    const withoutPeak = normalizePlanningProfile({
        target_running_sessions_per_week: 2,
        peak_week_proposal_mode: 'disabled'
    });
    assert.equal(withoutPeak.peak_week_max_running_sessions, null);
});

test('salva altri sport come impegni settimanali espliciti e non li deduce se assenti', () => {
    const empty = normalizePlanningProfile({
        weekly_availability: Object.fromEntries([
            ['mon', { available: true, max_minutes: 45 }],
            ['tue', { available: true, max_minutes: 45 }],
            ['wed', { available: true, max_minutes: 60 }],
            ['sat', { available: true, max_minutes: 90 }]
        ])
    });
    assert.deepEqual(empty.weekly_other_sports, []);
    assert.deepEqual(normalizePlanningProfile({
        weekly_other_sports: [{ sport: '', day: '', duration_minutes: '', schedule_type: '' }]
    }).weekly_other_sports, []);

    const profile = normalizePlanningProfile({
        weekly_other_sports: [{
            sport: 'swimming',
            day: 'wed',
            duration_minutes: '60',
            schedule_type: 'fixed'
        }]
    });
    assert.deepEqual(profile.weekly_other_sports, [{
        sport: 'swimming',
        custom_sport: null,
        day: 'wed',
        duration_minutes: 60,
        schedule_type: 'fixed'
    }]);
});

test('valida sedute incomplete e limiti degli altri sport', () => {
    assert.throws(() => normalizePlanningProfile({
        weekly_other_sports: [{ sport: 'swimming', day: 'wed' }]
    }), /Completa sport, giorno, durata e flessibilità/);
    assert.throws(() => normalizePlanningProfile({
        weekly_other_sports: [{
            sport: 'other',
            custom_sport: '',
            day: 'wed',
            duration_minutes: 45,
            schedule_type: 'fixed'
        }]
    }), /Specifica lo sport/);
    assert.throws(() => normalizePlanningProfile({
        weekly_other_sports: [{
            sport: 'swimming',
            day: 'wed',
            duration_minutes: 5,
            schedule_type: 'fixed'
        }]
    }), /durata.*tra 10 e 1440 minuti/);
});

test('registra la VR calcolata solo da un protocollo supportato e dal tempo del test', () => {
    const profile = normalizePlanningProfile({
        reference_test_protocol: 'three_km_plus_10',
        reference_test_date: '2026-10-20',
        reference_test_time: '15:12',
        reference_test_conditions: 'Pista misurata, asciutto'
    });

    assert.equal(profile.reference_test_time_seconds, 912);
    assert.equal(profile.reference_vr_seconds_per_km, 334);
    assert.equal(profile.reference_test_time, '15:12');

    const unsupported = normalizePlanningProfile({
        reference_test_protocol: 'race',
        reference_test_date: '2026-10-20',
        reference_test_time: '50:00'
    });
    assert.equal(unsupported.reference_vr_seconds_per_km, null);
});

test('non considera le sole condizioni come risultato di un test VR', () => {
    const readiness = getPlanningReadiness(readyProfile({
        reference_test_protocol: 'ten_km',
        reference_test_date: '2026-10-20',
        reference_test_conditions: 'Pianeggiante e asciutto'
    }));

    assert.ok(readiness.missing.some(item => item.includes('tipo, data e risultato')));
});

test('il prototipo 10 km usa la VR come prerequisito e segnala i limiti metodologici residui', () => {
    const race = {
        id: 'road-10k',
        name: '10 km su strada',
        event_date: '2027-06-01',
        target_period: null,
        distance_km: 10,
        status: 'planned'
    };
    const weeklyAvailability = {
        mon: { available: false, max_minutes: null },
        tue: { available: true, max_minutes: 60 },
        wed: { available: false, max_minutes: null },
        thu: { available: true, max_minutes: 60 },
        fri: { available: false, max_minutes: null },
        sat: { available: true, max_minutes: 90 },
        sun: { available: true, max_minutes: 90 }
    };
    const profile = readyProfile({
        goal_mode: 'race',
        primary_race_id: race.id,
        goal_horizon_weeks: null,
        goal_focus: null,
        preferred_terrains: ['road'],
        weekly_availability: weeklyAvailability,
        reference_test_protocol: 'ten_km',
        reference_test_date: '2026-10-20',
        reference_test_time: '50:00',
        reference_test_conditions: 'Pianeggiante e asciutto'
    });

    const readiness = getTenKmPrototypeReadiness(profile, [race], { today: '2026-11-13' });
    assert.equal(readiness.reference_vr_seconds_per_km, 300);
    assert.equal(readiness.ready, false);
    assert.ok(!readiness.missing.some(item => item.includes('VR')));
    assert.ok(readiness.blockers.some(item => item.includes('non può dedurre')));
    assert.ok(!readiness.blockers.some(item => item.includes('non ancora approvate')));
    assert.ok(readiness.blockers.some(item => item.includes('Seleziona 4 corse')));
    assert.ok(!readiness.blockers.some(item => item.includes('validità temporale')));
});

test('la bozza senza gara richiede obiettivo, esperienza, continuità, orizzonte e disponibilità completa', () => {
    const readiness = getPlanningReadiness(readyProfile({
        weekly_availability: { mon: { available: true, max_minutes: null } }
    }));

    assert.equal(readiness.ready, false);
    assert.ok(readiness.missing.some(item => item.includes('tempo massimo')));
    assert.ok(!readiness.missing.some(item => item.includes('ritmo')));
});

test('la frequenza scelta deve rientrare nei giorni tipici e le settimane di picco restano esplicite', () => {
    const tooManyBaseRuns = getPlanningReadiness(readyProfile({
        target_running_sessions_per_week: 3
    }));
    assert.ok(tooManyBaseRuns.missing.some(item => item.includes('supera i giorni attualmente disponibili')));

    const peakNeedsExceptionalAvailability = getPlanningReadiness(readyProfile({
        peak_week_max_running_sessions: 4
    }));
    assert.ok(peakNeedsExceptionalAvailability.warnings.some(item => item.includes('eccezioni di calendario esplicite')));

    const missingPeakLimit = getPlanningReadiness(readyProfile({
        peak_week_max_running_sessions: null
    }));
    assert.ok(missingPeakLimit.missing.some(item => item.includes('limite di corse')));
});

test('quattro corse restano compatibili senza altri sport ma rispettano gli impegni fissi', () => {
    const availability = {
        mon: { available: true, max_minutes: 45 },
        tue: { available: true, max_minutes: 45 },
        wed: { available: true, max_minutes: 60 },
        thu: { available: true, max_minutes: 90 }
    };
    const noOtherSports = getPlanningReadiness(readyProfile({
        target_running_sessions_per_week: 4,
        peak_week_proposal_mode: 'disabled',
        peak_week_max_running_sessions: null,
        weekly_availability: availability
    }));
    assert.equal(noOtherSports.ready, true);

    const fixedSwim = getPlanningReadiness(readyProfile({
        target_running_sessions_per_week: 4,
        peak_week_proposal_mode: 'disabled',
        peak_week_max_running_sessions: null,
        weekly_availability: availability,
        weekly_other_sports: [{
            sport: 'swimming',
            day: 'wed',
            duration_minutes: 60,
            schedule_type: 'fixed'
        }]
    }));
    assert.ok(fixedSwim.missing.some(item => item.includes('impegni fissi degli altri sport')));

    const movableSwim = getPlanningReadiness(readyProfile({
        target_running_sessions_per_week: 4,
        peak_week_proposal_mode: 'disabled',
        peak_week_max_running_sessions: null,
        weekly_availability: availability,
        weekly_other_sports: [{
            sport: 'swimming',
            day: 'wed',
            duration_minutes: 60,
            schedule_type: 'movable'
        }]
    }));
    assert.equal(movableSwim.ready, true);
    assert.ok(movableSwim.warnings.some(item => item.includes('seduta di altro sport è spostabile')));
});

test('consente di dichiarare continuità sconosciuta senza dedurre il livello', () => {
    const readiness = getPlanningReadiness(readyProfile({
        consistency_status: 'unknown',
        self_profile: 'prefer_not_to_say'
    }));

    assert.equal(readiness.ready, true);
});

test('la richiesta gara richiede selezione valida e esperienza trail per gare trail', () => {
    const profile = readyProfile({
        goal_mode: 'race',
        primary_race_id: 'race-1',
        goal_horizon_weeks: null,
        goal_focus: null,
        trail_experience: null
    });
    const missingRace = getPlanningReadiness(profile, []);
    assert.equal(missingRace.ready, false);
    assert.ok(missingRace.missing.some(item => item.includes('gara pianificata')));

    const missingTrailExperience = getPlanningReadiness(profile, [plannedRace]);
    assert.ok(missingTrailExperience.missing.some(item => item.includes('esperienza sui percorsi trail')));

    const ready = getPlanningReadiness({ ...profile, trail_experience: 'some' }, [plannedRace]);
    assert.equal(ready.ready, true);
});

test('considera le gare secondarie e segnala date coincidenti senza risolverle automaticamente', () => {
    const profile = readyProfile({
        goal_mode: 'race',
        primary_race_id: 'race-1',
        goal_horizon_weeks: null,
        goal_focus: null,
        trail_experience: 'some',
        secondary_race_ids: ['race-2']
    });
    const readiness = getPlanningReadiness(profile, [plannedRace, secondaryRace]);

    assert.equal(readiness.ready, true);
    assert.equal(readiness.profile.secondary_race_ids[0], 'race-2');
    assert.ok(readiness.warnings.some(item => item.includes('stessa data')));
    assert.ok(!readiness.missing.some(item => item.includes('stessa data')));
});

test('richiede una gara principale per usare gare secondarie', () => {
    const readiness = getPlanningReadiness(readyProfile({
        secondary_race_ids: ['race-2']
    }), [secondaryRace]);

    assert.ok(readiness.missing.some(item => item.includes('solo quando selezioni una gara obiettivo principale')));
});

test('richiede un focus per il miglioramento e un orizzonte per il mantenimento', () => {
    const improvement = getPlanningReadiness(readyProfile({ goal_focus: null }));
    assert.ok(improvement.missing.some(item => item.includes('cosa vuoi migliorare')));

    const maintenance = getPlanningReadiness(readyProfile({
        goal_mode: 'maintain',
        goal_focus: null,
        goal_horizon_weeks: null
    }));
    assert.ok(maintenance.missing.some(item => item.includes('orizzonte')));
});

test('salva e ricarica il questionario per utente usando upsert sulla chiave utente', async () => {
    const saved = { user_id: 'user-1', questionnaire: { goal_mode: 'maintain' } };
    const mock = createSupabaseMock({ data: saved, error: null });
    const service = new TrainingPlannerService(mock.client);

    assert.equal(await service.saveProfile('user-1', readyProfile()), saved);
    const upsert = mock.calls.find(call => call[0] === 'upsert');
    assert.equal(upsert[1].user_id, 'user-1');
    assert.equal(upsert[2].onConflict, 'user_id');
    assert.deepEqual(await service.loadProfile('user-1'), saved);
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});

test('crea una richiesta di bozza non attiva con snapshot della gara selezionata', async () => {
    const saved = { id: 'draft-1', status: 'awaiting_methodology' };
    const mock = createSupabaseMock({ data: saved, error: null });
    const service = new TrainingPlannerService(mock.client);
    const profile = readyProfile({
        goal_mode: 'race',
        primary_race_id: 'race-1',
        goal_horizon_weeks: null,
        goal_focus: null,
        trail_experience: 'some',
        preferred_terrains: ['trail'],
        secondary_race_ids: ['race-2'],
        secondary_race_intents: { 'race-2': 'time_goal' },
        weekly_other_sports: [{
            sport: 'swimming',
            day: 'wed',
            duration_minutes: 60,
            schedule_type: 'movable'
        }]
    });

    assert.equal(await service.createDraftRequest('user-1', profile, [plannedRace, secondaryRace]), saved);
    const insert = mock.calls.find(call => call[0] === 'insert')[1];
    assert.equal(insert.user_id, 'user-1');
    assert.equal(insert.goal_mode, 'race');
    assert.equal(insert.primary_race_id, 'race-1');
    assert.equal(insert.status, 'awaiting_methodology');
    assert.deepEqual(insert.profile_snapshot.primary_race, {
        id: 'race-1',
        name: 'Trail test',
        event_date: '2027-06-01',
        target_period: null,
        distance_km: 25,
        elevation_gain_m: 1200,
        priority: 1,
        goal: 'Obiettivo principale'
    });
    assert.equal(insert.profile_snapshot.methodology_assessment.status, 'awaiting_approved_rules');
    assert.equal(insert.profile_snapshot.methodology_assessment.generation_enabled, false);
    assert.equal(insert.profile_snapshot.target_running_sessions_per_week, 2);
    assert.equal(insert.profile_snapshot.peak_week_proposal_mode, 'suggest_with_reason');
    assert.equal(insert.profile_snapshot.peak_week_max_running_sessions, 4);
    assert.equal(insert.profile_snapshot.schedule_overflow_policy, 'ask_before_reduce');
    assert.deepEqual(insert.profile_snapshot.weekly_other_sports, [{
        sport: 'swimming',
        custom_sport: null,
        day: 'wed',
        duration_minutes: 60,
        schedule_type: 'movable'
    }]);
    assert.ok(insert.profile_snapshot.methodology_assessment.candidate_pattern_ids.includes('trail_specificity'));
    assert.ok(!insert.profile_snapshot.methodology_assessment.candidate_pattern_ids.includes('ten_km_breathing_cycle'));
    assert.ok(insert.profile_snapshot.methodology_assessment.source_example_ids.includes('bis_time_p175'));
    assert.equal(insert.profile_snapshot.race_compatibility[0].intent, 'time_goal');
    assert.equal(insert.profile_snapshot.race_compatibility[0].status, 'same_day_conflict');
    assert.deepEqual(insert.profile_snapshot.secondary_races, [{
        id: 'race-2',
        name: 'Road race',
        event_date: '2027-06-01',
        target_period: null,
        distance_km: 10,
        elevation_gain_m: 100,
        priority: 1,
        goal: 'Gara secondaria'
    }]);
});

test('non crea richieste se il questionario non è pronto o manca la gara selezionata', async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    const service = new TrainingPlannerService(mock.client);

    await assert.rejects(service.createDraftRequest('user-1', {}, []), /Completa il questionario/);
    await assert.rejects(
        service.createDraftRequest('user-1', readyProfile({
            goal_mode: 'race',
            primary_race_id: 'missing',
            goal_horizon_weeks: null,
            goal_focus: null
        }), [plannedRace]),
        /Completa il questionario/
    );
    assert.deepEqual(mock.calls, []);
});

function cycleProfile(overrides = {}) {
    return readyProfile({
        goal_mode: 'race',
        primary_race_id: 'race-10k',
        goal_horizon_weeks: null,
        goal_focus: null,
        preferred_terrains: ['road'],
        target_running_sessions_per_week: 4,
        peak_week_proposal_mode: 'disabled',
        peak_week_max_running_sessions: null,
        reference_test_protocol: 'ten_km',
        reference_test_date: '2026-11-01',
        reference_test_time: '45:00',
        reference_test_conditions: 'Pista',
        preferred_cycle_method: 'distance_time',
        weekly_availability: {
            mon: { available: false, max_minutes: null },
            tue: { available: true, max_minutes: 60 },
            wed: { available: false, max_minutes: null },
            thu: { available: true, max_minutes: 60 },
            fri: { available: false, max_minutes: null },
            sat: { available: true, max_minutes: 60 },
            sun: { available: true, max_minutes: 120 }
        },
        ...overrides
    });
}

const roadTenKm = {
    id: 'race-10k',
    name: 'Dieci su strada',
    event_date: '2027-03-21',
    target_period: null,
    distance_km: 10,
    elevation_gain_m: 20,
    priority: 1,
    goal: null,
    status: 'planned'
};

test('genera la bozza del ciclo solo quando la regola è approvata e la salva come da confermare', async () => {
    const { TRAINING_METHOD_RULES } = await import('../js/modules/training-methodology-rules.js');
    const approvedRules = TRAINING_METHOD_RULES;
    const unapprovedRules = TRAINING_METHOD_RULES.map(rule => rule.ruleStatus !== 'approved_for_drafts' ? rule : {
        ...rule,
        ruleStatus: 'candidate',
        approval: undefined
    });

    const notApproved = createSupabaseMock({ data: { id: 'draft-a' }, error: null });
    await new TrainingPlannerService(notApproved.client)
        .createDraftRequest('user-1', cycleProfile(), [roadTenKm], { today: '2026-11-13', rules: unapprovedRules });
    const pending = notApproved.calls.find(call => call[0] === 'insert')[1];
    assert.equal(pending.status, 'awaiting_methodology');
    assert.equal(pending.profile_snapshot.generated_draft, null);

    const approved = createSupabaseMock({ data: { id: 'draft-b' }, error: null });
    await new TrainingPlannerService(approved.client)
        .createDraftRequest('user-1', cycleProfile(), [roadTenKm], { today: '2026-11-13', rules: approvedRules });
    const generated = approved.calls.find(call => call[0] === 'insert')[1];
    assert.equal(generated.status, 'draft_generated');
    assert.equal(generated.profile_snapshot.generated_draft.rule_id, 'ten_km_distance_time_cycle');
    assert.equal(generated.profile_snapshot.generated_draft.status, 'draft_ready_for_confirmation');
    assert.equal(generated.profile_snapshot.generated_draft.weeks.length, 9);
});

test('scrive la bozza nel calendario solo con conferma esplicita e senza sovrascrivere sedute esistenti', async () => {
    const { generateCycleDraft } = await import('../js/modules/training-planner.js');
    const { TRAINING_METHOD_RULES } = await import('../js/modules/training-methodology-rules.js');
    const rule = TRAINING_METHOD_RULES.find(item => item.id === 'ten_km_distance_time_cycle');
    const profile = normalizePlanningProfile(cycleProfile());
    const draft = {
        id: 'draft-1',
        status: 'draft_generated',
        profile_snapshot: { generated_draft: generateCycleDraft(profile, roadTenKm, rule) }
    };

    const calls = [];
    const results = [
        { data: [{ id: 'draft-1' }], error: null },
        { data: [{ scheduled_date: '2027-01-19', session_order: 1 }], error: null },
        { data: Array.from({ length: 36 }, (_, index) => ({ id: `s${index}` })), error: null },
        { data: [], error: null }
    ];
    const client = {
        from(table) {
            calls.push(['from', table]);
            const result = results.shift();
            const query = {};
            ['select', 'eq', 'gte', 'lte', 'insert', 'update'].forEach(method => {
                query[method] = (...args) => { calls.push([method, ...args]); return query; };
            });
            query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
            return query;
        }
    };
    const service = new TrainingPlannerService(client);

    await assert.rejects(service.applyDraftToCalendar('user-1', draft), /conferma esplicita/);
    assert.deepEqual(calls, []);

    const outcome = await service.applyDraftToCalendar('user-1', draft, { confirmed: true, today: '2026-11-13' });
    assert.equal(outcome.session_count, 36);
    assert.deepEqual(outcome.overlapping_dates, ['2027-01-19']);
    const rows = calls.find(call => call[0] === 'insert')[1];
    assert.equal(rows.length, 36);
    assert.ok(rows.every(row => row.user_id === 'user-1'));
    assert.equal(rows.find(row => row.scheduled_date === '2027-01-19').session_order, 2);
    assert.deepEqual(calls.find(call => call[0] === 'update'), ['update', { status: 'confirmed' }]);
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'status' && call[2] === 'draft_generated'));

    await assert.rejects(
        service.applyDraftToCalendar('user-1', draft, { confirmed: true, today: '2026-11-13' }),
        /già stata confermata/
    );
    await assert.rejects(
        service.applyDraftToCalendar('user-1', draft, { confirmed: true, today: '2027-02-01' }),
        /prima di oggi/
    );
});

test('blocca gare obiettivo già passate e test VR futuri, avvisa per test scaduti', () => {
    const past = getPlanningReadiness(cycleProfile(), [{ ...roadTenKm, event_date: '2026-10-01' }], { today: '2026-11-13' });
    assert.ok(past.missing.some(item => item.includes('data già passata')));

    const futureTest = getPlanningReadiness(cycleProfile({ reference_test_date: '2026-12-01' }), [roadTenKm], { today: '2026-11-13' });
    assert.ok(futureTest.missing.some(item => item.includes('nel futuro')));

    const expiredTest = getPlanningReadiness(cycleProfile({ reference_test_date: '2026-09-01' }), [roadTenKm], { today: '2026-11-13' });
    assert.ok(expiredTest.warnings.some(item => item.includes('scaduto')));

    const five = getPlanningReadiness(cycleProfile({
        target_running_sessions_per_week: 5,
        weekly_availability: { ...cycleProfile().weekly_availability, mon: { available: true, max_minutes: 45 } }
    }), [roadTenKm], { today: '2026-11-13' });
    assert.ok(five.warnings.some(item => item.includes('scegli la variante')));
    assert.equal(normalizePlanningProfile(cycleProfile({ five_session_option: 'spread_plus_10' })).five_session_option, null);
    assert.equal(normalizePlanningProfile(cycleProfile({
        target_running_sessions_per_week: 5,
        five_session_option: 'spread_plus_10'
    })).five_session_option, 'spread_plus_10');
});

test('accetta disponibilità e altri sport fino a 24 ore per gli allenamenti lunghi', () => {
    const profile = normalizePlanningProfile({
        weekly_availability: { sun: { available: true, max_minutes: 720 } },
        weekly_other_sports: [{ sport: 'other', custom_sport: 'Escursione', day: 'sat', duration_minutes: 600, schedule_type: 'fixed' }]
    });
    assert.equal(profile.weekly_availability.sun.max_minutes, 720);
    assert.equal(profile.weekly_other_sports[0].duration_minutes, 600);
    assert.throws(() => normalizePlanningProfile({ weekly_availability: { sun: { available: true, max_minutes: 1500 } } }), /1440/);
});
