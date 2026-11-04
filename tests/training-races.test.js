import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainingRacesService } from '../js/modules/training-races.js';

function createSupabaseMock(result) {
    const calls = [];
    const query = {};

    ['select', 'eq', 'order', 'insert', 'update', 'delete'].forEach(method => {
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

const plannedRace = {
    name: 'Top Dolomites 100 km',
    event_date: '',
    target_period: 'Giugno 2027',
    distance_km: '100',
    elevation_gain_m: '6000',
    goal: 'Gara prioritaria',
    status: 'planned'
};

test('carica le gare del solo utente in ordine cronologico', async () => {
    const expected = [{ id: 'race-1' }];
    const mock = createSupabaseMock({ data: expected, error: null });
    const service = new TrainingRacesService(mock.client);

    const races = await service.listRaces('user-1');

    assert.equal(races, expected);
    assert.deepEqual(mock.calls, [
        ['from', 'training_races'],
        ['select', 'id, user_id, name, event_date, target_period, distance_km, elevation_gain_m, priority, goal, status, official_time_seconds, chip_time_seconds, overall_position, gender_position, category_position, category, bib_number, result_source_url'],
        ['eq', 'user_id', 'user-1'],
        ['order', 'event_date', { ascending: true, nullsFirst: false }],
        ['order', 'created_at']
    ]);
});

test('salva una gara con periodo indicativo e campi facoltativi normalizzati', async () => {
    const saved = { id: 'race-1', name: 'Top Dolomites 100 km' };
    const mock = createSupabaseMock({ data: saved, error: null });
    const service = new TrainingRacesService(mock.client);

    const result = await service.saveRace('user-1', {
        ...plannedRace,
        goal: ' Gara prioritaria ',
        elevation_gain_m: '',
        official_time: '',
        chip_time: '',
        overall_position: '',
        gender_position: '',
        category_position: '',
        category: '',
        bib_number: '',
        result_source_url: ''
    });

    assert.equal(result, saved);
    const insert = mock.calls.find(call => call[0] === 'insert')[1];
    assert.equal(insert.user_id, 'user-1');
    assert.equal(insert.distance_km, 100);
    assert.equal(insert.elevation_gain_m, null);
    assert.equal(insert.priority, 2);
    assert.equal(insert.goal, 'Gara prioritaria');
    assert.equal(insert.target_period, 'Giugno 2027');
});

test('salva i tempi ufficiale e chip in secondi per una gara completata', async () => {
    const mock = createSupabaseMock({ data: { id: 'race-2' }, error: null });
    const service = new TrainingRacesService(mock.client);

    await service.saveRace('user-1', {
        name: 'Venicemarathon',
        event_date: '2026-10-25',
        distance_km: '42.195',
        status: 'completed',
        official_time: '02:59:48',
        chip_time: '02:58:44',
        overall_position: '162',
        gender_position: '152',
        category_position: '19',
        category: 'SM40',
        bib_number: '5563',
        result_source_url: 'https://www.endu.net/events/venicemarathon-venice-marathon/results'
    });

    const insert = mock.calls.find(call => call[0] === 'insert')[1];
    assert.equal(insert.official_time_seconds, 10788);
    assert.equal(insert.chip_time_seconds, 10724);
    assert.equal(insert.overall_position, 162);
    assert.equal(insert.gender_position, 152);
    assert.equal(insert.category_position, 19);
});

test('aggiorna e cancella le gare limitando le scritture al proprietario', async () => {
    const mock = createSupabaseMock({ data: { id: 'race-1' }, error: null });
    const service = new TrainingRacesService(mock.client);

    await service.saveRace('user-1', { ...plannedRace, id: 'race-1' });
    assert.ok(mock.calls.some(call => call[0] === 'update'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'race-1'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));

    mock.calls.length = 0;
    await service.deleteRace('user-1', 'race-1');
    assert.ok(mock.calls.some(call => call[0] === 'delete'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'race-1'));
    assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
});

test('rifiuta date incoerenti, tempi non validi e posizioni negative senza scrivere', async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    const service = new TrainingRacesService(mock.client);

    await assert.rejects(
        service.saveRace('user-1', {
            ...plannedRace,
            event_date: '2027-06-01'
        }),
        /data esatta oppure il periodo/
    );
    await assert.rejects(
        service.saveRace('user-1', {
            name: 'Venicemarathon',
            event_date: '2026-10-25',
            distance_km: '42.195',
            status: 'completed',
            chip_time: '2:58'
        }),
        /HH:MM:SS/
    );
    await assert.rejects(
        service.saveRace('user-1', {
            name: 'Venicemarathon',
            event_date: '2026-10-25',
            distance_km: '42.195',
            status: 'completed',
            overall_position: '-1'
        }),
        /intero positivo/
    );
    assert.deepEqual(mock.calls, []);
});
