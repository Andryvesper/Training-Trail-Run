import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainingCalendarService } from '../js/modules/calendar.js';

test('genera sei settimane consecutive con regole coerenti al giorno', () => {
    const weeks = new TrainingCalendarService().generateMultiWeekPlan(
        new Date(2026, 2, 8, 12),
        1,
        4
    );

    assert.equal(weeks.length, 6);
    assert.equal(weeks.filter(week => week.isCurrent).length, 1);
    weeks.forEach(week => {
        assert.equal(week.days.length, 7);
        week.days.forEach(day => {
            assert.equal(new Date(`${day.date}T12:00:00`).getDay(), day.dayOfWeek);
            assert.deepEqual(day.plannedSessions, []);
        });
    });
    assert.equal(weeks[1].days[0].rule.type, 'FIXED_SESSION');
});

test('mantiene le date calendario locali senza spostarle al giorno precedente', () => {
    const weeks = new TrainingCalendarService().generateMultiWeekPlan(
        new Date(2026, 0, 7, 23, 30),
        0,
        0
    );
    const dates = weeks[0].days.map(day => day.date);

    assert.deepEqual(dates, [
        '2026-01-05',
        '2026-01-06',
        '2026-01-07',
        '2026-01-08',
        '2026-01-09',
        '2026-01-10',
        '2026-01-11'
    ]);
});
