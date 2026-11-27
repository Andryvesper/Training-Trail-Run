// js/modules/activity-detail.js - Dati per il dettaglio di un'attività svolta.
// Solo calcoli: nessun accesso al DOM o alla rete.
import { buildSamples, normalizeStreams } from './activity-streams.js';

const PACE_SPORTS = ['run', 'walk', 'hike'];

/** Sport misurati a passo (min/km) invece che a velocità (km/h). */
export function usesPace(activity) {
    const type = String(activity?.type || '').toLowerCase();
    return PACE_SPORTS.some(sport => type.includes(sport));
}

export function isSwim(activity) {
    return String(activity?.type || '').toLowerCase().includes('swim');
}

export function intervalsActivityUrl(activityId) {
    const id = String(activityId ?? '').trim();
    return id ? `https://intervals.icu/activities/${encodeURIComponent(id)}` : null;
}

/**
 * Voci del riepilogo: solo i campi presenti nell'attività Intervals.
 * @returns {{ label: string, value: string }[]}
 */
export function activitySummaryItems(activity) {
    if (!activity) return [];
    const items = [];
    const add = (label, value) => { if (value) items.push({ label, value }); };
    const distance = positive(activity.distance);
    const moving = positive(activity.moving_time);
    const elapsed = positive(activity.elapsed_time);
    const speed = positive(activity.average_speed) ?? (distance && moving ? distance / moving : null);

    add('Distanza', distance ? (isSwim(activity) ? `${Math.round(distance)} m` : `${formatNumber(distance / 1000, 2)} km`) : null);
    add('Tempo in movimento', moving ? formatDuration(moving) : null);
    if (elapsed && (!moving || elapsed - moving >= 60)) add('Tempo totale', formatDuration(elapsed));
    add(isSwim(activity) ? 'Passo medio' : usesPace(activity) ? 'Passo medio' : 'Velocità media', speedText(activity, speed));
    if (usesPace(activity)) add('Passo GAP (Intervals)', paceText(positive(activity.gap)));
    add('Dislivello positivo', positive(activity.total_elevation_gain) ? `${Math.round(activity.total_elevation_gain)} m` : null);
    add('Dislivello negativo', positive(activity.total_elevation_loss) ? `${Math.round(activity.total_elevation_loss)} m` : null);
    add('Quota massima', positive(activity.max_altitude) ? `${Math.round(activity.max_altitude)} m` : null);
    add('FC media', positive(activity.average_heartrate) ? `${Math.round(activity.average_heartrate)} bpm` : null);
    add('FC massima', positive(activity.max_heartrate) ? `${Math.round(activity.max_heartrate)} bpm` : null);
    add('Cadenza media', positive(activity.average_cadence) ? `${Math.round(activity.average_cadence)} /min` : null);
    add('Potenza media', positive(activity.icu_average_watts) ? `${Math.round(activity.icu_average_watts)} W` : null);
    add('Potenza normalizzata', positive(activity.icu_weighted_avg_watts) ? `${Math.round(activity.icu_weighted_avg_watts)} W` : null);
    add('Carico (Intervals)', positive(activity.icu_training_load) ? String(Math.round(activity.icu_training_load)) : null);
    add('TRIMP', positive(activity.trimp) ? String(Math.round(activity.trimp)) : null);
    add('Intensità', positive(activity.icu_intensity) ? `${Math.round(activity.icu_intensity)}%` : null);
    add('Calorie', positive(activity.calories) ? `${Math.round(activity.calories)} kcal` : null);
    const rpe = positive(activity.icu_rpe) ?? positive(activity.perceived_exertion);
    add('Fatica percepita (RPE)', rpe ? `${formatNumber(rpe, 1)}/10` : null);
    add('Temperatura media', Number.isFinite(Number(activity.average_temp)) && activity.average_temp !== null ? `${Math.round(activity.average_temp)} °C` : null);
    return items;
}

/**
 * Profilo lungo la distanza, ridotto a `points` punti (medie per tratto).
 * @returns {{ labels: string[], altitude: (number|null)[], heartrate: (number|null)[], pace: (number|null)[], speed: (number|null)[], has: { altitude: boolean, heartrate: boolean, pace: boolean } } | null}
 */
