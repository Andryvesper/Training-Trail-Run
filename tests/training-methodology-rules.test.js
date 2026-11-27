import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assessTrainingMethodology,
    CYCLE_RULE_APPROVALS,
    TRAINING_METHOD_RULES,
    TRAINING_METHOD_SOURCE_EXAMPLES
} from '../js/modules/training-methodology-rules.js';

test('il catalogo approva solo i cicli registrati dall’atleta e lascia candidati gli altri pattern', () => {
    assert.ok(TRAINING_METHOD_RULES.length > 0);
    TRAINING_METHOD_RULES.forEach(rule => {
        const approved = Boolean(CYCLE_RULE_APPROVALS[rule.id]);
        assert.equal(rule.ruleStatus, approved ? 'approved_for_drafts' : 'candidate', rule.id);
        if (approved) assert.deepEqual({ ...rule.approval }, { ...CYCLE_RULE_APPROVALS[rule.id] });
    });
    assert.ok(TRAINING_METHOD_RULES.every(rule => rule.sourceVerification === 'checked'));
    assert.ok(TRAINING_METHOD_RULES.every(rule => rule.source.title === 'Tipi che corrono'));
});

test('gli esempi fonte hanno blocchi tracciabili ma restano non eseguibili', () => {
    const bis = TRAINING_METHOD_SOURCE_EXAMPLES.find(example => example.id === 'bis_time_p175');
    const cycle = TRAINING_METHOD_SOURCE_EXAMPLES.find(example => example.id === 'ten_km_breathing_cycle_outline');

    assert.ok(bis);
    assert.equal(bis.executable, false);
    assert.equal(bis.status, 'source_example_not_executable');
    assert.equal(bis.source.printedPages, '175');
    assert.deepEqual(bis.structure.blocks.map(block => block.effort), ['CRF', 'CRLI', 'CRF', 'CRLI', 'CRF']);
    assert.ok(bis.structure.blocks.every(block => block.duration === 15 && block.unit === 'minute'));
    assert.equal(bis.structure.blocks.reduce((total, block) => total + block.duration, 0), bis.structure.totalDuration);
    assert.deepEqual(bis.structure.separateRecoveryBlocks, []);
    assert.equal(bis.structure.warmupIncluded, false);

    assert.ok(cycle);
    assert.equal(cycle.executable, false);
    assert.equal(cycle.structure.durationWeeks, 9);
    assert.equal(cycle.structure.runningSessionsPerWeek, 4);
    assert.equal(cycle.structure.referenceTestWeek, 3);
    assert.equal(cycle.structure.referenceTestProtocol, null);
    assert.deepEqual(cycle.structure.checkpoints, [
        { week: 3, kind: 'reference_vr_check', protocol: null },
        { week: 9, kind: 'goal_race' }
    ]);
    assert.deepEqual(cycle.structure.warmup, {
        sourcePrintedPages: '118-119',
        sourceScanPages: '59',
        includesMobilityExercises: true,
        defaultDurationMinutes: null,
        executable: false
    });
    assert.equal(cycle.source.table, '5');
    assert.ok(cycle.limitations.some(item => item.includes('p. 118') && item.includes('imprecisione editoriale')));
    assert.ok(cycle.limitations.some(item => item.includes('durata universale')));
    assert.ok(cycle.limitations.some(item => item.includes('controllata visivamente')));
});

test('le tabelle 6, 8 e 10 sono schemi fonte non eseguibili con celle trascritte', () => {
    const expected = [
        { id: 'ten_km_distance_time_cycle_outline', table: '6', weeks: 9, distance: 10, pages: '200', scans: '27' },
        { id: 'half_marathon_distance_time_cycle_outline', table: '8', weeks: 12, distance: 21.1, pages: '203-204', scans: '28-29' },
        { id: 'marathon_distance_time_cycle_outline', table: '10', weeks: 15, distance: 42.195, pages: '207-208', scans: '30-31' }
    ];

    expected.forEach(({ id, table, weeks, distance, pages, scans }) => {
        const example = TRAINING_METHOD_SOURCE_EXAMPLES.find(item => item.id === id);
        assert.ok(example, `outline table ${table} exists`);
        assert.equal(example.executable, false);
        assert.equal(example.status, 'source_outline_not_executable');
        assert.equal(example.source.printedPages, pages);
        assert.equal(example.source.scanPages, scans);
        assert.equal(example.source.table, table);
        assert.equal(example.structure.goalDistanceKm, distance);
        assert.equal(example.structure.durationWeeks, weeks);
        assert.equal(example.structure.runningSessionsPerWeek, 4);
        assert.equal(example.structure.reviewScope, 'cell_by_cell');
        assert.equal(example.structure.sessionDetailsTranscribed, true);
        assert.equal(example.structure.transcriptionStatus, 'double_blind_reconciled');
        assert.deepEqual(example.structure.checkpoints, [
            { week: 3, kind: 'reference_vr_check' },
            { week: weeks, kind: 'goal_race' }
        ]);
        assert.ok(example.limitations.some(item => item.includes('approvazione dell’atleta')));
    });
});

