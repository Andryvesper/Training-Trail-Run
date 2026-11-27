// Statistiche della dashboard calcolate dai dati Intervals.icu e dai
// risultati di gara registrati nell'app. Funzioni pure: nessuna chiamata
// di rete, nessun accesso al DOM.
import { addDays, mondayOf } from '../core/date-utils.js';
export { addDays, mondayOf };

export const RECORD_DISTANCES = Object.freeze([
    Object.freeze({ key: '5k', label: '5 km', meters: 5000 }),
    Object.freeze({ key: '10k', label: '10 km', meters: 10000 }),
    Object.freeze({ key: 'half', label: 'Mezza maratona', meters: 21097.5 }),
    Object.freeze({ key: 'marathon', label: 'Maratona', meters: 42195 })
]);

// Un'attività vale per un record solo se copre l'intera distanza: da -1%
// (tolleranza GPS) a +4% (percorsi gara misurati con traiettoria reale).
// Il tempo non viene mai estrapolato da attività più lunghe o più corte.
const RECORD_MIN_RATIO = 0.99;
const RECORD_MAX_RATIO = 1.04;

export const WELLNESS_FIELDS = Object.freeze([
    Object.freeze({ key: 'restingHR', label: 'FC a riposo', unit: 'bpm', decimals: 0 }),
    Object.freeze({ key: 'hrv', label: 'HRV (rMSSD)', unit: 'ms', decimals: 0 }),
    Object.freeze({ key: 'weight', label: 'Peso', unit: 'kg', decimals: 1 }),
    Object.freeze({ key: 'sleepHours', label: 'Sonno', unit: 'h', decimals: 1 }),
    Object.freeze({ key: 'vo2max', label: 'VO2max stimato', unit: 'ml/kg/min', decimals: 1 }),
    Object.freeze({ key: 'steps', label: 'Passi', unit: '', decimals: 0 })
]);

export function normalizeActivity(activity) {
    if (!activity || typeof activity !== 'object') return null;
    const date = typeof activity.start_date_local === 'string' ? activity.start_date_local.slice(0, 10) : null;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const type = String(activity.type || '').toLowerCase();
    return {
        id: activity.id ?? null,
        date,
        name: activity.name || activity.type || 'Attività',
        type,
        sport: classifySport(type),
        distanceM: positive(activity.distance),
        movingS: positive(activity.moving_time),
        elapsedS: positive(activity.elapsed_time),
        elevationM: nonNegative(activity.total_elevation_gain),
        averageHr: positive(activity.average_heartrate),
        load: nonNegative(activity.icu_training_load)
    };
}

