# Analisi avanzata delle prestazioni

Metriche calcolate nel browser dagli stream delle attività Intervals.icu e dai
dati wellness. Non vengono dal libro "Tipi che corrono": sono letteratura
generale più pesi derivati. L'atleta (Andrea Baron) le ha considerate valide il
27 novembre 2026, con rivalutazione ogni 15 giorni in base all'andamento dei
suoi dati. Le metriche danno solo indicazioni: non modificano il piano.

## Dati usati

| Fonte | Campi |
|---|---|
| `GET /api/v1/activity/{id}/streams.json?types=…` | `time`, `distance`, `fixed_altitude` o `altitude`, `heartrate`, `velocity_smooth`, `watts`, `cadence`, dinamiche di corsa |
| Elenco attività (`/athlete/{id}/activities`) | `stream_types`, `moving_time`, `distance`, `total_elevation_gain`, `total_elevation_loss`, `icu_training_load`, `trimp`; `decoupling`, `icu_efficiency_factor`, `gap` solo per confronto |
| Wellness (`/athlete/{id}/wellness`) | `hrv` (rMSSD), `restingHR` |

La specifica OpenAPI di Intervals.icu non elenca i nomi degli stream delle
dinamiche di corsa Garmin. Il parser ([activity-streams.js](../js/modules/activity-streams.js))
accetta più varianti (`stance_time`, `ground_contact_time`, `GroundContactTime`,
`vertical_oscillation`, `vertical_ratio`, …). La dashboard mostra l'elenco degli
stream trovati, così i nomi reali si verificano al primo aggiornamento.

Gli stream grezzi non si salvano. Le metriche di ogni corsa si salvano in
`activity_performance_analyses` (una riga per attività, con `config_version`).
Le revisioni delle soglie si salvano in `performance_threshold_reviews`.

## Formule

Tutte le costanti stanno in [performance-config.js](../js/modules/performance-config.js).

### 1. GAP ed Efficiency Factor

- Altitudine: filtro mediano su 5 campioni, poi media mobile su 30 m di distanza.
- Pendenza: `i = Δalt / Δdist` su almeno 20 m, limitata a ±45%.
- Costo energetico (Minetti et al. 2002, J Appl Physiol 93:1039):
  `C(i) = 155,4i⁵ − 30,4i⁴ − 43,3i³ + 46,3i² + 19,5i + 3,6` J/kg/m.
- `v_GAP = v · C(i) / 3,6`. Fattore circa 1,66 a +10%, circa 0,60 a −10%.
- `downhillFactorFloor` (spento) limita il "bonus" delle discese ripide: con
  Minetti puro il GAP delle discese tecniche risulta lento.
- GAP medio: media pesata sul tempo dei campioni in movimento (v ≥ 0,5 m/s,
  salto di tempo ≤ 10 s).
- `EF = v_GAP (m/min) / FC media`; con potenza anche `NP / FC media`.
- EF in salita: solo campioni con pendenza > +6%, almeno 2 minuti.
- Salita continua: almeno 50 m di dislivello e 3 minuti; una discesa fino a
  10 m non la interrompe. `VAM = dislivello / ore`.
- Trend a 60 o 90 giorni: retta di regressione dell'EF delle corse di almeno
  20 minuti. "GAP a FC di riferimento" = `EF × FC mediana`: il passo a parità di
  battito all'inizio e alla fine del periodo.

### 2. Deriva cardiaca

- Solo sedute oltre 60 minuti o 12 km.
- Si scartano i primi 10 minuti; il resto si divide a metà per tempo
  (`splitBy: 'distance'` per distanza).
- `Deriva % = (EF₁ − EF₂) / EF₁ · 100`, con EF calcolato sul GAP.
- Classi: sotto 3,5% ottima, fino a 5% buona, oltre significativa; sotto zero
  la seconda metà è più efficiente.
- Coefficiente di variazione del GAP su blocchi di 60 s oltre 0,15: seduta
  "non costante", deriva poco affidabile (ripetute, trail molto tecnici).

### 3. Decadimento biomeccanico

