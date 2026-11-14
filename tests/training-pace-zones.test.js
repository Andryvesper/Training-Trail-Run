import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBands, paceBandsForCell, singleTargetPace } from '../js/modules/training-pace-zones.js';
import { buildWeeklyCyclePattern, draftToCalendarSessions, scheduleCycleDraft } from '../js/modules/training-cycle-engine.js';

const byKey = bands => Object.fromEntries(bands.map(band => [band.key, band]));

test('ricava le fasce dei mezzi dalla VR con gli scarti del libro', () => {
    const vr = 300;
    assert.deepEqual(
        [byKey(paceBandsForCell('12 km L', vr, 10)).L.fastestSecondsPerKm, byKey(paceBandsForCell('12 km L', vr, 10)).L.slowestSecondsPerKm],
        [340, 350]
    );
    assert.equal(byKey(paceBandsForCell('4 x 1 km / MLSS / rec 3\'', vr, 10)).MLSS1000.fastestSecondsPerKm, 292);
    assert.equal(byKey(paceBandsForCell('10 x / 400 m / VAM rec. / 1\'30"', vr, 10)).VAM400.fastestSecondsPerKm, 280);
    assert.equal(byKey(paceBandsForCell('7 km / ritmo / gara 10 / km', vr, 10)).RG10.fastestSecondsPerKm, 300);
    assert.deepEqual(Object.keys(byKey(paceBandsForCell('1 km / RMA + / 5 x 1 km / RME rec.', vr, 42.195))).sort(), ['RMA', 'RME']);
    assert.equal(byKey(paceBandsForCell('32 km / LLM', vr, 42.195)).LLM.slowestSecondsPerKm, 360);
});

test('il medio dipende dalla gara obiettivo', () => {
    assert.equal(byKey(paceBandsForCell('10 km M', 300, 10)).M.fastestSecondsPerKm, 310);
    assert.equal(byKey(paceBandsForCell('10 km M', 300, 21.1)).M.fastestSecondsPerKm, 315);
    assert.equal(byKey(paceBandsForCell('16 km M', 300, 42.195)).M.fastestSecondsPerKm, 320);
});

test('senza regola numerica nel libro non calcola alcun passo', () => {
    const sb = paceBandsForCell('10 x / 100 m / in salita / SB rec.', 300, 10);
    assert.equal(byKey(sb).SB.fastestSecondsPerKm, null);
    const mlss600 = paceBandsForCell('8 x 600 / m MLSS / rec. 2\'', 300, 42.195);
    assert.equal(byKey(mlss600).MLSS600.fastestSecondsPerKm, null);
    assert.equal(singleTargetPace(mlss600), null);
    assert.deepEqual(paceBandsForCell('12 km L', null, 10), []);
});

test('un passo obiettivo unico solo con una sola fascia', () => {
    assert.equal(singleTargetPace(paceBandsForCell('12 km L', 300, 10)), 345);
    assert.equal(singleTargetPace(paceBandsForCell('9 km L + / 1 km M', 300, 10)), null);
    assert.match(describeBands(paceBandsForCell('9 km L + / 1 km M', 300, 10)), /lento \(CRF\) 5:40-5:50\/km; medio 5:10\/km/);
});

test('la bozza scrive passo e fasce ricavati dalla VR dell’atleta', () => {
    const draft = scheduleCycleDraft({
        pattern: buildWeeklyCyclePattern('ten_km_distance_time_cycle'),
        raceDate: '2027-03-21',
        availableDays: ['tue', 'thu', 'sat', 'sun'],
        vrSecondsPerKm: 270,
        goalDistanceKm: 10
    });
    const sessions = draftToCalendarSessions(draft);
    const easy = sessions.find(session => session.title.endsWith('10 km L'));
    assert.equal(easy.target_pace_seconds_per_km, 315);
    assert.match(easy.notes, /VR 4:30\/km: lento \(CRF\) 5:10-5:20\/km/);
    const mixed = sessions.find(session => session.title.includes('9 km L + 1 km M'));
    assert.equal(mixed.target_pace_seconds_per_km, null);
});
