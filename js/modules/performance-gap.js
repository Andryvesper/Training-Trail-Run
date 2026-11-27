// GAP (Grade Adjusted Pace), Efficiency Factor, EF in salita e VAM sulle
// salite continue. Modello di costo energetico di Minetti et al. (2002),
// J Appl Physiol 93:1039-1046. Funzioni pure.

import { PERFORMANCE_CONFIG } from './performance-config.js';

/**
 * @typedef {Object} MetricResult
 * @property {'ok'|'partial'|'unavailable'} status
 * @property {string|null} reason
 */

// Costo della corsa (J/kg/m) alla pendenza `grade` (frazione).
export function minettiCost(grade, coefficients = PERFORMANCE_CONFIG.gap.coefficients) {
    return coefficients.reduce((sum, coefficient) => sum * grade + coefficient, 0);
}

// Rapporto tra costo in pendenza e costo in piano: velocità piana equivalente
// = velocità × fattore.
export function gapFactor(grade, config = PERFORMANCE_CONFIG) {
    const { maxAbsGrade } = config.smoothing;
    const bounded = Math.min(maxAbsGrade, Math.max(-maxAbsGrade, grade));
    const flat = minettiCost(0, config.gap.coefficients);
    let factor = minettiCost(bounded, config.gap.coefficients) / flat;
    const floor = config.gap.downhillFactorFloor;
    if (bounded < 0 && Number.isFinite(floor)) factor = Math.max(factor, floor);
    return factor;
}

// Velocità GAP di ogni campione (m/s).
export function gapSpeedSeries(samples, config = PERFORMANCE_CONFIG) {
    if (!samples) return [];
    return samples.speed.map((speed, index) => (samples.has.altitude ? speed * gapFactor(samples.grade[index], config) : speed));
}

/**
 * GAP medio pesato sul tempo in movimento.
 * @returns {MetricResult & { gapSpeedMps: number|null, gapPaceSecondsPerKm: number|null, speedMps: number|null, paceSecondsPerKm: number|null, movingSeconds: number }}
 */
export function computeGap(samples, gapSpeeds, range = null) {
    if (!samples)
        return {
            status: 'unavailable',
            reason: 'Nessuno stream di tempo e distanza.',
            gapSpeedMps: null,
            gapPaceSecondsPerKm: null,
            speedMps: null,
            paceSecondsPerKm: null,
            movingSeconds: 0
        };
    const [from, to] = range || [1, samples.n - 1];
    let seconds = 0;
    let gapSum = 0;
    let speedSum = 0;
    for (let i = Math.max(1, from); i <= to; i += 1) {
        const dt = samples.dt[i];
        if (!dt) continue;
        seconds += dt;
        gapSum += gapSpeeds[i] * dt;
        speedSum += samples.speed[i] * dt;
    }
    if (seconds <= 0)
        return {
            status: 'unavailable',
            reason: 'Nessun tratto in movimento.',
            gapSpeedMps: null,
            gapPaceSecondsPerKm: null,
            speedMps: null,
            paceSecondsPerKm: null,
            movingSeconds: 0
        };
    const gapSpeedMps = gapSum / seconds;
    const speedMps = speedSum / seconds;
    return {
        status: samples.has.altitude ? 'ok' : 'partial',
        reason: samples.has.altitude ? null : 'Altitudine assente: GAP uguale al passo reale.',
        gapSpeedMps: round(gapSpeedMps, 3),
        gapPaceSecondsPerKm: Math.round(1000 / gapSpeedMps),
        speedMps: round(speedMps, 3),
        paceSecondsPerKm: Math.round(1000 / speedMps),
        movingSeconds: Math.round(seconds)
    };
}

/**
 * EF = velocità GAP (m/min) / FC media; con potenza anche NP / FC media.
 * `mask(i)` limita i campioni (es. solo salita).
 */
export function computeEfficiency(samples, gapSpeeds, config = PERFORMANCE_CONFIG, { range = null, mask = null, minSeconds = 1 } = {}) {
    const empty = reason => ({
        status: 'unavailable',
        reason,
        ef: null,
        efPower: null,
        averageHr: null,
        gapSpeedMps: null,
        normalizedPower: null,
        seconds: 0
    });
    if (!samples) return empty('Nessuno stream di tempo e distanza.');
    if (!samples.has.heartrate) return empty('Senza fascia cardio o FC al polso: EF non calcolabile.');
    const [from, to] = range || [1, samples.n - 1];
    let seconds = 0;
    let gapSum = 0;
    let hrSum = 0;
    for (let i = Math.max(1, from); i <= to; i += 1) {
        const dt = samples.dt[i];
        const hr = samples.heartrate[i];
        if (!dt || hr === null || (mask && !mask(i))) continue;
        seconds += dt;
        gapSum += gapSpeeds[i] * dt;
        hrSum += hr * dt;
    }
    if (seconds < minSeconds) return empty('Tratti con FC troppo brevi.');
    const averageHr = hrSum / seconds;
    const { minAverageHr, maxAverageHr } = config.efficiency;
    if (averageHr < minAverageHr || averageHr > maxAverageHr) return empty('FC media non plausibile.');
    const gapSpeedMps = gapSum / seconds;
    const normalizedPower = samples.has.watts && !mask ? computeNormalizedPower(samples, [from, to]) : null;
    return {
        status: samples.has.altitude ? 'ok' : 'partial',
        reason: samples.has.altitude ? null : 'Altitudine assente: EF sul passo reale.',
        ef: round((gapSpeedMps * 60) / averageHr, 3),
        efPower: normalizedPower ? round(normalizedPower / averageHr, 3) : null,
        averageHr: round(averageHr, 1),
        gapSpeedMps: round(gapSpeedMps, 3),
        normalizedPower: normalizedPower ? Math.round(normalizedPower) : null,
        seconds: Math.round(seconds)
    };
}

