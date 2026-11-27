// Trascrizione delle tabelle trail e ultra di "Tipi che corrono" (parte 2.pdf).
// Due letture indipendenti; le 12 differenze su 273 celle sono state risolte
// sulla scansione (14 novembre 2026). Testo come stampato.
// Stato (14 novembre 2026): tabelle 10 evoluti, 11 e 13 approvate dall'atleta;
// tabella 12 ancora in attesa di revisione. Scansioni: parte 2.pdf pp. 32-34, 60-61.
// Nessuna tabella è specifica per un ultra trail di montagna oltre i 100 km.

export const TRAIL_TRANSCRIPTION_STATUS = Object.freeze({
    method: 'double_blind_reconciled',
    transcribedAt: '2026-11-14',
    // Stato complessivo: resta in revisione finché la tabella 12 non è approvata.
    reviewStatus: 'awaiting_athlete_review',
    tableReviewStatus: Object.freeze({
        ultra_100km_evoluto: 'approved',
        ultra_100km_passatore: 'approved',
        trail_15_50km: 'approved',
        ultra_pistoia_abetone: 'awaiting_athlete_review'
    })
});

export const TRAIL_CYCLE_TRANSCRIPTIONS = deepFreeze({
    ultra_100km_passatore: {
        table: "11",
        section: "amatore",
        race: "100 km del Passatore (ultramaratona su strada)",
        goalDistanceKm: 100,
        intensity: "breathing",
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "211-212", scanPages: "32-33" },
        durationWeeks: 15,
        introRules: [
            "Nelle prossime tabelle troverai il programma di allenamento per la 100 km del Passatore (11) e per la Pistoia-Abetone (12).",
            "In entrambe vedrai indicati chilometri e ritmo respiratorio, invece del ritmo a chilometro. In questo tipo di gare, specialmente tu che sei un amatore, è meglio che rimanga concentrato sulle tue sensazioni.",
            "In base al tuo livello, alla tue caratteristiche e alla natura del percorso, dovrai decidere se fare lunghi tratti di cammino, soprattutto in salita, seguiti da altrettanto lunghi tratti di corsa, oppure alternare frequentemente corsa a cammino.",
            "Cerca di correre, almeno nel weekend, su tracciati che si avvicinino il più possibile a quelli della gara che hai in programma.",
            "Queste in particolare sono gare con dislivelli importanti, ma se ti stai preparando per una gara in pianura potrai comunque fare le salite brevi, utili per mantenere la forza, ma sostituendo i tratti di saliscendi con tratti in pianura; oppure, invece di 10 km in salita potrai fare una gara su strada in pianura di 10 km."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Test / Conconi" },
                { day: 2, raw: "12 CRF / p" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "5x 1 km / CRLI rec. / 1 x 1 km / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km / CRF p" },
                { day: 7, raw: "24 km / CRF ss" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "14 CRF / p" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "6 x 1 km / CRI rec. / 1 x 1 km / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km / CRF p" },
                { day: 7, raw: "28 CRF / ss" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "14 km / CRF p" },
                { day: 3, raw: "Riposo o / esercizi" },
                // CRLI confermato dall'atleta il 27 novembre 2026 (stessa struttura delle settimane 1 e 10).
                { day: 4, raw: "6 x 1 km / CRLI rec / 1 x 1 km / CRF", confirmedByAthlete: "2026-11-27" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km / CRF" },
                { day: 7, raw: "30 km / CRF" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "8 km / CRF p" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "10 x 400 / CRI rec / 2' CRF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "8 km / CRF p" },
                { day: 7, raw: "6 km in / salita / correndo / più forte / possibile / tornando / al punto / di / partenza / a CRF" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "15 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "14 x 100 / in salita / CRI rec. / 100 / CRMI + / rec. 3' / + 10 km / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "20 km / CRMF p" },
                { day: 7, raw: "34 km / CRMF / ss" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "16 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "5 x 1 km / in salita / CRI rec. / tornando / alla / partenza / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "20 km / CRMF / ss" },
                { day: 7, raw: "38 km / CRMF / ss" }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "14 km / CRMF / + 2 km / CRF p" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "6 x 1 km / in salita a / CRI rec. / tornando / alla / partenza / a CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "20 km / CRMF p" },
                { day: 7, raw: "10 km / in salita / correndo / più forte / possibile / tornando / al punto / di / partenza / a CRF" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "Riposo o / esercizio" },
                { day: 2, raw: "8 km / CRF p" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "10 x 500 / a CRI / rec. 2' / CRMF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km / CRF p" },
                { day: 7, raw: "Gara / maratona" }
            ] },
            { weekNumber: 9, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "14 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x 200 / in salita / a CRI / rec. 100 / a CRMI / + rec. 3' / + 10 km / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km / CRF p" },
                { day: 7, raw: "50 km / CRMF / ss" }
            ] },
            { weekNumber: 10, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "16 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "7 x 1 km / CRLI rec. / 1 x 1 km / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "20 km / CRMF p" },
                { day: 7, raw: "Mezza / maratona / CRF" }
            ] },
            { weekNumber: 11, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "6 km / CRMF / p" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "2 x 3 km / CRLI rec. / 3' CRF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km / CRMF p" },
                { day: 7, raw: "65 km / CRMF / ss" }
            ] },
            { weekNumber: 12, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "14 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "10 x 600 / CRI rec. / 3' CRF" },
                { day: 5, raw: "Riposo o / esercizio" },
                { day: 6, raw: "10 km / CRMF p" },
                { day: 7, raw: "30 km / CRMF / ss" }
            ] },
            { weekNumber: 13, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "12 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "12 x 150 / in salita / CRI rec. / 2' CRMF / + rec. 3' / CRMF / + 6 km / CRMF" },
                { day: 5, raw: "Riposo o / esercizio" },
                { day: 6, raw: "10 km / CRMF p" },
                { day: 7, raw: "20 km / CRMF p" }
            ] },
            { weekNumber: 14, days: [
                { day: 1, raw: "Riposo o / esercizio" },
                { day: 2, raw: "10 km / CRMF / p" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "5 x 1 km / CRI rec. / 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km a / CRMF" },
                { day: 7, raw: "10 km / CRMF" }
            ] },
            { weekNumber: 15, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "6 km / CRMF / p" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "6 km / CRMF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "Riposo" },
                { day: 7, raw: "Gara" }
            ] }
        ]
    },
    ultra_pistoia_abetone: {
        table: "12",
        section: "amatore",
        race: "Pistoia-Abetone (ultramaratona, distanza non indicata nel testo)",
        goalDistanceKm: null,
        intensity: "breathing",
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "213-214", scanPages: "33-34" },
        durationWeeks: 8,
        introRules: [
            "Nella Tabella 12 troverai uno schema di allenamento di 8 settimane fatto per affrontare un'altra delle più importati ultra d'Europa, la Pistoia-Abetone.",
            "Shares the intro rules printed before Tabella 11 (km + respiratory rhythm, walk/run decisions, train on race-like routes)."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "16 km / CRMF ss" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "5 x 1 km / in salita a / CRI rec. / tornando / alla / partenza / a CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "4 km / CRMF / + 16 / km CRF / ss" },
                { day: 7, raw: "35 km ss" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo o / esercizio" },
                { day: 2, raw: "12 km / CRMF ss" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "2 x 3 km / CRLI rec. / 1 x 1 km / CRMF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km / CRMF" },
                { day: 7, raw: "Mezza / maratona / in gara o / tipo gara" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "18 km / CRMF ss" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "6 x 1 km / in salita a / CRI / rec. 1 / km CRF / tornando / al punto / di / partenza" },
                { day: 5, raw: "Riposo o / esercizio" },
                { day: 6, raw: "4 km / CRMF / + 8 km / CRF ss" },
                { day: 7, raw: "40 km ss" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "14 km / CRMF p" },
                { day: 3, raw: "Riposo o / esercizio" },
                { day: 4, raw: "7 x 1 km / in salita / rec. 1 / km CRF / tornando / al punto / di / partenza" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "8 km / CRMF p" },
                { day: 7, raw: "45 km / CRMF ss" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "8 km / CRMF p" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "3 x 2 km / CRI rec. / 1 km / CRMF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km / CRMF / p." },
                { day: 7, raw: "Mezza / maratona / tirata in / gara o in / allenamento" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "16 km / CRMF" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "3 x 2 km / in salita / a CRI / rec. 2 / km CRF / tornando / al punto / di / partenza" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km / CRMF / ss", uncertain: true },
                { day: 7, raw: "25 km / CRMF ss", uncertain: true }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "12 km / CRMF" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "5 x 1 km / CRI rec. / 3' p" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km a / CRMF p" },
                { day: 7, raw: "15 km / CRMF ss" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "6 km / CRMF p" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "4 km / CRMF + / 2 km a / CRF p" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "Riposo" },
                { day: 7, raw: "Gara" }
            ] }
        ]
    },
    trail_15_50km: {
        table: "13",
        section: "amatore",
        race: "Gare trail da 15 a 50 km",
        goalDistanceKm: null,
        intensity: "breathing",
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "215", scanPages: "34" },
        durationWeeks: 4,
        introRules: [
            "Programmi di allenamento per il trail. La voglia di contatto con la natura, senza essere assillati dal cronometro, sta portando sempre più runner verso questa disciplina.",
            "Gli allenamenti infrasettimanali saranno uguali a quelli di chi corre su strada, mentre quelli più importanti, su tracciati sterrati o comunque simili ai percorsi di gara, vengono svolti nel weekend.",
            "Gli appassionati di ultratrail dovranno abituarsi anche a correre in condizioni precarie di luce, ecco perché sono previsti allenamenti nelle ore notturne.",
            "Nella tabella 13 un esempio di programma per un runner che partecipa sistematicamente a gare di trail running di distanza variabile fra i 15 e i 50 km, con la distanza in chilometri e il ritmo della respirazione.",
            "(After table, p.215) La preparazione per gli ultratrail per runner amatori non si differenzia troppo da quella per le ultramaratone. Dovrai però abituarti ai tracciati dove farai la gara: con l'allenamento capirai quando è il momento di camminare, di riposarsi o tenere il ritmo. L'allenamento per gli ultratrail dovrà abituarti a gestire bene i dislivelli. In queste gare ci sono i \"cancelli\": gli organizzatori stabiliscono che entro un certo tempo devi aver fatto un certo numero di chilometri. Se non superi il \"cancello\" entro il tempo stabilito, ti fanno abbandonare la gara.",
            "(p.216) Programmi di allenamento per l'amatore tranquillo: variante per ultramaratone e maratone - sostituire ai chilometri il tempo, per esempio 12 km a CRF potrebbero essere sostituiti da 70' a CRF."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "8 km / CRF p" },
                { day: 3, raw: "5 x 500 / CRI rec. / 2' CRF" },
                { day: 4, raw: "6 km / CRF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "Riposo" },
                // Cifra poco leggibile nella scansione: resta incerta (30 è coerente con 15-50 km).
                { day: 7, raw: "Gara 30 / km", uncertain: true }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "6 km / CRF p" },
                { day: 3, raw: "10 x 2' / CRI rec. / 2' CRF" },
                { day: 4, raw: "10 km / CRF / + / esercizi" },
                { day: 5, raw: "Riposo / o / esercizi" },
                { day: 6, raw: "6 km / CRF + / 10 x 100 / in salita / a CRI + / 6 km a / CRF" },
                { day: 7, raw: "7 km / CRF + 7 / km CRLI" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "8 km / CRF p" },
                { day: 3, raw: "10 x 1' / CRI rec / 1' CRF" },
                { day: 4, raw: "8 km / CRF p" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "4 km / CRF p" },
                { day: 7, raw: "Gara 22 / km" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo / o / esercizi" },
                { day: 2, raw: "6 km / CRF p" },
                { day: 3, raw: "6 km / CRF p / + / esercizi" },
                { day: 4, raw: "6 x 1 km / CRI rec. / 3' CRF" },
                { day: 5, raw: "Riposo / o / esercizi" },
                { day: 6, raw: "10 km / sterrato / ss" },
                { day: 7, raw: "12 / km ss / tirando / a CRI / gli ultimi / 100 m / di ogni / salita" }
            ] }
        ]
    },
    ultra_100km_evoluto: {
        table: "10",
        section: "evoluto",
        race: "100 km su strada, adattabile a un ultratrail",
        goalDistanceKm: 100,
        intensity: "vr_based",
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "267-268", scanPages: "60-61" },
        durationWeeks: 12,
        introRules: [
            "Ecco, nella tabella 10, un esempio di programma di allenamento per preparare una 100 km su strada, adattabile poi anche a un'ultratrail, con le opportune modifiche e adattamenti al tipo di tracciato.",
            "Sono previsti 6 allenamenti alla settimana.",
            "Il runner dell'esempio ha una VR di 4'00\". Il suo ritmo ultramaratona (RUM) lo considero a 1'30\" più lento della VR. Sarà la tua sensibilità ad adattarlo alle tue caratteristiche.",
            "I giorni di allenamento per la corsa sono 5, più un giorno alla settimana da dedicare solo agli esercizi di forza.",
            "In allenamento devi imparare a valutare la velocità ascensionale. Per avere un'idea della difficoltà che potrai incontrare ad affrontare questo tipo di gare, considera che, in 60' tirati al massimo, un runner di buon livello può fare 1700-1800 m, mentre un amatore ne fa 1100-1200 m.",
            "Attenzione però: durante gli ultratrail, quando dovrai gestire al meglio le energie che avrai disposizione, se sei un runner evoluto in 60' farai 800-900 metri, mentre se sei un amatore ne farai 500-600. Usa questi dati non come valore assoluto, ma come indicazioni che potranno variare in relazione ai dislivelli, al clima, alle tue condizioni, al tuo livello di allenamento."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "12 km L" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "Risc 4 x / 1 km SL / rec. 6' a / LLU" },
                { day: 4, raw: "16 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "16 km L" },
                { day: 7, raw: "Mattino / 15 km / LLU / Pom. / 15 km / LLU" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "14 km / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "Risc 5 x / 1 km SL / rec. 6' a / LLU" },
                { day: 4, raw: "18 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "10 km / L + 10 / km M" },
                { day: 7, raw: "20 LLU" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "8 km L" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "10 x / 400 / VAM / rec. 1'" },
                { day: 4, raw: "8 km L" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "15 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "40 km / LLU" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "14 KM / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "Risc 6x / 1 km SL / rec. 6' / + 4 km / LLU" },
                { day: 4, raw: "20 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "15 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "15 km / LLU / + 5 km L" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "18 km / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "7 x 1 / km SL / rec. 1 / km + 4 / km LLU" },
                { day: 4, raw: "16 km / LLU + 4 / km L" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "10 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "55 km / LLU" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "8 km / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "10 x / 500 / VAM / rec. / 1'30\"" },
                { day: 4, raw: "6 km L / + / esercizi" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "10 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "Mattino / 15 km / LLU / Pom. / 15 km L" }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "10 km / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "8 x 1 / km / rec. 2' / MLSS" },
                { day: 4, raw: "20 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "20 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "20 km / LLU" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "18 km L" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "9 x 1 / km / rec. 2' / MLSS" },
                { day: 4, raw: "15 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "10 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "65 km / LLU" }
            ] },
            { weekNumber: 9, days: [
                { day: 1, raw: "8 km L" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "2 x 3 / rec. 3' / MLSS" },
                { day: 4, raw: "16 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "15 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "Mattino / 20 km / LLU / Pom. / 10 km L" }
            ] },
            { weekNumber: 10, days: [
                { day: 1, raw: "10 km / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "3 x 3 / rec. 3' / MLSS" },
                { day: 4, raw: "14 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "10 km / LLU da / fare la / sera / dopo le / 21" },
                { day: 7, raw: "20 km / LLU" }
            ] },
            { weekNumber: 11, days: [
                { day: 1, raw: "12 km L" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "10 x / 600 / VAM / rec. / 1'30\"" },
                { day: 4, raw: "16 km / LLU" },
                { day: 5, raw: "Esercizi" },
                { day: 6, raw: "10 km / LLU" },
                { day: 7, raw: "15 km / LLU" }
            ] },
            { weekNumber: 12, days: [
                { day: 1, raw: "8 km / DAU" },
                { day: 2, raw: "Riposo" },
                { day: 3, raw: "6 km L" },
                { day: 4, raw: "6 km L" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "Riposo" },
                { day: 7, raw: "Gara / 100 km" }
            ] }
        ]
    }
});

function deepFreeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}
