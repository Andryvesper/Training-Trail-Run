import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, isIsoDate, localDateKey, mondayOf } from '../js/core/date-utils.js';

test('chiave locale, non UTC', () => {
    assert.equal(localDateKey(new Date(2026, 2, 29, 0, 30)), '2026-03-29');
});

test('aritmetica sui giorni stabile al cambio di ora legale e di anno', () => {
    assert.equal(addDays('2026-03-28', 1), '2026-03-29');
    assert.equal(addDays('2026-10-25', 1), '2026-10-26');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
    assert.equal(daysBetween('2026-11-10', '2026-11-03'), -7);
});

test('date ISO valide e lunedì della settimana', () => {
    assert.ok(isIsoDate('2028-02-29'));
    assert.ok(!isIsoDate('2027-02-29'));
    assert.ok(!isIsoDate('2026-1-01'));
    assert.equal(mondayOf('2026-11-29'), '2026-11-23');
    assert.equal(mondayOf('2026-11-23'), '2026-11-23');
});
