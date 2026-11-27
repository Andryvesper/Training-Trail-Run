// Decadimento biomeccanico: variazione di tempo di contatto al suolo (GCT),
// oscillazione verticale (VO) e vertical ratio tra l'inizio (dopo il
// riscaldamento) e il finale dell'attività, più la pendenza della retta del
// GCT nel tempo. Si confrontano solo campioni in piano e a passo simile, se
// ce ne sono abbastanza. Le percentuali non dipendono dall'unità degli
// stream (ms, mm o cm). Funzioni pure.

import { PERFORMANCE_CONFIG } from './performance-config.js';
import { median, totalMovingSeconds } from './activity-streams.js';

const METRICS = Object.freeze([
    { key: 'gct', label: 'Tempo di contatto (GCT)' },
    { key: 'verticalOscillation', label: 'Oscillazione verticale' },
    { key: 'verticalRatio', label: 'Vertical ratio' }
]);

export function computeBiomechanics(samples, config = PERFORMANCE_CONFIG) {
    const settings = config.biomechanics;
    const empty = (reason, status = 'unavailable') => ({
        status,
        reason,
        normalized: null,
        metrics: {},
        gctSlopePerHour: null,
        gctSlopePercentPerHour: null
    });
    if (!samples) return empty('Nessuno stream di tempo e distanza.');
    const available = METRICS.filter(metric => samples.has[metric.key]);
    if (!available.length) return empty('Nessuna dinamica di corsa (GCT, oscillazione verticale) negli stream.');
    const total = totalMovingSeconds(samples);
    if (total < settings.minMovingSeconds) return empty(`Attività sotto ${Math.round(settings.minMovingSeconds / 60)} minuti.`);

    const warmup = Math.min(settings.warmupSeconds, total * 0.15);
    const earlyRange = [warmup, Math.max(warmup + settings.minWindowSeconds, total * settings.earlyEndFraction)];
    const lateRange = [total * settings.lateStartFraction, total];

    const referenceSpeed = median(
        collect(
            samples,
            index => samples.movingTime[index] >= warmup && isFlat(samples, index, settings.flatGrade),
            index => samples.speed[index]
        )
    );
    const comparable = index => {
        if (!referenceSpeed) return false;
        if (samples.has.altitude && !isFlat(samples, index, settings.flatGrade)) return false;
        return Math.abs(samples.speed[index] / referenceSpeed - 1) <= settings.speedBand;
    };

    const metrics = {};
    let normalizedAll = true;
    available.forEach(metric => {
        const values = samples[metric.key];
        const windowValues = (range, filter) => {
            const picked = [];
            let seconds = 0;
            for (let i = 1; i < samples.n; i += 1) {
                const time = samples.movingTime[i];
                if (!samples.dt[i] || time < range[0] || time > range[1] || values[i] === null) continue;
                if (filter && !filter(i)) continue;
                picked.push(values[i]);
                seconds += samples.dt[i];
            }
            return { picked, seconds };
        };
        let early = windowValues(earlyRange, comparable);
        let late = windowValues(lateRange, comparable);
        let normalized = true;
        if (early.seconds < settings.minWindowSeconds || late.seconds < settings.minWindowSeconds) {
            early = windowValues(earlyRange, null);
            late = windowValues(lateRange, null);
            normalized = false;
        }
        if (early.seconds < settings.minWindowSeconds || late.seconds < settings.minWindowSeconds) return;
        if (!normalized) normalizedAll = false;
        const earlyMedian = median(early.picked);
        const lateMedian = median(late.picked);
        metrics[metric.key] = {
            label: metric.label,
            early: round(earlyMedian, 2),
            late: round(lateMedian, 2),
            changePercent: earlyMedian > 0 ? round(((lateMedian - earlyMedian) / earlyMedian) * 100, 1) : null,
            normalized
        };
    });
    if (!Object.keys(metrics).length) return empty("Dinamiche di corsa troppo scarse all'inizio o nel finale.");

    let gctSlopePerHour = null;
    let gctSlopePercentPerHour = null;
    if (metrics.gct) {
        const filter = metrics.gct.normalized ? comparable : () => true;
        const points = [];
        for (let i = 1; i < samples.n; i += 1) {
            if (!samples.dt[i] || samples.movingTime[i] < warmup || samples.gct[i] === null || !filter(i)) continue;
            points.push([samples.movingTime[i] / 3600, samples.gct[i]]);
        }
        const slope = linearSlope(points);
        if (slope !== null) {
            gctSlopePerHour = round(slope, 2);
            gctSlopePercentPerHour = metrics.gct.early > 0 ? round((slope / metrics.gct.early) * 100, 2) : null;
        }
    }

    const reasons = [];
    if (!normalizedAll) reasons.push('Pochi tratti in piano a passo simile: confronto senza normalizzazione.');
    if (!samples.has.altitude) reasons.push('Altitudine assente: normalizzazione solo sul passo.');
    return {
        status: reasons.length ? 'partial' : 'ok',
        reason: reasons.join(' ') || null,
        normalized: normalizedAll ? (samples.has.altitude ? 'pace_grade' : 'pace') : 'none',
        metrics,
        gctSlopePerHour,
        gctSlopePercentPerHour
    };
}

