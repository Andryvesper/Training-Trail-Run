const GOAL_MODES = Object.freeze(['race', 'maintain', 'improve', 'other']);

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
    createRule({
        id: 'ten_km_breathing_cycle',
        label: 'Esempio ciclico 10 km, metodo respiratorio',
        goalModes: ['race'],
        sourcePages: '197-199',
        scanPages: '25-26',
        sourceVerification: 'checked',
        raceDistanceKm: 10,
        requiredTerrains: ['road']
    }),
    createRule({
        id: 'ten_km_distance_time_cycle',
        label: 'Esempio ciclico 10 km, metodo distanza-tempo',
        goalModes: ['race'],
        sourcePages: '200',
        scanPages: '27',
        sourceVerification: 'checked',
        raceDistanceKm: 10,
        raceDistanceKmTolerance: 0.2,
        requiredTerrains: ['road']
    }),
    createRule({
        id: 'half_marathon_distance_time_cycle',
        label: 'Esempio ciclico mezza maratona, metodo distanza-tempo',
        goalModes: ['race'],
        sourcePages: '203-204',
        scanPages: '28-29',
        sourceVerification: 'checked',
        raceDistanceKm: 21.1,
        raceDistanceKmTolerance: 0.2,
        requiredTerrains: ['road']
    }),
    createRule({
        id: 'marathon_distance_time_cycle',
        label: 'Esempio ciclico maratona, metodo distanza-tempo',
        goalModes: ['race'],
        sourcePages: '207-208',
        scanPages: '31-32',
        sourceVerification: 'checked',
        raceDistanceKm: 42.195,
        raceDistanceKmTolerance: 0.3,
        requiredTerrains: ['road']
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
        scanPages: '31-32',
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
            'Le singole sedute non sono approvate né trascritte come prescrizioni.',
            'La tabella è stata controllata visivamente, ma i suoi dettagli non sono ancora stati verificati come regole applicabili.'
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
            reviewScope: 'structure_only',
            goalDistanceKm,
            durationWeeks,
            runningSessionsPerWeek: 4,
            sessionDetailsTranscribed: false,
            checkpoints: Object.freeze(checkpoints.map(checkpoint => Object.freeze(checkpoint)))
        }),
        limitations: Object.freeze([
            'Registrati solo obiettivo, orizzonte, frequenza e punti di controllo; le celle delle sedute non sono riprodotte.',
            'Schema fonte non personalizzato e non eseguibile; non equivale a una regola di allenamento approvata.',
            'La tabella prosegue sulle pagine indicate e va letta come un unico esempio, senza combinare tabelle diverse.'
        ])
    });
}

export function assessTrainingMethodology(profile, race = null, rules = TRAINING_METHOD_RULES) {
    const goalMode = profile?.goal_mode;
    if (!GOAL_MODES.includes(goalMode)) {
        throw new Error('Impossibile valutare la metodologia senza un obiettivo valido.');
    }

    const terrains = new Set(profile?.preferred_terrains ?? []);
    const applicableRules = rules.filter(rule => rule.goalModes?.includes(goalMode)
        && (!rule.requiredTerrains || rule.requiredTerrains.every(terrain => terrains.has(terrain)))
        && matchesRaceDistance(rule, race));
    const candidatePatternIds = applicableRules
        .filter(rule => rule.ruleStatus === 'candidate')
        .map(rule => rule.id);
    const approvedRules = applicableRules
        .filter(rule => rule.ruleStatus === 'approved_for_drafts')
        .map(rule => ({ rule, issues: getApprovedRuleIssues(rule, profile, race) }));
    const readyRules = approvedRules.filter(({ issues }) => issues.length === 0);
    const applicableRuleIds = new Set(applicableRules.map(rule => rule.id));
    const sourceExampleIds = TRAINING_METHOD_SOURCE_EXAMPLES
        .filter(example => applicableRuleIds.has(example.ruleId))
        .map(example => example.id);
    const blockers = [];
    if (!approvedRules.length) {
        blockers.push('Nessuna regola applicabile è stata approvata per creare bozze.');
    } else {
        approvedRules.forEach(({ rule, issues }) => {
            issues.forEach(issue => blockers.push(`Regola "${rule.id}": ${issue}`));
        });
    }
    blockers.push('La generazione delle sedute e la loro conferma non sono ancora attive.');

    const hasContractIssues = approvedRules.some(({ issues }) =>
        issues.some(issue => !issue.includes('input richiesti'))
    );

    return {
        status: !approvedRules.length
            ? 'awaiting_approved_rules'
            : readyRules.length
                ? 'rules_ready'
                : hasContractIssues
                    ? 'awaiting_rule_contract'
                    : 'awaiting_required_inputs',
        approved_pattern_ids: approvedRules.map(({ rule }) => rule.id),
        candidate_pattern_ids: candidatePatternIds,
        ready_pattern_ids: readyRules.map(({ rule }) => rule.id),
        source_example_ids: sourceExampleIds,
        rule_pipeline_ready: readyRules.length > 0,
        generation_enabled: false,
        blockers
    };
}

function matchesRaceDistance(rule, race) {
    if (rule.raceDistanceKm === undefined) return true;
    const distance = Number(race?.distance_km);
    const tolerance = rule.raceDistanceKmTolerance ?? 0;
    return Number.isFinite(distance) && Math.abs(distance - rule.raceDistanceKm) <= tolerance;
}

function getApprovedRuleIssues(rule, profile, race) {
    const issues = [];
    const approval = rule.approval;
    if (typeof rule.version !== 'string' || !rule.version.trim()
        || typeof rule.sourceConfidence !== 'string' || !rule.sourceConfidence.trim()
        || !approval || !String(approval.approvedBy || '').trim()
        || !isDate(approval.approvedAt)) {
        issues.push('mancano versione, affidabilità della fonte o metadati di approvazione.');
    }
    if (rule.sourceVerification !== 'checked'
        || !isNonEmptyString(rule.source?.title)
        || !isNonEmptyString(rule.source?.printedPages)
        || !isNonEmptyString(rule.source?.scan)
        || !isNonEmptyString(rule.source?.scanPages)) {
        issues.push('la fonte non è verificata o non è tracciata fino alla scansione.');
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
        issues.push('il contratto di applicabilità, input, pattern o spiegazione è incompleto.');
        return issues;
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
        issues.push(`mancano input richiesti: ${missing.join(', ')}.`);
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

function createRule({
    id,
    label,
    goalModes,
    sourcePages,
    scanPages,
    sourceVerification,
    requiredTerrains,
    raceDistanceKm,
    raceDistanceKmTolerance
}) {
    return Object.freeze({
        id,
        version: '0.1.0',
        label,
        ruleStatus: 'candidate',
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
        ...(raceDistanceKmTolerance === undefined ? {} : { raceDistanceKmTolerance })
    });
}
