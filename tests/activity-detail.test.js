import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activityProfile,
    activitySummaryItems,
    formatDuration,
    intervalsActivityUrl,
    lapRows,
    speedText,
    usesPace
} from '../js/modules/activity-detail.js';
import { runActivity, syntheticRun } from './helpers/synthetic-streams.js';

const valueOf = (items, label) => items.find(item => item.label === label)?.value;

test('riepilogo corsa: solo campi presenti, passo in min/km', () => {
    const items = activitySummaryItems({
        type: 'TrailRun',
        distance: 12600,
        moving_time: 4200,
        elapsed_time: 4300,
        total_elevation_gain: 300,
        average_heartrate: 145.4,
        icu_training_load: 80,
        calories: 0
    });
    assert.equal(valueOf(items, 'Distanza'), '12,6 km');
    assert.equal(valueOf(items, 'Tempo in movimento'), '1 h 10 min');
    assert.equal(valueOf(items, 'Tempo totale'), '1 h 11 min');
    assert.equal(valueOf(items, 'Passo medio'), '5:33/km');
    assert.equal(valueOf(items, 'FC media'), '145 bpm');
    assert.equal(valueOf(items, 'Carico (Intervals)'), '80');
    assert.equal(valueOf(items, 'Calorie'), undefined, 'zero non si mostra');
    assert.equal(valueOf(items, 'FC massima'), undefined);
});

test('riepilogo: bici in km/h, nuoto in min/100 m', () => {
    assert.equal(valueOf(activitySummaryItems({ type: 'Ride', distance: 40000, moving_time: 4800 }), 'Velocità media'), '30 km/h');
    const swim = activitySummaryItems({ type: 'Swim', distance: 1500, moving_time: 1800 });
    assert.equal(valueOf(swim, 'Distanza'), '1500 m');
    assert.equal(valueOf(swim, 'Passo medio'), '2:00/100 m');
    assert.equal(usesPace({ type: 'Hike' }), true);
    assert.equal(speedText({ type: 'Run' }, 0), null);
});

test('tempo totale mostrato solo se le pause superano un minuto', () => {
    assert.equal(valueOf(activitySummaryItems({ type: 'Run', moving_time: 3600, elapsed_time: 3630 }), 'Tempo totale'), undefined);
    assert.equal(formatDuration(754), '12 min 34 s');
});

test("link Intervals.icu dall'ID attività", () => {
    assert.equal(intervalsActivityUrl('i9001'), 'https://intervals.icu/activities/i9001');
    assert.equal(intervalsActivityUrl(''), null);
});

test('profilo: altitudine, FC e passo ridotti per tratti di distanza', () => {
    const streams = syntheticRun({ seconds: 3600, altitude: d => 200 + d * 0.01, hr: t => 130 + t / 120 });
    const profile = activityProfile(streams, 50);
    assert.equal(profile.labels.length, 50);
    assert.ok(profile.has.altitude && profile.has.heartrate && profile.has.pace);
    assert.ok(profile.altitude[49] > profile.altitude[0], 'sale lungo il percorso');
    assert.ok(profile.heartrate[49] > profile.heartrate[0]);
    const paces = profile.pace.filter(value => value !== null);
    assert.ok(paces.length >= 45);
    assert.ok(
        paces.every(value => value > 200 && value < 600),
        JSON.stringify(paces.slice(0, 5))
    );
    assert.match(profile.labels[0], /km$/);
});

test('profilo senza distanza: null', () => {
    assert.equal(activityProfile([{ type: 'time', data: [0, 1, 2] }]), null);
    assert.equal(activityProfile([]), null);
});

test('giri: tipi tradotti, passo per giro, tratti vuoti esclusi', () => {
    const rows = lapRows(
        {
            icu_intervals: [
                { type: 'WARMUP', distance: 2000, moving_time: 660, average_speed: 2000 / 660, average_heartrate: 132 },
                {
                    type: 'WORK',
                    label: 'Ripetuta 1',
                    distance: 1000,
                    moving_time: 240,
                    average_heartrate: 168.6,
                    max_heartrate: 175,
                    total_elevation_gain: 4
                },
                { type: 'RECOVERY', distance: 0, moving_time: 0 }
            ]
        },
        runActivity()
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].label, 'Riscaldamento');
    assert.equal(rows[0].pace, '5:30/km');
    assert.equal(rows[1].label, 'Ripetuta 1');
    assert.equal(rows[1].pace, '4:00/km');
    assert.equal(rows[1].heartrate, '169');
    assert.equal(rows[1].elevation, '4 m');
    assert.deepEqual(lapRows(null, runActivity()), []);
});
