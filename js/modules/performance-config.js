// Costanti dell'analisi avanzata delle prestazioni (GAP, EF, deriva cardiaca,
// decadimento biomeccanico, carico meccanico e prontezza).
//
// Non vengono dal libro "Tipi che corrono": sono letteratura generale
// (Minetti 2002 per il costo energetico in pendenza, soglia di deriva al 5%,
// metodo HRV con media a 7 giorni contro baseline) più pesi derivati per il
// carico eccentrico. L'atleta li ha considerati validi il 27 novembre 2026,
// con revisione ogni 15 giorni in base all'andamento dei dati
// (performance-calibration.js): le proposte di modifica vanno approvate.
//
// PERFORMANCE_CONFIG_VERSION cambia quando cambia un calcolo salvato in cache
// (activity_performance_analyses.config_version): le analisi si ricalcolano.
// Le soglie in THRESHOLD_KEYS servono solo a classificare e si applicano
// al momento della visualizzazione, senza ricalcolo.

export const PERFORMANCE_CONFIG_VERSION = '1.0.0';

/**
 * @typedef {Object} PerformanceConfig
 * @property {Object} streams
 * @property {Object} smoothing
 * @property {Object} gap
 * @property {Object} efficiency
 * @property {Object} decoupling
 * @property {Object} biomechanics
 * @property {Object} mechanicalLoad
 * @property {Object} readiness
 * @property {Object} review
 */

/** @type {PerformanceConfig} */
export const PERFORMANCE_CONFIG = deepFreeze({
    streams: {
        // Sotto questa velocità il campione è considerato fermo.
        minMovingSpeedMps: 0.5,
        // Un salto di tempo maggiore è una pausa: il tratto non conta.
        maxSampleGapSeconds: 10,
        // Analisi solo per corse e trail abbastanza lunghe.
        minMovingSeconds: 600,
        historyDays: 90,
        maxActivitiesPerSync: 120,
        concurrency: 2
    },
    smoothing: {
        // Filtro mediano sull'altitudine (campioni), poi media mobile in metri.
        altitudeMedianWindow: 5,
        altitudeDistanceWindowM: 30,
        // Distanza minima su cui si misura la pendenza.
        gradeWindowM: 20,
        // Intervallo di validità del modello di Minetti.
        maxAbsGrade: 0.45
    },
    gap: {
        model: 'minetti2002',
        // C(i) = 155,4i^5 - 30,4i^4 - 43,3i^3 + 46,3i^2 + 19,5i + 3,6 (J/kg/m).
        coefficients: [155.4, -30.4, -43.3, 46.3, 19.5, 3.6],
        // Fattore minimo in discesa (es. 0.8). null = Minetti puro.
        downhillFactorFloor: null
    },
    efficiency: {
        // EF in salita: solo campioni con pendenza oltre +6%.
        uphillGrade: 0.06,
        minUphillSeconds: 120,
        // Salita continua per la VAM.
        climbMinGainM: 50,
        climbMinDurationSeconds: 180,
        climbMaxDipM: 10,
        // FC media plausibile per l'EF.
        minAverageHr: 60,
        maxAverageHr: 220,
        trendDays: [60, 90],
        // Durata minima perché l'EF di un'attività entri nel trend.
        trendMinMovingSeconds: 1200
    },
    decoupling: {
        minMovingSeconds: 3600,
        minDistanceM: 12000,
        warmupSeconds: 600,
        // 'time' oppure 'distance'.
        splitBy: 'time',
        // Coefficiente di variazione del GAP sui blocchi da 60 s: oltre, la
        // seduta non è costante e la deriva è poco affidabile.
        unsteadyCv: 0.15,
        blockSeconds: 60,
        excellentMaxPercent: 3.5,
        goodMaxPercent: 5
    },
    biomechanics: {
        minMovingSeconds: 1200,
        warmupSeconds: 600,
        earlyEndFraction: 0.30,
        lateStartFraction: 0.80,
        flatGrade: 0.03,
        speedBand: 0.10,
        minWindowSeconds: 60,
        gctAlertPercent: 4,
        gctSlopeAlertMsPerHour: 8,
        voAlertPercent: 5,
        verticalRatioAlertPercent: 5
    },
    mechanicalLoad: {
        // La discesa conta da -3%; sotto -8% e -15% pesa di più.
        descentStartGrade: -0.03,
        eccentricBands: [
            { minGrade: -0.08, weight: 1 },
            { minGrade: -0.15, weight: 1.5 },
            { minGrade: -Infinity, weight: 2 }
        ],
        // Punti di carico ogni 100 m di D- pesato.
        pointsPer100m: 10,
        // Senza stream: D- dell'attività (o D+ se manca) con un peso medio.
        summaryFallbackWeight: 1.25,
        // Senza carico Intervals né TRIMP: punti per ora di movimento.
        durationLoadPerHour: 50
    },
    readiness: {
        acuteDays: 7,
        acuteHalfLifeDays: 2,
        chronicDays: 28,
        // Rapporto acuto/cronico del carico eccentrico.
        ratioModerate: 1.0,
        ratioHigh: 1.5,
        // Sotto questi punti eccentrici acuti lo stato è sempre basso.
        minAcutePoints: 10,
        // Una discesa recente molto grande porta lo stato almeno a medio.
        bigDescentPoints: 60,
        bigDescentHours: 72,
        hrv: {
            shortDays: 7,
            minShortValues: 3,
            baselineDays: 30,
            minBaselineValues: 14,
            // Range normale = media ln(rMSSD) ± swcSd × deviazione standard.
            swcSd: 0.5
        },
        restingHrAlertBpm: 5
    },
    review: {
        approvedBy: 'Andrea Baron',
        approvedAt: '2026-11-27',
        intervalDays: 15,
        // Una proposta non sposta una soglia oltre ±30% dal valore iniziale.
        maxAdjustment: 0.3,
        step: 0.1,
        lookbackDays: 90,
        minEccentricEvents: 4,
        minSteadyRuns: 5,
        minHrvDays: 10
    }
});