// NP: media mobile a 30 s della potenza, quarta potenza, media, radice quarta.
export function computeNormalizedPower(samples, range = null) {
    const [from, to] = range || [0, samples.n - 1];
    const rolling = [];
    let lo = from;
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i += 1) {
        const watts = samples.watts[i] ?? 0;
        sum += watts;
        count += 1;
        while (samples.time[i] - samples.time[lo] >= 30) {
            sum -= samples.watts[lo] ?? 0;
            count -= 1;
            lo += 1;
        }
        if (samples.time[i] - samples.time[from] >= 30 && samples.dt[i] > 0) rolling.push(sum / count);
    }
    if (!rolling.length) return null;
    const meanFourth = rolling.reduce((total, value) => total + value ** 4, 0) / rolling.length;
    const np = meanFourth ** 0.25;
    return np > 0 ? np : null;
}

export function computeUphillEfficiency(samples, gapSpeeds, config = PERFORMANCE_CONFIG) {
    if (!samples?.has.altitude) {
        return {
            status: 'unavailable',
            reason: 'Altitudine assente.',
            ef: null,
            averageHr: null,
            gapSpeedMps: null,
            seconds: 0,
            efPower: null,
            normalizedPower: null
        };
    }
    const { uphillGrade, minUphillSeconds } = config.efficiency;
    const result = computeEfficiency(samples, gapSpeeds, config, {
        mask: index => samples.grade[index] > uphillGrade,
        minSeconds: minUphillSeconds
    });
    if (result.status === 'unavailable' && samples.has.heartrate) {
        result.reason = `Meno di ${Math.round(minUphillSeconds / 60)} minuti con pendenza oltre +${Math.round(uphillGrade * 100)}%.`;
    }
    return result;
}

/**
 * Salite continue: tratti in cui l'altitudine smussata sale di almeno
 * climbMinGainM in almeno climbMinDurationSeconds di movimento; una discesa
 * fino a climbMaxDipM non interrompe la salita.
 */
export function detectClimbs(samples, config = PERFORMANCE_CONFIG) {
    if (!samples?.has.altitude)
        return { status: 'unavailable', reason: 'Altitudine assente.', climbs: [], bestVam: null, averageVam: null, climbGainM: 0 };
    const { climbMinGainM, climbMinDurationSeconds, climbMaxDipM } = config.efficiency;
    const altitude = samples.altitude;
    const climbs = [];
    const record = (start, peak) => {
        const gainM = altitude[peak] - altitude[start];
        const durationS = samples.movingTime[peak] - samples.movingTime[start];
        if (gainM < climbMinGainM || durationS < climbMinDurationSeconds) return;
        const distanceM = samples.distance[peak] - samples.distance[start];
        let hrSum = 0;
        let hrSeconds = 0;
        for (let i = start + 1; i <= peak; i += 1) {
            if (samples.dt[i] && samples.heartrate[i] !== null) {
                hrSum += samples.heartrate[i] * samples.dt[i];
                hrSeconds += samples.dt[i];
            }
        }
        climbs.push({
            startIndex: start,
            endIndex: peak,
            startKm: round(samples.distance[start] / 1000, 2),
            gainM: Math.round(gainM),
            durationS: Math.round(durationS),
            distanceM: Math.round(distanceM),
            averageGradePercent: distanceM > 0 ? round((gainM / distanceM) * 100, 1) : null,
            vam: Math.round((gainM / durationS) * 3600),
            averageHr: hrSeconds > 0 ? round(hrSum / hrSeconds, 1) : null
        });
    };
    let start = 0;
    let peak = 0;
    for (let i = 1; i < samples.n; i += 1) {
        if (altitude[i] >= altitude[peak]) {
            peak = i;
        } else if (altitude[peak] - altitude[i] > climbMaxDipM) {
            record(start, peak);
            start = i;
            peak = i;
        }
        if (altitude[i] < altitude[start]) {
            start = i;
            peak = i;
        }
    }
    record(start, peak);
    const totalGain = climbs.reduce((sum, climb) => sum + climb.gainM, 0);
    const totalSeconds = climbs.reduce((sum, climb) => sum + climb.durationS, 0);
    return {
        status: climbs.length ? 'ok' : 'unavailable',
        reason: climbs.length
            ? null
            : `Nessuna salita continua di almeno ${climbMinGainM} m e ${Math.round(climbMinDurationSeconds / 60)} minuti.`,
        climbs: climbs.map(({ startIndex, endIndex, ...climb }) => climb),
        bestVam: climbs.length ? Math.max(...climbs.map(climb => climb.vam)) : null,
        averageVam: totalSeconds > 0 ? Math.round((totalGain / totalSeconds) * 3600) : null,
        climbGainM: totalGain
    };
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
