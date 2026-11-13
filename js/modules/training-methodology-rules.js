import { buildWeeklyCyclePattern, FIVE_SESSION_OPTIONS } from './training-cycle-engine.js';
import { assessReferenceTestValidity, REFERENCE_TEST_VALIDITY_RULE } from './training-reference-pace.js';

const GOAL_MODES = Object.freeze(['race', 'maintain', 'improve', 'other']);
const NON_EXECUTABLE_PATTERN_KINDS = Object.freeze(['distance_time_cycle_outline']);

// Approvazioni delle tabelle-ciclo trascritte. Ogni voce va aggiunta solo
// dopo che l'atleta ha rivisto la trascrizione cella per cella
// (docs/cycle-transcriptions-review.md).
const ATHLETE_APPROVAL = Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-14' });
export const CYCLE_RULE_APPROVALS = Object.freeze({
    ten_km_breathing_cycle: ATHLETE_APPROVAL,
    ten_km_distance_time_cycle: ATHLETE_APPROVAL,
    half_marathon_distance_time_cycle: ATHLETE_APPROVAL,
    marathon_distance_time_cycle: ATHLETE_APPROVAL
});

export const TRAINING_METHOD_RULES = Object.freeze([
    createRule({
        id: 'easy_effort',
        label: 'Corsa facile o molto facile',
        goalModes: GOAL_MODES,
        sourcePages: '174-176',
        scanPages: '14-15',
        sourceVerification: 'checked'
    }),
    createRule({
        id: 'rhythm_variation',
        label: 'Variazioni di ritmo (bis/tris)',
        goalModes: ['race', 'improve'],
        sourcePages: '175-177',
        scanPages: '14-15',
        sourceVerification: 'checked'
    }),
    createRule({
        id: 'steady_or_progressive',
        label: 'Medio o progressivo',
        goalModes: ['race', 'improve'],
        sourcePages: '178-179',
        scanPages: '16',
        sourceVerification: 'checked'
    }),
    createRule({
        id: 'long_run',
        label: 'Lungo o lunghissimo',
        goalModes: ['race'],
        sourcePages: '174-179, 198-209',
        scanPages: null,
        sourceVerification: 'checked'
    }),
    createRule({
        id: 'trail_specificity',
        label: 'Specificità trail',
        goalModes: ['race'],
        sourcePages: '212-215',
        scanPages: null,
        sourceVerification: 'checked',
        requiredTerrains: ['trail']
    }),
    createRule({
        id: 'recovery_and_cycle',
        label: 'Riposo, recupero e scarico',
        goalModes: GOAL_MODES,
        sourcePages: '198-209',
        scanPages: null,
        sourceVerification: 'checked'
    }),
    createRule({
        id: 'field_test_reference',
        label: 'Test di campo e riferimento di forma',
        goalModes: ['race', 'improve'],
        sourcePages: '163-169',
        scanPages: null,
        sourceVerification: 'checked'
    }),
    createCycleRule({
        id: 'ten_km_breathing_cycle',
        label: 'Esempio ciclico 10 km, metodo respiratorio',
        table: '5',
        sourcePages: '197-199',
        scanPages: '25-26',
        raceDistanceKm: 10,
        supportedRunningSessionsPerWeek: [4]
    }),
    createCycleRule({
        id: 'ten_km_distance_time_cycle',
        label: 'Esempio ciclico 10 km, metodo distanza-tempo',
        table: '6',
        sourcePages: '200',
        scanPages: '27',
        raceDistanceKm: 10,
        raceDistanceKmTolerance: 0.2,
        supportedRunningSessionsPerWeek: [3, 4, 5]
    }),
    createCycleRule({
        id: 'half_marathon_distance_time_cycle',
        label: 'Esempio ciclico mezza maratona, metodo distanza-tempo',
        table: '8',
        sourcePages: '203-204',
        scanPages: '28-29',
        raceDistanceKm: 21.1,
        raceDistanceKmTolerance: 0.2,
        supportedRunningSessionsPerWeek: [3, 4, 5]
    }),
    createCycleRule({
        id: 'marathon_distance_time_cycle',
        label: 'Esempio ciclico maratona, metodo distanza-tempo',
        table: '10',
        sourcePages: '207-208',
        scanPages: '30-31',
        raceDistanceKm: 42.195,
        raceDistanceKmTolerance: 0.3,
        supportedRunningSessionsPerWeek: [3, 4, 5]
    })
]);

