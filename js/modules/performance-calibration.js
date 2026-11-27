// Revisione periodica delle soglie dell'analisi prestazioni.
// L'atleta ha considerato valide le soglie iniziali il 27 novembre 2026,
// con rivalutazione ogni 15 giorni in base all'andamento dei dati. Qui si
// calcola la proposta; le modifiche diventano effettive solo dopo
// l'approvazione dell'atleta (tabella performance_threshold_reviews).
// Ogni proposta resta entro ±maxAdjustment dal valore iniziale. Funzioni pure.

import { PERFORMANCE_CONFIG, THRESHOLD_KEYS, THRESHOLD_LABELS, readPath, withThresholds } from './performance-config.js';
import { addDays, eccentricStatus, hrvStatus } from './mechanical-readiness.js';

export const REVIEW_STATUSES = Object.freeze(['proposed', 'approved', 'rejected', 'no_change']);

/**
 * @typedef {Object} ThresholdReview
 * @property {string} [id]
 * @property {string} reviewed_at Data 'AAAA-MM-GG'.
 * @property {'proposed'|'approved'|'rejected'|'no_change'} status
 * @property {{ changes: ThresholdChange[], observations: string[] }} proposal
 * @property {Record<string, number>} thresholds Soglie effettive dopo la revisione.
 */
/**
 * @typedef {Object} ThresholdChange
 * @property {string} key
 * @property {string} label
 * @property {number} current
 * @property {number} proposed
 * @property {string} reason
 */

// Soglie approvate: quelle dell'ultima revisione approvata.
export function effectiveThresholds(reviews) {
    const approved = sortReviews(reviews).filter(review => review.status === 'approved');
    const last = approved[approved.length - 1];
    return last?.thresholds && typeof last.thresholds === 'object' ? { ...last.thresholds } : {};
}

export function effectiveConfig(reviews, base = PERFORMANCE_CONFIG) {
    return withThresholds(effectiveThresholds(reviews), base);
}

export function pendingReview(reviews) {
    const sorted = sortReviews(reviews);
    const last = sorted[sorted.length - 1];
    return last?.status === 'proposed' ? last : null;
}

export function nextReviewDate(reviews, config = PERFORMANCE_CONFIG) {
    const sorted = sortReviews(reviews);
    const last = sorted[sorted.length - 1]?.reviewed_at || config.review.approvedAt;
    return addDays(last, config.review.intervalDays);
}

export function isReviewDue(reviews, today, config = PERFORMANCE_CONFIG) {
    return !pendingReview(reviews) && today >= nextReviewDate(reviews, config);
}

/**
 * Proposta di revisione dai dati degli ultimi `lookbackDays` giorni.
 * @param {{ analyses: object[], eccentricEntries: object[], wellness: object[], today: string, config?: object }} input
 * @returns {{ windowFrom: string, windowTo: string, changes: ThresholdChange[], observations: string[] }}
 */
