# Revisione delle tabelle-ciclo trascritte

**Stato:** tutte e quattro le tabelle sono state approvate dall'atleta (Andrea Baron) il 14 novembre 2026 e registrate in `CYCLE_RULE_APPROVALS`.

Questo documento serve all'atleta per rivedere la trascrizione delle tabelle di *Tipi che corrono* prima di approvarle come regole del generatore.

## Come è stata fatta la trascrizione

- Due trascrizioni indipendenti per tabella, lette dalle scansioni di `docs/manuali/parte 2.pdf`.
- Una terza lettura ha riconciliato ogni differenza sulla scansione e ricontrollato a campione le celle concordi.
- Nessuna cella è rimasta irrisolta. Il testo è riportato come stampato, refusi inclusi; `/` indica un a capo nella cella.
- Le celle con lettura ancora incerta sono marcate con ⚠.

## Come approvare

Dopo la revisione, aggiungere la tabella approvata in `CYCLE_RULE_APPROVALS` dentro [`training-methodology-rules.js`](../js/modules/training-methodology-rules.js):

```js
export const CYCLE_RULE_APPROVALS = Object.freeze({
    ten_km_distance_time_cycle: { approvedBy: 'Andrea Baron', approvedAt: 'AAAA-MM-GG' }
});
```

Solo allora la regola passa a `approved_for_drafts` e, con un test VR valido, il motore genera la bozza. La bozza va poi confermata esplicitamente prima di scrivere le sedute nel calendario.

## Tabella 5 — 10 km, metodo respiratorio

Pagine stampate 198-199, scansioni 26. Regola: `ten_km_breathing_cycle`.

Note di stampa:

- Settimana 3, giorno 4: stampato '10 CRF' senza segno dei minuti; probabile refuso, mantenuto.
- Settimana 8, giorno 2: inizia con 'CRF' senza durata; probabile omissione di stampa, nessun valore aggiunto.
- Settimane 3, 6 e 9 stampate in grassetto.

| Sett. | 1° giorno | 2° giorno | 3° giorno | 4° giorno | 5° giorno | 6° giorno | 7° giorno |
|---|---|---|---|---|---|---|---|
| 1 | Riposo o<br>esercizi | 60' CRF | Riposo o<br>esercizi | 8 x 30"<br>in salita<br>a CRI<br>rec.<br>1'30" +<br>rec. 3' +<br>8 km a<br>CRF | Riposo o<br>esercizi | 40' CRF<br>+<br>20' CRLI | 70' CRF |
| 2 | Riposo o<br>esercizi | 50' CRF<br>+<br>10' CRLI | Riposo o<br>esercizi | 20' CRF<br>+ 10 x 1'<br>CRI rec.<br>2' CRF +<br>12' CRF | Riposo o<br>esercizi | 25'<br>CRF +<br>5' CRLI<br>+ 25'<br>CRF +<br>5' CRLI | 30' CRF<br>+<br>30' CRLI |
| 3 | Riposo | 40' CRF | Riposo<br>o<br>esercizi | 10 CRF<br>+ 2 x 5'<br>CRI rec.<br>3' CRF | Riposo | 20' CRF | Test di<br>verifica<br>della<br>VR |
| 4 | Riposo | 45' CRF<br>+<br>15' CRLI | Riposo o<br>esercizi | 10 x 30"<br>in<br>salita a<br>CRI rec.<br>1'30" +<br>rec. 3'<br>+ 30' a<br>CRF | Riposo o<br>esercizi | 20' CRF<br>+ 10'<br>CRLI +<br>20'<br>CRF +<br>10'<br>CRLI | 75' CRF |
| 5 | Riposo | 40' CRF<br>+<br>20' CRLI | Riposo o<br>esercizi | 20' CRF<br>+ 8 x 2'<br>CRI rec.<br>2' CRF +<br>10' CRF | Riposo o<br>esercizi | 20'<br>CRF +<br>5' CRLI<br>+ 20'<br>CRF +<br>5' CRLI<br>+ 5' CRI | 20' CRF<br>+<br>40' CRLI |
| 6 | Riposo | 35' CRF<br>+<br>5' CRI | Riposo<br>o<br>esercizi | 10' CRF<br>+ 2 x 6'<br>CRI rec.<br>3' CRF | Riposo | 30' CRF | 10' CRF<br>+<br>40'<br>ritmo<br>gara |
| 7 | Riposo | 35' CRF<br>+<br>25' CRLI | Riposo o<br>esercizi | 12 x<br>30" in<br>salita a<br>CRI rec.<br>1'30" +<br>rec. 3'<br>+ 30' a<br>CRF | Riposo o<br>esercizi | 25'<br>CRF+<br>3' CRLI<br>+<br>2' CRI+<br>25'<br>CRF+<br>3'<br>CRLI+<br>2' CRI | 80' CRF |
| 8 | Riposo | CRF<br>+ 30'<br>CRLI | Riposo o<br>esercizi | 20' CRF<br>+ 3 x 8'<br>CRI rec.<br>3' CRF | Riposo o<br>esercizi | 50' CRF<br>+ 10'<br>CRI | 10' CRF<br>+<br>30' ritmo<br>gara |
| 9 | Riposo | 30' CRF | Riposo | 20' CRF<br>+ 10'<br>CRI | Riposo | 20' CRF | Gara |