// Allarmi con le soglie correnti (applicate in visualizzazione).
export function biomechanicsAlerts(result, config = PERFORMANCE_CONFIG) {
    if (!result || !result.metrics) return [];
    const settings = config.biomechanics;
    const alerts = [];
    const gct = result.metrics.gct;
    if (gct?.changePercent > settings.gctAlertPercent) {
        alerts.push(
            `GCT più lungo del ${format(gct.changePercent)}% nel finale (soglia ${format(settings.gctAlertPercent)}%): possibile cedimento neuromuscolare.`
        );
    }
    if (gct && result.gctSlopePercentPerHour !== null && gct.early > 0) {
        const slopeMsPerHour = (result.gctSlopePercentPerHour / 100) * guessMilliseconds(gct.early);
        if (slopeMsPerHour > settings.gctSlopeAlertMsPerHour) {
            alerts.push(`GCT in crescita di circa ${format(slopeMsPerHour)} ms/ora (soglia ${format(settings.gctSlopeAlertMsPerHour)}).`);
        }
    }
    const vo = result.metrics.verticalOscillation;
    if (vo?.changePercent > settings.voAlertPercent) {
        alerts.push(`Oscillazione verticale aumentata del ${format(vo.changePercent)}% (soglia ${format(settings.voAlertPercent)}%).`);
    }
    const ratio = result.metrics.verticalRatio;
    if (ratio?.changePercent > settings.verticalRatioAlertPercent) {
        alerts.push(
            `Vertical ratio aumentato del ${format(ratio.changePercent)}% (soglia ${format(settings.verticalRatioAlertPercent)}%).`
        );
    }
    return alerts;
}

// GCT in ms (200-400) oppure in secondi (0,2-0,4).
function guessMilliseconds(value) {
    return value < 5 ? value * 1000 : value;
}

function isFlat(samples, index, flatGrade) {
    return !samples.has.altitude || Math.abs(samples.grade[index]) <= flatGrade;
}

function collect(samples, filter, pick) {
    const values = [];
    for (let i = 1; i < samples.n; i += 1) {
        if (samples.dt[i] && filter(i)) values.push(pick(i));
    }
    return values;
}

export function linearSlope(points, minPoints = 10) {
    if (points.length < minPoints) return null;
    const n = points.length;
    const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
    const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
    let numerator = 0;
    let denominator = 0;
    points.forEach(([x, y]) => {
        numerator += (x - meanX) * (y - meanY);
        denominator += (x - meanX) ** 2;
    });
    return denominator > 0 ? numerator / denominator : null;
}

function format(value) {
    return String(Math.round(value * 10) / 10).replace('.', ',');
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
