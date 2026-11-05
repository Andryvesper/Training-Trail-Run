import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assessRaceCompatibility,
    normalizeSecondaryRaceIntents
} from '../js/modules/training-race-compatibility.js';

const primaryUltra = {
    id: 'ultra-100',
    name: '100 km',
    event_date: '2027-06-15',
    distance_km: 100
};

const marathon = {
    id: 'marathon',
    name: 'Maratona',
    event_date: '2027-06-01',
    distance_km: 42.195
};

test('segnala con priorità alta maratona con obiettivo di tempo 14 giorni prima di una 100 km', () => {
    const [advisory] = assessRaceCompatibility(primaryUltra, [marathon], {
        marathon: 'time_goal'
    });

    assert.equal(advisory.status, 'high');
    assert.equal(advisory.days_before_primary, 14);
    assert.ok(advisory.messages.some(message => message.includes('obiettivo di tempo')));
    assert.ok(advisory.messages.some(message => message.includes('rinunciare')));
    assert.ok(advisory.messages.some(message => message.includes('non posso ricavare un passo')));
});

test('senza obiettivo di prestazione non inventa un passo e invita a riconsiderare la gara', () => {
    const [advisory] = assessRaceCompatibility(primaryUltra, [marathon], {
        marathon: 'undecided'
    });

    assert.equal(advisory.status, 'high');
    assert.ok(advisory.messages.some(message => message.includes('un passo sicuro non è deducibile')));
    assert.ok(advisory.messages.some(message => message.includes('non partecipare')));
});

test('chiede di definire l’intento quando la gara non presenta un conflitto ravvicinato evidente', () => {
    const [advisory] = assessRaceCompatibility({
        ...primaryUltra,
        event_date: '2027-08-01'
    }, [{
        ...marathon,
        event_date: '2027-06-01'
    }]);

    assert.equal(advisory.days_before_primary, 61);
    assert.equal(advisory.status, 'intent_needed');
    assert.ok(advisory.messages.some(message => message.toLowerCase().includes('non viene dedotto un passo')));
});

test('se le date sono indicative l’avviso dichiara i dati insufficienti', () => {
    const [advisory] = assessRaceCompatibility({
        ...primaryUltra,
        event_date: null
    }, [{
        ...marathon,
        event_date: null,
        target_period: 'giugno'
    }]);

    assert.equal(advisory.status, 'insufficient_data');
    assert.equal(advisory.days_before_primary, null);
});

test('se due gare sono nello stesso giorno chiede di sceglierne una', () => {
    const [advisory] = assessRaceCompatibility(primaryUltra, [{
        ...marathon,
        event_date: primaryUltra.event_date
    }]);

    assert.equal(advisory.status, 'same_day_conflict');
    assert.ok(advisory.messages.some(message => message.includes('non è possibile partecipare a entrambe')));
});

test('normalizza le intenzioni solo per gare selezionate e rifiuta valori non validi', () => {
    assert.deepEqual(normalizeSecondaryRaceIntents({ marathon: 'time_goal', ignored: 'social' }, ['marathon']), {
        marathon: 'time_goal'
    });
    assert.throws(
        () => normalizeSecondaryRaceIntents({ marathon: 'all_out' }, ['marathon']),
        /non è valido/
    );
});
