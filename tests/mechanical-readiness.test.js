import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSamples, normalizeStreams } from '../js/modules/activity-streams.js';
import {
    addDays,
    cardioLoad,
    computeMechanicalLoad,
    computeReadiness,
    eccentricFromSamples,
    eccentricFromSummary,
    eccentricStatus,
    hrvStatus
} from '../js/modules/mechanical-readiness.js';
import { runActivity, syntheticRun } from './helpers/synthetic-streams.js';

const TODAY = '2026-11-27';

// HRV stabile intorno a `base` (con piccola variazione), ultimi `days` giorni.
function wellness({ base = 60, days = 40, lastDays = 0, lastValue = null, restingHR = 48 } = {}) {
    return Array.from({ length: days }, (_, index) => {
        const age = days - 1 - index;
        const value = age < lastDays ? lastValue : base + ((index % 5) - 2);
        return { id: addDays(TODAY, -age), hrv: value, restingHR };
    });
}

test('discesa di 300 m al 10%: D- pesato 1,5 e 45 punti eccentrici', () => {
    // 3000 m al -10%, poi 600 s in piano.
    const altitude = d => (d <= 3000 ? 500 - d * 0.1 : 200);
    const samples = buildSamples(normalizeStreams(syntheticRun({ seconds: 1600, altitude })));
    const eccentric = eccentricFromSamples(samples);
    assert.ok(Math.abs(eccentric.descentM - 300) <= 3, `D- ${eccentric.descentM}`);
    assert.ok(Math.abs(eccentric.weightedDescentM - 450) <= 6, `pesato ${eccentric.weightedDescentM}`);
    const load = computeMechanicalLoad(runActivity({ type: 'TrailRun', icu_training_load: 40 }), samples, 1600);
    assert.equal(load.status, 'ok');
    assert.ok(Math.abs(load.eccentricPoints - 45) <= 1);
    assert.ok(Math.abs(load.score - 85) <= 1);
});

test('discesa dolce al -2%: nessun carico eccentrico', () => {
    const samples = buildSamples(normalizeStreams(syntheticRun({ seconds: 1800, altitude: d => 300 - d * 0.02 })));
    assert.equal(eccentricFromSamples(samples).weightedDescentM, 0);
});

test('senza stream: D- dal riepilogo, oppure assunto uguale al D+', () => {
    const fromLoss = eccentricFromSummary({ total_elevation_loss: 800, total_elevation_gain: 700 });
    assert.equal(fromLoss.source, 'summary');
    assert.equal(fromLoss.weightedDescentM, 1000);
    const assumed = eccentricFromSummary({ total_elevation_gain: 400 });
    assert.equal(assumed.source, 'summary_assumed');
    const load = computeMechanicalLoad({ type: 'Hike', moving_time: 7200, total_elevation_gain: 400 }, null, 0);
    assert.equal(load.cardioSource, 'duration');
    assert.equal(load.status, 'partial');
    assert.match(load.reason, /assunto uguale al D\+/);
});

test('nuoto: nessun carico eccentrico, solo cardio', () => {
    const load = computeMechanicalLoad({ type: 'Swim', icu_training_load: 30, total_elevation_gain: 0 }, null, 0);
    assert.equal(load.eccentric, null);
    assert.equal(load.score, 30);
});

test('carico cardio: Intervals, poi TRIMP, poi durata', () => {
    assert.deepEqual(cardioLoad({ icu_training_load: 72.4 }, 0), { value: 72, source: 'intervals' });
    assert.deepEqual(cardioLoad({ trimp: 90 }, 0), { value: 90, source: 'trimp' });
    assert.deepEqual(cardioLoad({}, 3600), { value: 50, source: 'duration' });
    assert.deepEqual(cardioLoad({}, 0), { value: 0, source: 'none' });
});

test('carico eccentrico: discesa grande ieri senza storico = alto', () => {
    const status = eccentricStatus([{ date: addDays(TODAY, -1), eccentricPoints: 90 }], TODAY);
    assert.equal(status.level, 'high');
    // Il cronico a 28 giorni include la discesa stessa: rapporto molto alto.
    assert.ok(status.ratio > 5, `rapporto ${status.ratio}`);
    assert.deepEqual(status.bigDescent, { date: addDays(TODAY, -1), points: 90 });
});

test('carico eccentrico regolare: stato basso o medio, non alto', () => {
    const entries = Array.from({ length: 28 }, (_, age) => ({ date: addDays(TODAY, -age), eccentricPoints: age % 2 ? 0 : 20 }));
    const status = eccentricStatus(entries, TODAY);
    assert.notEqual(status.level, 'high');
    assert.ok(status.ratio > 0.7 && status.ratio < 1.5, `rapporto ${status.ratio}`);
});

test('HRV: nel range, sotto il range, dati insufficienti', () => {
    assert.equal(hrvStatus(wellness(), TODAY).level, 'within');
    const low = hrvStatus(wellness({ lastDays: 5, lastValue: 40 }), TODAY);
    assert.equal(low.level, 'below');
    assert.ok(low.shortMeanMs < low.normalRangeMs[0]);
    assert.equal(hrvStatus(wellness({ days: 5 }), TODAY).status, 'unavailable');
});

test('prontezza: rosso con HRV bassa e carico eccentrico alto', () => {
    const readiness = computeReadiness({
        eccentricEntries: [{ date: addDays(TODAY, -1), eccentricPoints: 90 }],
        wellness: wellness({ lastDays: 5, lastValue: 40 }),
        today: TODAY
    });
    assert.equal(readiness.level, 'red');
    assert.equal(readiness.kind, 'combined');
});

test('prontezza: giallo muscolare con HRV normale ma discesa non assorbita', () => {
    const readiness = computeReadiness({
        eccentricEntries: [{ date: addDays(TODAY, -1), eccentricPoints: 90 }],
        wellness: wellness(),
        today: TODAY
    });
    assert.equal(readiness.level, 'amber');
    assert.equal(readiness.kind, 'muscular');
    assert.ok(readiness.advice.some(item => item.includes('discese tecniche')));
    assert.ok(readiness.advice.some(item => item.includes('HRV nella norma')));
});

test('prontezza: giallo sistemico con HRV bassa senza discese', () => {
    const readiness = computeReadiness({
        eccentricEntries: [{ date: TODAY, eccentricPoints: 0 }],
        wellness: wellness({ lastDays: 5, lastValue: 40 }),
        today: TODAY
    });
    assert.equal(readiness.level, 'amber');
    assert.equal(readiness.kind, 'systemic');
});

test('prontezza: verde senza carico e con HRV nel range; FC a riposo alta segnalata', () => {
    const records = wellness().map((record, index, all) => ({ ...record, restingHR: index >= all.length - 7 ? 58 : 48 }));
    const readiness = computeReadiness({
        eccentricEntries: [{ date: addDays(TODAY, -3), eccentricPoints: 2 }],
        wellness: records,
        today: TODAY
    });
    assert.equal(readiness.level, 'green');
    assert.ok(readiness.advice.some(item => item.startsWith('FC a riposo')));
});

test('prontezza: senza attività né HRV non calcolabile', () => {
    assert.equal(computeReadiness({ today: TODAY }).level, 'unavailable');
});

test('prontezza senza HRV: decide il carico eccentrico, con avviso', () => {
    const readiness = computeReadiness({ eccentricEntries: [{ date: TODAY, eccentricPoints: 90 }], wellness: [], today: TODAY });
    assert.equal(readiness.level, 'amber');
    assert.ok(readiness.advice.some(item => item.startsWith('HRV insufficiente')));
});
