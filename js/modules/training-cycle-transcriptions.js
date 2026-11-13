// Trascrizione strutturata delle tabelle-ciclo di "Tipi che corrono" (parte 2.pdf).
// Generata da due trascrizioni indipendenti, riconciliate cella per cella sulla scansione
// (13 novembre 2026). Testo delle celle riportato come stampato, refusi inclusi.
// Stato: in attesa di revisione e approvazione dell'atleta; non eseguibile finché
// la regola corrispondente non è approvata.

export const CYCLE_TRANSCRIPTION_STATUS = Object.freeze({
    method: 'double_blind_reconciled',
    transcribedAt: '2026-11-13',
    reviewStatus: 'awaiting_athlete_review'
});

export const CYCLE_TRANSCRIPTIONS = deepFreeze({
    "ten_km_breathing_cycle": {
        table: "5",
        ruleId: "ten_km_breathing_cycle",
        method: "breathing",
        goalDistanceKm: 10,
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "198-199", scanPages: "26" },
        durationWeeks: 9,
        printNotes: [
            "Settimana 3, giorno 4: stampato '10 CRF' senza segno dei minuti; probabile refuso, mantenuto.",
            "Settimana 8, giorno 2: inizia con 'CRF' senza durata; probabile omissione di stampa, nessun valore aggiunto.",
            "Settimane 3, 6 e 9 stampate in grassetto."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "60' CRF" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "8 x 30\" / in salita / a CRI / rec. / 1'30\" + / rec. 3' + / 8 km a / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "40' CRF / + / 20' CRLI" },
                { day: 7, raw: "70' CRF" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo o / esercizi" },
                { day: 2, raw: "50' CRF / + / 10' CRLI" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "20' CRF / + 10 x 1' / CRI rec. / 2' CRF + / 12' CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "25' / CRF + / 5' CRLI / + 25' / CRF + / 5' CRLI" },
                { day: 7, raw: "30' CRF / + / 30' CRLI" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "40' CRF" },
                { day: 3, raw: "Riposo / o / esercizi" },
                { day: 4, raw: "10 CRF / + 2 x 5' / CRI rec. / 3' CRF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "20' CRF" },
                { day: 7, raw: "Test di / verifica / della / VR" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "45' CRF / + / 15' CRLI" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x 30\" / in / salita a / CRI rec. / 1'30\" + / rec. 3' / + 30' a / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "20' CRF / + 10' / CRLI + / 20' / CRF + / 10' / CRLI" },
                { day: 7, raw: "75' CRF" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "40' CRF / + / 20' CRLI" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "20' CRF / + 8 x 2' / CRI rec. / 2' CRF + / 10' CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "20' / CRF + / 5' CRLI / + 20' / CRF + / 5' CRLI / + 5' CRI" },
                { day: 7, raw: "20' CRF / + / 40' CRLI" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "35' CRF / + / 5' CRI" },
                { day: 3, raw: "Riposo / o / esercizi" },
                { day: 4, raw: "10' CRF / + 2 x 6' / CRI rec. / 3' CRF" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "30' CRF" },
                { day: 7, raw: "10' CRF / + / 40' / ritmo / gara" }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "35' CRF / + / 25' CRLI" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "12 x / 30\" in / salita a / CRI rec. / 1'30\" + / rec. 3' / + 30' a / CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "25' / CRF+ / 3' CRLI / + / 2' CRI+ / 25' / CRF+ / 3' / CRLI+ / 2' CRI" },
                { day: 7, raw: "80' CRF" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "CRF / + 30' / CRLI" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "20' CRF / + 3 x 8' / CRI rec. / 3' CRF" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "50' CRF / + 10' / CRI" },
                { day: 7, raw: "10' CRF / + / 30' ritmo / gara" }
            ] },
            { weekNumber: 9, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "30' CRF" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "20' CRF / + 10' / CRI" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "20' CRF" },
                { day: 7, raw: "Gara" }
            ] }
        ]
    },
    "ten_km_distance_time_cycle": {
        table: "6",
        ruleId: "ten_km_distance_time_cycle",
        method: "distance_time",
        goalDistanceKm: 10,
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "200", scanPages: "27" },
        durationWeeks: 9,
        printNotes: [
            "La didascalia a p. 200 riporta solo 'Tabella 6.'; la descrizione 10 km distanza-tempo è nel testo di p. 199.",
            "Nessuna nota sotto la tabella 6.",
            "Settimane 3 e 9 stampate in grassetto (solo formattazione).",
            "Punteggiatura incoerente nella stampa, mantenuta: 'rec 3'' senza punto (sett. 3, 6, 8), 'rec. 3'' (sett. 7, 9), punti finali in 'km L.' e 'km M.'."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "10 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x / 100 m / in salita / SB rec. / 2' + rec. / 3' + 6 / km L." },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km B" },
                { day: 7, raw: "12 km L" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "9 km L + / 1 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x / 400 m / VAM rec. / 1'30\"" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "8 km L + / 2 km M" },
                { day: 7, raw: "12 km T" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "4 x 1 km / MLSS / rec 3'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "5 km L + / 1 km M" },
                { day: 7, raw: "Test di / verifica / della VR" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "9 km L + / 1 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "12 x 100 / m SB / in salita / rec. 2'+ / rec. 3' + / 6 km L" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km B" },
                { day: 7, raw: "14 km L" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "8 km L + / 2 km M." },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x 500 / m VAM / rec. / 1'30\"" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "7 km L + / 3 km M" },
                { day: 7, raw: "12 km P" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "5 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "2 x 2 km / MLSS / rec 3'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "7 km / ritmo / gara 10 / km" }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L + / 4 km M." },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "5 x 1 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km L." },
                { day: 7, raw: "7 km L + / 7 km M" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "4 km a L / + 1 / km M + / 4 km L + / 1 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "3 x 2 km / MLSS / rec 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "6 km L / 4 km M" },
                { day: 7, raw: "5 km / ritmo / gara" }
            ] },
            { weekNumber: 9, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "5 x 600 / m VAM / rec. 3'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "4 km L" },
                { day: 7, raw: "Gara" }
            ] }
        ]
    },
    "half_marathon_distance_time_cycle": {
        table: "8",
        ruleId: "half_marathon_distance_time_cycle",
        method: "distance_time",
        goalDistanceKm: 21.1,
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "203-204", scanPages: "28-29" },
        durationWeeks: 12,
        printNotes: [
            "Settimana 6, giorno 6: stampato '1 km a m' (m minuscola), probabilmente troncato; mantenuto.",
            "Settimana 6, giorno 7: 'O gara', 'Km', 'della VR'; in settimana 3 'delle VR', 'o gara', 'km'. Mantenuti come stampati.",
            "Settimana 7, giorno 1: 'riposo' minuscolo.",
            "Settimana 8, giorno 2: primo tratto '4 km' senza L; mantenuto.",
            "Settimane 3, 6 e 9 stampate in grassetto.",
            "Settimane 1-7 a p. 203 (scansione 28), settimane 8-12 a p. 204 (scansione 29)."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "12 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "12 x 100 / m SB / in salita / rec. 2' + / rec. 3' + / 8 km L" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km L / + 2 km M" },
                { day: 7, raw: "12 km B" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L + / 4 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x 600 / m VAM / rec. 2'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "4 km L + / 6 km M" },
                { day: 7, raw: "14 km L" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "5x 800 / m MLSS / rec. 2'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "Test di / verifica / delle VR / o gara / di 10-12 / km" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "10 km L / + 2 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "14 x / 100 m in / salita SB / rec. 2' / + rec. 3' / + 8 km L" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km T" },
                { day: 7, raw: "16 km L" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "5 km L + / 2 km M + / 5 km L + / 2 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "5 x 1 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "9 km P" },
                { day: 7, raw: "10 km M" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "5 km L + / 2 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "2 x 2 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "5 km L + / 1 km a m" },
                { day: 7, raw: "Test di / verifica / della VR / O gara / di 10-12 / Km" }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "riposo" },
                { day: 2, raw: "9 km L + / 3 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "3 x 2 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km L / + 2 km M" },
                { day: 7, raw: "18 km L" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "4 km + 3 / km M + 4 / km L + 3 / km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "7 x 1 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "6 km L + / 4 km M" },
                { day: 7, raw: "12 km P" }
            ] },
            { weekNumber: 9, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "4 km L + / 4 km M" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "2 x 3 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "12 km / RME" }
            ] },
            { weekNumber: 10, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "4 km L + / 8 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "4 x 2 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km L" },
                { day: 7, raw: "12 km L / + 6 km / M" }
            ] },
            { weekNumber: 11, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "9 km T" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "3 x 3 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "8 km L + / 2 km M" },
                { day: 7, raw: "10 km / RME" }
            ] },
            { weekNumber: 12, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "4 km L + / 2 km M" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "8 x 500 / m VAM / rec. 2'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "4 km L" },
                { day: 7, raw: "Gara" }
            ] }
        ]
    },
    "marathon_distance_time_cycle": {
        table: "10",
        ruleId: "marathon_distance_time_cycle",
        method: "distance_time",
        goalDistanceKm: 42.195,
        source: { title: 'Tipi che corrono', scan: 'parte 2.pdf', printedPages: "207-208", scanPages: "30-31" },
        durationWeeks: 15,
        printNotes: [
            "Settimane 1-7 a p. 207 (scansione 30), settimane 8-15 a p. 208 (scansione 31); il catalogo indicava per errore le scansioni 31-32.",
            "Settimana 7, giorno 4: stampato '1 kma' (sic).",
            "Settimane 10, 11 e 14, giorno 4: la cella termina con 'RMA + 1' senza 'km RMA'; mantenuto."
        ],
        weeks: [
            { weekNumber: 1, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "12 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "8 x 800 / m MLSS / rec. 2'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km L" },
                { day: 7, raw: "24 km L" }
            ] },
            { weekNumber: 2, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "10 km L. / + 4 km M", uncertain: true },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x 800 / m MLSS / rec. 2'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km L" },
                { day: 7, raw: "15 km T" }
            ] },
            { weekNumber: 3, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "8 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "8 x 100 m / in salita / SB rec. / 2' rec. 3' / 4 km L" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "Test di / verifica / della VR" }
            ] },
            { weekNumber: 4, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "8 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 5 x 1 km / RME rec. / 1 km / RMA + 1 / km RMA" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km B" },
                { day: 7, raw: "28 km L" }
            ] },
            { weekNumber: 5, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "12 km L + / 2 km a M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 6 x 1 km / RME rec. / 1 km / RMA + 1 / km RMA" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "14 km L" },
                { day: 7, raw: "16 km M" }
            ] },
            { weekNumber: 6, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "4 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "10 x 100 / m in / salita SB / rec. 2' + / rec. 3' + / 4 km L" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "Mezza / maratona / più forte / possibile / in gara / o in / allenam." }
            ] },
            { weekNumber: 7, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "5 km L + / 2 km M + / 5 km L + / 2 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 7 x 1 km / RME rec. / 1 kma / RMA + 1 / km RMA" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km L" },
                { day: 7, raw: "32 km / LLM" }
            ] },
            { weekNumber: 8, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "5 km L + / 7 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 3 x 2 km / RME rec. / 1 km / RMA + 1 / km RMA" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "3 km L + / 2 km M + / 3 km L+ 2 / km M" },
                { day: 7, raw: "20 km / RMA" }
            ] },
            { weekNumber: 9, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L+ 2 / km M" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "12 x 100 / m in / salita SB / rec. 2' + / rec. 3' + / 4 km L" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "20 km L / + 14 km / RMA" }
            ] },
            { weekNumber: 10, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "11 km L + / 1 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 4 x 2 km / RME rec. / 1 km / RMA + 1" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "12 km B" },
                { day: 7, raw: "18 km M" }
            ] },
            { weekNumber: 11, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "9 km L + / 5 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 3 x 3 km / RME rec. / 1 km / RMA + 1" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "9 km T" },
                { day: 7, raw: "24 km / RMA" }
            ] },
            { weekNumber: 12, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "8 km" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "5 x 1 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "6 km L" },
                { day: 7, raw: "20 km / LLM + / 16 km / RMA" }
            ] },
            { weekNumber: 13, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "5 km L + / 5 km M" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "7 x 1 km / MLSS / rec. 3'" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "10 km L + / 2 km M" },
                { day: 7, raw: "21 km P" }
            ] },
            { weekNumber: 14, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "10 km L" },
                { day: 3, raw: "Riposo o / esercizi" },
                { day: 4, raw: "1 km / RMA + / 2 x 3 km / RME rec. / 1 km / RMA + 1" },
                { day: 5, raw: "Riposo o / esercizi" },
                { day: 6, raw: "8 km L" },
                { day: 7, raw: "14 km / RMA" }
            ] },
            { weekNumber: 15, days: [
                { day: 1, raw: "Riposo" },
                { day: 2, raw: "6 km L" },
                { day: 3, raw: "Riposo" },
                { day: 4, raw: "4 km L+ 4 / km RMA" },
                { day: 5, raw: "Riposo" },
                { day: 6, raw: "Riposo o / 4 km L" },
                { day: 7, raw: "Gara" }
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
