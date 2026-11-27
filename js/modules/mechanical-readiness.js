// Carico meccanico (Mechanical Load Score) e prontezza muscolare/sistemica.
// I modelli cardio (TSS, TRIMP) sottostimano il danno eccentrico delle
// discese: il punteggio aggiunge al carico cardio i metri di D- pesati per
// pendenza. La prontezza incrocia il carico eccentrico acuto (rispetto al
// cronico) con l'HRV notturna (media a 7 giorni contro baseline a 30).
// Funzioni pure: date come stringhe 'AAAA-MM-GG'.

import { PERFORMANCE_CONFIG } from './performance-config.js';

const ECCENTRIC_SPORTS = ['run', 'trail', 'hike', 'walk', 'snowshoe'];

export function eccentricFromSamples(samples, config = PERFORMANCE_CONFIG) {
    if (!samples?.has.altitude) return null;
    const { descentStartGrade, eccentricBands } = config.mechanicalLoad;
    const byBand = eccentricBands.map(() => 0);
    let lossM = 0;
    let descentM = 0;
    let weighted = 0;
    let descentDistance = 0;
    for (let i = 1; i < samples.n; i += 1) {
        if (!samples.dt[i]) continue;
        const drop = samples.altitude[i - 1] - samples.altitude[i];
        if (drop <= 0) continue;
        lossM += drop;
        const grade = samples.grade[i];
        if (grade > descentStartGrade) continue;
        const band = eccentricBands.findIndex(item => grade >= item.minGrade);
        const index = band === -1 ? eccentricBands.length - 1 : band;
        byBand[index] += drop;
        descentM += drop;
        weighted += drop * eccentricBands[index].weight;
        descentDistance += samples.distance[i] - samples.distance[i - 1];
    }
    return {
        source: 'streams',
        elevationLossM: Math.round(lossM),
        descentM: Math.round(descentM),
        weightedDescentM: Math.round(weighted),
        averageDescentGradePercent: descentDistance > 0 ? round(-descentM / descentDistance * 100, 1) : null,
        // minGrade null = nessun limite inferiore (JSON non ammette -Infinity).
        byBand: eccentricBands.map((item, index) => ({ minGrade: Number.isFinite(item.minGrade) ? item.minGrade : null, weight: item.weight, meters: Math.round(byBand[index]) }))
    };
}

export function eccentricFromSummary(activity, config = PERFORMANCE_CONFIG) {
    const loss = positiveOrZero(activity?.total_elevation_loss);
    const gain = positiveOrZero(activity?.total_elevation_gain);
    const meters = loss ?? gain;
    if (meters === null) return null;
    return {
        source: loss !== null ? 'summary' : 'summary_assumed',
        elevationLossM: Math.round(meters),
        descentM: Math.round(meters),
        weightedDescentM: Math.round(meters * config.mechanicalLoad.summaryFallbackWeight),
        averageDescentGradePercent: null,
        byBand: []
    };
}

export function cardioLoad(activity, movingSeconds, config = PERFORMANCE_CONFIG) {
    const icu = positiveOrZero(activity?.icu_training_load);
    if (icu !== null) return { value: Math.round(icu), source: 'intervals' };
    const trimp = positiveOrZero(activity?.trimp);
    if (trimp !== null) return { value: Math.round(trimp), source: 'trimp' };
    const seconds = movingSeconds || positiveOrZero(activity?.moving_time) || 0;
    if (seconds > 0) return { value: Math.round(seconds / 3600 * config.mechanicalLoad.durationLoadPerHour), source: 'duration' };
    return { value: 0, source: 'none' };
}

export function isEccentricSport(activity) {
    const type = String(activity?.type || '').toLowerCase();
    return ECCENTRIC_SPORTS.some(sport => type.includes(sport));
}

/**
 * Mechanical Load Score = carico cardio + punti ogni 100 m di D- pesato.
 */