export function proposeThresholdReview({ analyses = [], eccentricEntries = [], wellness = [], today, config = PERFORMANCE_CONFIG }) {
    const review = config.review;
    const windowFrom = addDays(today, -(review.lookbackDays - 1));
    const changes = [];
    const observations = [];
    const recent = analyses.filter(item => item?.date >= windowFrom && item.date <= today);

    // 1. Carico eccentrico alto seguito (entro 2 giorni) da HRV sotto range?
    const days = [];
    for (let date = windowFrom; date <= today; date = addDays(date, 1)) days.push(date);
    const eccentricByDay = new Map(days.map(date => [date, eccentricStatus(eccentricEntries, date, config)]));
    const hrvByDay = new Map(days.map(date => [date, hrvStatus(wellness, date, config)]));
    const hrvDays = days.filter(date => hrvByDay.get(date).status === 'ok');
    const highEpisodes = days.filter(
        (date, index) => eccentricByDay.get(date).level === 'high' && (index === 0 || eccentricByDay.get(days[index - 1]).level !== 'high')
    );
    const followedByLowHrv = date => [1, 2].some(offset => hrvByDay.get(addDays(date, offset))?.level === 'below');
    const testable = highEpisodes.filter(
        date => addDays(date, 2) <= today && [1, 2].some(offset => hrvByDay.get(addDays(date, offset))?.status === 'ok')
    );
    const lowHrvEpisodes = days.filter(
        (date, index) => hrvByDay.get(date).level === 'below' && (index === 0 || hrvByDay.get(days[index - 1]).level !== 'below')
    );
    const missedModerate = lowHrvEpisodes.filter(date => {
        const ratios = [0, 1, 2].map(offset => eccentricByDay.get(addDays(date, -offset)));
        return ratios.some(status => status?.level === 'moderate') && !ratios.some(status => status?.level === 'high');
    });
    if (testable.length >= review.minEccentricEvents) {
        const hitRate = testable.filter(followedByLowHrv).length / testable.length;
        observations.push(
            `Carico eccentrico alto: ${testable.length} episodi, HRV sotto range nei 2 giorni seguenti nel ${Math.round(hitRate * 100)}% dei casi.`
        );
        if (hitRate < 0.25) {
            pushChange(
                changes,
                config,
                'readiness.ratioHigh',
                +1,
                `Gli episodi di carico eccentrico "alto" raramente sono seguiti da HRV bassa (${Math.round(hitRate * 100)}%): soglia probabilmente troppo prudente.`
            );
        }
    } else {
        observations.push(
            `Carico eccentrico alto: ${testable.length} episodi con HRV disponibile, ne servono ${review.minEccentricEvents} per rivedere la soglia.`
        );
    }
    if (
        lowHrvEpisodes.length >= 2 &&
        missedModerate.length / lowHrvEpisodes.length > 0.5 &&
        !changes.some(change => change.key === 'readiness.ratioHigh')
    ) {
        pushChange(
            changes,
            config,
            'readiness.ratioHigh',
            -1,
            `${missedModerate.length} cali di HRV su ${lowHrvEpisodes.length} sono arrivati dopo carico eccentrico solo "medio": soglia probabilmente troppo alta.`
        );
    }

    // 2. Rumore personale di GCT e oscillazione verticale nelle corse costanti.
    const steady = recent.filter(
        item =>
            Number.isFinite(item.decoupling?.driftPercent) &&
            item.decoupling.steady !== false &&
            item.decoupling.driftPercent <= config.decoupling.goodMaxPercent
    );
    [
        ['gct', 'biomechanics.gctAlertPercent', 'GCT'],
        ['verticalOscillation', 'biomechanics.voAlertPercent', 'oscillazione verticale']
    ].forEach(([metric, key, label]) => {
        const changesPercent = steady.map(item => item.biomechanics?.metrics?.[metric]?.changePercent).filter(Number.isFinite);
        if (changesPercent.length < review.minSteadyRuns) {
            observations.push(
                `Variazione ${label} nelle corse costanti: ${changesPercent.length} corse, ne servono ${review.minSteadyRuns}.`
            );
            return;
        }
        const mean = average(changesPercent);
        const sd = Math.sqrt(average(changesPercent.map(value => (value - mean) ** 2)));
        const normalUpper = round(mean + 2 * sd, 1);
        const current = readPath(config, key);
        observations.push(
            `Variazione ${label} nelle corse costanti: media ${format(mean)}%, limite normale personale ${format(normalUpper)}% (${changesPercent.length} corse).`
        );
        if (normalUpper > current * (1 + review.step)) {
            pushChange(
                changes,
                config,
                key,
                +1,
                `Nelle tue corse costanti la ${label} varia fino a ${format(normalUpper)}%: la soglia attuale darebbe falsi allarmi.`,
                normalUpper
            );
        } else if (normalUpper < current * 0.5) {
            pushChange(
                changes,
                config,
                key,
                -1,
                `Nelle tue corse costanti la ${label} varia al massimo del ${format(normalUpper)}%: una soglia più bassa coglie prima il cedimento.`,
                normalUpper
            );
        }
    });

    // 3. HRV: quante giornate sotto range negli ultimi 15 giorni.
    const shortFrom = addDays(today, -(review.intervalDays - 1));
    const shortHrvDays = hrvDays.filter(date => date >= shortFrom);
    if (shortHrvDays.length >= review.minHrvDays) {
        const belowShare = shortHrvDays.filter(date => hrvByDay.get(date).level === 'below').length / shortHrvDays.length;
        const belowWithoutLoad = shortHrvDays.filter(
            date => hrvByDay.get(date).level === 'below' && eccentricByDay.get(date).level === 'low'
        ).length;
        observations.push(`HRV sotto range nel ${Math.round(belowShare * 100)}% degli ultimi ${review.intervalDays} giorni.`);
        if (belowShare >= 0.4 && belowWithoutLoad / shortHrvDays.length >= 0.3) {
            pushChange(
                changes,
                config,
                'readiness.hrv.swcSd',
                +1,
                `HRV sotto range nel ${Math.round(belowShare * 100)}% dei giorni anche senza carico eccentrico: range troppo stretto per la tua variabilità.`
            );
        }
        const longBelow = hrvDays.filter(date => hrvByDay.get(date).level === 'below').length;
        if (
            hrvDays.length >= 60 &&
            longBelow === 0 &&
            testable.some(followedByLowHrv) === false &&
            testable.length >= review.minEccentricEvents
        ) {
            pushChange(
                changes,
                config,
                'readiness.hrv.swcSd',
                -1,
                "In 60 giorni l'HRV non è mai uscita dal range, nemmeno dopo carichi alti: range probabilmente troppo largo."
            );
        }
    } else {
        observations.push(`HRV: ${shortHrvDays.length} giorni utili negli ultimi ${review.intervalDays}, ne servono ${review.minHrvDays}.`);
    }

    // 4. Deriva cardiaca: soglie di letteratura, solo osservazione.
    const drifts = recent.map(item => item.decoupling?.driftPercent).filter(Number.isFinite);
    if (drifts.length) {
        const sorted = drifts.slice().sort((a, b) => a - b);
        observations.push(
            `Deriva cardiaca: mediana ${format(sorted[sorted.length >> 1])}% su ${drifts.length} sedute di endurance (soglie 3,5% e 5% di letteratura, non modificate automaticamente).`
        );
    }

    return { windowFrom, windowTo: today, changes, observations };
}

