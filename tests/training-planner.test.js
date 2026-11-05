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
    }), /tra 10 e 360 minuti/);
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
    }), /durata.*tra 10 e 360 minuti/);
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

test('il prototipo 10 km usa la VR come prerequisito ma resta bloccato da regole non approvate', () => {
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

    const readiness = getTenKmPrototypeReadiness(profile, [race]);
    assert.equal(readiness.reference_vr_seconds_per_km, 300);
    assert.equal(readiness.ready, false);
    assert.ok(!readiness.missing.some(item => item.includes('VR')));
    assert.ok(readiness.blockers.some(item => item.includes('non può dedurre')));
    assert.ok(readiness.blockers.some(item => item.includes('non sono ancora trascritte')));
    assert.ok(readiness.blockers.some(item => item.includes('adattamento non ancora implementato')));
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
            schedule_type: 'movable'
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