export const TRAINING_METHOD_SOURCE_EXAMPLES = Object.freeze([
    Object.freeze({
        id: 'bis_time_p175',
        ruleId: 'rhythm_variation',
        label: 'Esempio bis a tempo',
        status: 'source_example_not_executable',
        executable: false,
        sourceVerification: 'checked',
        source: Object.freeze({
            title: 'Tipi che corrono',
            printedPages: '175',
            scan: 'parte 2.pdf',
            scanPages: '14'
        }),
        structure: Object.freeze({
            kind: 'alternating_effort_blocks',
            blocks: Object.freeze([
                Object.freeze({ duration: 15, unit: 'minute', effort: 'CRF' }),
                Object.freeze({ duration: 15, unit: 'minute', effort: 'CRLI' }),
                Object.freeze({ duration: 15, unit: 'minute', effort: 'CRF' }),
                Object.freeze({ duration: 15, unit: 'minute', effort: 'CRLI' }),
                Object.freeze({ duration: 15, unit: 'minute', effort: 'CRF' })
            ]),
            separateRecoveryBlocks: Object.freeze([]),
            warmupIncluded: false,
            totalDuration: 75,
            totalDurationUnit: 'minute'
        }),
        limitations: Object.freeze([
            'Esempio descrittivo, non prescrizione personalizzata.',
            'Non sono specificati blocchi di recupero separati.',
            'Il riscaldamento è separato dalla durata indicata.'
        ])
    }),
    createCycleOutline({
        id: 'ten_km_distance_time_cycle_outline',
        ruleId: 'ten_km_distance_time_cycle',
        label: 'Schema del ciclo 10 km a metodo distanza-tempo',
        printedPages: '200',
        scanPages: '27',
        table: '6',
        durationWeeks: 9,
        goalDistanceKm: 10,
        checkpoints: [
            { week: 3, kind: 'reference_vr_check' },
            { week: 9, kind: 'goal_race' }
        ]
    }),
    createCycleOutline({
        id: 'half_marathon_distance_time_cycle_outline',
        ruleId: 'half_marathon_distance_time_cycle',
        label: 'Schema del ciclo mezza maratona a metodo distanza-tempo',
        printedPages: '203-204',
        scanPages: '28-29',
        table: '8',
        durationWeeks: 12,
        goalDistanceKm: 21.1,
        checkpoints: [
            { week: 3, kind: 'reference_vr_check' },
            { week: 12, kind: 'goal_race' }
        ]
    }),
    createCycleOutline({
        id: 'marathon_distance_time_cycle_outline',
        ruleId: 'marathon_distance_time_cycle',
        label: 'Schema del ciclo maratona a metodo distanza-tempo',
        printedPages: '207-208',
        scanPages: '30-31',
        table: '10',
        durationWeeks: 15,
        goalDistanceKm: 42.195,
        checkpoints: [
            { week: 3, kind: 'reference_vr_check' },
            { week: 15, kind: 'goal_race' }
        ]
    }),
    Object.freeze({
        id: 'ten_km_breathing_cycle_outline',
        ruleId: 'ten_km_breathing_cycle',
        label: 'Schema del ciclo 10 km a metodo respiratorio',
        status: 'source_outline_not_executable',
        executable: false,
        sourceVerification: 'checked',
        source: Object.freeze({
            title: 'Tipi che corrono',
            printedPages: '197-199',
            scan: 'parte 2.pdf',
            scanPages: '25-26',
            table: '5'
        }),
        structure: Object.freeze({
            durationWeeks: 9,
            runningSessionsPerWeek: 4,
            referenceTestWeek: 3,
            raceWeek: 9,
            referenceTestProtocol: null,
            checkpoints: Object.freeze([
                Object.freeze({ week: 3, kind: 'reference_vr_check', protocol: null }),
                Object.freeze({ week: 9, kind: 'goal_race' })
            ]),
            warmup: Object.freeze({
                sourcePrintedPages: '118-119',
                sourceScanPages: '59',
                includesMobilityExercises: true,
                defaultDurationMinutes: null,
                executable: false
            })
        }),
        limitations: Object.freeze([
            'Riferimento contestuale a un programma-esempio per la 10 km.',
            'La tabella non specifica il protocollo del test di verifica.',
            'La sezione Riscaldamento inizia a p. 118; il rinvio a p. 117 nell’introduzione del programma va trattato come imprecisione editoriale. Non includere la prova dei tre piani di scale.',
            'La sezione pp. 118-119 descrive esercizi di preparazione, ma non stabilisce una durata universale da aggiungere a ogni seduta.',
            'Le singole sedute sono trascritte (doppia lettura riconciliata) ma non ancora approvate dall’atleta.',
            'La tabella è stata controllata visivamente; le celle restano da approvare prima di diventare regole applicabili.'
        ])
    })
]);

