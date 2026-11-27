import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAIL_CYCLE_TRANSCRIPTIONS, TRAIL_TRANSCRIPTION_STATUS } from '../js/modules/training-trail-transcriptions.js';

test('le tabelle trail e ultra sono trascritte per intero e restano da approvare', () => {
    assert.equal(TRAIL_TRANSCRIPTION_STATUS.reviewStatus, 'awaiting_athlete_review');
    const expected = { ultra_100km_passatore: 15, ultra_pistoia_abetone: 8, trail_15_50km: 4, ultra_100km_evoluto: 12 };
    Object.entries(expected).forEach(([id, weeks]) => {
        const table = TRAIL_CYCLE_TRANSCRIPTIONS[id];
        assert.equal(table.weeks.length, weeks, id);
        table.weeks.forEach(week =>
            assert.deepEqual(
                week.days.map(day => day.day),
                [1, 2, 3, 4, 5, 6, 7]
            )
        );
    });
    assert.equal(TRAIL_CYCLE_TRANSCRIPTIONS.ultra_100km_passatore.weeks[0].days[3].raw, '5x 1 km / CRLI rec. / 1 x 1 km / CRF');
    assert.equal(TRAIL_CYCLE_TRANSCRIPTIONS.ultra_100km_evoluto.weeks.at(-1).days[6].raw.includes('100 km'), true);
});
