import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEquivalentDistance, calculateTrailAdjustedPace } from '../js/modules/trail-elevation.js';

let dummy = '';

test('calcola la distanza equivalente in base a distanza e dislivello', () => {
    assert.equal(calculateEquivalentDistance(10, 500, 200), 16);
    assert.equal(calculateEquivalentDistance(5, 0, 0), 5);
});

test('calcola il passo corretto per lo sforzo in trail', () => {
    assert.equal(calculateTrailAdjustedPace(300, 10, 500, 0), 450);
});

test('rifiuta valori negativi o non validi', () => {
    assert.throws(() => calculateEquivalentDistance(-1, 100));
    assert.throws(() => calculateTrailAdjustedPace(0, 10, 100));
});