function createCycleOutline({
    id,
    ruleId,
    label,
    printedPages,
    scanPages,
    table,
    durationWeeks,
    goalDistanceKm,
    checkpoints
}) {
    return Object.freeze({
        id,
        ruleId,
        label,
        status: 'source_outline_not_executable',
        executable: false,
        sourceVerification: 'checked',
        source: Object.freeze({
            title: 'Tipi che corrono',
            printedPages,
            scan: 'parte 2.pdf',
            scanPages,
            table
        }),
        structure: Object.freeze({
            kind: 'distance_time_cycle_outline',
            reviewScope: 'cell_by_cell',
            goalDistanceKm,
            durationWeeks,
            runningSessionsPerWeek: 4,
            sessionDetailsTranscribed: true,
            transcriptionStatus: 'double_blind_reconciled',
            checkpoints: Object.freeze(checkpoints.map(checkpoint => Object.freeze(checkpoint)))
        }),
        limitations: Object.freeze([
            'Le celle delle sedute sono trascritte in training-cycle-transcriptions.js da due letture indipendenti riconciliate sulla scansione.',
            'Schema fonte non personalizzato: diventa eseguibile solo dopo l’approvazione dell’atleta della trascrizione.',
            'La tabella prosegue sulle pagine indicate e va letta come un unico esempio, senza combinare tabelle diverse.'
        ])
    });
}

