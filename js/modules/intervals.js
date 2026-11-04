// js/modules/intervals.js - Servizio API Intervals.icu per Metriche e Attività

export class IntervalsService {
    constructor(athleteId, apiKey) {
        this.athleteId = athleteId || 'me';
        this.apiKey = apiKey;
        this.baseUrl = 'https://intervals.icu/api/v1';
    }

    getAuthHeaders() {
        const token = btoa(`API_KEY:${this.apiKey}`);
        return {
            'Authorization': `Basic ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async getWellness(oldest, newest) {
        return this.fetchCollection(
            `${this.baseUrl}/athlete/${this.athleteId}/wellness?oldest=${oldest}&newest=${newest}`,
            'wellness'
        );
    }

    async getActivities(oldest, newest) {
        return this.fetchCollection(
            `${this.baseUrl}/athlete/${this.athleteId}/activities?oldest=${oldest}&newest=${newest}`,
            'attività'
        );
    }

    async fetchCollection(url, resourceName) {
        const response = await fetch(url, { headers: this.getAuthHeaders() });
        if (!response.ok) {
            throw new Error(`Intervals.icu (${resourceName}): risposta HTTP ${response.status}.`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error(`Intervals.icu ha restituito un formato inatteso per ${resourceName}.`);
        }
        return data;
    }
}

export function getLastSevenDaysRange(referenceDate = new Date()) {
    const newest = new Date(referenceDate);
    const oldest = new Date(referenceDate);
    oldest.setDate(oldest.getDate() - 6);

    return {
        oldest: formatDateKey(oldest),
        newest: formatDateKey(newest)
    };
}

export function summarizeIntervalsData(wellness, activities) {
    const records = Array.isArray(wellness) ? wellness.filter(isRecord) : [];
    const latestWellness = records
        .slice()
        .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
        .reverse()
        .find(record => ['ctl', 'atl', 'load'].some(key => readNumber(record[key]) !== null));

    const ctl = readNumber(latestWellness?.ctl);
    const atl = readNumber(latestWellness?.atl);
    const explicitTsb = readNumber(latestWellness?.tsb);
    const load = readNumber(latestWellness?.load);
    const activityRecords = Array.isArray(activities) ? activities.filter(isRecord) : [];
    const runActivities = activityRecords.filter(activity => isRunActivity(activity));
    const swimActivities = activityRecords.filter(activity => isSwimActivity(activity));
    const runDistances = runActivities.map(activity => readNumber(activity.distance)).filter(value => value !== null);
    const swimDistances = swimActivities.map(activity => readNumber(activity.distance)).filter(value => value !== null);
    const runBreakdown = runActivities.map(activity => ({
        date: typeof activity.start_date_local === 'string'
            ? activity.start_date_local.slice(0, 10)
            : null,
        name: activity.name || activity.type || 'Corsa',
        type: activityType(activity),
        distanceKm: readNumber(activity.distance) === null
            ? null
            : readNumber(activity.distance) / 1000
    }));
    const timedRunActivities = runActivities
        .map(activity => ({
            distance: readNumber(activity.distance),
            time: readNumber(activity.moving_time) ?? readNumber(activity.elapsed_time)
        }))
        .filter(activity => activity.distance > 0 && activity.time > 0);
    const totalRunDistance = timedRunActivities.reduce((sum, activity) => sum + activity.distance, 0);
    const totalRunTime = timedRunActivities.reduce((sum, activity) => sum + activity.time, 0);

    return {
        metrics: {
            ctl,
            atl,
            tsb: explicitTsb ?? (ctl !== null && atl !== null ? ctl - atl : null),
            load
        },
        activities: {
            count: activityRecords.length,
            runKm: runDistances.length
                ? runDistances.reduce((sum, distance) => sum + distance, 0) / 1000
                : null,
            runBreakdown,
            swimMeters: swimDistances.length
                ? swimDistances.reduce((sum, distance) => sum + distance, 0)
                : null,
            averageRunPaceSecondsPerKm: totalRunDistance > 0
                ? totalRunTime / (totalRunDistance / 1000)
                : null
        }
    };
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function activityType(activity) {
    return String(activity.type || activity.sport_settings?.type || '').toLowerCase();
}

function isRunActivity(activity) {
    const type = activityType(activity);
    return type.includes('run') || type.includes('trail');
}

function isSwimActivity(activity) {
    const type = activityType(activity);
    return type.includes('swim') || type.includes('nuoto');
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
