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

export function assessTrainingMethodology(profile, race = null, rules = TRAINING_METHOD_RULES) {
    const goalMode = profile?.goal_mode;
    if (!GOAL_MODES.includes(goalMode)) {
        throw new Error('Impossibile valutare la metodologia senza un obiettivo valido.');
    }

    const terrains = new Set(profile?.preferred_terrains ?? []);
    const candidates = rules.filter(rule => rule.goalModes.includes(goalMode)
        && (!rule.requiredTerrains || rule.requiredTerrains.every(terrain => terrains.has(terrain)))
        && (rule.raceDistanceKm === undefined || Number(race?.distance_km) === rule.raceDistanceKm));
    const approvedPatternIds = candidates
        .filter(rule => rule.ruleStatus === 'approved_for_drafts')
        .map(rule => rule.id);
    const candidatePatternIds = candidates
        .filter(rule => rule.ruleStatus === 'candidate')
        .map(rule => rule.id);
    const applicableRuleIds = new Set(candidates.map(rule => rule.id));
    const sourceExampleIds = TRAINING_METHOD_SOURCE_EXAMPLES
        .filter(example => applicableRuleIds.has(example.ruleId))
        .map(example => example.id);

    return {
        status: approvedPatternIds.length ? 'approved_rules_available' : 'awaiting_approved_rules',
        approved_pattern_ids: approvedPatternIds,
        candidate_pattern_ids: candidatePatternIds,
        source_example_ids: sourceExampleIds,
        generation_enabled: false,
        blockers: [
            ...(approvedPatternIds.length
                ? []
                : ['Nessun pattern applicabile è stato approvato per creare bozze.']),
            'Il generatore di piani non è ancora implementato.'
        ]
    };
}

function createRule({
    id,
    label,
    goalModes,
    sourcePages,
    scanPages,
    sourceVerification,
    requiredTerrains,
    raceDistanceKm
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
        ...(raceDistanceKm === undefined ? {} : { raceDistanceKm })
    });
}
