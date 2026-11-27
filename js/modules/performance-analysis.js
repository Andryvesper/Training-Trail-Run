// Analisi avanzata di un'attività e trend: coordina stream, GAP/EF, deriva
// cardiaca, biomeccanica e carico meccanico. Funzioni pure: il risultato è
// un oggetto serializzabile salvato in activity_performance_analyses.metrics.

import { PERFORMANCE_CONFIG, PERFORMANCE_CONFIG_VERSION } from './performance-config.js';
import { buildSamples, median, normalizeStreams, totalMovingSeconds } from './activity-streams.js';
import { computeEfficiency, computeGap, computeUphillEfficiency, detectClimbs, gapSpeedSeries } from './performance-gap.js';
import { computeDecoupling } from './performance-decoupling.js';
import { computeBiomechanics, linearSlope } from './performance-biomechanics.js';
import { addDays, computeMechanicalLoad } from './mechanical-readiness.js';

export function activityDate(activity) {
    const date = typeof activity?.start_date_local === 'string' ? activity.start_date_local.slice(0, 10) : null;
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function isRunActivity(activity) {
    const type = String(activity?.type || '').toLowerCase();
    return type.includes('run') || type.includes('trail');
}

/**
 * Analisi completa con gli stream. Se gli stream mancano o non hanno
 * distanza, restano solo le metriche dal riepilogo.
 */
export function analyzeActivity(activity, rawStreams, config = PERFORMANCE_CONFIG) {
    const normalized = normalizeStreams(rawStreams);
    const samples = buildSamples(normalized, config);
    const movingSeconds = samples ? totalMovingSeconds(samples) : Number(activity?.moving_time) || 0;
    const gapSpeeds = gapSpeedSeries(samples, config);
    const unavailable = reason => ({ status: 'unavailable', reason });
    const noSamples = 'Stream di tempo e distanza assenti.';
    return {
        ...baseRecord(activity),
        configVersion: PERFORMANCE_CONFIG_VERSION,
        streams: {
            available: Object.keys(normalized.series),
            rawTypes: normalized.rawTypes,
            samples: samples?.n ?? 0
        },
        summary: summaryOf(activity, samples, movingSeconds),
        gap: computeGap(samples, gapSpeeds),
        efficiency: samples ? computeEfficiency(samples, gapSpeeds, config) : unavailable(noSamples),
        uphill: samples ? computeUphillEfficiency(samples, gapSpeeds, config) : unavailable(noSamples),
        climbs: samples ? detectClimbs(samples, config) : { ...unavailable(noSamples), climbs: [], bestVam: null, averageVam: null, climbGainM: 0 },
        decoupling: computeDecoupling(activity, samples, gapSpeeds, config),
        biomechanics: computeBiomechanics(samples, config),
        mechanicalLoad: computeMechanicalLoad(activity, samples, movingSeconds, config),
        intervals: intervalsReference(activity)
    };
}

// Solo carico meccanico dal riepilogo: attività senza stream o non di corsa.
export function analyzeActivitySummary(activity, config = PERFORMANCE_CONFIG) {
    const movingSeconds = Number(activity?.moving_time) || 0;
    return {
        ...baseRecord(activity),
        configVersion: PERFORMANCE_CONFIG_VERSION,
        summaryOnly: true,
        summary: summaryOf(activity, null, movingSeconds),
        mechanicalLoad: computeMechanicalLoad(activity, null, movingSeconds, config)
    };
}

// Corse da analizzare: ultimi `historyDays`, abbastanza lunghe, senza analisi
// in cache o con versione di calcolo diversa. Le più recenti prima.
export function activitiesToAnalyze(activities, cachedVersions, today, config = PERFORMANCE_CONFIG) {
    const { historyDays, minMovingSeconds, maxActivitiesPerSync } = config.streams;
    const from = addDays(today, -(historyDays - 1));
    const cached = cachedVersions instanceof Map ? cachedVersions : new Map();
    const pending = (Array.isArray(activities) ? activities : [])
        .filter(activity => {
            const date = activityDate(activity);
            if (!date || date < from || date > today || !isRunActivity(activity)) return false;
            if ((Number(activity.moving_time) || Number(activity.elapsed_time) || 0) < minMovingSeconds) return false;
            if (activity.id === null || activity.id === undefined || activity.id === '') return false;
            return cached.get(String(activity.id)) !== PERFORMANCE_CONFIG_VERSION;
        })
        .sort((left, right) => String(right.start_date_local).localeCompare(String(left.start_date_local)));
    return { pending: pending.slice(0, maxActivitiesPerSync), skipped: Math.max(0, pending.length - maxActivitiesPerSync) };
}

/**
 * Punti di carico eccentrico per giorno: dall'analisi se presente,
 * altrimenti dal riepilogo dell'attività (anche escursioni e camminate).
 */
export function eccentricEntries(activities, analysesById, today, config = PERFORMANCE_CONFIG) {
    const from = addDays(today, -(config.readiness.chronicDays + config.review.lookbackDays));
    return (Array.isArray(activities) ? activities : [])
        .map(activity => {
            const date = activityDate(activity);
            if (!date || date < from || date > today) return null;
            const analysis = analysesById?.get(String(activity.id)) || analyzeActivitySummary(activity, config);
            return { date, activityId: String(activity.id ?? ''), eccentricPoints: analysis.mechanicalLoad?.eccentricPoints || 0, score: analysis.mechanicalLoad?.score || 0 };
        })
        .filter(Boolean);
}

/**
 * Trend dell'EF sugli ultimi `days` giorni. Il "GAP a FC di riferimento"
 * (EF × FC di riferimento) confronta il passo a parità di frequenza cardiaca.
 */
export function efficiencyTrend(analyses, today, days, config = PERFORMANCE_CONFIG) {
    const from = addDays(today, -(days - 1));
    const points = (analyses || [])
        .filter(item => item?.date >= from && item.date <= today
            && Number.isFinite(item.efficiency?.ef)
            && (item.efficiency?.seconds || 0) >= config.efficiency.trendMinMovingSeconds)
        .map(item => ({
            date: item.date,
            activityId: item.activityId,
            name: item.name,
            ef: item.efficiency.ef,
            averageHr: item.efficiency.averageHr,
            efUphill: Number.isFinite(item.uphill?.ef) ? item.uphill.ef : null
        }))
        .sort((left, right) => left.date.localeCompare(right.date));
    if (points.length < 2) {
        return { days, points, referenceHr: null, slopePer30Days: null, changePercent: null, start: null, end: null };
    }
    const referenceHr = Math.round(median(points.map(point => point.averageHr)));
    const dayIndex = date => (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    const xy = points.map(point => [dayIndex(point.date), point.ef]);
    const slope = linearSlope(xy, 3);
    const meanX = xy.reduce((sum, [x]) => sum + x, 0) / xy.length;
    const meanY = xy.reduce((sum, [, y]) => sum + y, 0) / xy.length;
    const fitted = x => (slope === null ? meanY : meanY + slope * (x - meanX));
    const startEf = fitted(xy[0][0]);
    const endEf = fitted(xy[xy.length - 1][0]);
    const paceAt = ef => (ef > 0 ? Math.round(1000 / (ef * referenceHr / 60)) : null);
    return {
        days,
        points: points.map(point => ({ ...point, gapPaceAtReferenceHr: paceAt(point.ef) })),
        referenceHr,
        slopePer30Days: slope === null ? null : round(slope * 30, 4),
        changePercent: slope === null || startEf <= 0 ? null : round((endEf - startEf) / startEf * 100, 1),
        start: { ef: round(startEf, 3), gapPaceAtReferenceHr: paceAt(startEf) },
        end: { ef: round(endEf, 3), gapPaceAtReferenceHr: paceAt(endEf) }
    };
}

function baseRecord(activity) {
    return {
        activityId: String(activity?.id ?? ''),
        date: activityDate(activity),
        name: activity?.name || activity?.type || 'Attività',
        type: String(activity?.type || ''),
        sport: isRunActivity(activity) ? 'run' : String(activity?.type || 'other').toLowerCase()
    };
}

function summaryOf(activity, samples, movingSeconds) {
    return {
        distanceM: samples ? Math.round(samples.distance[samples.n - 1]) : numberOrNull(activity?.distance),
        movingSeconds: Math.round(movingSeconds) || null,
        elevationGainM: numberOrNull(activity?.total_elevation_gain),
        elevationLossM: numberOrNull(activity?.total_elevation_loss),
        averageHr: numberOrNull(activity?.average_heartrate)
    };
}

// Valori calcolati da Intervals.icu, solo per confronto.
function intervalsReference(activity) {
    return {
        decouplingPercent: numberOrNull(activity?.decoupling),
        efficiencyFactor: numberOrNull(activity?.icu_efficiency_factor),
        gapSecondsPerKm: Number.isFinite(Number(activity?.gap)) && Number(activity.gap) > 0 ? Math.round(1000 / Number(activity.gap)) : null,
        averageStanceTime: numberOrNull(activity?.average_stance_time),
        averageVerticalOscillation: numberOrNull(activity?.average_vertical_oscillation)
    };
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