// Soglie modificabili dalla revisione periodica: percorso nella config.
export const THRESHOLD_KEYS = Object.freeze([
    'decoupling.excellentMaxPercent',
    'decoupling.goodMaxPercent',
    'biomechanics.gctAlertPercent',
    'biomechanics.voAlertPercent',
    'readiness.ratioModerate',
    'readiness.ratioHigh',
    'readiness.hrv.swcSd'
]);

export const THRESHOLD_LABELS = Object.freeze({
    'decoupling.excellentMaxPercent': 'Deriva cardiaca: limite "ottima" (%)',
    'decoupling.goodMaxPercent': 'Deriva cardiaca: limite "buona" (%)',
    'biomechanics.gctAlertPercent': 'Allarme allungamento GCT (%)',
    'biomechanics.voAlertPercent': 'Allarme aumento oscillazione verticale (%)',
    'readiness.ratioModerate': 'Carico eccentrico: rapporto acuto/cronico "medio"',
    'readiness.ratioHigh': 'Carico eccentrico: rapporto acuto/cronico "alto"',
    'readiness.hrv.swcSd': 'HRV: ampiezza del range normale (deviazioni standard)'
});

export function readPath(object, path) {
    return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

// Config effettiva: valori iniziali più le soglie approvate nelle revisioni.
export function withThresholds(overrides = {}, base = PERFORMANCE_CONFIG) {
    const copy = structuredCloneSafe(base);
    Object.entries(overrides || {}).forEach(([path, value]) => {
        if (!THRESHOLD_KEYS.includes(path) || !Number.isFinite(Number(value))) return;
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((object, key) => object[key], copy);
        target[last] = Number(value);
    });
    return deepFreeze(copy);
}

function structuredCloneSafe(value) {
    if (Array.isArray(value)) return value.map(structuredCloneSafe);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structuredCloneSafe(item)]));
    }
    return value;
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}