export function normalizeActivities(activities) {
    return (Array.isArray(activities) ? activities : [])
        .map(normalizeActivity)
        .filter(Boolean)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function classifySport(type) {
    if (type.includes('swim')) return 'swim';
    if (type.includes('run') || type.includes('trail')) return 'run';
    if (type.includes('ride') || type.includes('bike') || type.includes('cycl')) return 'ride';
    return 'other';
}

export function summarizePeriod(activities, fromDate, toDate) {
    const inRange = activities.filter(activity => activity.date >= fromDate && activity.date <= toDate);
    const runs = inRange.filter(activity => activity.sport === 'run');
    const swims = inRange.filter(activity => activity.sport === 'swim');
    const timedRuns = runs.filter(activity => activity.distanceM && (activity.movingS || activity.elapsedS));
    const timedDistance = sum(timedRuns, activity => activity.distanceM);
    const timedSeconds = sum(timedRuns, activity => activity.movingS || activity.elapsedS);
    return {
        fromDate,
        toDate,
        totalCount: inRange.length,
        totalSeconds: sum(inRange, activity => activity.movingS || activity.elapsedS || 0),
        run: {
            count: runs.length,
            km: sum(runs, activity => activity.distanceM || 0) / 1000,
            seconds: sum(runs, activity => activity.movingS || activity.elapsedS || 0),
            elevationM: sum(runs, activity => activity.elevationM || 0),
            longestKm: runs.reduce((max, activity) => Math.max(max, (activity.distanceM || 0) / 1000), 0),
            averagePaceSecondsPerKm: timedDistance > 0 ? timedSeconds / (timedDistance / 1000) : null
        },
        swim: {
            count: swims.length,
            meters: sum(swims, activity => activity.distanceM || 0),
            seconds: sum(swims, activity => activity.movingS || activity.elapsedS || 0)
        },
        otherCount: inRange.length - runs.length - swims.length
    };
}

export function weeklyVolumes(activities, weeks, today) {
    const currentWeekStart = mondayOf(today);
    const buckets = Array.from({ length: weeks }, (_, index) => ({
        weekStart: addDays(currentWeekStart, -7 * (weeks - 1 - index)),
        runKm: 0,
        runCount: 0,
        runElevationM: 0,
        swimMeters: 0,
        swimCount: 0,
        hours: 0
    }));
    const byStart = new Map(buckets.map(bucket => [bucket.weekStart, bucket]));
    activities.forEach(activity => {
        const bucket = byStart.get(mondayOf(activity.date));
        if (!bucket) return;
        bucket.hours += (activity.movingS || activity.elapsedS || 0) / 3600;
        if (activity.sport === 'run') {
            bucket.runKm += (activity.distanceM || 0) / 1000;
            bucket.runElevationM += activity.elevationM || 0;
            bucket.runCount += 1;
        } else if (activity.sport === 'swim') {
            bucket.swimMeters += activity.distanceM || 0;
            bucket.swimCount += 1;
        }
    });
    return buckets.map(bucket => ({
        ...bucket,
        runKm: round1(bucket.runKm),
        runElevationM: Math.round(bucket.runElevationM),
        hours: round1(bucket.hours)
    }));
}

export function computeRecords(activities, races = []) {
    const runs = activities.filter(activity => activity.sport === 'run');
    const records = RECORD_DISTANCES.map(target => {
        const candidates = [];
        races
            .filter(race => race?.status === 'completed')
            .forEach(race => {
                const meters = Number(race.distance_km) * 1000;
                const seconds = positive(race.chip_time_seconds) ?? positive(race.official_time_seconds);
                if (!seconds || !coversDistance(meters, target.meters)) return;
                candidates.push({
                    seconds,
                    date: race.event_date,
                    name: race.name,
                    source: 'race',
                    sourceLabel: race.chip_time_seconds ? 'gara, tempo chip' : 'gara, tempo ufficiale'
                });
            });
        runs.forEach(activity => {
            const seconds = activity.elapsedS ?? activity.movingS;
            if (!seconds || !coversDistance(activity.distanceM, target.meters)) return;
            candidates.push({
                seconds,
                date: activity.date,
                name: activity.name,
                source: 'activity',
                sourceLabel: activity.elapsedS ? 'Intervals, tempo totale' : 'Intervals, tempo in movimento'
            });
        });
        const best = candidates.reduce((winner, candidate) =>
            !winner || candidate.seconds < winner.seconds ? candidate : winner, null);
        return {
            key: target.key,
            label: target.label,
            meters: target.meters,
            best,
            paceSecondsPerKm: best ? best.seconds / (target.meters / 1000) : null,
            attempts: candidates.length
        };
    });

    const longest = runs.reduce((winner, activity) =>
        (activity.distanceM || 0) > (winner?.distanceM || 0) ? activity : winner, null);
    return {
        distances: records,
        longestRun: longest?.distanceM
            ? { km: longest.distanceM / 1000, date: longest.date, name: longest.name, seconds: longest.movingS || longest.elapsedS }
            : null
    };
}

function coversDistance(meters, target) {
    return Number.isFinite(meters) && meters >= target * RECORD_MIN_RATIO && meters <= target * RECORD_MAX_RATIO;
}

export function wellnessSeries(wellness, fromDate) {
    const records = (Array.isArray(wellness) ? wellness : [])
        .filter(record => record && typeof record === 'object')
        .map(record => ({ ...record, date: String(record.date ?? record.id ?? '').slice(0, 10) }))
        .filter(record => /^\d{4}-\d{2}-\d{2}$/.test(record.date) && record.date >= fromDate)
        .sort((left, right) => left.date.localeCompare(right.date));
    const dates = records.map(record => record.date);
    const read = key => records.map(record => {
        if (key === 'sleepHours') {
            const seconds = positive(record.sleepSecs);
            return seconds === null ? null : round1(seconds / 3600);
        }
        if (key === 'tsb') {
            const ctl = finite(record.ctl);
            const atl = finite(record.atl);
            return ctl === null || atl === null ? null : round1(ctl - atl);
        }
        return finite(record[key]);
    });
    const series = {
        ctl: read('ctl'),
        atl: read('atl'),
        tsb: read('tsb')
    };
    WELLNESS_FIELDS.forEach(field => { series[field.key] = read(field.key); });
    const available = Object.fromEntries(Object.entries(series)
        .map(([key, values]) => [key, values.filter(value => value !== null).length >= 2]));
    return { dates, series, available };
}

function sum(items, pick) {
    return items.reduce((total, item) => total + pick(item), 0);
}

function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function positive(value) {
    const number = finite(value);
    return number !== null && number > 0 ? number : null;
}

function nonNegative(value) {
    const number = finite(value);
    return number !== null && number >= 0 ? number : null;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}