test('la valutazione espone i candidati pertinenti ma blocca la generazione', () => {
    const assessment = assessTrainingMethodology({
        goal_mode: 'improve',
        preferred_terrains: ['road']
    });

    assert.equal(assessment.status, 'awaiting_approved_rules');
    assert.deepEqual(assessment.approved_pattern_ids, []);
    assert.ok(assessment.candidate_pattern_ids.includes('easy_effort'));
    assert.ok(assessment.candidate_pattern_ids.includes('rhythm_variation'));
    assert.ok(assessment.source_example_ids.includes('bis_time_p175'));
    assert.deepEqual(assessment.ready_pattern_ids, []);
    assert.equal(assessment.rule_pipeline_ready, false);
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('approvata')));
    assert.ok(assessment.blockers.some(item => item.includes('conferma non sono ancora attive')));
});

test('il candidato trail e il ciclo 10 km rispettano terreno e distanza', () => {
    const trail = assessTrainingMethodology({
        goal_mode: 'race',
        preferred_terrains: ['trail']
    }, { distance_km: 10 });
    const roadTenKm = assessTrainingMethodology({
        goal_mode: 'race',
        preferred_terrains: ['road']
    }, { distance_km: 10 });
    const road = assessTrainingMethodology({
        goal_mode: 'race',
        preferred_terrains: ['road']
    }, { distance_km: 21.1 });

    assert.ok(trail.candidate_pattern_ids.includes('trail_specificity'));
    assert.ok(!trail.approved_pattern_ids.includes('ten_km_breathing_cycle'));
    assert.ok(roadTenKm.approved_pattern_ids.includes('ten_km_breathing_cycle'));
    assert.ok(!road.candidate_pattern_ids.includes('trail_specificity'));
    assert.ok(!road.approved_pattern_ids.includes('ten_km_breathing_cycle'));
});

test('seleziona il ciclo distanza-tempo in base alla gara stradale', () => {
    const cases = [
        { distance: 10, ruleId: 'ten_km_distance_time_cycle', exampleId: 'ten_km_distance_time_cycle_outline' },
        { distance: 21.0975, ruleId: 'half_marathon_distance_time_cycle', exampleId: 'half_marathon_distance_time_cycle_outline' },
        { distance: 42.195, ruleId: 'marathon_distance_time_cycle', exampleId: 'marathon_distance_time_cycle_outline' }
    ];

    cases.forEach(({ distance, ruleId, exampleId }) => {
        const assessment = assessTrainingMethodology({
            goal_mode: 'race',
            preferred_terrains: ['road']
        }, { distance_km: distance });

        assert.ok(assessment.approved_pattern_ids.includes(ruleId));
        assert.ok(assessment.source_example_ids.includes(exampleId));
        assert.equal(assessment.status, 'awaiting_required_inputs');
        assert.equal(assessment.generation_enabled, false);
    });
});

test('non valuta la metodologia senza un obiettivo riconosciuto', () => {
    assert.throws(
        () => assessTrainingMethodology({ goal_mode: 'automatic' }),
        /obiettivo valido/
    );
});

test('una regola promossa senza contratto di approvazione resta inutilizzabile', () => {
    const approvedRule = {
        ...TRAINING_METHOD_RULES[0],
        ruleStatus: 'approved_for_drafts'
    };
    const assessment = assessTrainingMethodology({
        goal_mode: 'maintain'
    }, null, [approvedRule]);

    assert.equal(assessment.status, 'awaiting_rule_contract');
    assert.deepEqual(assessment.approved_pattern_ids, ['easy_effort']);
    assert.deepEqual(assessment.ready_pattern_ids, []);
    assert.equal(assessment.rule_pipeline_ready, false);
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('contratto di applicabilità')));
});

function completeApprovedRule(overrides = {}) {
    return {
        ...TRAINING_METHOD_RULES[0],
        ruleStatus: 'approved_for_drafts',
        sourceConfidence: 'high',
        approval: { approvedBy: 'reviewer', approvedAt: '2026-11-05' },
        requiredProfileFields: ['consistency_status'],
        requiredRaceFields: [],
        exclusions: [],
        sessionPattern: { kind: 'explicit_template' },
        explanation: 'Pattern approvato con limiti dichiarati.',
        ...overrides
    };
}

