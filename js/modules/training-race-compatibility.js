const SECONDARY_RACE_INTENTS = Object.freeze([
    'time_goal',
    'controlled',
    'social',
    'undecided'
]);

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeSecondaryRaceIntents(input = {}, selectedRaceIds = []) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Le intenzioni delle gare secondarie non sono valide.');
    }

    return Object.fromEntries(selectedRaceIds.map(raceId => {
        const intent = input[raceId] ?? 'undecided';
        if (!SECONDARY_RACE_INTENTS.includes(intent)) {
            throw new Error(`L’obiettivo dichiarato per la gara ${raceId} non è valido.`);
        }
        return [raceId, intent];
    }));
}

export function assessRaceCompatibility(primaryRace, secondaryRaces, intents = {}) {
    if (!primaryRace || !Array.isArray(secondaryRaces)) {
        throw new Error('Servono la gara obiettivo e l’elenco delle altre gare.');
    }

    return secondaryRaces.map(race => assessOneRace(
        primaryRace,
        race,
        intents[race.id] ?? 'undecided'
    ));
}

function assessOneRace(primaryRace, secondaryRace, intent) {
    if (!SECONDARY_RACE_INTENTS.includes(intent)) {
        throw new Error(`L’obiettivo dichiarato per la gara ${secondaryRace.id} non è valido.`);
    }

    const gapDays = getDayGap(secondaryRace.event_date, primaryRace.event_date);
    if (gapDays === null) {
        return result(secondaryRace, intent, 'insufficient_data', null, [
            'Le date esatte non sono entrambe disponibili: non posso stimare la distanza temporale dalla gara obiettivo.',
            'Aggiorna le date prima di valutare la compatibilità.'
        ]);
    }
    if (gapDays < 0) {
        return result(secondaryRace, intent, 'after_primary_goal', gapDays, [
            'Questa gara è successiva alla gara principale e non rientra nella preparazione che la precede.'
        ]);
    }
    if (gapDays === 0) {
        return result(secondaryRace, intent, 'same_day_conflict', gapDays, [
            'Le due gare sono nello stesso giorno: non è possibile partecipare a entrambe come eventi distinti.',
            'Scegli quale gara mantenere come prioritaria prima di preparare il piano.'
        ]);
    }

    const secondaryDistance = Number(secondaryRace.distance_km);
    const primaryDistance = Number(primaryRace.distance_km);
    if (!Number.isFinite(secondaryDistance) || secondaryDistance <= 0
        || !Number.isFinite(primaryDistance) || primaryDistance <= 0) {
        return result(secondaryRace, intent, 'insufficient_data', gapDays, [
            'Manca una distanza attendibile per una valutazione comparativa.'
        ]);
    }

    const relativeDistance = secondaryDistance / primaryDistance;
    const substantialRace = secondaryDistance >= 42 || relativeDistance >= 0.5;
    const performanceIntent = intent === 'time_goal';
    const highRisk = (gapDays <= 14 && substantialRace)
        || (gapDays <= 21 && substantialRace && performanceIntent)
        || (gapDays <= 28 && relativeDistance >= 0.75 && performanceIntent);

    if (highRisk) {
        const advice = performanceIntent
            ? 'La gara ravvicinata con obiettivo di tempo può interferire con la preparazione e il recupero della gara principale. Valuta di rinunciare, spostarla o parlarne con un allenatore; non posso ricavare un passo compatibile dai dati disponibili.'
            : 'La distanza e la vicinanza alla gara principale possono interferire con preparazione e recupero. Senza un obiettivo di tempo, un passo sicuro non è deducibile: valuta di non partecipare oppure chiedi una revisione a un allenatore.';
        return result(secondaryRace, intent, 'high', gapDays, [
            `Restano ${gapDays} giorni e la distanza secondaria è circa il ${Math.round(relativeDistance * 100)}% di quella principale.`,
            advice
        ]);
    }

    const reviewRisk = (gapDays <= 28 && substantialRace)
        || (gapDays <= 42 && performanceIntent);
    if (reviewRisk) {
        const advice = performanceIntent
            ? 'Un obiettivo di tempo può aggiungere carico in una fase importante: confronta le due priorità prima di confermare la gara.'
            : 'Se partecipi, non impostare automaticamente un passo gara: mantieni l’obiettivo subordinato alla gara principale e richiedi una revisione del piano.';
        return result(secondaryRace, intent, 'review', gapDays, [
            `La gara secondaria è a ${gapDays} giorni dall’obiettivo principale.`,
            advice
        ]);
    }

    if (intent === 'undecided') {
        return result(secondaryRace, intent, 'intent_needed', gapDays, [
            `La gara secondaria è a ${gapDays} giorni dall’obiettivo principale.`,
            'Indica se vuoi correrla con un obiettivo di tempo, in modo controllato o solo per partecipare. Non viene dedotto un passo.'
        ]);
    }

    return result(secondaryRace, intent, 'no_obvious_conflict', gapDays, [
        `Non emergono conflitti temporali evidenti con il controllo preliminare (${gapDays} giorni).`,
        'Questo controllo non garantisce che la gara sia compatibile con il tuo carico o con la tua condizione.'
    ]);
}

function getDayGap(secondaryDate, primaryDate) {
    if (!isValidDate(secondaryDate) || !isValidDate(primaryDate)) return null;
    const secondaryTime = Date.parse(`${secondaryDate}T00:00:00Z`);
    const primaryTime = Date.parse(`${primaryDate}T00:00:00Z`);
    return Math.round((primaryTime - secondaryTime) / DAY_MS);
}

function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function result(race, intent, status, daysBeforePrimary, messages) {
    return {
        race_id: race.id,
        race_name: race.name,
        intent,
        status,
        days_before_primary: daysBeforePrimary,
        messages
    };
}
