import test from 'node:test';
import assert from 'node:assert/strict';
import { PERFORMANCE_CONFIG, withThresholds } from '../js/modules/performance-config.js';
import { buildSamples, normalizeStreams } from '../js/modules/activity-streams.js';
import {
    computeEfficiency,
    computeGap,
    computeNormalizedPower,
    computeUphillEfficiency,
    detectClimbs,
    gapFactor,
    gapSpeedSeries,
    minettiCost
} from '../js/modules/performance-gap.js';
import { noise, syntheticRun } from './helpers/synthetic-streams.js';

const prepare = streams => {
    const samples = buildSamples(normalizeStreams(streams));
    return { samples, gapSpeeds: gapSpeedSeries(samples) };
};

test('Minetti: costo in piano 3,6 J/kg/m, fattori a +10% e -10%', () => {
    assert.equal(minettiCost(0), 3.6);
    assert.ok(Math.abs(gapFactor(0.1) - 1.658) < 0.005);
    assert.ok(Math.abs(gapFactor(-0.1) - 0.598) < 0.005);
    // Oltre il ±45% la pendenza viene limitata.
    assert.equal(gapFactor(0.9), gapFactor(0.45));
});

test('fattore minimo in discesa configurabile', () => {
    const config = { ...PERFORMANCE_CONFIG, gap: { ...PERFORMANCE_CONFIG.gap, downhillFactorFloor: 0.8 } };
    assert.equal(gapFactor(-0.2, config), 0.8);
    assert.ok(gapFactor(0.1, config) > 1.6);
});

test('corsa in piano a 3 m/s con FC 150: GAP = passo, EF = 1,2', () => {
    const { samples, gapSpeeds } = prepare(syntheticRun({ seconds: 1800, altitude: () => 100, hr: () => 150 }));
    const gap = computeGap(samples, gapSpeeds);
    assert.equal(gap.status, 'ok');
    assert.equal(gap.gapPaceSecondsPerKm, 333);
    assert.equal(gap.paceSecondsPerKm, 333);
    const efficiency = computeEfficiency(samples, gapSpeeds);
    assert.equal(efficiency.ef, 1.2);
    assert.equal(efficiency.averageHr, 150);
});

test('salita al 10% a 2 m/s: GAP più veloce del passo reale', () => {
    const { samples, gapSpeeds } = prepare(syntheticRun({ seconds: 900, speed: () => 2, altitude: d => 100 + d * 0.1, hr: () => 160 }));
    const gap = computeGap(samples, gapSpeeds);
    assert.ok(Math.abs(gap.gapSpeedMps - 2 * 1.658) < 0.05, `GAP ${gap.gapSpeedMps}`);
    assert.ok(gap.gapPaceSecondsPerKm < gap.paceSecondsPerKm);
    const uphill = computeUphillEfficiency(samples, gapSpeeds);
    assert.equal(uphill.status, 'ok');
    assert.ok(uphill.ef > 1.2);
});

test('rumore barometrico in piano: il GAP resta entro il 2% del passo', () => {
    const { samples, gapSpeeds } = prepare(syntheticRun({ seconds: 1800, altitude: (d, t) => 200 + noise(t, 1.5), hr: () => 150 }));
    const gap = computeGap(samples, gapSpeeds);
    assert.ok(Math.abs(gap.gapSpeedMps / gap.speedMps - 1) < 0.02, `${gap.gapSpeedMps} vs ${gap.speedMps}`);
});

test('salita continua di 200 m in 15 minuti: VAM 800 m/h', () => {
    // 900 s in salita a 2 m/s (1800 m all'11,1%), poi discesa.
    const altitude = d => (d <= 1800 ? 100 + d / 9 : 300 - (d - 1800) / 9);
    const { samples } = prepare(syntheticRun({ seconds: 1500, speed: () => 2, altitude, hr: () => 160 }));
    const climbs = detectClimbs(samples);
    assert.equal(climbs.status, 'ok');
    assert.equal(climbs.climbs.length, 1);
    assert.ok(Math.abs(climbs.climbs[0].gainM - 200) <= 3);
    assert.ok(Math.abs(climbs.bestVam - 800) <= 15, `VAM ${climbs.bestVam}`);
});

test('senza FC: GAP calcolato, EF non disponibile senza errori', () => {
    const { samples, gapSpeeds } = prepare(syntheticRun({ seconds: 1200, altitude: () => 50 }));
    assert.equal(computeGap(samples, gapSpeeds).status, 'ok');
    const efficiency = computeEfficiency(samples, gapSpeeds);
    assert.equal(efficiency.status, 'unavailable');
    assert.equal(efficiency.ef, null);
});

test('senza altitudine: GAP uguale al passo e stato parziale', () => {
    const { samples, gapSpeeds } = prepare(syntheticRun({ seconds: 1200, hr: () => 150 }));
    const gap = computeGap(samples, gapSpeeds);
    assert.equal(gap.status, 'partial');
    assert.equal(gap.gapPaceSecondsPerKm, gap.paceSecondsPerKm);
    assert.equal(computeUphillEfficiency(samples, gapSpeeds).status, 'unavailable');
    assert.equal(detectClimbs(samples).status, 'unavailable');
});

test('potenza costante: NP uguale alla potenza e EF di potenza', () => {
    const { samples, gapSpeeds } = prepare(syntheticRun({ seconds: 1200, altitude: () => 10, hr: () => 150, watts: () => 250 }));
    assert.equal(Math.round(computeNormalizedPower(samples)), 250);
    const efficiency = computeEfficiency(samples, gapSpeeds);
    assert.equal(efficiency.normalizedPower, 250);
    assert.equal(efficiency.efPower, 1.667);
});

test('withThresholds applica solo le soglie previste', () => {
    const config = withThresholds({ 'decoupling.goodMaxPercent': 6, 'gap.coefficients': [1] });
    assert.equal(config.decoupling.goodMaxPercent, 6);
    assert.deepEqual(config.gap.coefficients, PERFORMANCE_CONFIG.gap.coefficients);
    assert.equal(PERFORMANCE_CONFIG.decoupling.goodMaxPercent, 5);
});
