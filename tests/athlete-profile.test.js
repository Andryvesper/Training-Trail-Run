import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, AthleteProfileService, normalizePersonalData } from '../js/modules/athlete-profile.js';

test('normalizza i dati anagrafici e accetta campi vuoti', () => {
    assert.deepEqual(normalizePersonalData({
        full_name: '  Andrea Baron ',
        birth_date: '1980-05-20',
        sex: 'male',
        city: 'Treviso',
        phone: '+39 333 1234567',
        height_cm: '178',
        weight_kg: '68,46'
    }, '2026-11-14'), {
        full_name: 'Andrea Baron',
        birth_date: '1980-05-20',
        sex: 'male',
        city: 'Treviso',
        phone: '+39 333 1234567',
        height_cm: 178,
        weight_kg: 68.5
    });
    assert.deepEqual(normalizePersonalData({}), {
        full_name: null, birth_date: null, sex: null, city: null, phone: null, height_cm: null, weight_kg: null
    });
});

test('rifiuta valori anagrafici non validi', () => {
    assert.throws(() => normalizePersonalData({ birth_date: '2030-01-01' }, '2026-11-14'), /tra il 1900 e oggi/);
    assert.throws(() => normalizePersonalData({ birth_date: '1980-02-30' }), /non è valida/);
    assert.throws(() => normalizePersonalData({ sex: 'x' }), /sesso/);
    assert.throws(() => normalizePersonalData({ height_cm: '17.5' }), /intero/);
    assert.throws(() => normalizePersonalData({ weight_kg: '300' }), /tra 25 e 250/);
    assert.throws(() => normalizePersonalData({ phone: 'abc' }), /telefono/);
});

test('calcola l’età alla data indicata', () => {
    assert.equal(ageOn('1980-11-15', '2026-11-14'), 45);
    assert.equal(ageOn('1980-11-14', '2026-11-14'), 46);
    assert.equal(ageOn(null), null);
});

test('salva solo i campi anagrafici sulla propria riga, senza toccare il ruolo', async () => {
    const calls = [];
    const query = {};
    ['update', 'eq', 'select'].forEach(method => {
        query[method] = (...args) => { calls.push([method, ...args]); return query; };
    });
    query.single = () => Promise.resolve({ data: { id: 'u1' }, error: null });
    const service = new AthleteProfileService({ from: table => { calls.push(['from', table]); return query; } });

    await service.save('u1', { full_name: 'Andrea', role: 'admin' });
    const update = calls.find(call => call[0] === 'update')[1];
    assert.equal(update.full_name, 'Andrea');
    assert.equal('role' in update, false);
    assert.deepEqual(calls.find(call => call[0] === 'eq'), ['eq', 'id', 'u1']);
});
