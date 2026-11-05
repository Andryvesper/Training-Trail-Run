alter table public.training_sessions
    add column if not exists target_pace_seconds_per_km integer
    check (
        target_pace_seconds_per_km is null
        or target_pace_seconds_per_km between 120 and 1800
    );

create table if not exists public.training_plan_shares (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    share_code uuid not null unique default gen_random_uuid(),
    title text not null check (length(btrim(title)) between 1 and 120),
    source_reference_pace_seconds_per_km integer
        check (
            source_reference_pace_seconds_per_km is null
            or source_reference_pace_seconds_per_km between 120 and 1800
        ),
    session_snapshot jsonb not null
        check (jsonb_typeof(session_snapshot) = 'array' and jsonb_array_length(session_snapshot) between 1 and 200),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    revoked_at timestamptz
);

create table if not exists public.training_plan_share_imports (
    id uuid primary key default gen_random_uuid(),
    share_id uuid not null references public.training_plan_shares(id) on delete cascade,
    imported_by uuid not null references auth.users(id) on delete cascade,
    imported_at timestamptz not null default now(),
    new_start_date date not null,
    source_reference_pace_seconds_per_km integer,
    target_reference_pace_seconds_per_km integer,
    session_count integer not null check (session_count > 0),
    unique (share_id, imported_by)
);

alter table public.training_plan_shares enable row level security;
alter table public.training_plan_share_imports enable row level security;

revoke all on public.training_plan_shares from anon, authenticated;
revoke all on public.training_plan_share_imports from anon, authenticated;