export function computeMechanicalLoad(activity, samples, movingSeconds, config = PERFORMANCE_CONFIG) {
    const cardio = cardioLoad(activity, movingSeconds, config);
    const eccentric = isEccentricSport(activity)
        ? eccentricFromSamples(samples, config) || eccentricFromSummary(activity, config)
        : null;
    const eccentricPoints = eccentric ? round(eccentric.weightedDescentM / 100 * config.mechanicalLoad.pointsPer100m, 1) : 0;
    const reasons = [];
    if (cardio.source === 'duration') reasons.push('Carico cardio stimato dalla durata.');
    if (eccentric?.source === 'summary') reasons.push('D- dal riepilogo dell\'attività, senza pendenza.');
    if (eccentric?.source === 'summary_assumed') reasons.push('D- non disponibile: assunto uguale al D+.');
    return {
        status: cardio.source === 'none' ? 'unavailable' : reasons.length ? 'partial' : 'ok',
        reason: cardio.source === 'none' ? 'Né carico né durata disponibili.' : reasons.join(' ') || null,
        cardioLoad: cardio.value,
        cardioSource: cardio.source,
        eccentric,
        eccentricPoints,
        score: round(cardio.value + eccentricPoints, 1)
    };
}

/**
 * Stato del carico eccentrico al giorno `today`.
 * @param {{date: string, eccentricPoints: number}[]} entries
 */
export function eccentricStatus(entries, today, config = PERFORMANCE_CONFIG) {
    const settings = config.readiness;
    const byDate = new Map();
    (entries || []).forEach(entry => {
        if (!entry?.date || !Number.isFinite(entry.eccentricPoints)) return;
        byDate.set(entry.date, (byDate.get(entry.date) || 0) + entry.eccentricPoints);
    });
    const decay = age => 0.5 ** (age / settings.acuteHalfLifeDays);
    let acute = 0;
    let decaySum = 0;
    for (let age = 0; age < settings.acuteDays; age += 1) {
        acute += (byDate.get(addDays(today, -age)) || 0) * decay(age);
        decaySum += decay(age);
    }
    let chronicTotal = 0;
    for (let age = 0; age < settings.chronicDays; age += 1) chronicTotal += byDate.get(addDays(today, -age)) || 0;
    const chronicDaily = chronicTotal / settings.chronicDays;
    const expected = chronicDaily * decaySum;
    const ratio = expected > 0 ? acute / expected : acute > 0 ? Infinity : 0;
    const bigDays = Math.ceil(settings.bigDescentHours / 24);
    let bigDescent = null;
    for (let age = 0; age < bigDays; age += 1) {
        const points = byDate.get(addDays(today, -age)) || 0;
        if (points >= settings.bigDescentPoints && (!bigDescent || points > bigDescent.points)) {
            bigDescent = { date: addDays(today, -age), points: round(points, 1) };
        }
    }
    let level = 'low';
    if (acute >= settings.minAcutePoints) {
        if (ratio >= settings.ratioHigh) level = 'high';
        else if (ratio >= settings.ratioModerate) level = 'moderate';
    }
    if (bigDescent && level === 'low') level = 'moderate';
    return {
        level,
        acutePoints: round(acute, 1),
        chronicDailyPoints: round(chronicDaily, 1),
        ratio: Number.isFinite(ratio) ? round(ratio, 2) : null,
        noChronicBase: !Number.isFinite(ratio),
        bigDescent
    };
}

/**
 * HRV: media di ln(rMSSD) a 7 giorni contro baseline a 30 giorni,
 * range normale = media ± swcSd × deviazione standard.
 */
export function hrvStatus(wellness, today, config = PERFORMANCE_CONFIG) {
    const settings = config.readiness.hrv;
    const values = wellnessValues(wellness, 'hrv');
    const shortFrom = addDays(today, -(settings.shortDays - 1));
    const baselineFrom = addDays(today, -(settings.baselineDays - 1));
    const short = values.filter(item => item.date >= shortFrom && item.date <= today).map(item => Math.log(item.value));
    const baseline = values.filter(item => item.date >= baselineFrom && item.date <= today).map(item => Math.log(item.value));
    if (short.length < settings.minShortValues || baseline.length < settings.minBaselineValues) {
        return {
            status: 'unavailable',
            reason: `HRV insufficiente: servono ${settings.minShortValues} valori negli ultimi ${settings.shortDays} giorni e ${settings.minBaselineValues} negli ultimi ${settings.baselineDays}.`,
            level: null
        };
    }
    const mean = average(baseline);
    const sd = Math.sqrt(average(baseline.map(value => (value - mean) ** 2)));
    const shortMean = average(short);
    const lower = mean - settings.swcSd * sd;
    const upper = mean + settings.swcSd * sd;
    const level = shortMean < lower ? 'below' : shortMean > upper ? 'above' : 'within';
    return {
        status: 'ok',
        reason: null,
        level,
        shortMeanMs: Math.round(Math.exp(shortMean)),
        baselineMeanMs: Math.round(Math.exp(mean)),
        normalRangeMs: [Math.round(Math.exp(lower)), Math.round(Math.exp(upper))],
        shortValues: short.length,
        baselineValues: baseline.length
    };
}

