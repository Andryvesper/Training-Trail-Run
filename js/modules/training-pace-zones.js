// Fasce di passo dei mezzi di allenamento ricavate dalla VR, come scarti in
// secondi/km stampati in "Tipi che corrono" (positivo = più lento della VR).
// Dove il libro non dà un numero (SB, MLSS sotto 800 m) non si calcola
// alcun passo: la seduta resta guidata da sforzo e frequenza cardiaca.

const RULES = Object.freeze({
    CRMF: { label: 'CRMF', min: 60, max: 90, page: '174' },
    CRF: { label: 'CRF', min: 40, max: 50, page: '176-177' },
    CRLI: { label: 'CRLI', min: 15, max: 25, page: '177' },
    CRI: { label: 'CRI', min: 5, max: 10, page: '177' },
    LLM: { label: 'CRF (lunghissimo)', min: 50, max: 60, page: '179-180' },
    RMA: { label: 'ritmo maratona', min: 30, max: 40, page: '192' },
    RME: { label: 'ritmo mezza', min: 5, max: 10, page: '192' },
    RG10: { label: 'ritmo gara 10 km', min: 0, max: 0, page: '192' }
});

// Medio: un solo valore che dipende dalla gara obiettivo (p. 178).
const MEDIO_BY_GOAL = Object.freeze([
    { maxKm: 10.5, offset: 10 },
    { maxKm: 21.5, offset: 15 },
    { maxKm: Infinity, offset: 20 }
]);

// Ripetute MLSS (pp. 182-184) e VAM (pp. 184-187): scarto per distanza della prova.
const MLSS_BY_METERS = Object.freeze({ 800: -9, 1000: -8, 1200: -7, 1600: -5, 2000: -4, 2400: -3, 3000: -2 });
const VAM_BY_METERS = Object.freeze({ 200: -30, 300: -25, 400: -20, 500: -15, 600: -10 });

export const PACE_ZONE_SOURCE = Object.freeze({
    title: 'Tipi che corrono',
    pages: '174-192',
    notes: Object.freeze([
        'Lento: p. 174 indica 50-60", p. 176 (amatore vero, come le tabelle) 40-50": si usa 40-50".',
        'Ritmo mezza: p. 192 indica 5-10", p. 181 circa 10": si usa la definizione dedicata di p. 192.',
        'SB e MLSS sotto 800 m: nessun passo numerico nel libro, si usano sforzo e frequenza cardiaca.'
    ])
});

export function paceBandsForCell(raw, vrSecondsPerKm, goalDistanceKm) {
    if (!Number.isInteger(vrSecondsPerKm) || vrSecondsPerKm <= 0) return [];
    const text = String(raw ?? '').split('/').join(' ').replace(/\s+/g, ' ');
    const bands = [];
    const add = (key, label, min, max, page) => {
        if (bands.some(band => band.key === key)) return;
        bands.push({
            key,
            label,
            fastestSecondsPerKm: vrSecondsPerKm + min,
            slowestSecondsPerKm: vrSecondsPerKm + max,
            page
        });
    };
    const rule = (key, code = key) => {
        const r = RULES[key];
        add(code, r.label, r.min, r.max, r.page);
    };
    const reps = [...text.matchAll(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(km|m)\b\s*(?:in\s+salita\s+)?(MLSS|VAM|SB)?/gi)];

    if (/\bMLSS\b/.test(text)) {
        reps.map(repMeters).forEach(meters => {
            const offset = MLSS_BY_METERS[meters];
            if (offset === undefined) {
                bands.push({ key: `MLSS${meters}`, label: `MLSS ${meters} m`, fastestSecondsPerKm: null, slowestSecondsPerKm: null, page: '182-184', note: 'Distanza non prevista dal libro: nessun passo calcolato.' });
            } else {
                add(`MLSS${meters}`, `MLSS ${meters} m`, offset, offset, '182-184');
            }
        });
    }
    if (/\bVAM\b/.test(text)) {
        reps.map(repMeters).forEach(meters => {
            const offset = VAM_BY_METERS[meters];
            if (offset === undefined) {
                bands.push({ key: `VAM${meters}`, label: `VAM ${meters} m`, fastestSecondsPerKm: null, slowestSecondsPerKm: null, page: '184-187', note: 'Distanza non prevista dal libro: nessun passo calcolato.' });
            } else {
                add(`VAM${meters}`, `VAM ${meters} m`, offset, offset, '184-187');
            }
        });
    }
    if (/\bSB\b/.test(text)) {
        bands.push({ key: 'SB', label: 'Salite SB', fastestSecondsPerKm: null, slowestSecondsPerKm: null, page: '185-189', note: 'In salita: ritmo CRI a sforzo 7-8 e 85-90% di PMAX, senza passo.' });
    }
    if (/\bLLM\b/.test(text)) rule('LLM');
    // Tabella ultra evoluti, p. 266: ritmo ultramaratona (RUM) = VR + 1'30".
    if (/\bLLU\b/.test(text)) add('LLU', 'lunghissimo ultra (RUM)', 90, 90, '266');
    if (/\bDAU\b/.test(text)) add('DAU', 'day after ultra (CRMF)', RULES.CRMF.min, RULES.CRMF.max, RULES.CRMF.page);
    if (/\bSL\b/.test(text)) {
        bands.push({ key: 'SL', label: 'SL', fastestSecondsPerKm: null, slowestSecondsPerKm: null, page: '267', note: 'Sigla senza passo numerico nel libro: usa sforzo e frequenza cardiaca.' });
    }
    if (/\bRMA\b/.test(text)) rule('RMA');
    if (/\bRME\b/.test(text)) rule('RME');
    if (/ritmo gara/i.test(text)) rule('RG10');
    if (/\bL\b/.test(text)) add('L', 'lento (CRF)', RULES.CRF.min, RULES.CRF.max, RULES.CRF.page);
    if (/\bM\b/.test(text)) {
        const offset = (MEDIO_BY_GOAL.find(item => (goalDistanceKm ?? 0) <= item.maxKm) || MEDIO_BY_GOAL[2]).offset;
        add('M', 'medio', offset, offset, '178');
    }
    if (/\b[BTP]\b/.test(text)) {
        rule('CRF');
        rule('CRLI');
        if (/\bB\b/.test(text)) add('CRI_B', 'CRI (bis)', 10, 10, '177');
        else rule('CRI');
    }
    return bands;
}

// Passo obiettivo unico solo quando la seduta ha una sola fascia calcolabile.
export function singleTargetPace(bands) {
    const usable = bands.filter(band => band.fastestSecondsPerKm !== null);
    if (usable.length !== 1 || bands.length !== 1) return null;
    const [band] = usable;
    return Math.round((band.fastestSecondsPerKm + band.slowestSecondsPerKm) / 2);
}

export function describeBands(bands) {
    return bands.map(band => band.fastestSecondsPerKm === null
        ? `${band.label}: ${band.note}`
        : band.fastestSecondsPerKm === band.slowestSecondsPerKm
            ? `${band.label} ${formatPace(band.fastestSecondsPerKm)}/km`
            : `${band.label} ${formatPace(band.fastestSecondsPerKm)}-${formatPace(band.slowestSecondsPerKm)}/km`
    ).join('; ');
}

function repMeters(rep) {
    const value = Number(rep[2].replace(',', '.'));
    return Math.round(rep[3].toLowerCase() === 'km' ? value * 1000 : value);
}

function formatPace(seconds) {
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
