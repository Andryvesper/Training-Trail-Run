# Training-Trail-Run
Web App per la schedulazione del programma di allenamento 

## Pianificazione degli allenamenti

Il calendario consente di pianificare più sedute per giorno e di modificarle o
eliminarle. Ogni seduta può includere tipo di attività, titolo, distanza,
durata e note. I dati sono separati per utente tramite Row Level Security.

## Percorso di sviluppo

1. **Pianificazione:** implementata; resta da applicare la migrazione Supabase.
2. **Dati sportivi:** rendere affidabili sincronizzazione Intervals.icu e metriche.
3. **Calendario:** completare abbinamento tra piano e attività svolte e progressi.
4. **Fondamenta:** estendere test, gestione errori e struttura del progetto.

Prima di usare il calendario, applica la migrazione
[`20261104205800_create_training_sessions.sql`](./supabase/migrations/20261104205800_create_training_sessions.sql)
al progetto Supabase collegato (SQL Editor o Supabase CLI). Senza la tabella e
le policy, il calendario mostrerà un errore e il salvataggio non sarà
disponibile.

## Test

Esegui i test automatici con `npm test` (richiede Node.js).