export function restingHrStatus(wellness, today, config = PERFORMANCE_CONFIG) {
    const values = wellnessValues(wellness, 'restingHR');
    const short = values.filter(item => item.date >= addDays(today, -6) && item.date <= today).map(item => item.value);
    const baseline = values.filter(item => item.date >= addDays(today, -29) && item.date <= today).map(item => item.value);
    if (short.length < 3 || baseline.length < 10) return null;
    const shortMean = average(short);
    const baselineMean = average(baseline);
    return {
        shortMean: round(shortMean, 1),
        baselineMean: round(baselineMean, 1),
        elevated: shortMean - baselineMean > config.readiness.restingHrAlertBpm
    };
}

/**
 * Indicatore di prontezza: verde, giallo (muscolare o sistemico), rosso.
 */
export function computeReadiness({ eccentricEntries = [], wellness = [], today, config = PERFORMANCE_CONFIG }) {
    const eccentric = eccentricStatus(eccentricEntries, today, config);
    const hrv = hrvStatus(wellness, today, config);
    const restingHr = restingHrStatus(wellness, today, config);
    const hasEccentricData = (eccentricEntries || []).length > 0;
    if (!hasEccentricData && hrv.status !== 'ok') {
        return { level: 'unavailable', kind: null, headline: 'Prontezza non calcolabile: servono attività analizzate o dati HRV.', advice: [], eccentric, hrv, restingHr };
    }
    const advice = [];
    let level = 'green';
    let kind = null;
    let headline = 'Pronto: carico recente assorbito.';
    const hrvBelow = hrv.status === 'ok' && hrv.level === 'below';
    if (hrvBelow && eccentric.level === 'high') {
        level = 'red';
        kind = 'combined';
        headline = 'Solo recupero: HRV sotto il tuo range e carico eccentrico recente alto.';
        advice.push('Niente qualità né discese: corsa molto facile in piano, camminata o riposo.');
    } else if (hrvBelow) {
        level = 'amber';
        kind = 'systemic';
        headline = 'Fatica sistemica: HRV sotto il tuo range normale.';
        advice.push('Rimanda i lavori di qualità; resta su intensità facile finché l\'HRV rientra.');
    } else if (eccentric.level === 'high') {
        level = 'amber';
        kind = 'muscular';
        headline = 'Carico eccentrico non ancora assorbito.';
        advice.push('Evita discese tecniche e lavori di qualità in discesa; preferisci salita o piano.');
        if (hrv.status === 'ok') advice.push('HRV nella norma: il sistema cardiovascolare è recuperato, i muscoli ancora no.');
    } else if (eccentric.level === 'moderate') {
        headline = 'Pronto, con discese recenti da gestire.';
        advice.push('Qualità possibile; discese tecniche con prudenza.');
    }
    if (eccentric.bigDescent && level === 'green') {
        advice.push(`Discesa importante il ${eccentric.bigDescent.date}: le DOMS possono comparire fino a 48-72 ore dopo.`);
    }
    if (hrv.status === 'ok' && hrv.level === 'above') {
        advice.push('HRV sopra il range: a volte segnala fatica accumulata, valuta le sensazioni.');
    }
    if (hrv.status !== 'ok') advice.push(hrv.reason);
    if (restingHr?.elevated) advice.push(`FC a riposo media ${String(restingHr.shortMean).replace('.', ',')} bpm, sopra la tua media di ${String(restingHr.baselineMean).replace('.', ',')}.`);
    return { level, kind, headline, advice, eccentric, hrv, restingHr };
}

function wellnessValues(wellness, key) {
    return (Array.isArray(wellness) ? wellness : [])
        .filter(record => record && typeof record === 'object')
        .map(record => ({ date: String(record.date ?? record.id ?? '').slice(0, 10), value: Number(record[key]) }))
        .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.value) && item.value > 0);
}

export function addDays(dateKey, days) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveOrZero(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
