// Deriva cardiaca (aerobic decoupling, Pa:Hr con GAP o Pw:Hr con potenza).
// Si scartano i primi minuti di riscaldamento, il resto si divide a metà
// per tempo (o distanza) e si confronta l'EF delle due metà:
// deriva % = (EF1 - EF2) / EF1 × 100. Funzioni pure.

import { PERFORMANCE_CONFIG } from './performance-config.js';
import { computeEfficiency } from './performance-gap.js';
import { indexAtDistance, indexAtMovingTime, totalMovingSeconds } from './activity-streams.js';

export const DECOUPLING_CLASSES = Object.freeze({
    excellent: 'Ottima tenuta aerobica',
    good: 'Buona tenuta aerobica',
    significant: 'Deriva significativa: affaticamento',
    negative: 'Seconda metà più efficiente'
});

export function isEnduranceSession(activity, samples, config = PERFORMANCE_CONFIG) {
    const { minMovingSeconds, minDistanceM } = config.decoupling;
    const moving = samples ? totalMovingSeconds(samples) : Number(activity?.moving_time) || 0;
    const distance = samples ? samples.distance[samples.n - 1] : Number(activity?.distance) || 0;
    return moving > minMovingSeconds || distance > minDistanceM;
}

/**
 * @returns {{ status: 'ok'|'partial'|'unavailable', reason: string|null,
 *   driftPercent: number|null, powerDriftPercent: number|null, ef1: number|null, ef2: number|null,
 *   splitBy: string, steady: boolean|null, gapCv: number|null }}
 */
export function computeDecoupling(activity, samples, gapSpeeds, config = PERFORMANCE_CONFIG) {
    const { warmupSeconds, splitBy, unsteadyCv } = config.decoupling;
    const base = {
        driftPercent: null,
        powerDriftPercent: null,
        ef1: null,
        ef2: null,
        averageHr1: null,
        averageHr2: null,
        splitBy,
        steady: null,
        gapCv: null
    };
    if (!samples) return { ...base, status: 'unavailable', reason: 'Nessuno stream di tempo e distanza.' };
    if (!isEnduranceSession(activity, samples, config)) {
        return { ...base, status: 'unavailable', reason: 'Seduta sotto 60 minuti e 12 km: deriva non applicabile.' };
    }
    if (!samples.has.heartrate) return { ...base, status: 'unavailable', reason: 'Senza FC la deriva cardiaca non è calcolabile.' };

    const start = indexAtMovingTime(samples, warmupSeconds);
    const last = samples.n - 1;
    let middle;
    if (splitBy === 'distance') {
        const from = samples.distance[start];
        middle = indexAtDistance(samples, from + (samples.distance[last] - from) / 2);
    } else {
        const from = samples.movingTime[start];
        middle = indexAtMovingTime(samples, from + (samples.movingTime[last] - from) / 2);
    }
    if (middle <= start + 1 || middle >= last - 1)
        return { ...base, status: 'unavailable', reason: 'Dati insufficienti dopo il riscaldamento.' };

    const first = computeEfficiency(samples, gapSpeeds, config, { range: [start + 1, middle] });
    const second = computeEfficiency(samples, gapSpeeds, config, { range: [middle + 1, last] });
    if (first.ef === null || second.ef === null) {
        return { ...base, status: 'unavailable', reason: first.reason || second.reason };
    }
    const driftPercent = round(((first.ef - second.ef) / first.ef) * 100, 1);
    const powerDriftPercent = first.efPower && second.efPower ? round(((first.efPower - second.efPower) / first.efPower) * 100, 1) : null;
    const gapCv = blockCv(samples, gapSpeeds, start, last, config.decoupling.blockSeconds);
    const steady = gapCv === null ? null : gapCv <= unsteadyCv;
    const partialReasons = [];
    if (!samples.has.altitude) partialReasons.push('altitudine assente, deriva sul passo reale');
    if (steady === false) partialReasons.push('ritmo non costante (es. ripetute): deriva poco affidabile');
    return {
        status: partialReasons.length ? 'partial' : 'ok',
        reason: partialReasons.length ? capitalize(partialReasons.join('; ')) + '.' : null,
        driftPercent,
        powerDriftPercent,
        ef1: first.ef,
        ef2: second.ef,
        averageHr1: first.averageHr,
        averageHr2: second.averageHr,
        splitBy,
        steady,
        gapCv
    };
}

export function classifyDecoupling(driftPercent, config = PERFORMANCE_CONFIG) {
    if (!Number.isFinite(driftPercent)) return null;
    const { excellentMaxPercent, goodMaxPercent } = config.decoupling;
    if (driftPercent < 0) return { key: 'negative', label: DECOUPLING_CLASSES.negative };
    if (driftPercent < excellentMaxPercent) return { key: 'excellent', label: DECOUPLING_CLASSES.excellent };
    if (driftPercent <= goodMaxPercent) return { key: 'good', label: DECOUPLING_CLASSES.good };
    return { key: 'significant', label: DECOUPLING_CLASSES.significant };
}

// Coefficiente di variazione del GAP su blocchi di tempo in movimento.
function blockCv(samples, gapSpeeds, from, to, blockSeconds) {
    const blocks = [];
    let seconds = 0;
    let sum = 0;
    for (let i = from + 1; i <= to; i += 1) {
        const dt = samples.dt[i];
        if (!dt) continue;
        seconds += dt;
        sum += gapSpeeds[i] * dt;
        if (seconds >= blockSeconds) {
            blocks.push(sum / seconds);
            seconds = 0;
            sum = 0;
        }
    }
    if (blocks.length < 4) return null;
    const mean = blocks.reduce((total, value) => total + value, 0) / blocks.length;
    const variance = blocks.reduce((total, value) => total + (value - mean) ** 2, 0) / blocks.length;
    return mean > 0 ? round(Math.sqrt(variance) / mean, 3) : null;
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