export function activityProfile(rawStreams, points = 150) {
    const samples = buildSamples(normalizeStreams(rawStreams));
    if (!samples) return null;
    const total = lastFinite(samples.distance);
    if (!total || total <= 0) return null;
    const buckets = Math.max(2, Math.min(points, Math.floor(total / 10)));
    const step = total / buckets;
    const sums = Array.from({ length: buckets }, () => ({ alt: [0, 0], hr: [0, 0], dist: 0, time: 0 }));
    for (let index = 0; index < samples.n; index += 1) {
        const distance = samples.distance[index];
        if (!Number.isFinite(distance)) continue;
        const bucket = sums[Math.max(0, Math.min(buckets - 1, Math.floor(distance / step)))];
        if (Number.isFinite(samples.altitude[index])) { bucket.alt[0] += samples.altitude[index]; bucket.alt[1] += 1; }
        if (Number.isFinite(samples.heartrate[index])) { bucket.hr[0] += samples.heartrate[index]; bucket.hr[1] += 1; }
        // Velocità del tratto: distanza percorsa sul tempo in movimento.
        if (index > 0 && samples.dt[index] > 0 && Number.isFinite(samples.distance[index - 1])) {
            bucket.dist += Math.max(0, distance - samples.distance[index - 1]);
            bucket.time += samples.dt[index];
        }
    }
    const mean = ([sum, count]) => (count ? sum / count : null);
    const speed = sums.map(bucket => (bucket.time > 0 && bucket.dist > 0 ? bucket.dist / bucket.time : null));
    const profile = {
        labels: sums.map((_, index) => `${formatNumber((index + 0.5) * step / 1000, 1)} km`),
        altitude: sums.map(bucket => round(mean(bucket.alt), 0)),
        heartrate: sums.map(bucket => round(mean(bucket.hr), 0)),
        // Sotto 1 m/s (soste, tratti a piedi lenti) il passo non è significativo.
        pace: speed.map(value => (value !== null && value >= 1 ? Math.round(1000 / value) : null)),
        speed: speed.map(value => (value !== null ? round(value * 3.6, 1) : null))
    };
    profile.has = {
        altitude: samples.has.altitude && profile.altitude.some(value => value !== null),
        heartrate: samples.has.heartrate && profile.heartrate.some(value => value !== null),
        pace: profile.pace.filter(value => value !== null).length >= 2
    };
    return profile;
}

/**
 * Righe della tabella dei giri e intervalli (risposta di /activity/{id}/intervals).
 */
export function lapRows(intervalsResponse, activity) {
    const laps = Array.isArray(intervalsResponse?.icu_intervals) ? intervalsResponse.icu_intervals : [];
    return laps
        .filter(lap => positive(lap.moving_time) || positive(lap.elapsed_time))
        .map((lap, index) => {
            const distance = positive(lap.distance);
            const seconds = positive(lap.moving_time) ?? positive(lap.elapsed_time);
            const speed = positive(lap.average_speed) ?? (distance && seconds ? distance / seconds : null);
            return {
                index: index + 1,
                label: lapLabel(lap),
                kind: String(lap.type || '').toUpperCase(),
                distance: distance ? `${formatNumber(distance / 1000, 2)} km` : '—',
                duration: seconds ? formatDuration(seconds) : '—',
                pace: speedText(activity, speed) || '—',
                heartrate: positive(lap.average_heartrate) ? `${Math.round(lap.average_heartrate)}` : '—',
                maxHeartrate: positive(lap.max_heartrate) ? `${Math.round(lap.max_heartrate)}` : '—',
                elevation: positive(lap.total_elevation_gain) ? `${Math.round(lap.total_elevation_gain)} m` : '—'
            };
        });
}

const LAP_TYPES = { WORK: 'Lavoro', RECOVERY: 'Recupero', WARMUP: 'Riscaldamento', COOLDOWN: 'Defaticamento', REST: 'Pausa' };

function lapLabel(lap) {
    const label = String(lap.label || '').trim();
    if (label) return label;
    return LAP_TYPES[String(lap.type || '').toUpperCase()] || '—';
}

export function speedText(activity, metersPerSecond) {
    const speed = positive(metersPerSecond);
    if (!speed) return null;
    if (isSwim(activity)) return `${formatClock(100 / speed)}/100 m`;
    if (usesPace(activity)) return paceText(speed);
    return `${formatNumber(speed * 3.6, 1)} km/h`;
}

export function paceText(metersPerSecond) {
    const speed = positive(metersPerSecond);
    return speed ? `${formatClock(1000 / speed)}/km` : null;
}

export function formatClock(totalSeconds) {
    const rounded = Math.round(totalSeconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds) {
    const seconds = Math.round(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
}

function formatNumber(value, digits) {
    return Number(value).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function positive(value) {
    const number = Number(value);
    return value !== null && value !== undefined && value !== '' && Number.isFinite(number) && number > 0 ? number : null;
}

function round(value, digits) {
    if (value === null || !Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function lastFinite(values) {
    for (let index = values.length - 1; index >= 0; index -= 1) {
        if (Number.isFinite(values[index])) return values[index];
    }
    return null;
}
