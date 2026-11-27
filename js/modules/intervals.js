// js/modules/intervals.js - Servizio API Intervals.icu per Metriche e Attività
//
// Due modi di raggiungere Intervals.icu:
// - proxy (consigliato): la Edge Function Supabase "intervals-proxy" aggiunge la
//   chiave API lato server, quindi la chiave non arriva mai al browser;
// - diretto: il browser chiama Intervals.icu con la chiave. Resta come ripiego
//   finché la funzione non è distribuita, e per verificare una chiave appena digitata.
import { localDateKey } from '../core/date-utils.js';

const API_BASE_URL = 'https://intervals.icu/api/v1';
const REQUEST_TIMEOUT_MS = 30000;
// Intestazione che la funzione aggiunge a ogni risposta: "1" inoltrata, "error" errore proprio.
export const PROXY_HEADER = 'x-intervals-proxy';

export class IntervalsService {
    /**
     * @param {string} athleteId
     * @param {string|null} apiKey chiave in chiaro, solo per il modo diretto
     * @param {{ proxy?: { url: string, apikey?: string, getAccessToken: () => Promise<string|null> } }} [options]
     */
    constructor(athleteId, apiKey, { proxy = null } = {}) {
        // L'ID entra nel percorso dell'URL: va codificato.
        this.athleteId = encodeURIComponent(String(athleteId || 'me').trim());
        this.apiKey = apiKey || null;
        this.baseUrl = API_BASE_URL;
        this.proxy = proxy;
        this.useProxy = Boolean(proxy);
    }

    getAuthHeaders() {
        if (!this.apiKey) {
            throw new Error('Il collegamento sicuro a Intervals.icu non è attivo: distribuisci la funzione "intervals-proxy" (vedi README).');
        }
        let token;
        try {
            token = btoa(`API_KEY:${this.apiKey}`);
        } catch {
            throw new Error('La API Key di Intervals.icu contiene caratteri non validi: copiala di nuovo dal sito.');
        }
        return {
            'Authorization': `Basic ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async getWellness(oldest, newest) {
        return this.fetchCollection(
            `athlete/${this.athleteId}/wellness?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}`,
            'wellness'
        );
    }

    async getActivities(oldest, newest) {
        return this.fetchCollection(
            `athlete/${this.athleteId}/activities?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}`,
            'attività'
        );
    }

    // Stream di un'attività (time, distance, altitude, heartrate, ...).
    // Risposta: array di { type, data }.
    async getActivityStreams(activityId, types = []) {
        const query = types.length ? `?types=${types.map(encodeURIComponent).join(',')}` : '';
        return this.fetchCollection(
            `activity/${encodeURIComponent(activityId)}/streams.json${query}`,
            "stream dell'attività"
        );
    }

    // Giri e intervalli di un'attività: { icu_intervals: [...], icu_groups: [...] }.
    async getActivityIntervals(activityId) {
        const response = await this.request(`activity/${encodeURIComponent(activityId)}/intervals`, "giri dell'attività");
        const data = await response.json();
        return data && typeof data === 'object' ? data : {};
    }

    // Richiesta con tempo massimo e messaggi chiari per credenziali errate.
    // `path` è relativo all'API (es. "athlete/i1/wellness?...").
    async request(path, resourceName) {
        if (this.useProxy) {
            const response = await this.send(`${this.proxy.url}/${path}`, await this.proxyHeaders(), resourceName);
            const marker = response.headers?.get?.(PROXY_HEADER);
            // 404 senza intestazione: la funzione non è distribuita. Si ripiega sul
            // modo diretto solo se la chiave è disponibile nel browser.
            if (response.status === 404 && !marker && this.apiKey) {
                this.useProxy = false;
            } else if (marker === 'error' || (!marker && !response.ok)) {
                throw new Error(`Intervals.icu (${resourceName}): ${await proxyErrorMessage(response)}`);
            } else {
                return checkResponse(response, resourceName);
            }
        }
        const response = await this.send(`${this.baseUrl}/${path}`, this.getAuthHeaders(), resourceName);
        return checkResponse(response, resourceName);
    }

    async proxyHeaders() {
        const token = await this.proxy.getAccessToken();
        if (!token) throw new Error('Sessione scaduta: esci e accedi di nuovo.');
        return {
            'Authorization': `Bearer ${token}`,
            ...(this.proxy.apikey ? { apikey: this.proxy.apikey } : {})
        };
    }

    async send(url, headers, resourceName) {
        const options = { headers };
        if (typeof AbortSignal?.timeout === 'function') options.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, options);
        } catch (error) {
            if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
                throw new Error(`Intervals.icu (${resourceName}): nessuna risposta entro ${REQUEST_TIMEOUT_MS / 1000} secondi.`);
            }
            throw new Error(`Intervals.icu (${resourceName}): connessione non riuscita.`);
        }
    }

    async fetchCollection(path, resourceName) {
        const response = await this.request(path, resourceName);

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error(`Intervals.icu ha restituito un formato inatteso per ${resourceName}.`);
        }
        return data;
    }
}

function checkResponse(response, resourceName) {
    if (!response.ok) {
        const hint = response.status === 401 || response.status === 403
            ? ' Controlla Athlete ID e API Key.'
            : response.status === 429 ? ' Troppe richieste: riprova tra poco.' : '';
        throw new Error(`Intervals.icu (${resourceName}): risposta HTTP ${response.status}.${hint}`);
    }
    return response;
}

async function proxyErrorMessage(response) {
    try {
        const body = await response.json();
        if (body && typeof body.error === 'string') return body.error;
    } catch {
        // Corpo non JSON: si usa il codice HTTP.
    }
    return `collegamento sicuro non riuscito (HTTP ${response.status}).`;
}

// Intervals.icu identifica il record wellness con la data in `id`;
// `date` resta supportato per compatibilità con dati già normalizzati.
function wellnessDate(record) {
    return String(record.date ?? record.id ?? '');
}

function wellnessLoad(record) {
    return readNumber(record.load) ?? readNumber(record.ctlLoad);
}

export function getLastSevenDaysRange(referenceDate = new Date()) {
    const newest = new Date(referenceDate);
    const oldest = new Date(referenceDate);
    oldest.setDate(oldest.getDate() - 6);

    return {
        oldest: localDateKey(oldest),
        newest: localDateKey(newest)
    };
}

export function summarizeIntervalsData(wellness, activities) {
    const records = Array.isArray(wellness) ? wellness.filter(isRecord) : [];
    const latestWellness = records
        .slice()
        .sort((left, right) => wellnessDate(left).localeCompare(wellnessDate(right)))
        .reverse()
        .find(record => readNumber(record.ctl) !== null
            || readNumber(record.atl) !== null
            || wellnessLoad(record) !== null);

    const ctl = readNumber(latestWellness?.ctl);
    const atl = readNumber(latestWellness?.atl);
    const explicitTsb = readNumber(latestWellness?.tsb);
    const load = latestWellness ? wellnessLoad(latestWellness) : null;
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

