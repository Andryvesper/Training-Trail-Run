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
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('approvato')));
    assert.ok(assessment.blockers.some(item => item.includes('non è ancora implementato')));
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

test('non valuta la metodologia senza un obiettivo riconosciuto', () => {
    assert.throws(
        () => assessTrainingMethodology({ goal_mode: 'automatic' }),
        /obiettivo valido/
    );
});

test('anche una regola approvata non abilita un generatore che non esiste ancora', () => {
    const approvedRule = {
        ...TRAINING_METHOD_RULES[0],
        ruleStatus: 'approved_for_drafts'
    };
    const assessment = assessTrainingMethodology({
        goal_mode: 'maintain'
    }, null, [approvedRule]);

    assert.equal(assessment.status, 'approved_rules_available');
    assert.deepEqual(assessment.approved_pattern_ids, ['easy_effort']);
    assert.equal(assessment.generation_enabled, false);
    assert.ok(assessment.blockers.some(item => item.includes('non è ancora implementato')));
});
