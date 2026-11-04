# Training-Trail-Run
Web App per la schedulazione del programma di allenamento 

## Pianificazione degli allenamenti

Il calendario consente di pianificare più sedute per giorno e di modificarle o
eliminarle. Ogni seduta può includere tipo di attività, titolo, distanza,
durata e note. I dati sono separati per utente tramite Row Level Security.
Da telefono il calendario mostra una settimana per volta, con controlli grandi
per scorrere tra le settimane.

Per visualizzare metriche e attività reali, inserisci l’Athlete ID e la API Key
di Intervals.icu nella scheda **Intervals.icu**, quindi usa **Salva e
sincronizza**. Se il collegamento non è configurato, i dati mancanti vengono
indicati senza sostituirli con valori di esempio.

## Percorso di sviluppo

1. **Pianificazione:** sedute persistenti su Supabase e calendario navigabile per settimana.
2. **Dati sportivi:** metriche e attività provengono da Intervals.icu; valori mancanti ed errori sono espliciti.
3. **Calendario:** le attività reali di Intervals.icu sono visibili accanto alle sedute pianificate.
4. **Fondamenta:** test automatici per calendario, persistenza e riepilogo delle API.

Prima di usare il calendario, applica la migrazione
[`20261104205800_create_training_sessions.sql`](./supabase/migrations/20261104205800_create_training_sessions.sql)
al progetto Supabase collegato (SQL Editor o Supabase CLI). Senza la tabella e
le policy, il calendario mostrerà un errore e il salvataggio non sarà
disponibile.

## Test

Esegui i test automatici con `npm test` (richiede Node.js).
