import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainingPlanService } from '../js/modules/training-plan.js';

function createSupabaseMock(result) {
    const calls = [];
    const query = {};

    ['select', 'eq', 'gte', 'lte', 'order', 'insert', 'update', 'delete'].forEach(method => {
        query[method] = (...args) => {
            calls.push([method, ...args]);
            return query;
        };
    });
    query.single = () => Promise.resolve(result);
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

test('carica le sedute del solo utente e dell’intervallo richiesto', async () => {
    const expected = [{ id: 'session-1' }];
    const mock = createSupabaseMock({ data: expected, error: null });
    const service = new TrainingPlanService(mock.client);

    const sessions = await service.listSessions('user-1', '2026-05-04', '2026-05-10');

    assert.equal(sessions, expected);
    assert.deepEqual(mock.calls, [
        ['from', 'training_sessions'],
        ['select', 'id, user_id, scheduled_date, session_order, title, sport_type, distance_km, duration_minutes, target_pace_seconds_per_km, notes, intervals_activity_id, completed_at, adherence_score, completed_activity'],
        ['eq', 'user_id', 'user-1'],
        ['gte', 'scheduled_date', '2026-05-04'],
        ['lte', 'scheduled_date', '2026-05-10'],
        ['order', 'scheduled_date'],
        ['order', 'session_order']
    ]);
});

test('salva una nuova seduta normalizzando i campi opzionali', async () => {
    const saved = { id: 'session-1', title: 'Trail' };
    const mock = createSupabaseMock({ data: saved, error: null });
    const service = new TrainingPlanService(mock.client);

    const result = await service.saveSession('user-1', {
        scheduled_date: '2026-05-04',
        session_order: 1,
        title: ' Trail ',
        sport_type: 'trail',
        distance_km: '12.5',
        duration_minutes: '',
        target_pace_seconds_per_km: 320,
        notes: ' '
    });

    assert.equal(result, saved);
    assert.ok(mock.calls.some(call => call[0] === 'insert' && call[1].user_id === 'user-1'));
    assert.ok(mock.calls.some(call => call[0] === 'insert' && call[1].distance_km === 12.5));
    assert.ok(mock.calls.some(call => call[0] === 'insert' && call[1].duration_minutes === null));
    assert.ok(mock.calls.some(call => call[0] === 'insert' && call[1].target_pace_seconds_per_km === 320));
    assert.ok(mock.calls.some(call => call[0] === 'insert' && call[1].notes === null));
});

test('aggiorna una seduta limitando la scrittura al proprietario', async () => {
    const saved = { id: 'session-1', title: 'Trail aggiornato' };
    const mock = createSupabaseMock({ data: saved, error: null });
    const service = new TrainingPlanService(mock.client);

    await service.saveSession('user-1', {
        id: 'session-1',
        scheduled_date: '2026-05-04',
        session_order: 2,
        title: 'Trail aggiornato',
        sport_type: 'trail',
        distance_km: '',
        duration_minutes: '60',
        notes: ''
    });

    assert.ok(mock.calls.some(call => call[0] === 'update' && call[1].user_id === 'user-1'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'session-1'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});

test('elimina una seduta solo per il proprietario', async () => {
    const mock = createSupabaseMock({ data: { id: 'session-1' }, error: null });
    const service = new TrainingPlanService(mock.client);

    await service.deleteSession('user-1', 'session-1');

    assert.ok(mock.calls.some(call => call[0] === 'delete'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'session-1'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});

test('rifiuta valori non validi senza inviare scritture al database', async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    const service = new TrainingPlanService(mock.client);

    await assert.rejects(
        service.saveSession('user-1', {
            scheduled_date: '2026-05-04',
            session_order: 1,
            title: 'Corsa',
            sport_type: 'run',
            distance_km: '-1',
            duration_minutes: '',
            target_pace_seconds_per_km: '',
            notes: ''
        }),
        /distanza deve essere un numero non negativo/
    );
    await assert.rejects(
        service.saveSession('user-1', {
            scheduled_date: '2026-05-04',
            session_order: 1,
            title: 'Corsa',
            sport_type: 'run',
            distance_km: '',
            duration_minutes: '',
            target_pace_seconds_per_km: 119,
            notes: ''
        }),
        /passo obiettivo deve essere compreso/
    );
    assert.deepEqual(mock.calls, []);
});

test('associa un’attività Intervals confermata e salva voto e snapshot per il solo proprietario', async () => {
    const saved = { id: 'session-1', intervals_activity_id: 'activity-1', adherence_score: 4 };
    const mock = createSupabaseMock({ data: saved, error: null });
    const service = new TrainingPlanService(mock.client);
    const snapshot = {
        id: 'activity-1',
        name: 'Corsa',
        type: 'Run',
        start_date_local: '2026-05-04T08:00:00',
        distance: 10000,
        moving_time: 3600,
        elapsed_time: 3700
    };

    assert.equal(await service.confirmActivity('user-1', 'session-1', snapshot, 4), saved);
    assert.ok(mock.calls.some(call => call[0] === 'update'
        && call[1].intervals_activity_id === 'activity-1'
        && call[1].adherence_score === 4
        && call[1].completed_activity === snapshot));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'session-1'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});

test('rifiuta un’associazione senza ID o con voto fuori scala', async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    const service = new TrainingPlanService(mock.client);

    await assert.rejects(service.confirmActivity('user-1', 'session-1', { id: '' }, 3), /ID Intervals valido/);
    await assert.rejects(service.confirmActivity('user-1', 'session-1', { id: 'activity-1' }, 6), /voto da 1 a 5/);
    assert.deepEqual(mock.calls, []);
});

test('rimuove l’associazione e la valutazione senza toccare altri utenti', async () => {
    const mock = createSupabaseMock({ data: { id: 'session-1' }, error: null });
    const service = new TrainingPlanService(mock.client);

    await service.unlinkActivity('user-1', 'session-1');

    assert.ok(mock.calls.some(call => call[0] === 'update'
        && call[1].intervals_activity_id === null
        && call[1].completed_at === null
        && call[1].adherence_score === null
        && call[1].completed_activity === null));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});