test('la pipeline espone gli input mancanti richiesti dalla regola approvata', () => {
    const assessment = assessTrainingMethodology({
        goal_mode: 'maintain'
    }, null, [completeApprovedRule()]);

    assert.equal(assessment.status, 'awaiting_required_inputs');
    assert.equal(assessment.rule_pipeline_ready, false);
    assert.ok(assessment.blockers.some(item => item.includes('profilo.consistency_status')));
    assert.equal(assessment.generation_enabled, false);
});

test('una regola approvata e completa passa la valutazione senza attivare sedute', () => {
    const assessment = assessTrainingMethodology({
        goal_mode: 'maintain',
        consistency_status: 'unknown'
    }, null, [completeApprovedRule()]);

    assert.equal(assessment.status, 'rules_ready');
    assert.deepEqual(assessment.ready_pattern_ids, ['easy_effort']);
    assert.equal(assessment.rule_pipeline_ready, true);
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('conferma non sono ancora attive')));
});

test('la regola trail_specificity richiede esplicitamente terreno trail', () => {
    const roadAssessment = assessTrainingMethodology({
        goal_mode: 'race',
        preferred_terrains: ['road']
    }, { distance_km: 15 });

    const trailAssessment = assessTrainingMethodology({
        goal_mode: 'race',
        preferred_terrains: ['trail']
    }, { distance_km: 15 });

    assert.ok(!roadAssessment.candidate_pattern_ids.includes('trail_specificity'));
    assert.ok(trailAssessment.candidate_pattern_ids.includes('trail_specificity'));
});

test('una regola approvata con pattern settimanale esplicito passa la validazione', () => {
    const rule = completeApprovedRule({
        sessionPattern: {
            kind: 'explicit_weekly_cycle',
            weeks: [
                { weekNumber: 1, sessions: [{ day: 'tue', type: 'easy' }, { day: 'thu', type: 'long' }] },
                { weekNumber: 2, sessions: [{ day: 'tue', type: 'easy' }, { day: 'thu', type: 'tempo' }] }
            ]
        }
    });
    const assessment = assessTrainingMethodology({
        goal_mode: 'maintain',
        consistency_status: 'unknown'
    }, null, [rule]);

        assert.equal(assessment.status, 'rules_ready');
    assert.deepEqual(assessment.ready_pattern_ids, ['easy_effort']);
});

test('il ciclo 10 km mantiene il contratto di outline non eseguibile e richiede verifiche esplicite sulla settimana 3', () => {
    const tenKmOutline = TRAINING_METHOD_SOURCE_EXAMPLES.find(
        example => example.id === 'ten_km_distance_time_cycle_outline'
    );

    assert.ok(tenKmOutline);
    assert.equal(tenKmOutline.executable, false);
    assert.equal(tenKmOutline.status, 'source_outline_not_executable');
    assert.equal(tenKmOutline.structure.goalDistanceKm, 10);
    assert.equal(tenKmOutline.structure.durationWeeks, 9);
    assert.equal(tenKmOutline.structure.runningSessionsPerWeek, 4);

    const vrCheckpoint = tenKmOutline.structure.checkpoints.find(cp => cp.week === 3);
    assert.ok(vrCheckpoint);
    assert.equal(vrCheckpoint.kind, 'reference_vr_check');
});

test('i cicli trascritti sono approvati dall’atleta e richiedono comunque gli input per generare', () => {
    const expected = [
        ['ten_km_breathing_cycle', 9, [4]],
        ['ten_km_distance_time_cycle', 9, [3, 4, 5]],
        ['half_marathon_distance_time_cycle', 12, [3, 4, 5]],
        ['marathon_distance_time_cycle', 15, [3, 4, 5]]
    ];
    expected.forEach(([id, weeks, frequencies]) => {
        const rule = TRAINING_METHOD_RULES.find(item => item.id === id);
        assert.ok(rule, id);
        assert.deepEqual({ ...CYCLE_RULE_APPROVALS[id] }, { approvedBy: 'Andrea Baron', approvedAt: '2026-11-14' });
        assert.equal(rule.ruleStatus, 'approved_for_drafts');
        assert.equal(rule.sessionPattern.kind, 'explicit_weekly_cycle');
        assert.equal(rule.sessionPattern.weeks.length, weeks);
        assert.equal(rule.requiresValidReferenceTest, true);
        assert.deepEqual([...rule.supportedRunningSessionsPerWeek], frequencies);
        assert.deepEqual([...rule.requiredRaceFields], ['distance_km', 'event_date']);
    });

    const assessment = assessTrainingMethodology(
        { goal_mode: 'race', preferred_terrains: ['road'] },
        { distance_km: 10, event_date: '2027-03-21' }
    );
    assert.deepEqual(assessment.awaiting_review_pattern_ids, []);
    assert.equal(assessment.status, 'awaiting_required_inputs');
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('profilo.reference_test_date')));

    const unapproved = TRAINING_METHOD_RULES.map(rule => !CYCLE_RULE_APPROVALS[rule.id] ? rule : {
        ...rule, ruleStatus: 'candidate', approval: undefined
    });
    const pending = assessTrainingMethodology(
        { goal_mode: 'race', preferred_terrains: ['road'] },
        { distance_km: 10, event_date: '2027-03-21' },
        unapproved
    );
    assert.ok(pending.awaiting_review_pattern_ids.includes('ten_km_distance_time_cycle'));
    assert.ok(pending.blockers.some(item => item.includes('in attesa di revisione e approvazione')));
});

