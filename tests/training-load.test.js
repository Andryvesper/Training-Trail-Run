import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compareMetric,
    comparePlannedVsDone,
    describeIncreases,
    doneActivityMetrics,
    doneLoadEntries,
    formatDeltaElevation,
    formatDeltaKm,
    formatDeltaMinutes,
    formatDeltaPace,
    LOAD_RULE_LABEL,
    loadIncreaseWarnings,
    parsePlannedElevation,
    plannedLoadEntries,
    plannedSessionMetrics,
    recentDoneLoad,
    recentWeekStarts,
    weeklyAdherence,
    weeklyLoad
} from '../js/modules/training-load.js';
import { normalizeActivities } from '../js/modules/dashboard-stats.js';

test('legge il D+ scritto dal motore nelle note', () => {
    const notes =
        "Lungo collinare.\nDislivello da inserire nella traccia: circa 650 m D+ (gara 40 m/km); a 600 m/h sono circa 1 h 05' di salita.";
    assert.equal(parsePlannedElevation(notes), 650);
});

test('il parser del D+ è tollerante ai formati comuni', () => {
    assert.equal(parsePlannedElevation('1.200 m D+'), 1200);
    assert.equal(parsePlannedElevation('1200m D+ su sterrato'), 1200);
    assert.equal(parsePlannedElevation('D+ 800 m'), 800);
    assert.equal(parsePlannedElevation('d+: circa 450'), 450);
    assert.equal(parsePlannedElevation('D+300'), 300);
    assert.equal(parsePlannedElevation('dislivello positivo di 900 metri'), 900);
    assert.equal(parsePlannedElevation('500 metri di D+'), 500);
});

test('senza D+ nelle note restituisce null', () => {
    assert.equal(parsePlannedElevation('Percorso pianeggiante o ondulato (seduta infrasettimanale o di qualità).'), null);
    assert.equal(parsePlannedElevation('4 x 1000 m a ritmo 10 km'), null);
    assert.equal(parsePlannedElevation('pendenza 40 m/km'), null);
    assert.equal(parsePlannedElevation(''), null);
    assert.equal(parsePlannedElevation(null), null);
});

test('metriche pianificate: tempo da durata o da km e passo', () => {
    assert.deepEqual(plannedSessionMetrics({ distance_km: 10, target_pace_seconds_per_km: 300, notes: 'circa 200 m D+' }), {
        km: 10,
        elevationM: 200,
        seconds: 3000,
        paceSecondsPerKm: 300
    });
    const fromDuration = plannedSessionMetrics({ distance_km: 12, duration_minutes: 60 });
    assert.equal(fromDuration.seconds, 3600);
    assert.equal(fromDuration.paceSecondsPerKm, 300);
    assert.equal(fromDuration.elevationM, null);
});

test('metriche svolte: snapshot completato con l’attività Intervals', () => {
    const snapshot = { distance: 15000, moving_time: 5400, elapsed_time: 5600 };
    const live = { total_elevation_gain: 720 };
    assert.deepEqual(doneActivityMetrics(snapshot, live), { km: 15, elevationM: 720, seconds: 5400, paceSecondsPerKm: 360 });
    assert.equal(doneActivityMetrics({ average_speed: 4 }).paceSecondsPerKm, 250);
});

test('confronto con tolleranza del 10%', () => {
    assert.equal(compareMetric(10, 10.9).status, 'in_linea');
    assert.equal(compareMetric(10, 11.2).status, 'sopra');
    assert.equal(compareMetric(10, 8.5).status, 'sotto');
    assert.equal(compareMetric(null, 8).status, null);
    assert.equal(compareMetric(300, 340, { lowerIsFaster: true }).status, 'piu_lento');
    assert.equal(compareMetric(300, 260, { lowerIsFaster: true }).status, 'piu_veloce');
});

test('confronto completo pianificato/svolto', () => {
    const session = { distance_km: 22, duration_minutes: 120, notes: 'circa 600 m D+' };
    const activity = { distance: 24100, moving_time: 7500, total_elevation_gain: 300 };
    const result = comparePlannedVsDone(session, activity);
    assert.equal(result.status, 'in_linea');
    assert.equal(formatDeltaKm(result.km.delta), '+2,1 km');
    assert.equal(result.elevationM.status, 'sotto');
    assert.equal(formatDeltaElevation(result.elevationM.delta), '-300 m D+');
    assert.equal(formatDeltaMinutes(result.seconds.delta), '+5 min');
});

test('senza D+ pianificato mostra solo lo svolto', () => {
    const result = comparePlannedVsDone({ distance_km: 10 }, { distance: 10000, total_elevation_gain: 150 });
    assert.equal(result.elevationM.planned, null);
    assert.equal(result.elevationM.done, 150);
    assert.equal(result.elevationM.status, null);
});

test('formattazione dei delta', () => {
    assert.equal(formatDeltaKm(-0.04), '±0,0 km');
    assert.equal(formatDeltaPace(12), '+0:12 /km');
    assert.equal(formatDeltaPace(-75), '-1:15 /km');
});

test('carico settimanale con settimane vuote intermedie', () => {
    const weeks = weeklyLoad([
        { date: '2026-11-02', km: 10, elevationM: 100, seconds: 3600 },
        { date: '2026-11-04', km: 5, elevationM: 50, seconds: 1800 },
        { date: '2026-11-18', km: 12, elevationM: 0, seconds: 4000 }
    ]);
    assert.deepEqual(
        weeks.map(week => week.weekStart),
        ['2026-11-02', '2026-11-09', '2026-11-16']
    );
    assert.equal(weeks[0].km, 15);
    assert.equal(weeks[0].elevationM, 150);
    assert.equal(weeks[1].count, 0);
});

