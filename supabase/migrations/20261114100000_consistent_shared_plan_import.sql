-- Import of shared plans: paces keep their offset from the reference pace
-- (the book defines every pace as VR +/- seconds per km), duration follows
-- the adapted pace when distance and pace are set, and imported sessions are
-- appended after the ones already planned on the same day.
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
        -- Le sedute importate seguono quelle già presenti nello stesso giorno.
        (item->>'session_order')::integer + coalesce((
            select max(existing.session_order)
            from public.training_sessions existing
            where existing.user_id = v_user_id
              and existing.scheduled_date = p_new_start_date
                  + ((item->>'scheduled_date')::date - v_first_date)
        ), 0),
        item->>'title',
        item->>'sport_type',
        nullif(item->>'distance_km', 'null')::numeric,
        -- Con distanza e passo obiettivo la durata segue il passo adattato,
        -- altrimenti distanza, passo e durata non sarebbero coerenti.
        case
            when v_share.source_reference_pace_seconds_per_km is not null
                 and nullif(item->>'distance_km', 'null') is not null
                 and nullif(item->>'target_pace_seconds_per_km', 'null') is not null
                 and nullif(item->>'duration_minutes', 'null') is not null
            then round(
                (item->>'duration_minutes')::numeric
                * greatest(120, least(1800,
                    (item->>'target_pace_seconds_per_km')::numeric
                    - v_share.source_reference_pace_seconds_per_km
                    + p_target_reference_pace_seconds_per_km))
                / (item->>'target_pace_seconds_per_km')::numeric
            )::integer
            else nullif(item->>'duration_minutes', 'null')::integer
        end,
        case
            when v_share.source_reference_pace_seconds_per_km is null then null
            when nullif(item->>'target_pace_seconds_per_km', 'null') is null then null
            else greatest(
                120,
                least(
                    1800,
                    round(
                        (item->>'target_pace_seconds_per_km')::numeric
                        - v_share.source_reference_pace_seconds_per_km
                        + p_target_reference_pace_seconds_per_km
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
