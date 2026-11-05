import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assessTrainingMethodology,
    TRAINING_METHOD_RULES,
    TRAINING_METHOD_SOURCE_EXAMPLES
} from '../js/modules/training-methodology-rules.js';

test('il catalogo conserva fonti verificate senza approvare automaticamente pattern', () => {
    assert.ok(TRAINING_METHOD_RULES.length > 0);
    assert.ok(TRAINING_METHOD_RULES.every(rule => rule.ruleStatus === 'candidate'));
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

test('le tabelle 6, 8 e 10 sono catalogate solo come outline non eseguibili', () => {
    const expected = [
        { id: 'ten_km_distance_time_cycle_outline', table: '6', weeks: 9, distance: 10, pages: '200', scans: '27' },
        { id: 'half_marathon_distance_time_cycle_outline', table: '8', weeks: 12, distance: 21.1, pages: '203-204', scans: '28-29' },
        { id: 'marathon_distance_time_cycle_outline', table: '10', weeks: 15, distance: 42.195, pages: '207-208', scans: '31-32' }
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
        assert.equal(example.structure.reviewScope, 'structure_only');
        assert.equal(example.structure.sessionDetailsTranscribed, false);
        assert.deepEqual(example.structure.checkpoints, [
            { week: 3, kind: 'reference_vr_check' },
            { week: weeks, kind: 'goal_race' }
        ]);
        assert.ok(example.limitations.some(item => item.includes('celle delle sedute non sono riprodotte')));
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
    assert.ok(!trail.candidate_pattern_ids.includes('ten_km_breathing_cycle'));
    assert.ok(roadTenKm.candidate_pattern_ids.includes('ten_km_breathing_cycle'));
    assert.ok(!road.candidate_pattern_ids.includes('trail_specificity'));
    assert.ok(!road.candidate_pattern_ids.includes('ten_km_breathing_cycle'));
});

test('seleziona l’outline distanza-tempo in base alla gara stradale', () => {
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

        assert.ok(assessment.candidate_pattern_ids.includes(ruleId));
        assert.ok(assessment.source_example_ids.includes(exampleId));
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