function approvedCycleRule(id = 'ten_km_distance_time_cycle') {
    return {
        ...TRAINING_METHOD_RULES.find(rule => rule.id === id),
        ruleStatus: 'approved_for_drafts',
        approval: { approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }
    };
}

const READY_CYCLE_PROFILE = Object.freeze({
    goal_mode: 'race',
    preferred_terrains: ['road'],
    consistency_status: 'consistent',
    target_running_sessions_per_week: 4,
    reference_test_date: '2026-11-01',
    reference_vr_seconds_per_km: 270
});

test('un ciclo approvato con test VR valido abilita la generazione della bozza', () => {
    const assessment = assessTrainingMethodology(
        READY_CYCLE_PROFILE,
        { distance_km: 10, event_date: '2027-03-21' },
        [approvedCycleRule()],
        { asOfDate: '2026-11-13' }
    );

    assert.equal(assessment.status, 'rules_ready');
    assert.deepEqual(assessment.generation_pattern_ids, ['ten_km_distance_time_cycle']);
    assert.equal(assessment.generation_enabled, true);
    assert.ok(!assessment.blockers.some(item => item.includes('non sono ancora attive')));
});

test('con più cicli pronti serve la scelta del metodo', () => {
    const race = { distance_km: 10, event_date: '2027-03-21' };
    const rules = [approvedCycleRule('ten_km_breathing_cycle'), approvedCycleRule()];
    const undecided = assessTrainingMethodology(READY_CYCLE_PROFILE, race, rules, { asOfDate: '2026-11-13' });
    assert.equal(undecided.generation_enabled, false);
    assert.ok(undecided.blockers.some(item => item.includes('scegli il metodo')));

    const breathing = assessTrainingMethodology(
        { ...READY_CYCLE_PROFILE, preferred_cycle_method: 'breathing' }, race, rules, { asOfDate: '2026-11-13' }
    );
    assert.deepEqual(breathing.generation_pattern_ids, ['ten_km_breathing_cycle']);
});

test('il gate di generazione blocca test VR scaduti, frequenze non supportate e variante a 5 mancante', () => {
    const race = { distance_km: 10, event_date: '2027-03-21' };
    const expired = assessTrainingMethodology(
        { ...READY_CYCLE_PROFILE, reference_test_date: '2026-09-01' },
        race, [approvedCycleRule()], { asOfDate: '2026-11-13' }
    );
    assert.equal(expired.status, 'awaiting_required_inputs');
    assert.equal(expired.generation_enabled, false);
    assert.ok(expired.blockers.some(item => item.includes('scaduto')));

    const sixRuns = assessTrainingMethodology(
        { ...READY_CYCLE_PROFILE, target_running_sessions_per_week: 6 },
        race, [approvedCycleRule()], { asOfDate: '2026-11-13' }
    );
    assert.equal(sixRuns.generation_enabled, false);
    assert.ok(sixRuns.blockers.some(item => item.includes('6 corse settimanali non sono supportate')));

    const fiveWithoutOption = assessTrainingMethodology(
        { ...READY_CYCLE_PROFILE, target_running_sessions_per_week: 5 },
        race, [approvedCycleRule()], { asOfDate: '2026-11-13' }
    );
    assert.equal(fiveWithoutOption.generation_enabled, false);
    assert.ok(fiveWithoutOption.blockers.some(item => item.includes('scegli la variante')));

    const breathingThree = assessTrainingMethodology(
        { ...READY_CYCLE_PROFILE, target_running_sessions_per_week: 3 },
        race, [approvedCycleRule('ten_km_breathing_cycle')], { asOfDate: '2026-11-13' }
    );
    assert.equal(breathingThree.generation_enabled, false);
});

