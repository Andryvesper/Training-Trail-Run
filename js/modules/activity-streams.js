// Stream delle attività Intervals.icu: nomi, normalizzazione e campioni
// pronti per l'analisi (velocità, tratti in movimento, altitudine smussata,
// pendenza). Funzioni pure: nessuna chiamata di rete, nessun accesso al DOM.

import { PERFORMANCE_CONFIG } from './performance-config.js';

/**
 * @typedef {Object} ActivitySamples
 * @property {number} n
 * @property {number[]} time Secondi dall'inizio.
 * @property {(number|null)[]} distance Metri.
 * @property {(number|null)[]} altitude Metri, smussata.
 * @property {number[]} speed m/s.
 * @property {number[]} dt Secondi pesati solo se in movimento.
 * @property {number[]} movingTime Tempo in movimento cumulato (s).
 * @property {number[]} grade Pendenza (frazione, 0.1 = 10%).
 * @property {(number|null)[]} heartrate
 * @property {(number|null)[]} watts
 * @property {(number|null)[]} cadence
 * @property {(number|null)[]} gct Ground contact time.
 * @property {(number|null)[]} verticalOscillation
 * @property {(number|null)[]} verticalRatio
 * @property {Record<string, boolean>} has
 */

// Nomi possibili per ogni stream. Intervals usa nomi in minuscolo con
// trattino basso; le dinamiche di corsa Garmin non sono documentate, quindi
// si accettano più varianti (confronto senza maiuscole, spazi e trattini).
export const STREAM_ALIASES = Object.freeze({
    time: ['time'],
    distance: ['distance'],
    altitude: ['fixed_altitude', 'altitude', 'enhanced_altitude'],
    heartrate: ['heartrate', 'heart_rate'],
    velocity: ['velocity_smooth', 'speed', 'enhanced_speed'],
    watts: ['watts', 'power'],
    cadence: ['cadence'],
    gct: ['stance_time', 'ground_contact_time', 'groundcontacttime', 'gct', 'stance_time_ms'],
    verticalOscillation: ['vertical_oscillation', 'verticaloscillation', 'vert_oscillation'],
    verticalRatio: ['vertical_ratio', 'verticalratio']
});

