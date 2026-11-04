import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getLastSevenDaysRange,
    IntervalsService,
    summarizeIntervalsData
} from '../js/modules/intervals.js';

test('limita l’intervallo alle ultime sette date, includendo oggi', () => {
    assert.deepEqual(
        getLastSevenDaysRange(new Date(2026, 10, 4, 12)),
        { oldest: '2026-10-29', newest: '2026-11-04' }
    );
});

test('usa le metriche più recenti disponibili e separa gli sport nel riepilogo', () => {
    const summary = summarizeIntervalsData([
        { date: '2026-11-02', ctl: 40, atl: 35, load: 60 },
        { date: '2026-11-03', ctl: 42, atl: 38, load: 70 }
    ], [
        { type: 'Run', distance: 10000, moving_time: 3000 },
        { type: 'TrailRun', distance: 5000, moving_time: 1800 },
        { type: 'Swim', distance: 1200, moving_time: 1800 },
        { type: 'Ride', distance: 20000, moving_time: 3600 }
    ]);

    assert.deepEqual(summary.metrics, { ctl: 42, atl: 38, tsb: 4, load: 70 });
    assert.equal(summary.activities.count, 4);
    assert.equal(summary.activities.runKm, 15);
    assert.equal(summary.activities.swimMeters, 1200);
    assert.equal(summary.activities.averageRunPaceSecondsPerKm, 320);
    assert.deepEqual(summary.activities.runBreakdown, [
        { date: null, name: 'Run', type: 'run', distanceKm: 10 },
        { date: null, name: 'TrailRun', type: 'trailrun', distanceKm: 5 }
    ]);
});

test('non inventa metriche quando Intervals non restituisce valori', () => {
    const summary = summarizeIntervalsData([], []);

    assert.deepEqual(summary.metrics, { ctl: null, atl: null, tsb: null, load: null });
    assert.deepEqual(summary.activities, {
        count: 0,
        runKm: null,
        runBreakdown: [],
        swimMeters: null,
        averageRunPaceSecondsPerKm: null
    });
});

test('non fabbrica il bilancio se CTL o ATL mancano e usa TSB esplicito quando presente', () => {
    const missingTsb = summarizeIntervalsData([{ date: '2026-11-03', ctl: 42 }], []);
    const explicitTsb = summarizeIntervalsData([{ date: '2026-11-03', ctl: 42, atl: 38, tsb: -2 }], []);

    assert.equal(missingTsb.metrics.tsb, null);
    assert.equal(explicitTsb.metrics.tsb, -2);
});

test('segnala esplicitamente le risposte HTTP non riuscite', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    try {
        const service = new IntervalsService('i123', 'api-key');
        await assert.rejects(service.getActivities('2026-11-01', '2026-11-04'), /risposta HTTP 401/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('segnala risposte API con formato inatteso', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'invalid' }) });
    try {
        const service = new IntervalsService('i123', 'api-key');
        await assert.rejects(service.getWellness('2026-11-01', '2026-11-04'), /formato inatteso/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
