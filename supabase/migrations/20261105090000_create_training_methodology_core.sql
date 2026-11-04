create table if not exists public.training_methodology_core (
    methodology_key text not null,
    version integer not null check (version > 0),
    title text not null,
    source_title text not null,
    source_pages text[] not null default '{}',
    diagram_mermaid text not null,
    content jsonb not null check (jsonb_typeof(content) = 'object'),
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (methodology_key, version)
);

create unique index if not exists training_methodology_one_active_version_idx
    on public.training_methodology_core (methodology_key)
    where is_active;

alter table public.training_methodology_core enable row level security;

revoke all on public.training_methodology_core from anon, authenticated;
grant select on public.training_methodology_core to authenticated;

drop policy if exists "Authenticated users can read active training methodology"
    on public.training_methodology_core;
create policy "Authenticated users can read active training methodology"
    on public.training_methodology_core for select to authenticated
    using (is_active);

insert into public.training_methodology_core (
    methodology_key,
    version,
    title,
    source_title,
    source_pages,
    diagram_mermaid,
    content,
    is_active
)
values (
    'running-methodology',
    1,
    'Base metodologica per la corsa e il trail',
    'Tipi che corrono',
    array['pp. 13-17', 'pp. 149-216', 'da circa p. 231'],
    $diagram$flowchart TD
    A[Dati reali dell'atleta e disponibilita] --> B[Obiettivo e gara]
    B --> C[Valutazione condivisa del livello]
    C --> D[Scelta del metodo e dei mezzi]
    D --> E[Piano con sedute, recupero e specificita]
    E --> F[Proiezione nel calendario]
    F --> G[Attivita reale da Intervals.icu]
    G --> H{Corrispondenza proposta}
    H -->|Confermata dall'atleta| I[Confronto piano-attivita]
    H -->|Non confermata| J[Attivita non associata]
    I --> K{Dati sufficienti e criteri approvati?}
    K -->|Si| L[Valutazione 1-5 spiegabile]
    K -->|No| M[Nessun punteggio: dati insufficienti]$diagram$,
    $content${
        "profiles": [
            {
                "key": "beginner",
                "description": "Nuovo runner, corsa limitata a una o due sedute settimanali/non oltre 60 minuti, oppure ripresa dopo una lunga interruzione; progressione graduale.",
                "source_pages": "pp. 13-14"
            },
            {
                "key": "amateur",
                "description": "Runner che corre agevolmente per circa 60 minuti; il manuale distingue ex-principiante, amatore vero e amatore tranquillo.",
                "source_pages": "pp. 14-15, 149-216"
            },
            {
                "key": "advanced",
                "description": "Runner con allenamento strutturato e volume/frequenza elevati secondo la descrizione dell'autore; non assegnare automaticamente questa categoria usando solo chilometri o ritmo.",
                "source_pages": "pp. 14-15, da circa p. 231"
            }
        ],
        "intensity_legend": [
            {"code": "CRMF", "meaning": "Corsa a respirazione molto facile"},
            {"code": "CRF", "meaning": "Corsa a respirazione facile"},
            {"code": "CRLI", "meaning": "Corsa a respirazione leggermente impegnata"},
            {"code": "CRI", "meaning": "Corsa a respirazione impegnata"},
            {"code": "CRMI", "meaning": "Corsa a respirazione molto impegnata"},
            {"code": "LS", "meaning": "Lentissimo"},
            {"code": "L", "meaning": "Lento"},
            {"code": "B", "meaning": "Bis"},
            {"code": "T", "meaning": "Tris"},
            {"code": "M", "meaning": "Medio"},
            {"code": "P", "meaning": "Progressivo"},
            {"code": "PA", "meaning": "Ripetute brevi"},
            {"code": "F", "meaning": "Fartlek"},
            {"code": "CVS", "meaning": "Corto veloce in salita"},
            {"code": "LLU", "meaning": "Lunghissimo ultra"},
            {"code": "LLM", "meaning": "Lunghissimo maratona"},
            {"code": "DA", "meaning": "Day After"},
            {"code": "DAU", "meaning": "Day After Ultra"},
            {"code": "TR", "meaning": "Tempo Run"},
            {"code": "VR", "meaning": "Velocita di riferimento"},
            {"code": "RG", "meaning": "Ritmo gara"},
            {"code": "RMA", "meaning": "Ritmo maratona"},
            {"code": "RME", "meaning": "Ritmo mezza maratona"},
            {"code": "RUM", "meaning": "Ritmo ultra"},
            {"code": "RRM", "meaning": "Ripetute a ritmo maratona"},
            {"code": "rec.", "meaning": "Recupero"}
        ],
        "planning_principles": [
            "Raccogliere obiettivo, data e caratteristiche della gara, disponibilita settimanale, esperienza recente e attivita realmente svolte.",
            "Concordare il profilo con l'atleta; le categorie del manuale sono descrittive e non costituiscono soglie automatiche.",
            "Comporre sedute facili, eventuali stimoli qualitativi, corsa lunga e recupero in modo individualizzato.",
            "Considerare cicli e scarichi come elementi presenti in alcuni esempi, non come progressione universale o aumento percentuale fisso.",
            "Non prescrivere ritmi fissi senza un riferimento recente e valido; non inventare valori mancanti."
        ],
        "trail_guidance": [
            "Preparare la specificita del terreno e del dislivello, includendo la gestione corsa/cammino quando appropriato.",
            "Non usare il solo passo al chilometro per confrontare sforzi su terreni e pendenze differenti.",
            "Commisurare le sedute specifiche al percorso obiettivo, all'esperienza e al recupero."
        ],
        "activity_matching": {
            "confirmation_required": true,
            "save_association_only_after_user_confirmation": true,
            "score_scale": {"min": 1, "max": 5},
            "score_status": "pending_criteria",
            "score_rules": [
                "Il punteggio e una regola applicativa, non una scala definita dal manuale.",
                "Definire e rendere visibili criteri per tipo di seduta prima di assegnare un punteggio.",
                "Usare solo dati realmente disponibili e pertinenti (per esempio intervalli, durata, distanza o potenza).",
                "Se l'attivita non e confermata o i dati sono insufficienti, non assegnare un voto."
            ]
        },
        "safeguards": [
            "Non dedurre il livello da eta, chilometri o da un singolo allenamento.",
            "Non trasformare automaticamente intensita respiratorie in ritmi fissi.",
            "Non trasformare testo OCR incerto in prescrizioni di recupero, test, riabilitazione o nutrizione.",
            "Sintomi, infortuni e idoneita richiedono valutazione di un professionista sanitario; l'app non formula diagnosi."
        ],
        "source_note": "Sintesi rielaborata dai PDF locali; non e una trascrizione. Le sigle OCR incerte vanno verificate sulla scansione prima di una codifica ulteriore."
    }$content$::jsonb,
    true
)
on conflict (methodology_key, version) do update
set title = excluded.title,
    source_title = excluded.source_title,
    source_pages = excluded.source_pages,
    diagram_mermaid = excluded.diagram_mermaid,
    content = excluded.content,
    is_active = excluded.is_active;