// Soglie effettive dopo l'approvazione di una proposta.
export function applyChanges(currentThresholds, changes) {
    const next = { ...(currentThresholds || {}) };
    (changes || []).forEach(change => {
        if (THRESHOLD_KEYS.includes(change.key) && Number.isFinite(change.proposed)) next[change.key] = change.proposed;
    });
    return next;
}

function pushChange(changes, config, key, direction, reason, target = null) {
    const { maxAdjustment, step } = config.review;
    const initial = readPath(PERFORMANCE_CONFIG, key);
    const current = readPath(config, key);
    const raw = target ?? current * (1 + direction * step);
    const bounded = Math.min(initial * (1 + maxAdjustment), Math.max(initial * (1 - maxAdjustment), raw));
    const proposed = round(bounded, key.startsWith('readiness') ? 2 : 1);
    if (Math.abs(proposed - current) < 1e-9) return;
    // Le soglie della stessa scala devono restare ordinate.
    if (key === 'readiness.ratioHigh' && proposed <= readPath(config, 'readiness.ratioModerate')) return;
    changes.push({ key, label: THRESHOLD_LABELS[key] || key, current, proposed, reason });
}

function sortReviews(reviews) {
    return (Array.isArray(reviews) ? reviews : [])
        .filter(review => review?.reviewed_at)
        .slice()
        .sort(
            (left, right) =>
                String(left.reviewed_at).localeCompare(String(right.reviewed_at)) ||
                String(left.created_at || '').localeCompare(String(right.created_at || ''))
        );
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function format(value) {
    return String(Math.round(value * 10) / 10).replace('.', ',');
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