create or replace function public.create_training_plan_share(
    p_title text,
    p_session_ids uuid[],
    p_expires_in_days integer default 14,
    p_source_reference_pace_seconds_per_km integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_share public.training_plan_shares;
    v_session_count integer;
begin
    if v_user_id is null then
        raise exception 'Autenticazione richiesta.';
    end if;
    if p_title is null or length(btrim(p_title)) not between 1 and 120 then
        raise exception 'Il titolo deve contenere da 1 a 120 caratteri.';
    end if;
    if p_session_ids is null or cardinality(p_session_ids) not between 1 and 200 then
        raise exception 'Seleziona da 1 a 200 sedute.';
    end if;
    if p_expires_in_days is null or p_expires_in_days not between 1 and 30 then
        raise exception 'La condivisione deve scadere entro 1-30 giorni.';
    end if;
    if p_source_reference_pace_seconds_per_km is not null
       and p_source_reference_pace_seconds_per_km not between 120 and 1800 then
        raise exception 'Il passo di riferimento deve essere compreso tra 2:00 e 30:00 min/km.';
    end if;

    select count(distinct s.id)::integer
    into v_session_count
    from public.training_sessions s
    where s.user_id = v_user_id
      and s.id = any(p_session_ids);

    if v_session_count <> cardinality(p_session_ids) then
        raise exception 'Una o più sedute non sono disponibili per la condivisione.';
    end if;

    if p_source_reference_pace_seconds_per_km is null and exists (
        select 1
        from public.training_sessions s
        where s.user_id = v_user_id
          and s.id = any(p_session_ids)
          and s.target_pace_seconds_per_km is not null
    ) then
        raise exception 'Dichiara il passo di riferimento dell’atleta per condividere sedute con passi obiettivo.';
    end if;

    insert into public.training_plan_shares (
        owner_id,
        title,
        source_reference_pace_seconds_per_km,
        session_snapshot,
        expires_at
    )
    select
        v_user_id,
        btrim(p_title),
        p_source_reference_pace_seconds_per_km,
        jsonb_agg(
            jsonb_build_object(
                'scheduled_date', s.scheduled_date,
                'session_order', s.session_order,
                'title', s.title,
                'sport_type', s.sport_type,
                'distance_km', s.distance_km,
                'duration_minutes', s.duration_minutes,
                'target_pace_seconds_per_km', s.target_pace_seconds_per_km,
                'notes', s.notes
            )
            order by s.scheduled_date, s.session_order, s.id
        ),
        now() + make_interval(days => p_expires_in_days)
    from public.training_sessions s
    where s.user_id = v_user_id
      and s.id = any(p_session_ids)
    returning * into v_share;

    return jsonb_build_object(
        'id', v_share.id,
        'share_code', v_share.share_code,
        'title', v_share.title,
        'expires_at', v_share.expires_at,
        'session_count', v_session_count
    );
end;
$$;

create or replace function public.preview_training_plan_share(p_share_code uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_share public.training_plan_shares;
begin
    if auth.uid() is null then
        raise exception 'Autenticazione richiesta.';
    end if;

    select *
    into v_share
    from public.training_plan_shares s
    where s.share_code = p_share_code
      and s.revoked_at is null
      and s.expires_at > now();

    if not found then
        raise exception 'Codice di condivisione non valido, scaduto o revocato.';
    end if;

    return jsonb_build_object(
        'share_id', v_share.id,
        'title', v_share.title,
        'source_reference_pace_seconds_per_km', v_share.source_reference_pace_seconds_per_km,
        'session_count', jsonb_array_length(v_share.session_snapshot),
        'first_date', (
            select min((item->>'scheduled_date')::date)
            from jsonb_array_elements(v_share.session_snapshot) as entries(item)
        ),
        'sessions', v_share.session_snapshot,
        'expires_at', v_share.expires_at
    );
end;
$$;

create or replace function public.import_training_plan_share(
    p_share_code uuid,
    p_new_start_date date,
    p_target_reference_pace_seconds_per_km integer default null,
    p_confirm_overlaps boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_share public.training_plan_shares;
    v_first_date date;
    v_session_count integer;
    v_has_overlaps boolean;
begin
    if v_user_id is null then
        raise exception 'Autenticazione richiesta.';
    end if;
    if p_new_start_date is null then
        raise exception 'Indica la nuova data di inizio.';
    end if;
    if p_target_reference_pace_seconds_per_km is not null
       and p_target_reference_pace_seconds_per_km not between 120 and 1800 then
        raise exception 'Il passo di riferimento deve essere compreso tra 2:00 e 30:00 min/km.';
    end if;

    select *
    into v_share
    from public.training_plan_shares s
    where s.share_code = p_share_code
      and s.revoked_at is null
      and s.expires_at > now()
    for update;

    if not found then
        raise exception 'Codice di condivisione non valido, scaduto o revocato.';
    end if;
    if v_share.owner_id = v_user_id then
        raise exception 'Non puoi importare la tua stessa condivisione.';
    end if;
    if exists (
        select 1
        from public.training_plan_share_imports i
        where i.share_id = v_share.id
          and i.imported_by = v_user_id
    ) then
        raise exception 'Hai già importato questo programma.';
    end if;

    if v_share.source_reference_pace_seconds_per_km is null
       and p_target_reference_pace_seconds_per_km is not null then
        raise exception 'Il programma non dichiara un passo di riferimento da riparametrizzare.';
    end if;
    if v_share.source_reference_pace_seconds_per_km is not null
       and p_target_reference_pace_seconds_per_km is null then
        raise exception 'Indica il tuo passo di riferimento per adattare i passi obiettivo.';
    end if;

    select min((item->>'scheduled_date')::date)
    into v_first_date
    from jsonb_array_elements(v_share.session_snapshot) as entries(item);
    v_session_count := jsonb_array_length(v_share.session_snapshot);

    select exists (
        select 1
        from jsonb_array_elements(v_share.session_snapshot) as entries(item)
        join public.training_sessions existing
          on existing.user_id = v_user_id
         and existing.scheduled_date = p_new_start_date
             + ((item->>'scheduled_date')::date - v_first_date)
    )
    into v_has_overlaps;
    if v_has_overlaps and not coalesce(p_confirm_overlaps, false) then
        raise exception 'Il calendario contiene già sedute nelle date di importazione; controlla i conflitti e conferma esplicitamente.';
    end if;

    insert into public.training_plan_share_imports (
        share_id,
        imported_by,
        new_start_date,
        source_reference_pace_seconds_per_km,
        target_reference_pace_seconds_per_km,
        session_count
    )
    values (
        v_share.id,
        v_user_id,
        p_new_start_date,
        v_share.source_reference_pace_seconds_per_km,
        p_target_reference_pace_seconds_per_km,
        v_session_count
    );

    insert into public.training_sessions (
        user_id,
        scheduled_date,
        session_order,
        title,
        sport_type,
        distance_km,
        duration_minutes,
        target_pace_seconds_per_km,
        notes
    )
    select
        v_user_id,
        p_new_start_date + ((item->>'scheduled_date')::date - v_first_date),
        (item->>'session_order')::integer,
        item->>'title',
        item->>'sport_type',
        nullif(item->>'distance_km', 'null')::numeric,
        nullif(item->>'duration_minutes', 'null')::integer,
        case
            when v_share.source_reference_pace_seconds_per_km is null then null
            when nullif(item->>'target_pace_seconds_per_km', 'null') is null then null
            else greatest(
                120,
                least(
                    1800,
                    round(
                        (item->>'target_pace_seconds_per_km')::numeric
                        * p_target_reference_pace_seconds_per_km
                        / v_share.source_reference_pace_seconds_per_km
                    )::integer
                )
            )
        end,
        concat_ws(
            E'\n',
            nullif(item->>'notes', 'null'),
            'Programma importato da una condivisione; verifica carichi e ritmi prima di seguirlo.'
        )
    from jsonb_array_elements(v_share.session_snapshot) as entries(item);

    return jsonb_build_object('session_count', v_session_count);
end;
$$;

create or replace function public.revoke_training_plan_share(p_share_code uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_updated integer;
begin
    if auth.uid() is null then
        raise exception 'Autenticazione richiesta.';
    end if;

    update public.training_plan_shares
    set revoked_at = now()
    where share_code = p_share_code
      and owner_id = auth.uid()
      and revoked_at is null;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        raise exception 'Condivisione non trovata o già revocata.';
    end if;
    return true;
end;
$$;

revoke all on function public.create_training_plan_share(text, uuid[], integer, integer) from public, anon;
revoke all on function public.preview_training_plan_share(uuid) from public, anon;
revoke all on function public.import_training_plan_share(uuid, date, integer, boolean) from public, anon;
revoke all on function public.revoke_training_plan_share(uuid) from public, anon;
grant execute on function public.create_training_plan_share(text, uuid[], integer, integer) to authenticated;
grant execute on function public.preview_training_plan_share(uuid) to authenticated;
grant execute on function public.import_training_plan_share(uuid, date, integer, boolean) to authenticated;
grant execute on function public.revoke_training_plan_share(uuid) to authenticated;