## Tabella 6 — 10 km, metodo distanza-tempo

Pagine stampate 200, scansioni 27. Regola: `ten_km_distance_time_cycle`.

Note di stampa:

- La didascalia a p. 200 riporta solo 'Tabella 6.'; la descrizione 10 km distanza-tempo è nel testo di p. 199.
- Nessuna nota sotto la tabella 6.
- Settimane 3 e 9 stampate in grassetto (solo formattazione).
- Punteggiatura incoerente nella stampa, mantenuta: 'rec 3'' senza punto (sett. 3, 6, 8), 'rec. 3'' (sett. 7, 9), punti finali in 'km L.' e 'km M.'.

| Sett. | 1° giorno | 2° giorno | 3° giorno | 4° giorno | 5° giorno | 6° giorno | 7° giorno |
|---|---|---|---|---|---|---|---|
| 1 | Riposo | 10 km L | Riposo o<br>esercizi | 10 x<br>100 m<br>in salita<br>SB rec.<br>2' + rec.<br>3' + 6<br>km L. | Riposo o<br>esercizi | 10 km B | 12 km L |
| 2 | Riposo | 9 km L +<br>1 km M | Riposo o<br>esercizi | 10 x<br>400 m<br>VAM rec.<br>1'30" | Riposo o<br>esercizi | 8 km L +<br>2 km M | 12 km T |
| 3 | Riposo | 6 km L | Riposo o<br>esercizi | 4 x 1 km<br>MLSS<br>rec 3' | Riposo | 5 km L +<br>1 km M | Test di<br>verifica<br>della VR |
| 4 | Riposo | 9 km L +<br>1 km M | Riposo o<br>esercizi | 12 x 100<br>m SB<br>in salita<br>rec. 2'+<br>rec. 3' +<br>6 km L | Riposo o<br>esercizi | 12 km B | 14 km L |
| 5 | Riposo | 8 km L +<br>2 km M. | Riposo o<br>esercizi | 10 x 500<br>m VAM<br>rec.<br>1'30" | Riposo o<br>esercizi | 7 km L +<br>3 km M | 12 km P |
| 6 | Riposo | 5 km L | Riposo o<br>esercizi | 2 x 2 km<br>MLSS<br>rec 3' | Riposo | 6 km L | 7 km<br>ritmo<br>gara 10<br>km |
| 7 | Riposo | 6 km L +<br>4 km M. | Riposo o<br>esercizi | 5 x 1 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 10 km L. | 7 km L +<br>7 km M |
| 8 | Riposo | 4 km a L<br>+ 1<br>km M +<br>4 km L +<br>1 km M | Riposo o<br>esercizi | 3 x 2 km<br>MLSS<br>rec 3' | Riposo o<br>esercizi | 6 km L<br>4 km M | 5 km<br>ritmo<br>gara |
| 9 | Riposo | 6 km L | Riposo | 5 x 600<br>m VAM<br>rec. 3' | Riposo | 4 km L | Gara |

