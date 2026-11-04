# Training-Trail-Run
Web App per la schedulazione del programma di allenamento 

## Pianificazione degli allenamenti

Il calendario consente di pianificare più sedute per giorno e di modificarle o
eliminarle. Ogni seduta può includere tipo di attività, titolo, distanza,
durata e note. I dati sono separati per utente tramite Row Level Security.
Da telefono il calendario mostra una settimana per volta, con controlli grandi
per scorrere tra le settimane.

La scheda **Gare** salva obiettivi e risultati per utente. Per una gara futura
si può indicare il periodo previsto quando la data esatta non è ancora nota;
per una gara conclusa si possono registrare tempi ufficiali e real time,
piazzamenti e fonte del risultato.

Per visualizzare metriche e attività reali, inserisci l’Athlete ID e la API Key
di Intervals.icu nella scheda **Intervals.icu**, quindi usa **Salva e
sincronizza**. Se il collegamento non è configurato, i dati mancanti vengono
indicati senza sostituirli con valori di esempio.

I manuali PDF da analizzare in locale possono essere copiati in
`docs/manuali/`. I PDF in questa cartella sono esclusi da Git e Vercel. Il
caricamento dei PDF in Supabase Storage non è implementato. La sintesi
metodologica rielaborata e non testuale è documentata in
[`docs/training-methodology.md`](./docs/training-methodology.md) e archiviata
nella tabella `training_methodology_core` di Supabase.

## Percorso di sviluppo

1. **Pianificazione:** sedute persistenti su Supabase e calendario navigabile per settimana.
2. **Dati sportivi:** metriche e attività provengono da Intervals.icu; valori mancanti ed errori sono espliciti.
3. **Calendario:** le attività reali di Intervals.icu sono visibili accanto alle sedute pianificate.
4. **Fondamenta:** test automatici per calendario, persistenza e riepilogo delle API.
5. **Gare:** obiettivi e risultati sono salvati per atleta, con date flessibili e priorità.
6. **Metodo:** sintesi versionata dei manuali, senza assegnazioni o carichi automatici non verificati.

Prima di usare il calendario, applica la migrazione
[`20261104205800_create_training_sessions.sql`](./supabase/migrations/20261104205800_create_training_sessions.sql)
al progetto Supabase collegato (SQL Editor o Supabase CLI). Senza la tabella e
le policy, il calendario mostrerà un errore e il salvataggio non sarà
disponibile. Le migrazioni successive aggiungono la base metodologica e la
scheda Gare:

- [`20261105090000_create_training_methodology_core.sql`](./supabase/migrations/20261105090000_create_training_methodology_core.sql)
- [`20261105091000_restrict_training_methodology_read_policy.sql`](./supabase/migrations/20261105091000_restrict_training_methodology_read_policy.sql)
- [`20261105100000_create_training_races.sql`](./supabase/migrations/20261105100000_create_training_races.sql)
- [`20261105101000_add_training_race_priority.sql`](./supabase/migrations/20261105101000_add_training_race_priority.sql)

## Test

Esegui i test automatici con `npm test` (richiede Node.js).
