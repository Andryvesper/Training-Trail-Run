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

La scheda **Tracce GPX** carica un file GPX (traccia o percorso, fino a 25 MB),
lo legge nel browser e salva una versione semplificata (al massimo un punto
ogni 10 m, 20000 punti) nella tabella `gpx_tracks`; il file originale non
viene conservato. L'analisi mostra distanza, D+ e D-, quote, km sforzo (stessa
formula dell'app: distanza + D+/100 + D-/200), profilo altimetrico colorato per
pendenza, forma del percorso, distribuzione delle pendenze, salite e discese
principali (almeno 50 m) e parziali al km. I dislivelli sono stime: quota
lisciata su circa 100 m e variazioni sotto 2 m ignorate, quindi possono
differire da quelli ufficiali. Si possono aggiungere punti personalizzati
(ristoro, acqua, aid station, punto di controllo, cancello orario, tratto
tecnico, altro) indicando il km o toccando il profilo; i waypoint del file a
meno di 500 m dalla traccia si possono importare al caricamento. Con i punti
l'app calcola le tratte tra i rifornimenti (o tra tutti i punti) e permette di
scaricare un GPX con traccia e punti per l'orologio. La mappa di sfondo non è
disponibile: la Content Security Policy ammette solo risorse dello stesso sito.
Una traccia si può collegare a una gara della scheda **Gare**; con conferma
esplicita, distanza e dislivelli stimati dalla traccia sostituiscono quelli
della gara.
Serve la migrazione
[`20261128120000_create_gpx_tracks.sql`](./supabase/migrations/20261128120000_create_gpx_tracks.sql).

Nel calendario, le attività Intervals.icu dello stesso giorno e sport di una
seduta vengono proposte come possibili corrispondenze, ma l'associazione viene
salvata solo dopo conferma esplicita. L'atleta può dare un voto personale da 1
a 5; distanza e durata effettive restano visibili accanto al piano. Il voto
non è un confronto automatico con ritmo, ripetute o potenza: i criteri
oggettivi vanno definiti prima di automatizzarlo.

