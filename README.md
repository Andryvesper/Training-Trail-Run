# Training-Trail-Run
Web App per la schedulazione del programma di allenamento 

## Pianificazione degli allenamenti

Il calendario consente di pianificare più sedute per giorno e di modificarle o
eliminarle. Ogni seduta può includere tipo di attività, titolo, distanza,
durata, passo obiettivo facoltativo e note. I dati sono separati per utente
tramite Row Level Security.
Da telefono il calendario mostra una settimana per volta, con controlli grandi
per scorrere tra le settimane.

La scheda **Gare** salva obiettivi e risultati per utente. Per una gara futura
si può indicare il periodo previsto quando la data esatta non è ancora nota;
per una gara conclusa si possono registrare tempi ufficiali e real time,
piazzamenti e fonte del risultato.

Nel calendario, le attività Intervals.icu dello stesso giorno e sport di una
seduta vengono proposte come possibili corrispondenze, ma l'associazione viene
salvata solo dopo conferma esplicita. L'atleta può dare un voto personale da 1
a 5; distanza e durata effettive restano visibili accanto al piano. Il voto
non è un confronto automatico con ritmo, ripetute o potenza: i criteri
oggettivi vanno definiti prima di automatizzarlo.

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
La specifica del motore di bozze e lo stato della pipeline sono in
[`docs/training-engine-paradigm.md`](./docs/training-engine-paradigm.md); non
costituisce ancora regole di allenamento attive.

La scheda **Motore piani** permette di salvare il questionario, selezionare una
gara principale e altre gare da considerare, vedere gli esempi metodologici
pertinenti e registrare una richiesta di bozza. Una pipeline deterministica
valuta applicabilità, approvazione, tracciabilità della fonte e input richiesti
dalle regole. Gli outline strutturali delle tabelle 6, 8 e 10 non riportano le
singole sedute e restano non eseguibili; nessuna seduta viene generata o
attivata. Il questionario salva anche il numero di corse desiderato nella
settimana tipo, il limite delle eventuali proposte di picco e le sedute
settimanali di altri sport (giorno, durata e flessibilità). Gli sport non
indicati non riducono la disponibilità per la corsa; gli impegni fissi
riducono i giorni liberi, mentre quelli spostabili generano un avviso. Il
conteggio del carico incrociato e la logica che colloca le settimane di picco
non sono ancora implementati. Le date coincidenti vengono segnalate senza risolvere
automaticamente le priorità. Per i test VR già svolti
si possono registrare protocollo, tempo, data e condizioni; la VR è calcolata
solo per i metodi 3 km + 10% e test 10 km documentati. Il calcolo non ordina un
test e non prescrive un passo di allenamento. Il primo prototipo è circoscritto
alla gara stradale 10 km, ma resta bloccato finché le sedute del ciclo fonte e
i criteri di applicabilità non saranno verificati e approvati. La richiesta di
bozza non genera allenamenti né attiva modifiche al calendario. Per salvarla
è necessaria la migrazione
[`20261105110000_create_training_planner_drafts.sql`](./supabase/migrations/20261105110000_create_training_planner_drafts.sql).

Dal calendario si possono condividere sedute selezionate con un codice casuale
a scadenza, revocabile dall’atleta che lo ha creato, oppure importare una copia
nel proprio calendario con conferma esplicita. Il codice dà accesso al
programma condiviso: va comunicato privatamente. L’importazione non modifica
l’originale e può essere fatta una sola volta per account. I passi obiettivo
facoltativi sono riparametrizzati in proporzione ai passi di riferimento
dichiarati dai due atleti; è un adattamento matematico preliminare, non una
validazione fisiologica e non tiene conto di soglie, dislivello, condizioni o
carichi individuali. Verifica le sedute con un allenatore prima di seguirle.
Questa funzione copia le sedute già pianificate: non genera automaticamente
un nuovo piano né i dettagli strutturati di ripetute e recuperi.

## Backup locale

Gli script in `scripts/backup/` preparano un backup cifrato age con dump
Supabase, snapshot del repository, bundle Git e PDF locali. Configura la
connessione al database con `configure-supabase-connection.ps1` inserendo
l'URL senza password e la password nel prompt nascosto; le credenziali sono
protette con DPAPI per l'utente Windows corrente. Esegui poi
`run-backup.ps1` per esportare, cifrare, caricare su Drive e verificare
l'archivio. Solo dopo la verifica vengono conservate le tre generazioni più
recenti. `register-daily-backup.ps1` registra l'esecuzione giornaliera alle
07:00, mentre `backup.log` registra gli esiti in `%LOCALAPPDATA%`.

Prima di usare il backup, conserva la chiave privata age di recupero nel
password manager. La chiave privata non è nel repository né nel Drive. La
configurazione dipende dall'account Google autorizzato nel remote rclone
`trainingtrailrun`; controlla che sia l'account di backup previsto.

La CLI Supabase esclude gli schemi gestiti `auth` e `storage` dal dump: il
backup SQL non conserva gli account/credenziali Auth né gli oggetti Storage.
Il ripristino degli utenti e di eventuali file Storage richiede passaggi
separati. Il job richiede Windows in esecuzione e l'utente connesso, affinché
DPAPI e OAuth siano disponibili. In modalità OAuth Testing, Google può
richiedere una nuova autorizzazione dopo sette giorni.

## Percorso di sviluppo

1. **Pianificazione:** sedute persistenti su Supabase e calendario navigabile per settimana.
2. **Dati sportivi:** metriche e attività provengono da Intervals.icu; valori mancanti ed errori sono espliciti.
3. **Calendario:** le attività reali di Intervals.icu sono visibili accanto alle sedute pianificate.
4. **Fondamenta:** test automatici per calendario, persistenza e riepilogo delle API.
5. **Gare:** obiettivi e risultati sono salvati per atleta, con date flessibili e priorità.
6. **Metodo:** sintesi versionata dei manuali e paradigma progettuale per bozze, senza assegnazioni o carichi automatici non verificati.

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
- [`20261105100901_add_training_session_completion.sql`](./supabase/migrations/20261105100901_add_training_session_completion.sql), per memorizzare l'associazione confermata e la valutazione personale delle sedute completate.
- [`20261105110000_create_training_planner_drafts.sql`](./supabase/migrations/20261105110000_create_training_planner_drafts.sql), per salvare il questionario e le richieste di bozza per utente.
- [`20261105123000_add_training_plan_sharing.sql`](./supabase/migrations/20261105123000_add_training_plan_sharing.sql), per i passi obiettivo e la condivisione/importazione consensuale di sedute.

## Test

Esegui i test automatici con `npm test` (richiede Node.js).
