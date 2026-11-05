import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivitySnapshot, getMatchingSessions } from '../js/modules/activity-matching.js';

const sessions = [
    { id: 'run-1', scheduled_date: '2026-11-05', sport_type: 'run' },
    { id: 'trail-1', scheduled_date: '2026-11-05', sport_type: 'trail' },
    { id: 'swim-1', scheduled_date: '2026-11-05', sport_type: 'swim' },
    { id: 'other-day', scheduled_date: '2026-11-06', sport_type: 'run' },
    { id: 'already-linked', scheduled_date: '2026-11-05', sport_type: 'run', intervals_activity_id: 'activity-2' }
];

test('propone solo sedute dello stesso giorno e sport compatibile', () => {
    const activity = {
        id: 'activity-1',
        type: 'TrailRun',
        start_date_local: '2026-11-05T08:30:00'
    };

    assert.deepEqual(
        getMatchingSessions(activity, sessions).map(session => session.id),
        ['run-1', 'trail-1']
    );
});

test('non propone attività senza ID, data o sport riconosciuto', () => {
    assert.deepEqual(getMatchingSessions({ type: 'Ride', start_date_local: '2026-11-05' }, sessions), []);
    assert.deepEqual(getMatchingSessions({ id: 1, type: 'Run' }, sessions), []);
});

test('uno snapshot salva solo i dati dell’attività necessari alla scheda', () => {
    assert.deepEqual(createActivitySnapshot({
        id: 42,
        name: 'Corsa collinare',
        type: 'TrailRun',
        start_date_local: '2026-11-05T08:30:00',
        distance: 12500,
        moving_time: 4800,
        elapsed_time: 5100,
        description: 'informazione non necessaria'
    }), {
        id: '42',
        name: 'Corsa collinare',
        type: 'TrailRun',
        start_date_local: '2026-11-05T08:30:00',
        distance: 12500,
        moving_time: 4800,
        elapsed_time: 5100
    });
});
