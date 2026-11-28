import test from 'node:test';
import assert from 'node:assert/strict';
import { detailStreamTypes, latLngTrack, requestedStreamTypes } from '../js/modules/activity-streams.js';
import { isLoop, thinLatLngs } from '../js/modules/track-map.js';

test('percorso GPS: latitudini in data e longitudini in data2', () => {
    const streams = [
        { type: 'time', data: [0, 1, 2, 3] },
        { type: 'latlng', data: [45.1, null, 45.2, 45.3], data2: [7.1, 7.15, 7.2, 7.3] }
    ];
    assert.deepEqual(latLngTrack(streams), [
        [45.1, 7.1],
        [45.2, 7.2],
        [45.3, 7.3]
    ]);
});

test('percorso GPS: coppie [lat, lon], punti senza segnale scartati', () => {
    const streams = [
        {
            type: 'latlng',
            data: [[45.1, 7.1], null, [0, 0], [95, 7], ['45.2', '7.2'], [45.3, 7.3]]
        }
    ];
    assert.deepEqual(latLngTrack(streams), [
        [45.1, 7.1],
        [45.2, 7.2],
        [45.3, 7.3]
    ]);
    assert.deepEqual(latLngTrack({ latlng: [[46, 8]] }), [[46, 8]]);
});

test('percorso GPS: nessuno stream latlng, nessun punto', () => {
    assert.deepEqual(latLngTrack([{ type: 'time', data: [0, 1] }]), []);
    assert.deepEqual(latLngTrack(null), []);
    assert.deepEqual(latLngTrack([{ type: 'latlng', data: 'x' }]), []);
});

test('stream del dettaglio: latlng solo se l’attività può averlo', () => {
    assert.ok(detailStreamTypes({}).includes('latlng'));
    assert.deepEqual(detailStreamTypes({ stream_types: ['time', 'distance', 'latlng'] }), ['time', 'distance', 'latlng']);
    assert.deepEqual(detailStreamTypes({ stream_types: ['time', 'distance'] }), ['time', 'distance']);
    // L'analisi della prestazione non scarica il percorso.
    assert.ok(!requestedStreamTypes({}).includes('latlng'));
});

test('mappa: riduzione dei punti con primo e ultimo sempre presenti', () => {
    const points = Array.from({ length: 10001 }, (_, index) => [45 + index / 1e5, 7]);
    const thinned = thinLatLngs(points, 1000);
    assert.equal(thinned.length, 1000);
    assert.equal(thinned[0], points[0]);
    assert.equal(thinned[thinned.length - 1], points[points.length - 1]);
    const few = points.slice(0, 5);
    assert.equal(thinLatLngs(few, 1000), few);
});

test('mappa: anello se partenza e arrivo distano meno di 200 m', () => {
    assert.equal(
        isLoop([
            [45, 7],
            [45.05, 7.05],
            [45.001, 7.001]
        ]),
        true
    );
    assert.equal(
        isLoop([
            [45, 7],
            [45.05, 7.05]
        ]),
        false
    );
    assert.equal(isLoop([[45, 7]]), false);
});