const canonical = name =>
    String(name ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const ALIAS_LOOKUP = new Map(Object.entries(STREAM_ALIASES).flatMap(([key, names]) => names.map(name => [canonical(name), key])));

export function streamKeyFor(type) {
    return ALIAS_LOOKUP.get(canonical(type)) || null;
}

// Tipi da chiedere a Intervals. Se l'attività dichiara `stream_types`,
// si chiedono solo quelli presenti; altrimenti tutti i nomi noti.
export function requestedStreamTypes(activity) {
    const declared = Array.isArray(activity?.stream_types) ? activity.stream_types : null;
    if (declared?.length) {
        return [...new Set(declared.filter(type => streamKeyFor(type)))];
    }
    return [...new Set(Object.values(STREAM_ALIASES).flat())];
}

// Tipi per il dettaglio attività: quelli dell'analisi più il percorso GPS
// (`latlng`), che serve solo alla mappa e non entra nell'analisi.
export function detailStreamTypes(activity) {
    const declared = Array.isArray(activity?.stream_types) ? activity.stream_types : null;
    const types = requestedStreamTypes(activity);
    return !declared?.length || declared.includes('latlng') ? [...types, 'latlng'] : types;
}

/**
 * Percorso GPS dallo stream `latlng` di Intervals.icu. Accetta coppie
 * [lat, lon] in `data` oppure latitudini in `data` e longitudini in `data2`.
 * Scarta i punti senza segnale (null, fuori scala o 0,0).
 * @returns {[number, number][]}
 */
export function latLngTrack(raw) {
    const item = Array.isArray(raw) ? raw.find(entry => canonical(entry?.type ?? entry?.name) === 'latlng') : null;
    const data = Array.isArray(item?.data) ? item.data : Array.isArray(raw?.latlng) ? raw.latlng : null;
    if (!data) return [];
    const longitudes = Array.isArray(item?.data2) ? item.data2 : null;
    const points = [];
    data.forEach((value, index) => {
        const [lat, lon] = longitudes ? [value, longitudes[index]] : Array.isArray(value) ? value : [null, null];
        const point = [readNumber(lat), readNumber(lon)];
        if (isValidLatLng(point)) points.push(point);
    });
    return points;
}

function isValidLatLng([lat, lon]) {
    return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
}

/**
 * Accetta la risposta di /activity/{id}/streams.json (array di
 * { type, data }) oppure un oggetto { tipo: valori }.
 * @returns {{ series: Record<string, (number|null)[]>, rawTypes: string[], length: number }}
 */
export function normalizeStreams(raw) {
    const entries = Array.isArray(raw)
        ? raw.filter(item => item && typeof item === 'object').map(item => [item.type ?? item.name, item.data])
        : raw && typeof raw === 'object'
          ? Object.entries(raw)
          : [];
    const series = {};
    const rawTypes = [];
    entries.forEach(([type, data]) => {
        if (!Array.isArray(data)) return;
        rawTypes.push(String(type));
        const key = streamKeyFor(type);
        if (!key) return;
        const priority = STREAM_ALIASES[key].findIndex(name => canonical(name) === canonical(type));
        if (series[key] && series[key].priority <= priority) return;
        series[key] = { priority, values: data.map(readNumber) };
    });
    const flat = Object.fromEntries(Object.entries(series).map(([key, item]) => [key, item.values]));
    const length = flat.time?.length ?? 0;
    return { series: flat, rawTypes, length };
}

/**
 * Campioni pronti per l'analisi. Restituisce null se mancano tempo o
 * distanza/velocità (nuoto in vasca, attività manuali).
 * @returns {ActivitySamples|null}
 */
export function buildSamples(streams, config = PERFORMANCE_CONFIG) {
    const { series } = streams?.series ? streams : normalizeStreams(streams);
    const time = series.time;
    if (!Array.isArray(time) || time.length < 2) return null;
    const n = time.length;
    const pick = key => (Array.isArray(series[key]) && series[key].length === n ? series[key] : null);
    let distance = pick('distance');
    const velocity = pick('velocity');
    if (!distance && velocity) distance = integrateDistance(time, velocity);
    if (!distance || distance.filter(value => value !== null).length < n / 2) return null;
    distance = fillForward(distance);

    const { minMovingSpeedMps, maxSampleGapSeconds } = config.streams;
    const rawSpeed = new Array(n).fill(0);
    for (let i = 1; i < n; i += 1) {
        const dtRaw = (time[i] ?? 0) - (time[i - 1] ?? 0);
        const dd = distance[i] - distance[i - 1];
        rawSpeed[i] = velocity?.[i] ?? (dtRaw > 0 ? Math.max(0, dd / dtRaw) : 0);
    }
    rawSpeed[0] = rawSpeed[1] ?? 0;
    const speed = velocity ? rawSpeed : rollingMean(rawSpeed, 5);

    const dt = new Array(n).fill(0);
    const movingTime = new Array(n).fill(0);
    for (let i = 1; i < n; i += 1) {
        const step = (time[i] ?? 0) - (time[i - 1] ?? 0);
        const moving = step > 0 && step <= maxSampleGapSeconds && speed[i] >= minMovingSpeedMps;
        dt[i] = moving ? step : 0;
        movingTime[i] = movingTime[i - 1] + dt[i];
    }

    const altitudeRaw = pick('altitude');
    const altitudeValid = altitudeRaw && altitudeRaw.filter(value => value !== null).length >= n / 2;
    const altitude = altitudeValid ? smoothAltitude(fillForward(altitudeRaw), distance, config.smoothing) : new Array(n).fill(null);
    const grade = altitudeValid ? computeGrade(altitude, distance, config.smoothing) : new Array(n).fill(0);

    const clean = key => {
        const values = pick(key);
        if (!values) return new Array(n).fill(null);
        // Le dinamiche a zero sono pause o assenza di segnale.
        return ['gct', 'verticalOscillation', 'verticalRatio', 'heartrate'].includes(key)
            ? values.map(value => (value !== null && value > 0 ? value : null))
            : values;
    };
    const heartrate = clean('heartrate');
    const watts = clean('watts');
    const cadence = clean('cadence');
    const gct = clean('gct');
    const verticalOscillation = clean('verticalOscillation');
    const verticalRatio = clean('verticalRatio');
    const enough = values => values.filter(value => value !== null).length >= Math.min(60, n / 4);

    return {
        n,
        time: time.map(value => value ?? 0),
        distance,
        altitude,
        speed,
        dt,
        movingTime,
        grade,
        heartrate,
        watts,
        cadence,
        gct,
        verticalOscillation,
        verticalRatio,
        has: {
            altitude: Boolean(altitudeValid),
            heartrate: enough(heartrate),
            watts: enough(watts.map(value => (value !== null && value > 0 ? value : null))),
            cadence: enough(cadence),
            gct: enough(gct),
            verticalOscillation: enough(verticalOscillation),
            verticalRatio: enough(verticalRatio)
        }
    };
}

export function totalMovingSeconds(samples) {
    return samples ? samples.movingTime[samples.n - 1] : 0;
}

// Indice del primo campione con tempo in movimento >= seconds.
export function indexAtMovingTime(samples, seconds) {
    let lo = 0;
    let hi = samples.n - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples.movingTime[mid] < seconds) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

export function indexAtDistance(samples, meters) {
    let lo = 0;
    let hi = samples.n - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples.distance[mid] < meters) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function smoothAltitude(altitude, distance, { altitudeMedianWindow, altitudeDistanceWindowM }) {
    const median = medianFilter(altitude, altitudeMedianWindow);
    const half = altitudeDistanceWindowM / 2;
    const n = median.length;
    const out = new Array(n);
    let lo = 0;
    let hi = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i += 1) {
        while (hi < n && distance[hi] - distance[i] <= half) {
            sum += median[hi];
            count += 1;
            hi += 1;
        }
        while (distance[i] - distance[lo] > half) {
            sum -= median[lo];
            count -= 1;
            lo += 1;
        }
        out[i] = count ? sum / count : median[i];
    }
    return out;
}