export function assessTrainingMethodology(
    profile,
    race = null,
    rules = TRAINING_METHOD_RULES,
    { asOfDate = localDateKey() } = {}
) {
    const goalMode = profile?.goal_mode;
    if (!GOAL_MODES.includes(goalMode)) {
        throw new Error('Impossibile valutare la metodologia senza un obiettivo valido.');
    }

    const terrains = new Set(profile?.preferred_terrains ?? []);
    const applicableRules = rules.filter(rule => rule.goalModes?.includes(goalMode)
        && (!rule.requiredTerrains || rule.requiredTerrains.every(terrain => terrains.has(terrain)))
        && matchesRaceDistance(rule, race));
    const candidateRules = applicableRules.filter(rule => rule.ruleStatus === 'candidate');
    const approvedRules = applicableRules
        .filter(rule => rule.ruleStatus === 'approved_for_drafts')
        .map(rule => ({ rule, issues: getApprovedRuleIssues(rule, profile, race, asOfDate) }));
    const readyRules = approvedRules.filter(({ issues }) => issues.length === 0);
    const readyCycles = readyRules
        .filter(({ rule }) => rule.sessionPattern?.kind === 'explicit_weekly_cycle');
    const preferredMethod = profile?.preferred_cycle_method;
    const matchingCycles = preferredMethod
        ? readyCycles.filter(({ rule }) => rule.sessionPattern.method === preferredMethod)
        : readyCycles;
    const methodChoiceNeeded = !preferredMethod && matchingCycles.length > 1;
    const generationRules = methodChoiceNeeded ? [] : matchingCycles;
    const applicableRuleIds = new Set(applicableRules.map(rule => rule.id));
    const sourceExampleIds = TRAINING_METHOD_SOURCE_EXAMPLES
        .filter(example => applicableRuleIds.has(example.ruleId))
        .map(example => example.id);
    const awaitingReviewIds = candidateRules
        .filter(rule => rule.sessionPattern?.kind === 'explicit_weekly_cycle')
        .map(rule => rule.id);
    const blockers = [];
    if (!approvedRules.length) {
        blockers.push('Nessuna regola applicabile è stata approvata per creare bozze.');
    } else {
        approvedRules.forEach(({ rule, issues }) => {
            issues.forEach(issue => blockers.push(`Regola "${rule.id}": ${issue.message}`));
        });
    }
    awaitingReviewIds.forEach(id => blockers.push(
        `Regola "${id}": sedute trascritte e riconciliate, in attesa di revisione e approvazione dell'atleta.`
    ));
    if (methodChoiceNeeded) {
        blockers.push('Più cicli sono applicabili: scegli il metodo (respiratorio o distanza-tempo) nel questionario.');
    } else if (preferredMethod && readyCycles.length && !matchingCycles.length) {
        blockers.push('Nessun ciclo pronto usa il metodo scelto per questa gara e frequenza.');
    }
    if (!generationRules.length) {
        blockers.push('La generazione delle sedute e la loro conferma non sono ancora attive.');
    }

    const hasContractIssues = approvedRules.some(({ issues }) =>
        issues.some(issue => issue.type === 'contract'));

    return {
        status: !approvedRules.length
            ? 'awaiting_approved_rules'
            : readyRules.length
                ? 'rules_ready'
                : hasContractIssues
                    ? 'awaiting_rule_contract'
                    : 'awaiting_required_inputs',
        approved_pattern_ids: approvedRules.map(({ rule }) => rule.id),
        candidate_pattern_ids: candidateRules.map(rule => rule.id),
        ready_pattern_ids: readyRules.map(({ rule }) => rule.id),
        awaiting_review_pattern_ids: awaitingReviewIds,
        generation_pattern_ids: generationRules.map(({ rule }) => rule.id),
        source_example_ids: sourceExampleIds,
        rule_pipeline_ready: readyRules.length > 0,
        generation_enabled: generationRules.length > 0,
        blockers
    };
}

function matchesRaceDistance(rule, race) {
    if (rule.raceDistanceKm === undefined) return true;
    const distance = Number(race?.distance_km);
    const tolerance = rule.raceDistanceKmTolerance ?? 0;
    return Number.isFinite(distance) && Math.abs(distance - rule.raceDistanceKm) <= tolerance;
}

