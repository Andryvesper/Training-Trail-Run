import test from 'node:test';
import assert from 'node:assert/strict';
import { PERFORMANCE_CONFIG, PERFORMANCE_CONFIG_VERSION, withThresholds } from '../js/modules/performance-config.js';
import { buildSamples, normalizeStreams, requestedStreamTypes } from '../js/modules/activity-streams.js';
import { activitiesToAnalyze, analyzeActivity, eccentricEntries, efficiencyTrend } from '../js/modules/performance-analysis.js';
import { addDays } from '../js/modules/mechanical-readiness.js';
import {
    applyChanges,
    effectiveConfig,
    effectiveThresholds,
    isReviewDue,
    nextReviewDate,
    pendingReview,
    proposeThresholdReview
} from '../js/modules/performance-calibration.js';
import { analysisFromRecord } from '../js/modules/performance-analysis-service.js';
import { runActivity, syntheticRun } from './helpers/synthetic-streams.js';

const TODAY = '2026-11-27';

test('stream: alias, priorità di fixed_altitude e tipi richiesti', () => {
    const normalized = normalizeStreams([
        { type: 'time', data: [0, 1] },
        { type: 'altitude', data: [10, 11] },
        { type: 'fixed_altitude', data: [20, 21] },
        { type: 'stance_time', data: [250, 251] },
        {
            type: 'latlng',
            data: [
                [1, 2],
                [1, 2]
            ]
        }
    ]);
    assert.deepEqual(normalized.series.altitude, [20, 21]);
    assert.deepEqual(normalized.series.gct, [250, 251]);
    assert.ok(normalized.rawTypes.includes('latlng'));
    assert.deepEqual(requestedStreamTypes({ stream_types: ['time', 'distance', 'latlng', 'heartrate'] }), [
        'time',
        'distance',
        'heartrate'
    ]);
    assert.ok(requestedStreamTypes({}).includes('vertical_oscillation'));
});

test('stream: senza distanza né velocità nessun campione; le pause non contano', () => {
    assert.equal(buildSamples(normalizeStreams([{ type: 'time', data: [0, 1, 2] }])), null);
    const streams = syntheticRun({ seconds: 600, altitude: () => 10 });
    // Pausa di 5 minuti a metà: il tempo salta da 300 a 600.
    const time = streams[0].data.map(t => (t > 300 ? t + 300 : t));
    const samples = buildSamples(normalizeStreams([{ type: 'time', data: time }, ...streams.slice(1)]));
    assert.equal(samples.movingTime[samples.n - 1], 599);
});

test('analisi completa di un trail con tutti gli stream', () => {
    const altitude = d => 300 + 60 * Math.sin((d / 3000) * 2 * Math.PI);
    const streams = syntheticRun({ seconds: 5400, altitude, hr: t => 140 + (6 * t) / 5400, gct: () => 250, vo: () => 80 });
    const analysis = analyzeActivity(runActivity({ type: 'TrailRun', decoupling: 2.1, icu_efficiency_factor: 1.3 }), streams);
    assert.equal(analysis.configVersion, PERFORMANCE_CONFIG_VERSION);
    assert.equal(analysis.date, '2026-11-20');
    assert.equal(analysis.gap.status, 'ok');
    assert.equal(analysis.efficiency.status, 'ok');
    assert.ok(Number.isFinite(analysis.decoupling.driftPercent));
    assert.equal(analysis.biomechanics.status, 'ok');
    assert.ok(analysis.mechanicalLoad.eccentricPoints > 0);
    assert.equal(analysis.intervals.decouplingPercent, 2.1);
    assert.ok(analysis.streams.available.includes('gct'));
    // Serializzabile per Supabase.
    assert.deepEqual(JSON.parse(JSON.stringify(analysis)), analysis);
});