function computeGrade(altitude, distance, { gradeWindowM, maxAbsGrade }) {
    const n = altitude.length;
    const half = gradeWindowM / 2;
    const grade = new Array(n).fill(0);
    let lo = 0;
    let hi = 0;
    let previous = 0;
    for (let i = 0; i < n; i += 1) {
        if (hi < i) hi = i;
        while (hi < n - 1 && distance[hi] - distance[i] < half) hi += 1;
        while (lo < i && distance[i] - distance[lo + 1] >= half) lo += 1;
        const run = distance[hi] - distance[lo];
        if (run >= gradeWindowM / 2) {
            previous = clamp((altitude[hi] - altitude[lo]) / run, -maxAbsGrade, maxAbsGrade);
        }
        grade[i] = previous;
    }
    return grade;
}

function medianFilter(values, window) {
    const half = Math.floor(window / 2);
    return values.map((_, index) => {
        const slice = values.slice(Math.max(0, index - half), index + half + 1).filter(value => value !== null);
        return slice.length ? median(slice) : values[index];
    });
}

function rollingMean(values, window) {
    const half = Math.floor(window / 2);
    return values.map((_, index) => {
        const slice = values.slice(Math.max(0, index - half), index + half + 1);
        return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });
}

function integrateDistance(time, velocity) {
    const out = new Array(time.length).fill(0);
    for (let i = 1; i < time.length; i += 1) {
        const step = Math.max(0, (time[i] ?? 0) - (time[i - 1] ?? 0));
        out[i] = out[i - 1] + (velocity[i] ?? 0) * step;
    }
    return out;
}

function fillForward(values) {
    const firstValid = values.find(value => value !== null) ?? 0;
    let last = firstValid;
    return values.map(value => {
        if (value !== null) last = value;
        return last;
    });
}

export function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