function getApprovedRuleIssues(rule, profile, race, asOfDate) {
    const issues = [];
    const contract = message => issues.push({ type: 'contract', message });
    const input = message => issues.push({ type: 'input', message });
    const approval = rule.approval;
    if (typeof rule.version !== 'string' || !rule.version.trim()
        || typeof rule.sourceConfidence !== 'string' || !rule.sourceConfidence.trim()
        || !approval || !String(approval.approvedBy || '').trim()
        || !isDate(approval.approvedAt)) {
        contract('mancano versione, affidabilità della fonte o metadati di approvazione.');
    }
    if (rule.sourceVerification !== 'checked'
        || !isNonEmptyString(rule.source?.title)
        || !isNonEmptyString(rule.source?.printedPages)
        || !isNonEmptyString(rule.source?.scan)
        || !isNonEmptyString(rule.source?.scanPages)) {
        contract('la fonte non è verificata o non è tracciata fino alla scansione.');
    }
    if (!isNonEmptyStringArray(rule.goalModes)
        || rule.goalModes.some(goalMode => !GOAL_MODES.includes(goalMode))
        || !isStringArray(rule.requiredProfileFields)
        || !isStringArray(rule.requiredRaceFields)
        || !isStringArray(rule.exclusions)
        || !rule.sessionPattern || typeof rule.sessionPattern !== 'object'
        || Array.isArray(rule.sessionPattern)
        || !Object.keys(rule.sessionPattern).length
        || !isNonEmptyString(rule.explanation)) {
        contract('il contratto di applicabilità, input, pattern o spiegazione è incompleto.');
        return issues;
    }

    const sessionPattern = rule.sessionPattern;
    if (NON_EXECUTABLE_PATTERN_KINDS.includes(sessionPattern.kind)) {
        contract('il pattern è solo un outline della fonte: le sedute non sono trascritte e non può essere approvato.');
    } else if (sessionPattern.kind === 'explicit_weekly_cycle') {
        getWeeklyCycleIssues(sessionPattern).forEach(contract);
    }

    const missingProfile = rule.requiredProfileFields
        .filter(field => !hasValue(profile, field));
    const missingRace = rule.requiredRaceFields
        .filter(field => !hasValue(race, field));
    if (missingProfile.length || missingRace.length) {
        const missing = [
            ...missingProfile.map(field => `profilo.${field}`),
            ...missingRace.map(field => `gara.${field}`)
        ];
        input(`mancano input richiesti: ${missing.join(', ')}.`);
    }
    if (rule.requiresValidReferenceTest && hasValue(profile, 'reference_test_date')) {
        const validity = assessReferenceTestValidity(profile.reference_test_date, asOfDate);
        if (validity.status !== 'valid') input(`test VR non utilizzabile: ${validity.message}`);
    }
    const frequency = profile?.target_running_sessions_per_week;
    if (Array.isArray(rule.supportedRunningSessionsPerWeek) && Number.isInteger(frequency)) {
        if (!rule.supportedRunningSessionsPerWeek.includes(frequency)) {
            input(`${frequency} corse settimanali non sono supportate da questa regola (ammesse: ${rule.supportedRunningSessionsPerWeek.join(', ')}).`);
        } else if (frequency === 5 && !FIVE_SESSION_OPTIONS.includes(profile?.five_session_option)) {
            input('per 5 corse settimanali scegli la variante: +10% km oppure seduta di qualità o palestra.');
        }
    }
    return issues;
}

function getWeeklyCycleIssues(sessionPattern) {
    if (!Array.isArray(sessionPattern.weeks) || sessionPattern.weeks.length === 0) {
        return ['il pattern settimanale esplicito richiede un elenco di settimane non vuoto.'];
    }
    const issues = [];
    const seenWeeks = new Set();
    sessionPattern.weeks.forEach((week, weekIndex) => {
        if (!week || typeof week !== 'object' || !Number.isInteger(week.weekNumber) || week.weekNumber <= 0
            || !Array.isArray(week.sessions) || week.sessions.length === 0
            || week.sessions.some(session => !session || !isNonEmptyString(session.day) || !isNonEmptyString(session.type))) {
            issues.push(`la settimana ${weekIndex + 1} nel pattern esplicito non è valida o non ha sedute complete.`);
            return;
        }
        if (seenWeeks.has(week.weekNumber)) {
            issues.push(`la settimana ${week.weekNumber} è ripetuta nel pattern esplicito.`);
        }
        seenWeeks.add(week.weekNumber);
    });
    if (sessionPattern.durationWeeks !== undefined) {
        const expected = sessionPattern.durationWeeks;
        const complete = Number.isInteger(expected) && expected > 0 && seenWeeks.size === expected
            && [...seenWeeks].every(weekNumber => weekNumber <= expected);
        if (!complete) {
            issues.push('il pattern esplicito non copre tutte le settimane dichiarate in durationWeeks.');
        }
    }
    return issues;
}

