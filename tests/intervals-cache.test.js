import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEntry, mergeActivities, readActivityCache, REFRESH_WINDOW_DAYS, refetchStart } from '../js/modules/intervals-cache.js';

const act = (id, date) => ({ id, start_date_local: `${date}T08:00:00` });

test('senza cache si scarica tutto lo storico', () => {
    assert.equal(refetchStart(null, '2000-01-01'), '2000-01-01');
    assert.equal(refetchStart({ v: 99, activities: [], syncedAt: '2026-11-20' }, '2000-01-01'), '2000-01-01');
});

test('con la cache si riscaricano solo le ultime settimane', () => {
    const entry = { v: 1, activities: [], syncedAt: '2026-11-20' };
    assert.equal(REFRESH_WINDOW_DAYS, 45);
    assert.equal(refetchStart(entry, '2000-01-01'), '2026-10-06');
    assert.ok(isValidEntry(entry));
});

test('la finestra riscaricata sostituisce la cache: modifiche e cancellazioni', () => {
    const cached = [act('a', '2026-09-01'), act('b', '2026-10-10'), act('c', '2026-10-20')];
    const fresh = [act('c', '2026-10-20'), act('d', '2026-11-01')];
    const merged = mergeActivities(cached, fresh, '2026-10-06');
    // "b" non è più tra le nuove: era stata cancellata su Intervals.
    assert.deepEqual(
        merged.map(item => item.id),
        ['a', 'c', 'd']
    );
    assert.equal(
        merged.find(item => item.id === 'c'),
        fresh[0]
    );
});

test('senza IndexedDB la cache è semplicemente assente', async () => {
    assert.equal(await readActivityCache('u:i1'), null);
});