## Tabella 8 — mezza maratona, metodo distanza-tempo

Pagine stampate 203-204, scansioni 28-29. Regola: `half_marathon_distance_time_cycle`.

Note di stampa:

- Settimana 6, giorno 6: stampato '1 km a m' (m minuscola), probabilmente troncato; mantenuto.
- Settimana 6, giorno 7: 'O gara', 'Km', 'della VR'; in settimana 3 'delle VR', 'o gara', 'km'. Mantenuti come stampati.
- Settimana 7, giorno 1: 'riposo' minuscolo.
- Settimana 8, giorno 2: primo tratto '4 km' senza L; mantenuto.
- Settimane 3, 6 e 9 stampate in grassetto.
- Settimane 1-7 a p. 203 (scansione 28), settimane 8-12 a p. 204 (scansione 29).

| Sett. | 1° giorno | 2° giorno | 3° giorno | 4° giorno | 5° giorno | 6° giorno | 7° giorno |
|---|---|---|---|---|---|---|---|
| 1 | Riposo | 12 km L | Riposo o<br>esercizi | 12 x 100<br>m SB<br>in salita<br>rec. 2' +<br>rec. 3' +<br>8 km L | Riposo o<br>esercizi | 10 km L<br>+ 2 km M | 12 km B |
| 2 | Riposo | 6 km L +<br>4 km M | Riposo o<br>esercizi | 10 x 600<br>m VAM<br>rec. 2' | Riposo o<br>esercizi | 4 km L +<br>6 km M | 14 km L |
| 3 | Riposo | 6 km L | Riposo o<br>esercizi | 5x 800<br>m MLSS<br>rec. 2' | Riposo | 6 km L | Test di<br>verifica<br>delle VR<br>o gara<br>di 10-12<br>km |
| 4 | Riposo | 10 km L<br>+ 2 km M | Riposo o<br>esercizi | 14 x<br>100 m in<br>salita SB<br>rec. 2'<br>+ rec. 3'<br>+ 8 km L | Riposo o<br>esercizi | 12 km T | 16 km L |
| 5 | Riposo | 5 km L +<br>2 km M +<br>5 km L +<br>2 km M | Riposo o<br>esercizi | 5 x 1 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 9 km P | 10 km M |
| 6 | Riposo | 5 km L +<br>2 km M | Riposo o<br>esercizi | 2 x 2 km<br>MLSS<br>rec. 3' | Riposo | 5 km L +<br>1 km a m | Test di<br>verifica<br>della VR<br>O gara<br>di 10-12<br>Km |
| 7 | riposo | 9 km L +<br>3 km M | Riposo o<br>esercizi | 3 x 2 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 10 km L<br>+ 2 km M | 18 km L |
| 8 | Riposo | 4 km + 3<br>km M + 4<br>km L + 3<br>km M | Riposo o<br>esercizi | 7 x 1 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 6 km L +<br>4 km M | 12 km P |
| 9 | Riposo | 4 km L +<br>4 km M | Riposo | 2 x 3 km<br>MLSS<br>rec. 3' | Riposo | 6 km L | 12 km<br>RME |
| 10 | Riposo | 4 km L +<br>8 km M | Riposo o<br>esercizi | 4 x 2 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 12 km L | 12 km L<br>+ 6 km<br>M |
| 11 | Riposo | 9 km T | Riposo o<br>esercizi | 3 x 3 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 8 km L +<br>2 km M | 10 km<br>RME |
| 12 | Riposo | 4 km L +<br>2 km M | Riposo | 8 x 500<br>m VAM<br>rec. 2' | Riposo | 4 km L | Gara |

## Tabella 10 — maratona, metodo distanza-tempo

Pagine stampate 207-208, scansioni 30-31. Regola: `marathon_distance_time_cycle`.

Note di stampa:

- Settimane 1-7 a p. 207 (scansione 30), settimane 8-15 a p. 208 (scansione 31); il catalogo indicava per errore le scansioni 31-32.
- Settimana 7, giorno 4: stampato '1 kma' (sic).
- Settimane 10, 11 e 14, giorno 4: la cella termina con 'RMA + 1' senza 'km RMA'; mantenuto.