test('un ciclo solo outline promosso ad approvato viene rifiutato dal contratto', () => {
    const promoted = {
        ...approvedCycleRule('marathon_distance_time_cycle'),
        sessionPattern: { kind: 'distance_time_cycle_outline', durationWeeks: 15, runningSessionsPerWeek: 4 }
    };
    const assessment = assessTrainingMethodology(
        { goal_mode: 'race', preferred_terrains: ['road'], consistency_status: 'consistent' },
        { distance_km: 42.195, event_date: '2027-04-11' },
        [promoted]
    );

    assert.equal(assessment.status, 'awaiting_rule_contract');
    assert.deepEqual(assessment.ready_pattern_ids, []);
    assert.equal(assessment.rule_pipeline_ready, false);
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('solo un outline')));
});

test('il pattern settimanale esplicito deve coprire tutte le settimane dichiarate senza duplicati', () => {
    const incomplete = completeApprovedRule({
        sessionPattern: {
            kind: 'explicit_weekly_cycle',
            durationWeeks: 3,
            weeks: [
                { weekNumber: 1, sessions: [{ day: 'tue', type: 'easy' }] },
                { weekNumber: 1, sessions: [{ day: 'thu', type: 'easy' }] }
            ]
        }
    });
    const missingType = completeApprovedRule({
        sessionPattern: {
            kind: 'explicit_weekly_cycle',
            weeks: [{ weekNumber: 1, sessions: [{ day: 'tue' }] }]
        }
    });
    const profile = { goal_mode: 'maintain', consistency_status: 'unknown' };

    const first = assessTrainingMethodology(profile, null, [incomplete]);
    assert.equal(first.status, 'awaiting_rule_contract');
    assert.ok(first.blockers.some(item => item.includes('ripetuta')));
    assert.ok(first.blockers.some(item => item.includes('durationWeeks')));

    const second = assessTrainingMethodology(profile, null, [missingType]);
    assert.equal(second.status, 'awaiting_rule_contract');
    assert.ok(second.blockers.some(item => item.includes('sedute complete')));
});

test('rigetta le regole promosse se mancano campi obbligatori del contratto o dei metadati di approvazione', () => {
    const invalidRule = {
        ...TRAINING_METHOD_RULES.find(r => r.id === 'ten_km_distance_time_cycle'),
        ruleStatus: 'approved_for_drafts',
        approval: { approvedBy: '', approvedAt: 'invalid-date' },
        requiredProfileFields: null,
        sessionPattern: null
    };

    const assessment = assessTrainingMethodology(
        { goal_mode: 'race', preferred_terrains: ['road'] },
        { distance_km: 10, event_date: '2027-06-01' },
        [invalidRule]
    );

    assert.equal(assessment.status, 'awaiting_rule_contract');
    assert.deepEqual(assessment.ready_pattern_ids, []);
    assert.equal(assessment.rule_pipeline_ready, false);
    assert.ok(assessment.blockers.some(b => b.includes('ten_km_distance_time_cycle')));
});

test('test VR scaduto: propone il metodo respiratorio se la tabella 11 è pronta', () => {
    const race = { name: 'Ultra trail', distance_km: 102, event_date: '2027-06-04', status: 'planned' };
    const profile = {
        goal_mode: 'race', preferred_terrains: ['road', 'trail'], consistency_status: 'returning',
        target_running_sessions_per_week: 4, preferred_cycle_method: 'distance_time',
        reference_test_date: '2026-09-25', reference_vr_seconds_per_km: 300
    };
    const blocked = assessTrainingMethodology(profile, race, undefined, { asOfDate: '2026-11-27' });
    assert.equal(blocked.generation_enabled, false);
    assert.equal(blocked.reference_test_alternative.pattern_id, 'ultra_100km_passatore');
    assert.equal(blocked.reference_test_alternative.preferred_cycle_method, 'breathing');
    assert.match(blocked.reference_test_alternative.message, /metodo Respiratorio/);
    assert.ok(blocked.blockers.includes(blocked.reference_test_alternative.message));

    const valid = assessTrainingMethodology({ ...profile, reference_test_date: '2026-11-20' }, race, undefined, { asOfDate: '2026-11-27' });
    assert.equal(valid.generation_enabled, true);
    assert.equal(valid.reference_test_alternative, null);

    const breathing = assessTrainingMethodology({ ...profile, preferred_cycle_method: 'breathing' }, race, undefined, { asOfDate: '2026-11-27' });
    assert.equal(breathing.generation_enabled, true);
    assert.equal(breathing.reference_test_alternative, null);
});