- Finestra iniziale: dalla fine del riscaldamento (10 minuti) al 30% della
  durata. Finestra finale: ultimo 20%.
- Normalizzazione: campioni con pendenza entro ±3% e velocità entro ±10% della
  mediana in piano. Con meno di 60 s utili per finestra si confrontano tutti i
  campioni e il risultato viene segnalato.
- Variazione delle mediane di GCT, oscillazione verticale e vertical ratio, in
  percentuale (indipendente dall'unità dello stream).
- Pendenza della retta del GCT nel tempo (ms/ora).
- Allarmi: GCT oltre +4%, crescita oltre 8 ms/ora, oscillazione verticale o
  vertical ratio oltre +5%.

### 4. Carico meccanico e prontezza

- Carico cardio: `icu_training_load`, poi `trimp`, poi 50 punti per ora.
- Carico eccentrico: D- per campione da −3% in giù, pesato ×1 fino a −8%,
  ×1,5 fino a −15%, ×2 oltre. Senza stream: `total_elevation_loss` (o il D+ se
  manca) × 1,25.
- `Mechanical Load Score = carico cardio + 10 punti ogni 100 m di D- pesato`.
- Eccentrico acuto: ultimi 7 giorni con emivita di 2 giorni. Rapporto con la
  media a 28 giorni: da 1,0 medio, da 1,5 alto. Sotto 10 punti acuti lo stato è
  basso. Una discesa da 60 punti nelle ultime 72 ore porta lo stato almeno a
  medio.
- HRV: media di ln(rMSSD) a 7 giorni (almeno 3 valori) contro la baseline a
  30 giorni (almeno 14 valori); range normale = media ± 0,5 deviazioni standard.
- Matrice:
  - HRV sotto range e carico eccentrico alto: **rosso**, solo recupero.
  - HRV sotto range: **giallo sistemico**, rimandare la qualità.
  - Carico eccentrico alto con HRV normale (o assente): **giallo muscolare**,
    evitare discese tecniche e qualità in discesa.
  - Altrimenti **verde**; con carico medio, discese tecniche con prudenza.
- FC a riposo a 7 giorni oltre 5 bpm sopra la media a 30: segnalata.

## Dati mancanti

Ogni metrica restituisce `status` (`ok`, `partial`, `unavailable`) e `reason`,
senza lanciare errori:

- senza distanza (nuoto in vasca, attività manuali): solo carico meccanico;
- senza FC: GAP, VAM e biomeccanica sì, EF e deriva no;
- senza altitudine: GAP uguale al passo reale (stato parziale);
- senza dinamiche di corsa: niente decadimento biomeccanico;
- senza HRV: la prontezza decide solo sul carico eccentrico, con avviso.

## Revisione ogni 15 giorni

[performance-calibration.js](../js/modules/performance-calibration.js). La prima
revisione cade il 12 dicembre 2026, poi ogni 15 giorni dall'ultima. La proposta
guarda gli ultimi 90 giorni:

| Soglia | Regola |
|---|---|
| Carico eccentrico "alto" | Con almeno 4 episodi: se meno del 25% è seguito da HRV sotto range entro 2 giorni, +10%. Se più della metà dei cali di HRV arriva dopo carico solo "medio", −10%. |
| Allarme GCT e oscillazione verticale | Con almeno 5 corse costanti (deriva ≤ 5%): limite personale = media + 2 deviazioni standard; se supera la soglia di oltre il 10%, la soglia sale; se è sotto la metà, scende. |
| Range HRV | Con almeno 10 giorni utili su 15: HRV sotto range in almeno il 40% dei giorni, anche senza carico, +10%. Mai fuori range in 60 giorni nonostante carichi alti, −10%. |
| Deriva cardiaca | Soglie di letteratura: solo osservazione, nessuna modifica automatica. |

Ogni proposta resta entro ±30% dal valore iniziale. Se non serve nessuna
modifica, la revisione si registra come "nessuna modifica". Se serve, la
dashboard mostra la proposta: le nuove soglie valgono solo dopo "Approva".
Le soglie servono solo a classificare: cambiarle non richiede di ricalcolare
le analisi salvate.