function hasValue(object, field) {
    const value = field.split('.').reduce((current, key) => current?.[key], object);
    if (typeof value === 'string') return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && Boolean(value.trim());
}

function isStringArray(value) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
}

function isNonEmptyStringArray(value) {
    return isStringArray(value) && value.length > 0;
}

function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function createCycleRule({
    id,
    label,
    table,
    sourcePages,
    scanPages,
    raceDistanceKm,
    raceDistanceKmTolerance,
    supportedRunningSessionsPerWeek
}) {
    const approval = CYCLE_RULE_APPROVALS[id];
    const rule = createRule({
        id,
        label,
        goalModes: ['race'],
        sourcePages,
        scanPages,
        sourceVerification: 'checked',
        raceDistanceKm,
        raceDistanceKmTolerance,
        requiredTerrains: ['road'],
        ruleStatus: approval ? 'approved_for_drafts' : 'candidate',
        version: '1.0.0',
        sourceConfidence: 'double_blind_transcription',
        approval: approval ? Object.freeze({ ...approval }) : undefined,
        requiredProfileFields: [
            'consistency_status',
            'target_running_sessions_per_week',
            'reference_test_date',
            'reference_vr_seconds_per_km'
        ],
        requiredRaceFields: ['distance_km', 'event_date'],
        exclusions: ['Trail o percorsi con dislivello significativo'],
        sessionPattern: buildWeeklyCyclePattern(id),
        explanation: `Ciclo della tabella ${table} di "Tipi che corrono", trascritto cella per cella; i ritmi derivano dalla VR di un test valido (massimo ${REFERENCE_TEST_VALIDITY_RULE.maxAgeDays / 7} settimane).`
    });
    return Object.freeze({
        ...rule,
        requiresValidReferenceTest: true,
        supportedRunningSessionsPerWeek: Object.freeze([...supportedRunningSessionsPerWeek])
    });
}

function localDateKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function createRule({
    id,
    label,
    goalModes,
    sourcePages,
    scanPages,
    sourceVerification,
    requiredTerrains,
    raceDistanceKm,
    raceDistanceKmTolerance,
    ruleStatus = 'candidate',
    version = '0.1.0',
    sourceConfidence,
    approval,
    requiredProfileFields,
    requiredRaceFields,
    exclusions,
    sessionPattern,
    explanation
}) {
    return Object.freeze({
        id,
        version,
        label,
        ruleStatus,
        sourceVerification,
        source: Object.freeze({
            title: 'Tipi che corrono',
            printedPages: sourcePages,
            scan: 'parte 2.pdf',
            scanPages
        }),
        goalModes: Object.freeze([...goalModes]),
        ...(requiredTerrains ? { requiredTerrains: Object.freeze([...requiredTerrains]) } : {}),
        ...(raceDistanceKm === undefined ? {} : { raceDistanceKm }),
        ...(raceDistanceKmTolerance === undefined ? {} : { raceDistanceKmTolerance }),
        ...(sourceConfidence ? { sourceConfidence } : {}),
        ...(approval ? { approval } : {}),
        ...(requiredProfileFields ? { requiredProfileFields: Object.freeze([...requiredProfileFields]) } : {}),
        ...(requiredRaceFields ? { requiredRaceFields: Object.freeze([...requiredRaceFields]) } : {}),
        ...(exclusions ? { exclusions: Object.freeze([...exclusions]) } : {}),
        ...(sessionPattern ? { sessionPattern } : {}),
        ...(explanation ? { explanation } : {})
    });
}

