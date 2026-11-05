import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TrainingPlanSharingService,
    formatPace,
    parsePace,
    scaleTrainingPace
} from '../js/modules/training-plan-sharing.js';

function createRpcMock(result) {
    const calls = [];
    return {
        calls,
        client: {
            rpc(name, args) {
                calls.push([name, args]);
                return Promise.resolve(result);
            }
        }
    };
}

test('converte i passi min:ss/km e adatta proporzionalmente un target', () => {
    assert.equal(parsePace('4:10'), 250);
    assert.equal(formatPace(320), '5:20');
    assert.equal(scaleTrainingPace(300, 250, 320), 384);
    assert.equal(scaleTrainingPace(null, 250, 320), null);
});

test('rifiuta passi non validi e adattamento senza due riferimenti', () => {
    assert.throws(() => parsePace('4:60'), /formato min:ss\/km/);
    assert.throws(() => parsePace('1:59'), /compreso tra 2:00 e 30:00/);
    assert.throws(() => scaleTrainingPace(300, null, 320), /entrambi i passi di riferimento/);
});

test('crea una condivisione tramite RPC con i soli parametri espliciti', async () => {
    const result = { data: { share_code: 'c72b6575-314a-4b6c-a6af-1e1fd272b85c' }, error: null };
    const mock = createRpcMock(result);
    const service = new TrainingPlanSharingService(mock.client);

    assert.equal(await service.createShare({
        title: '  Preparazione  ',
        sessionIds: ['session-1'],
        expiresInDays: 7,
        sourceReferencePace: 250
    }), result.data);
    assert.deepEqual(mock.calls, [[
        'create_training_plan_share',
        {
            p_title: 'Preparazione',
            p_session_ids: ['session-1'],
            p_expires_in_days: 7,
            p_source_reference_pace_seconds_per_km: 250
        }
    ]]);
});

test('importa solo dopo conferma esplicita di eventuali sovrapposizioni', async () => {
    const result = { data: { session_count: 2 }, error: null };
    const mock = createRpcMock(result);
    const service = new TrainingPlanSharingService(mock.client);

    await service.importShare({
        shareCode: 'c72b6575-314a-4b6c-a6af-1e1fd272b85c',
        newStartDate: '2026-11-15',
        targetReferencePace: 320,
        confirmOverlaps: true
    });

    assert.deepEqual(mock.calls, [[
        'import_training_plan_share',
        {
            p_share_code: 'c72b6575-314a-4b6c-a6af-1e1fd272b85c',
            p_new_start_date: '2026-11-15',
            p_target_reference_pace_seconds_per_km: 320,
            p_confirm_overlaps: true
        }
    ]]);
});

test('valida codice e parametri localmente senza chiamare RPC', async () => {
    const mock = createRpcMock({ data: null, error: null });
    const service = new TrainingPlanSharingService(mock.client);

    await assert.rejects(service.previewShare('non-uuid'), /UUID valido/);
    await assert.rejects(service.importShare({
        shareCode: 'c72b6575-314a-4b6c-a6af-1e1fd272b85c',
        newStartDate: '2026-02-30',
        targetReferencePace: null
    }), /data di inizio valida/);
    await assert.rejects(service.createShare({
        title: '',
        sessionIds: ['session-1']
    }), /titolo deve contenere/);
    assert.deepEqual(mock.calls, []);
});
