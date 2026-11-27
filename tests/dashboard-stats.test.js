import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeRecords,
    mondayOf,
    normalizeActivities,
    summarizePeriod,
    weeklyVolumes,
    wellnessSeries
} from '../js/modules/dashboard-stats.js';

const raw = [
    { id: 'a1', start_date_local: '2026-11-02T07:00:00', type: 'Run', name: 'Parkrun', distance: 5020, moving_time: 1240, elapsed_time: 1260 },
    { id: 'a2', start_date_local: '2026-11-04T07:00:00', type: 'TrailRun', name: 'Collina', distance: 14000, moving_time: 5400, total_elevation_gain: 600 },
    { id: 'a3', start_date_local: '2026-11-05T19:00:00', type: 'Swim', name: 'Piscina', distance: 2000, moving_time: 2700 },
    { id: 'a4', start_date_local: '2026-11-09T07:00:00', type: 'Run', name: 'Lungo', distance: 30000, moving_time: 9900 },
    { id: 'a5', start_date_local: '2026-11-10T07:00:00', type: 'Run', name: 'Dieci forte', distance: 10050, moving_time: 2580, elapsed_time: 2610 },
    { id: 'a6', start_date_local: '2026-11-11T07:00:00', type: 'Ride', name: 'Bici', distance: 40000, moving_time: 5400 },
    { id: 'bad', start_date_local: null, type: 'Run' }
];

test('normalizza le attività e scarta quelle senza data', () => {
    const activities = normalizeActivities(raw);
    assert.equal(activities.length, 6);
    assert.deepEqual(activities.map(item => item.sport), ['run', 'run', 'swim', 'run', 'run', 'ride']);
});

test('riepiloga corse e nuoto nel periodo', () => {
    const summary = summarizePeriod(normalizeActivities(raw), '2026-11-01', '2026-11-08');
    assert.equal(summary.run.count, 2);
    assert.equal(summary.run.km, 19.02);
    assert.equal(summary.run.elevationM, 600);
    assert.equal(summary.run.longestKm, 14);
    assert.equal(summary.swim.count, 1);
    assert.equal(summary.swim.meters, 2000);
    assert.equal(summary.otherCount, 0);
    assert.equal(Math.round(summary.run.averagePaceSecondsPerKm), Math.round((1240 + 5400) / 19.02));
});

test('aggrega i volumi per settimana da lunedì', () => {
    assert.equal(mondayOf('2026-11-15'), '2026-11-09');
    const weeks = weeklyVolumes(normalizeActivities(raw), 2, '2026-11-13');
    assert.deepEqual(weeks.map(week => week.weekStart), ['2026-11-02', '2026-11-09']);
    assert.equal(weeks[0].runKm, 19);
    assert.equal(weeks[0].swimCount, 1);
    assert.equal(weeks[1].runCount, 2);
    assert.equal(weeks[1].runKm, 40.1);
    assert.equal(weeks[0].runElevationM, 600);
    assert.equal(weeks[1].runElevationM, 0);
});

test('i record usano solo attività o gare sull’intera distanza, senza estrapolare', () => {
    const races = [
        { status: 'completed', distance_km: 10, chip_time_seconds: 2550, official_time_seconds: 2560, event_date: '2026-10-04', name: 'Dieci di città' },
        { status: 'planned', distance_km: 21.0975, chip_time_seconds: null, event_date: '2027-03-01', name: 'Futura' },
        { status: 'completed', distance_km: 21.0975, official_time_seconds: 5700, event_date: '2026-04-12', name: 'Mezza di primavera' }
    ];
    const records = computeRecords(normalizeActivities(raw), races);
    const byKey = Object.fromEntries(records.distances.map(record => [record.key, record]));

    assert.equal(byKey['5k'].best.seconds, 1260);
    assert.equal(byKey['5k'].best.source, 'activity');
    assert.equal(byKey['10k'].best.seconds, 2550);
    assert.equal(byKey['10k'].best.sourceLabel, 'gara, tempo chip');
    assert.equal(byKey['10k'].attempts, 2);
    assert.equal(byKey.half.best.name, 'Mezza di primavera');
    assert.equal(byKey.marathon.best, null);
    assert.equal(records.longestRun.km, 30);
    assert.equal(records.longestRun.name, 'Lungo');
});

test('estrae le serie wellness disponibili, con forma calcolata', () => {
    const series = wellnessSeries([
        { id: '2026-11-10', ctl: 40, atl: 50, restingHR: 48, sleepSecs: 25200 },
        { id: '2026-11-11', ctl: 41, atl: 45, restingHR: 47, sleepSecs: 27000 },
        { id: '2026-10-01', ctl: 30, atl: 30 }
    ], '2026-11-01');
    assert.deepEqual(series.dates, ['2026-11-10', '2026-11-11']);
    assert.deepEqual(series.series.tsb, [-10, -4]);
    assert.deepEqual(series.series.sleepHours, [7, 7.5]);
    assert.equal(series.available.restingHR, true);
    assert.equal(series.available.weight, false);
});
