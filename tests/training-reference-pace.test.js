import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateReferencePace,
    canCalculateReferencePace,
    formatPace,
    formatTestDuration,
    parseTestDuration
} from '../js/modules/training-reference-pace.js';

test('parsa e formatta durate senza perdere i secondi', () => {
    assert.equal(parseTestDuration('15:12'), 912);
    assert.equal(parseTestDuration('1:02:03'), 3723);
    assert.equal(formatTestDuration(912), '15:12');
    assert.equal(formatTestDuration(3723), '1:02:03');
    assert.equal(formatPace(334), '5:34');
});

test('calcola la VR dai protocolli del test dichiarati nel manuale', () => {
    assert.equal(calculateReferencePace('three_km_plus_10', parseTestDuration('15:12')), 334);
    assert.equal(calculateReferencePace('ten_km', parseTestDuration('50:00')), 300);
    assert.equal(canCalculateReferencePace('three_km_plus_10'), true);
    assert.equal(canCalculateReferencePace('race'), false);
});

test('rifiuta tempi malformati e protocolli senza formula supportata', () => {
    assert.throws(() => parseTestDuration('15:60'), /mm:ss o hh:mm:ss/);
    assert.throws(() => parseTestDuration('0:00'), /mm:ss o hh:mm:ss/);
    assert.throws(() => calculateReferencePace('race', 3000), /non consente di calcolare/);
    assert.throws(() => calculateReferencePace('ten_km', 0), /maggiore di zero/);
});
