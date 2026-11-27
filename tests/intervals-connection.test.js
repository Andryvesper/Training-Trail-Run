import test from 'node:test';
import assert from 'node:assert/strict';
import { IntervalsService, PROXY_HEADER } from '../js/modules/intervals.js';
import { isConnected, loadIntervalsConnection, saveIntervalsCredentials } from '../js/modules/intervals-connection.js';

const PROXY = { url: 'https://x.supabase.co/functions/v1/intervals-proxy', apikey: 'pub', getAccessToken: async () => 'jwt' };

function response(status, body, marker) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => (name === PROXY_HEADER ? marker ?? null : null) },
        json: async () => body
    };
}

async function withFetch(handler, run) {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return handler(url, calls.length); };
    try { await run(calls); } finally { globalThis.fetch = original; }
}

test('con il proxy la chiave non viaggia: solo il token di sessione', async () => {
    await withFetch(() => response(200, [], '1'), async calls => {
        await new IntervalsService('i1', null, { proxy: PROXY }).getActivities('2026-11-01', '2026-11-04');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, `${PROXY.url}/athlete/i1/activities?oldest=2026-11-01&newest=2026-11-04`);
        assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt');
        assert.equal(calls[0].options.headers.apikey, 'pub');
    });
});

test('funzione non distribuita: ripiego diretto solo se la chiave è nota', async () => {
    await withFetch((url, call) => (call === 1 ? response(404, {}) : response(200, [])), async calls => {
        const service = new IntervalsService('i1', 'k', { proxy: PROXY });
        await service.getWellness('2026-11-01', '2026-11-04');
        assert.equal(calls.length, 2);
        assert.match(calls[1].url, /^https:\/\/intervals\.icu\/api\/v1\/athlete\/i1\/wellness/);
        assert.match(calls[1].options.headers.Authorization, /^Basic /);
        // Le richieste successive vanno subito dirette.
        await service.getWellness('2026-11-01', '2026-11-04');
        assert.equal(calls.length, 3);
    });
    await withFetch(() => response(404, {}), async () => {
        await assert.rejects(
            new IntervalsService('i1', null, { proxy: PROXY }).getWellness('2026-11-01', '2026-11-04'),
            /collegamento sicuro non riuscito \(HTTP 404\)/
        );
    });
});

test('errori del proxy e di Intervals.icu restano distinti', async () => {
    await withFetch(() => response(412, { error: 'Intervals.icu non è collegato.' }, 'error'), async () => {
        await assert.rejects(new IntervalsService('i1', null, { proxy: PROXY }).getActivities('a', 'b'), /non è collegato/);
    });
    await withFetch(() => response(401, {}, '1'), async () => {
        await assert.rejects(new IntervalsService('i1', null, { proxy: PROXY }).getActivities('a', 'b'), /HTTP 401\. Controlla Athlete ID e API Key/);
    });
});

function mockSupabase({ rpcResult, rows = [] }) {
    const calls = [];
    const query = {};
    ['select', 'eq', 'update'].forEach(method => { query[method] = (...args) => { calls.push([method, ...args]); return query; }; });
    query.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    query.then = (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return {
        calls,
        client: {
            rpc: async name => { calls.push(['rpc', name]); return rpcResult; },
            from: table => { calls.push(['from', table]); return query; }
        }
    };
}

test('collegamento: la RPC non restituisce mai la chiave', async () => {
    const { client } = mockSupabase({ rpcResult: { data: [{ athlete_id: 'i7', has_key: true }], error: null } });
    const connection = await loadIntervalsConnection(client, 'u1');
    assert.deepEqual(connection, { athleteId: 'i7', hasKey: true, apiKey: null });
    assert.ok(isConnected(connection));
});

test('collegamento: senza la migrazione si leggono le colonne come prima', async () => {
    const { client, calls } = mockSupabase({
        rpcResult: { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
        rows: [{ intervals_athlete_id: 'i8', intervals_api_key: 'k8' }]
    });
    assert.deepEqual(await loadIntervalsConnection(client, 'u1'), { athleteId: 'i8', hasKey: true, apiKey: 'k8' });
    assert.ok(calls.some(call => call[0] === 'from' && call[1] === 'profiles'));
});

test('collegamento: altri errori della RPC non vengono nascosti', async () => {
    const { client } = mockSupabase({ rpcResult: { data: null, error: { code: '42501', message: 'permission denied' } } });
    await assert.rejects(loadIntervalsConnection(client, 'u1'), { message: /permission denied/ });
});

test('salvataggio: chiave vuota = resta quella salvata', async () => {
    const { client, calls } = mockSupabase({ rows: [{ id: 'u1' }] });
    await saveIntervalsCredentials(client, 'u1', { athleteId: 'i9', apiKey: '' });
    const update = calls.find(call => call[0] === 'update')[1];
    assert.deepEqual(update, { intervals_id: 'i9', intervals_athlete_id: 'i9' });

    const empty = mockSupabase({ rows: [] });
    await assert.rejects(saveIntervalsCredentials(empty.client, 'u1', { athleteId: 'i9', apiKey: 'k' }), /profilo utente non trovato/);
});