test('attività senza stream utili (nuoto): nessun errore, solo carico', () => {
    const analysis = analyzeActivity(
        { id: 's1', type: 'Swim', start_date_local: '2026-11-20T07:00:00', moving_time: 2400, icu_training_load: 35 },
        []
    );
    assert.equal(analysis.gap.status, 'unavailable');
    assert.equal(analysis.efficiency.status, 'unavailable');
    assert.equal(analysis.decoupling.status, 'unavailable');
    assert.equal(analysis.biomechanics.status, 'unavailable');
    assert.equal(analysis.mechanicalLoad.score, 35);
});

test('corse da analizzare: ultimi 90 giorni, almeno 10 minuti, cache per versione', () => {
    const activities = [
        runActivity({ id: 'a', start_date_local: '2026-11-25T08:00:00' }),
        runActivity({ id: 'b', start_date_local: '2026-11-26T08:00:00' }),
        runActivity({ id: 'c', start_date_local: '2026-08-01T08:00:00' }),
        runActivity({ id: 'd', start_date_local: '2026-11-24T08:00:00', moving_time: 300 }),
        { id: 'e', type: 'Swim', start_date_local: '2026-11-24T08:00:00', moving_time: 3000 },
        runActivity({ id: 'f', start_date_local: '2026-11-23T08:00:00' })
    ];
    const cached = new Map([
        ['a', PERFORMANCE_CONFIG_VERSION],
        ['f', '0.9.0']
    ]);
    const { pending } = activitiesToAnalyze(activities, cached, TODAY);
    assert.deepEqual(
        pending.map(activity => activity.id),
        ['b', 'f']
    );
});

test('trend EF: miglioramento a parità di FC', () => {
    const analyses = Array.from({ length: 6 }, (_, index) => ({
        activityId: String(index),
        date: addDays(TODAY, -75 + index * 15),
        name: 'Lento',
        efficiency: { ef: 1.2 + index * 0.02, averageHr: 145, seconds: 3600 },
        uphill: { ef: null }
    }));
    const trend = efficiencyTrend(analyses, TODAY, 90);
    assert.equal(trend.points.length, 6);
    assert.equal(trend.referenceHr, 145);
    assert.ok(trend.changePercent > 7);
    assert.ok(trend.end.gapPaceAtReferenceHr < trend.start.gapPaceAtReferenceHr);
    assert.equal(efficiencyTrend(analyses, TODAY, 60).points.length, 4);
});

test('carico eccentrico giornaliero: analisi se presente, altrimenti riepilogo', () => {
    const activities = [
        runActivity({ id: 'r1', start_date_local: '2026-11-26T08:00:00' }),
        { id: 'h1', type: 'Hike', start_date_local: '2026-11-25T08:00:00', moving_time: 7200, total_elevation_loss: 600 }
    ];
    const analyses = new Map([['r1', { mechanicalLoad: { eccentricPoints: 12, score: 70 } }]]);
    const entries = eccentricEntries(activities, analyses, TODAY);
    assert.deepEqual(
        entries.map(entry => [entry.activityId, entry.eccentricPoints]),
        [
            ['r1', 12],
            ['h1', 75]
        ]
    );
});

test('revisione delle soglie ogni 15 giorni dalla data di approvazione', () => {
    assert.equal(nextReviewDate([]), '2026-12-12');
    assert.equal(isReviewDue([], '2026-12-11'), false);
    assert.equal(isReviewDue([], '2026-12-12'), true);
    const proposed = [{ reviewed_at: '2026-12-12', status: 'proposed', proposal: { changes: [] } }];
    assert.equal(pendingReview(proposed), proposed[0]);
    assert.equal(isReviewDue(proposed, '2027-01-30'), false, 'una proposta in attesa blocca la successiva');
    assert.equal(nextReviewDate([{ reviewed_at: '2026-12-12', status: 'no_change' }]), '2026-12-27');
});