Per visualizzare metriche e attività reali, inserisci l’Athlete ID e la API Key
di Intervals.icu nella scheda **Intervals.icu**, quindi usa **Salva e
sincronizza**. Se il collegamento non è configurato, i dati mancanti vengono
indicati senza sostituirli con valori di esempio. La API Key salvata non torna
più nel browser: le letture passano dalla Edge Function `intervals-proxy`
(vedi [Collegamento sicuro a Intervals.icu](#collegamento-sicuro-a-intervalsicu)).
Lo storico delle attività resta in cache nel browser (IndexedDB): dopo il
primo accesso si scaricano solo le ultime settimane. La cache si cancella
all'uscita.

I manuali PDF da analizzare in locale possono essere copiati in
`docs/manuali/`. I PDF in questa cartella sono esclusi da Git e Vercel. Il
caricamento dei PDF in Supabase Storage non è implementato. La sintesi
metodologica rielaborata e non testuale è documentata in
[`docs/training-methodology.md`](./docs/training-methodology.md) e archiviata
nella tabella `training_methodology_core` di Supabase.
La specifica del motore di bozze e lo stato della pipeline sono in
[`docs/training-engine-paradigm.md`](./docs/training-engine-paradigm.md). Le
tabelle-ciclo trascritte da approvare sono in
[`docs/cycle-transcriptions-review.md`](./docs/cycle-transcriptions-review.md).

La scheda **Motore piani** permette di salvare il questionario, selezionare una
gara principale e altre gare da considerare, vedere gli esempi metodologici
pertinenti e registrare una richiesta di bozza. Una pipeline deterministica
valuta applicabilità, approvazione, tracciabilità della fonte e input richiesti
dalle regole. Le tabelle 5, 6, 8 e 10 sono trascritte cella per cella e
approvate dall'atleta. Con gara su strada, metodo scelto e test VR di al
massimo 6 settimane, la richiesta contiene una bozza (anche adattata a 3 o 5
corse settimanali) che scrive le sedute nel calendario solo dopo conferma
esplicita. Il questionario salva anche il numero di corse desiderato nella
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

## App sullo smartphone

L'app è una PWA: si installa dal browser, senza store.

- **iPhone (Safari):** apri il sito, tocca Condividi e poi "Aggiungi alla schermata Home".
- **Android (Chrome):** apri il sito e tocca "Installa app" nel menu, oppure accetta la proposta di installazione.

L'app installata si aggiorna da sola a ogni deploy e ha bisogno della rete:
senza connessione mostra solo la struttura salvata (HTML, CSS e libreria
Supabase sono già in cache dall'installazione). File: `manifest.webmanifest`,
`sw.js` e la cartella `icons/` (generata dal logo in `docs/`).

## Collegamento sicuro a Intervals.icu

La Edge Function [`supabase/functions/intervals-proxy`](./supabase/functions/intervals-proxy/index.ts)
legge la API Key dal profilo lato server e inoltra a Intervals.icu solo le
letture usate dall'app (attività, wellness, stream e giri). Il browser invia
solo la sessione Supabase.

L'ordine dei passaggi conta:

1. Distribuisci la funzione (serve un token di accesso Supabase):
   `npx supabase functions deploy intervals-proxy --project-ref sjsttftadxmutrhmagep --no-verify-jwt`.
   `--no-verify-jwt` è voluto: la funzione verifica la sessione da sola.
2. Applica le migrazioni (sotto). Solo dopo il passo 1:
   `20261128100000_protect_intervals_credentials.sql` rende la chiave
   illeggibile dal browser, quindi senza funzione Intervals.icu non funziona.

Finché la funzione non è distribuita, l'app chiama Intervals.icu direttamente
come prima (la chiave è ancora leggibile).

## Invito di nuovi utenti

Gli utenti con ruolo `admin` vedono la scheda **Amministrazione**. Lì
inseriscono l'email di un nuovo utente e inviano l'invito. Il destinatario
riceve un link: aprendolo entra senza password e l'app gli chiede subito di
sceglierne una (almeno 8 caratteri). Finché non la salva, non vede l'app; se
chiude la pagina, al rientro sullo stesso browser la richiesta si ripresenta.

L'invio passa dalla Edge Function
[`supabase/functions/admin-invite`](./supabase/functions/admin-invite/index.ts),
che verifica lato server che chi invia sia `admin` e marca il nuovo utente con
il metadato `must_set_password`. La scheda nascosta agli atleti è solo
interfaccia: il controllo vero è nella funzione.

Configurazione (una volta):

1. Distribuisci la funzione:
   `npx supabase functions deploy admin-invite --project-ref sjsttftadxmutrhmagep --no-verify-jwt`.
2. Promuovi il tuo profilo ad amministratore dal SQL Editor:
   `update public.profiles set role = 'admin' where email = '<tua email>';`
3. In **Authentication → URL Configuration** aggiungi l'indirizzo dell'app
   (ad esempio `https://<utente>.github.io/Training-Trail-Run/`) a
   **Redirect URLs**. Senza, il link porta al Site URL.
4. In **Authentication → Emails → SMTP Settings** configura un SMTP
   personalizzato. Il servizio email predefinito di Supabase invia solo agli
   indirizzi del team del progetto e con limiti molto bassi.
5. Facoltativo: traduci il modello **Invite user** in
   **Authentication → Emails → Templates**.
6. Consigliato: disattiva **Allow new users to sign up**
   (Authentication → Sign In / Providers). Gli inviti funzionano lo stesso e
   nessuno può registrarsi da solo con la chiave pubblica.

Il link vale una volta e scade dopo il tempo di **Email OTP Expiration**. Un
link scaduto o già usato mostra il motivo nella schermata di accesso. Si può
reinviare l'invito alla stessa email finché il link non è stato usato; dopo, la
funzione risponde che l'account esiste già.

**Password dimenticata?** nella schermata di accesso fa inviare da Supabase un
link di recupero allo stesso indirizzo dell'app. Aprendolo si sceglie una
nuova password prima di entrare. Il messaggio di conferma è lo stesso anche se
l'email non è registrata, per non rivelare quali account esistono. Serve anche
a un invitato che ha perso la sessione prima di scegliere la password. Il
testo dell'email si cambia nel modello **Reset Password**.

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
2. **Dati sportivi:** metriche e attività provengono da Intervals.icu; valori mancanti ed errori sono espliciti. La dashboard mostra record personali (5 km, 10 km, mezza, maratona da gare o attività sull'intera distanza, corsa più lunga), riepilogo di corse e nuotate per periodo e grafici di forma, volumi settimanali e dati wellness.
3. **Calendario:** le attività reali di Intervals.icu sono visibili accanto alle sedute pianificate.
4. **Fondamenta:** test automatici per calendario, persistenza e riepilogo delle API.
5. **Gare:** obiettivi e risultati sono salvati per atleta, con date flessibili e priorità.
6. **Metodo:** sintesi versionata dei manuali e paradigma progettuale per bozze, senza assegnazioni o carichi automatici non verificati.

Per applicare al database Supabase tutte le migrazioni non ancora eseguite,
usa la connessione cifrata creata per i backup
(`scripts/backup/configure-supabase-connection.ps1`) e lancia
`scripts/supabase/apply-migrations.ps1` (elenco) poi
`scripts/supabase/apply-migrations.ps1 -Apply`. Le migrazioni sono
rieseguibili e vengono registrate in `app_migrations.applied`.

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
- [`20261113120000_list_owned_training_plan_shares.sql`](./supabase/migrations/20261113120000_list_owned_training_plan_shares.sql), per elencare e revocare le proprie condivisioni attive anche senza il codice.
- [`20261113121000_allow_generated_training_plan_drafts.sql`](./supabase/migrations/20261113121000_allow_generated_training_plan_drafts.sql), per salvare bozze generate e segnarle come confermate.
- [`20261114090000_secure_profiles_role.sql`](./supabase/migrations/20261114090000_secure_profiles_role.sql), per impedire che un utente scelga o modifichi il proprio ruolo.
- [`20261114100000_consistent_shared_plan_import.sql`](./supabase/migrations/20261114100000_consistent_shared_plan_import.sql), per mantenere coerenti durata e passo dei programmi importati.
- [`20261114110000_add_profile_personal_data.sql`](./supabase/migrations/20261114110000_add_profile_personal_data.sql), per i dati anagrafici della scheda Profilo.
- [`20261114120000_add_training_race_elevation_loss.sql`](./supabase/migrations/20261114120000_add_training_race_elevation_loss.sql), per il dislivello negativo delle gare.
- [`20261127100000_create_performance_analyses.sql`](./supabase/migrations/20261127100000_create_performance_analyses.sql), per le analisi della prestazione e le revisioni delle soglie.
- [`20261128090000_add_profiles_legacy_intervals_columns.sql`](./supabase/migrations/20261128090000_add_profiles_legacy_intervals_columns.sql), per le colonne `intervals_athlete_id` e `intervals_api_key` usate dall'app.
- [`20261128091000_harden_schema.sql`](./supabase/migrations/20261128091000_harden_schema.sql), per limiti di dimensione, policy solo per utenti autenticati, indici, una revisione delle soglie al giorno e pulizia delle condivisioni scadute.
- [`20261128100000_protect_intervals_credentials.sql`](./supabase/migrations/20261128100000_protect_intervals_credentials.sql), per nascondere la API Key al browser. **Solo dopo aver distribuito `intervals-proxy`.**
- [`20261128110000_record_confirmed_draft_choices.sql`](./supabase/migrations/20261128110000_record_confirmed_draft_choices.sql), per salvare nella bozza confermata le scelte fatte (gare intermedie, sedute extra).
- [`20261128120000_create_gpx_tracks.sql`](./supabase/migrations/20261128120000_create_gpx_tracks.sql), per le tracce GPX e i loro punti personalizzati.

## Sviluppo

Richiede Node.js 22 o successivo. Dopo `npm install`:

| Comando | Cosa fa |
| --- | --- |
| `npm run build:css` | Genera `css/app.css` da `css/tailwind.input.css` (da rilanciare quando cambiano le classi Tailwind; il file generato va committato). |
| `npm run lint` | ESLint su codice, test e service worker. |
| `npm run format` / `npm run format:check` | Prettier. Trascrizioni e regole metodologiche sono escluse. |
| `npm test` | Test unitari. |
| `npm run test:e2e` | Test dell'interfaccia con Edge (Playwright), senza rete esterna. |
| `npm run check` | Lint, formattazione e test unitari insieme. |

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))
esegue tutti i controlli a ogni push e pull request.

La pagina non carica script di terze parti: `supabase-js` è in `vendor/` e
Tailwind è compilato. La Content Security Policy in `index.html` e gli
header di sicurezza in `vercel.json` presuppongono questa scelta. L'app è
pubblicata con GitHub Pages in `/Training-Trail-Run/`: per questo manifest e
service worker usano percorsi relativi. GitHub Pages non applica gli header di
`vercel.json`, che valgono solo per un eventuale deploy su Vercel; la CSP resta
attiva perché è nel `<meta>` di `index.html`.