| Sett. | 1° giorno | 2° giorno | 3° giorno | 4° giorno | 5° giorno | 6° giorno | 7° giorno |
|---|---|---|---|---|---|---|---|
| 1 | Riposo | 12 km L | Riposo o<br>esercizi | 8 x 800<br>m MLSS<br>rec. 2' | Riposo o<br>esercizi | 10 km L | 24 km L |
| 2 | Riposo | 10 km L.<br>+ 4 km M ⚠ | Riposo o<br>esercizi | 10 x 800<br>m MLSS<br>rec. 2' | Riposo o<br>esercizi | 12 km L | 15 km T |
| 3 | Riposo | 8 km L | Riposo o<br>esercizi | 8 x 100 m<br>in salita<br>SB rec.<br>2' rec. 3'<br>4 km L | Riposo | 6 km L | Test di<br>verifica<br>della VR |
| 4 | Riposo | 8 km L | Riposo o<br>esercizi | 1 km<br>RMA +<br>5 x 1 km<br>RME rec.<br>1 km<br>RMA + 1<br>km RMA | Riposo o<br>esercizi | 12 km B | 28 km L |
| 5 | Riposo | 12 km L +<br>2 km a M | Riposo o<br>esercizi | 1 km<br>RMA +<br>6 x 1 km<br>RME rec.<br>1 km<br>RMA + 1<br>km RMA | Riposo o<br>esercizi | 14 km L | 16 km M |
| 6 | Riposo | 4 km L | Riposo o<br>esercizi | 10 x 100<br>m in<br>salita SB<br>rec. 2' +<br>rec. 3' +<br>4 km L | Riposo | 6 km L | Mezza<br>maratona<br>più forte<br>possibile<br>in gara<br>o in<br>allenam. |
| 7 | Riposo | 5 km L +<br>2 km M +<br>5 km L +<br>2 km M | Riposo o<br>esercizi | 1 km<br>RMA +<br>7 x 1 km<br>RME rec.<br>1 kma<br>RMA + 1<br>km RMA | Riposo o<br>esercizi | 10 km L | 32 km<br>LLM |
| 8 | Riposo | 5 km L +<br>7 km M | Riposo o<br>esercizi | 1 km<br>RMA +<br>3 x 2 km<br>RME rec.<br>1 km<br>RMA + 1<br>km RMA | Riposo o<br>esercizi | 3 km L +<br>2 km M +<br>3 km L+ 2<br>km M | 20 km<br>RMA |
| 9 | Riposo | 6 km L+ 2<br>km M | Riposo | 12 x 100<br>m in<br>salita SB<br>rec. 2' +<br>rec. 3' +<br>4 km L | Riposo | 6 km L | 20 km L<br>+ 14 km<br>RMA |
| 10 | Riposo | 11 km L +<br>1 km M | Riposo o<br>esercizi | 1 km<br>RMA +<br>4 x 2 km<br>RME rec.<br>1 km<br>RMA + 1 | Riposo o<br>esercizi | 12 km B | 18 km M |
| 11 | Riposo | 9 km L +<br>5 km M | Riposo o<br>esercizi | 1 km<br>RMA +<br>3 x 3 km<br>RME rec.<br>1 km<br>RMA + 1 | Riposo o<br>esercizi | 9 km T | 24 km<br>RMA |
| 12 | Riposo | 8 km | Riposo | 5 x 1 km<br>MLSS<br>rec. 3' | Riposo | 6 km L | 20 km<br>LLM +<br>16 km<br>RMA |
| 13 | Riposo | 5 km L +<br>5 km M | Riposo o<br>esercizi | 7 x 1 km<br>MLSS<br>rec. 3' | Riposo o<br>esercizi | 10 km L +<br>2 km M | 21 km P |
| 14 | Riposo | 10 km L | Riposo o<br>esercizi | 1 km<br>RMA +<br>2 x 3 km<br>RME rec.<br>1 km<br>RMA + 1 | Riposo o<br>esercizi | 8 km L | 14 km<br>RMA |
| 15 | Riposo | 6 km L | Riposo | 4 km L+ 4<br>km RMA | Riposo | Riposo o<br>4 km L | Gara |