test("soglie effettive: solo l'ultima revisione approvata", () => {
    const reviews = [
        { reviewed_at: '2026-12-12', status: 'approved', thresholds: { 'biomechanics.gctAlertPercent': 4.4 } },
        { reviewed_at: '2026-12-27', status: 'rejected', thresholds: {} },
        { reviewed_at: '2027-01-11', status: 'approved', thresholds: { 'biomechanics.gctAlertPercent': 4.8, 'readiness.ratioHigh': 1.65 } }
    ];
    assert.deepEqual(effectiveThresholds(reviews), { 'biomechanics.gctAlertPercent': 4.8, 'readiness.ratioHigh': 1.65 });
    assert.equal(effectiveConfig(reviews).readiness.ratioHigh, 1.65);
    assert.deepEqual(
        applyChanges({ a: 1 }, [
            { key: 'readiness.ratioHigh', proposed: 1.6 },
            { key: 'x', proposed: 3 }
        ]),
        { a: 1, 'readiness.ratioHigh': 1.6 }
    );
});

test('proposta: GCT molto variabile nelle corse costanti alza la soglia entro il 30%', () => {
    const analyses = [2, 9, 1, 8, 3, 10].map((change, index) => ({
        date: addDays(TODAY, -index * 7),
        decoupling: { driftPercent: 2, steady: true },
        biomechanics: { metrics: { gct: { changePercent: change } } }
    }));
    const proposal = proposeThresholdReview({ analyses, today: TODAY });
    const change = proposal.changes.find(item => item.key === 'biomechanics.gctAlertPercent');
    assert.ok(change, JSON.stringify(proposal));
    assert.equal(change.current, 4);
    assert.equal(change.proposed, 5.2, 'massimo +30% sul valore iniziale');
});

test('proposta: carico eccentrico alto mai seguito da HRV bassa alza la soglia', () => {
    // Quattro discese grandi a 20 giorni di distanza, HRV sempre stabile.
    const entries = [10, 30, 50, 70].map(age => ({ date: addDays(TODAY, -age), eccentricPoints: 120 }));
    const wellness = Array.from({ length: 120 }, (_, index) => ({ id: addDays(TODAY, -index), hrv: 60 + ((index % 5) - 2) }));
    const proposal = proposeThresholdReview({ eccentricEntries: entries, wellness, today: TODAY });
    const change = proposal.changes.find(item => item.key === 'readiness.ratioHigh');
    assert.ok(change, JSON.stringify(proposal.observations));
    assert.equal(change.proposed, 1.65);
});

test('proposta senza dati sufficienti: nessuna modifica, osservazioni spiegate', () => {
    const proposal = proposeThresholdReview({ today: TODAY });
    assert.deepEqual(proposal.changes, []);
    assert.ok(proposal.observations.some(item => item.includes('ne servono')));
    assert.equal(proposal.windowTo, TODAY);
});

test('le proposte partono dalle soglie approvate', () => {
    const config = withThresholds({ 'biomechanics.gctAlertPercent': 5 });
    const analyses = [2, 9, 1, 8, 3, 10].map((change, index) => ({
        date: addDays(TODAY, -index * 7),
        decoupling: { driftPercent: 2, steady: true },
        biomechanics: { metrics: { gct: { changePercent: change } } }
    }));
    const change = proposeThresholdReview({ analyses, today: TODAY, config }).changes.find(
        item => item.key === 'biomechanics.gctAlertPercent'
    );
    assert.equal(change.current, 5);
    assert.equal(PERFORMANCE_CONFIG.biomechanics.gctAlertPercent, 4);
});

test('record Supabase -> analisi', () => {
    const analysis = analysisFromRecord({
        intervals_activity_id: 42,
        activity_date: '2026-11-20',
        config_version: '1.0.0',
        metrics: { name: 'Lungo', gap: {} }
    });
    assert.equal(analysis.activityId, '42');
    assert.equal(analysis.date, '2026-11-20');
    assert.equal(analysisFromRecord({ metrics: null }), null);
});