test('avviso oltre +10% sulla settimana precedente', () => {
    const warnings = loadIncreaseWarnings([
        { weekStart: '2026-11-02', km: 40, elevationM: 500, seconds: 14400 },
        { weekStart: '2026-11-09', km: 44, elevationM: 600, seconds: 14400 },
        { weekStart: '2026-11-16', km: 0, elevationM: 0, seconds: 0 },
        { weekStart: '2026-11-23', km: 30, elevationM: 0, seconds: 9000 }
    ]);
    assert.equal(warnings[0].warning, false);
    assert.equal(warnings[1].warning, true);
    assert.deepEqual(
        warnings[1].increases.map(item => item.metric),
        ['elevationM']
    );
    assert.equal(describeIncreases(warnings[1].increases), 'D+ +20%');
    assert.equal(warnings[3].warning, false, 'dopo una settimana vuota non si confronta');
    assert.equal(LOAD_RULE_LABEL, 'regola generale di prudenza, non dal libro');
});

test('carico pianificato considera solo corsa e trail', () => {
    const entries = plannedLoadEntries([
        { scheduled_date: '2026-11-16', sport_type: 'run', distance_km: 10, target_pace_seconds_per_km: 330 },
        { scheduled_date: '2026-11-17', sport_type: 'trail', distance_km: 15, duration_minutes: 120, notes: 'circa 700 m D+' },
        { scheduled_date: '2026-11-18', sport_type: 'swim', distance_km: 2, duration_minutes: 45 }
    ]);
    assert.equal(entries.length, 2);
    const [week] = weeklyLoad(entries);
    assert.equal(week.km, 25);
    assert.equal(week.elevationM, 700);
    assert.equal(week.seconds, 3300 + 7200);
});

test('carico svolto dalle attività normalizzate', () => {
    const activities = normalizeActivities([
        { id: 1, start_date_local: '2026-11-02T07:00:00', type: 'TrailRun', distance: 14000, moving_time: 5400, total_elevation_gain: 600 },
        { id: 2, start_date_local: '2026-11-03T07:00:00', type: 'Ride', distance: 40000, moving_time: 5400 }
    ]);
    const entries = doneLoadEntries(activities);
    assert.deepEqual(entries, [{ date: '2026-11-02', km: 14, elevationM: 600, seconds: 5400 }]);
});

test('aderenza settimanale: sedute, km e D+', () => {
    const sessions = [
        {
            scheduled_date: '2026-11-02',
            sport_type: 'run',
            distance_km: 10,
            notes: null,
            completed_at: '2026-11-02T10:00:00Z',
            intervals_activity_id: 'a1',
            completed_activity: { id: 'a1', distance: 9500 }
        },
        {
            scheduled_date: '2026-11-07',
            sport_type: 'trail',
            distance_km: 20,
            notes: 'circa 800 m D+',
            completed_at: '2026-11-07T10:00:00Z',
            intervals_activity_id: 'a2',
            completed_activity: { id: 'a2', distance: 21000, total_elevation_gain: 750 }
        },
        { scheduled_date: '2026-11-05', sport_type: 'run', distance_km: 8 },
        { scheduled_date: '2026-11-10', sport_type: 'run', distance_km: 6 }
    ];
    const byId = new Map([['a1', { total_elevation_gain: 40 }]]);
    const [week, next] = weeklyAdherence(sessions, ['2026-11-02', '2026-11-09'], byId);
    assert.equal(week.plannedCount, 3);
    assert.equal(week.doneCount, 2);
    assert.equal(week.plannedKm, 38);
    assert.equal(week.doneKm, 30.5);
    assert.equal(week.plannedElevationM, 800);
    assert.equal(week.doneElevationM, 790);
    assert.equal(next.plannedCount, 1);
    assert.equal(next.doneCount, 0);
});

test('carico svolto recente: la prima settimana mostrata è confrontata con la precedente', () => {
    const activities = normalizeActivities([
        { id: 1, start_date_local: '2026-10-28T07:00:00', type: 'Run', distance: 20000, moving_time: 6000 },
        { id: 2, start_date_local: '2026-11-03T07:00:00', type: 'Run', distance: 25000, moving_time: 7500, total_elevation_gain: 300 },
        { id: 3, start_date_local: '2026-11-12T07:00:00', type: 'Run', distance: 10000, moving_time: 3000 }
    ]);
    const weeks = recentDoneLoad(activities, '2026-11-14', 2);
    assert.deepEqual(
        weeks.map(week => week.weekStart),
        ['2026-11-02', '2026-11-09']
    );
    assert.equal(weeks[0].warning, true);
    assert.deepEqual(
        weeks[0].increases.map(item => item.metric),
        ['km', 'seconds']
    );
    assert.equal(weeks[1].warning, false);
    assert.deepEqual(recentDoneLoad(activities, 'oggi'), []);
});

test('settimane recenti per l’aderenza', () => {
    assert.deepEqual(recentWeekStarts('2026-11-14', 4), ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
});

test('il D+ non viene letto dal tempo verticale ne dalle ripetute', async () => {
    const { parsePlannedElevation } = await import('../js/modules/training-load.js');
    assert.equal(parsePlannedElevation("Salite a sforzo: tempo verticale 12' ogni 100 m D+ (500 m/h)."), null);
    assert.equal(parsePlannedElevation("circa 800 m D+ e 700 m D-, 12' ogni 100 m D+"), 800);
    assert.equal(parsePlannedElevation('10 x 400 m D+ 20 m'), 20);
});
