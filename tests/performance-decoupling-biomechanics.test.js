import test from 'node:test';
import assert from 'node:assert/strict';
import { PERFORMANCE_CONFIG } from '../js/modules/performance-config.js';
import { buildSamples, normalizeStreams } from '../js/modules/activity-streams.js';
import { gapFactor, gapSpeedSeries } from '../js/modules/performance-gap.js';
import { classifyDecoupling, computeDecoupling } from '../js/modules/performance-decoupling.js';
import { biomechanicsAlerts, computeBiomechanics } from '../js/modules/performance-biomechanics.js';
import { runActivity, syntheticRun } from './helpers/synthetic-streams.js';

const decouple = (streams, activity = runActivity(), config = PERFORMANCE_CONFIG) => {
    const samples = buildSamples(normalizeStreams(streams), config);
    return computeDecoupling(activity, samples, gapSpeedSeries(samples, config), config);
};
const biomech = streams => computeBiomechanics(buildSamples(normalizeStreams(streams)));

test('90 minuti costanti: deriva circa 0, tenuta ottima', () => {
    const result = decouple(syntheticRun({ seconds: 5400, altitude: () => 100, hr: () => 145 }));
    assert.equal(result.status, 'ok');
    assert.equal(result.driftPercent, 0);
    assert.equal(result.steady, true);
    assert.equal(classifyDecoupling(result.driftPercent).key, 'excellent');
});

test('FC che sale da 140 a 160 a passo costante: deriva significativa', () => {
    const result = decouple(syntheticRun({ seconds: 5400, altitude: () => 100, hr: t => 140 + 20 * t / 5400 }));
    assert.ok(result.driftPercent > 5, `deriva ${result.driftPercent}`);
    assert.ok(result.averageHr2 > result.averageHr1);
    assert.equal(classifyDecoupling(result.driftPercent).key, 'significant');
});

test('in collina la deriva usa il GAP: salite e discese alternate senza deriva', () => {
    // Onda di 40 m ogni 2 km: il passo reale cambia, lo sforzo (GAP) no.
    const altitude = d => 300 + 20 * Math.sin(d / 2000 * 2 * Math.PI);
    const grade = d => 20 * 2 * Math.PI / 2000 * Math.cos(d / 2000 * 2 * Math.PI);
    const speed = (t, d) => 3 / gapFactor(grade(d));
    const result = decouple(syntheticRun({ seconds: 5400, speed, altitude, hr: () => 150 }));
    assert.equal(result.status, 'ok');
    assert.ok(Math.abs(result.driftPercent) < 1.5, `deriva ${result.driftPercent}`);
});

test('classi della deriva con le soglie della config', () => {
    assert.equal(classifyDecoupling(3.4).key, 'excellent');
    assert.equal(classifyDecoupling(3.5).key, 'good');
    assert.equal(classifyDecoupling(5).key, 'good');
    assert.equal(classifyDecoupling(5.1).key, 'significant');
    assert.equal(classifyDecoupling(-1).key, 'negative');
    assert.equal(classifyDecoupling(null), null);
});

test('seduta di 45 minuti (8 km): deriva non applicabile', () => {
    const result = decouple(syntheticRun({ seconds: 2700, altitude: () => 100, hr: () => 150 }), runActivity({ moving_time: 2700, distance: 8100 }));
    assert.equal(result.status, 'unavailable');
    assert.match(result.reason, /60 minuti/);
});

test('senza FC: deriva non disponibile senza errori', () => {
    const result = decouple(syntheticRun({ seconds: 5400, altitude: () => 100 }));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.driftPercent, null);
});

test('ripetute: ritmo non costante segnalato', () => {
    const speed = t => (Math.floor(t / 120) % 2 ? 2.5 : 4.5);
    const result = decouple(syntheticRun({ seconds: 5400, speed, altitude: () => 100, hr: () => 155 }));
    assert.equal(result.steady, false);
    assert.equal(result.status, 'partial');
    assert.match(result.reason, /non costante/);
});

test('divisione a metà per distanza', () => {
    const config = { ...PERFORMANCE_CONFIG, decoupling: { ...PERFORMANCE_CONFIG.decoupling, splitBy: 'distance' } };
    const result = decouple(syntheticRun({ seconds: 5400, altitude: () => 100, hr: () => 145 }), runActivity(), config);
    assert.equal(result.splitBy, 'distance');
    assert.equal(result.driftPercent, 0);
});

test('GCT costante: nessuna variazione e nessun allarme', () => {
    const result = biomech(syntheticRun({ seconds: 3600, altitude: () => 100, hr: () => 150, gct: () => 250, vo: () => 85 }));
    assert.equal(result.status, 'ok');
    assert.equal(result.normalized, 'pace_grade');
    assert.equal(result.metrics.gct.changePercent, 0);
    assert.deepEqual(biomechanicsAlerts(result), []);
});

test('GCT che si allunga del 10%: allarme di cedimento neuromuscolare', () => {
    const result = biomech(syntheticRun({ seconds: 3600, altitude: () => 100, gct: t => 240 + 24 * t / 3600, vo: () => 85 }));
    assert.ok(result.metrics.gct.changePercent > 4, `ΔGCT ${result.metrics.gct.changePercent}`);
    assert.ok(result.gctSlopePerHour > 20);
    const alerts = biomechanicsAlerts(result);
    assert.ok(alerts.some(alert => alert.startsWith('GCT più lungo')));
    assert.ok(alerts.some(alert => alert.startsWith('GCT in crescita')));
    assert.equal(result.metrics.verticalOscillation.changePercent, 0);
});

test('GCT più lungo solo in salita: la normalizzazione in piano lo esclude', () => {
    // Ultimo 20% su una salita al 10%: GCT più alto ma non per fatica.
    const altitude = d => (d > 8640 ? 100 + (d - 8640) * 0.1 : 100);
    const gct = (t, d) => (d > 8640 ? 290 : 250);
    const result = biomech(syntheticRun({ seconds: 3600, altitude, gct }));
    assert.equal(result.metrics.gct.normalized, false, 'nel finale non ci sono tratti in piano');
    const flatFinish = biomech(syntheticRun({ seconds: 3600, altitude: () => 100, gct: () => 250 }));
    assert.equal(flatFinish.metrics.gct.normalized, true);
});

test('stream "GroundContactTime" riconosciuto come GCT', () => {
    const result = biomech(syntheticRun({ seconds: 3600, altitude: () => 100, gct: () => 250, gctType: 'GroundContactTime' }));
    assert.equal(result.status, 'ok');
    assert.ok(result.metrics.gct);
});

test('senza dinamiche di corsa: biomeccanica non disponibile senza errori', () => {
    const result = biomech(syntheticRun({ seconds: 3600, altitude: () => 100, hr: () => 150 }));
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(biomechanicsAlerts(result), []);
});
