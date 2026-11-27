-- Schema hardening. Every new constraint is NOT VALID so rows that already
-- exist can never make this migration fail; they only apply to new writes.
-- No user data is modified or deleted here.

-- 1. training_sessions: size and value caps matching what the client already
-- enforces (title/notes maxLength in the form, distance <= 1000 km in
-- validateSession). sport_type values are the ones the app can write:
-- calendar-ui SESSION_TYPES plus 'run'/'trail'/'strength' from the cycle engine.
alter table public.training_sessions
    drop constraint if exists training_sessions_title_length_check,
    drop constraint if exists training_sessions_notes_length_check,
    drop constraint if exists training_sessions_sport_type_values_check,
    drop constraint if exists training_sessions_distance_max_check,
    drop constraint if exists training_sessions_completed_activity_size_check;

alter table public.training_sessions
    add constraint training_sessions_title_length_check
        check (char_length(title) <= 120) not valid,
    add constraint training_sessions_notes_length_check
        check (notes is null or char_length(notes) <= 2000) not valid,
    add constraint training_sessions_sport_type_values_check
        check (sport_type in ('run', 'trail', 'swim', 'strength', 'recovery', 'other')) not valid,
    -- the >= 0 lower bound already exists from the table definition
    add constraint training_sessions_distance_max_check
        check (distance_km is null or distance_km <= 1000) not valid,
    add constraint training_sessions_completed_activity_size_check
        check (completed_activity is null or pg_column_size(completed_activity) < 20000) not valid;

-- 2. training_sessions: policies only for signed-in users, anon gets nothing.
-- Same names and logic as before, just scoped with "to authenticated".
revoke all on public.training_sessions from anon;

drop policy if exists "Users can read their own training sessions" on public.training_sessions;
create policy "Users can read their own training sessions"
    on public.training_sessions for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own training sessions" on public.training_sessions;
create policy "Users can create their own training sessions"
    on public.training_sessions for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own training sessions" on public.training_sessions;
create policy "Users can update their own training sessions"
    on public.training_sessions for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own training sessions" on public.training_sessions;
create policy "Users can delete their own training sessions"
    on public.training_sessions for delete to authenticated
    using ((select auth.uid()) = user_id);

-- 3. Indexes on foreign keys used by the share lookups and cascades.
create index if not exists training_plan_shares_owner_idx
    on public.training_plan_shares (owner_id);

create index if not exists training_plan_share_imports_imported_by_idx
    on public.training_plan_share_imports (imported_by);

-- 4. One threshold review per user and day (the app writes one row per
-- reviewed_at and later updates it). Existing duplicates would make the
-- index creation fail, so it is skipped with a notice in that case.
do $$
begin
    if exists (
        select 1
        from public.performance_threshold_reviews
        group by user_id, reviewed_at
        having count(*) > 1
    ) then
        raise notice 'performance_threshold_reviews has duplicate (user_id, reviewed_at) rows: unique index not created, clean them up and re-run this migration.';
    else
        create unique index if not exists performance_threshold_reviews_user_day_key
            on public.performance_threshold_reviews (user_id, reviewed_at);
    end if;
end
$$;

-- 5. Purge of old shares: removes shares expired or revoked more than 30 days
-- ago (their import records go with them through on delete cascade), so
-- old share codes do not pile up forever.
create or replace function public.purge_expired_training_plan_shares()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_deleted integer;
begin
    delete from public.training_plan_shares
    where expires_at < now() - interval '30 days'
       or revoked_at < now() - interval '30 days';

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

revoke all on function public.purge_expired_training_plan_shares() from public, anon, authenticated;

-- Daily schedule, only when pg_cron is already installed (never created here).
do $$
begin
    if to_regnamespace('cron') is not null
       and to_regprocedure('cron.schedule(text,text,text)') is not null then
        if exists (select 1 from cron.job where jobname = 'purge-expired-training-plan-shares') then
            perform cron.unschedule('purge-expired-training-plan-shares');
        end if;
        perform cron.schedule(
            'purge-expired-training-plan-shares',
            '30 3 * * *',
            'select public.purge_expired_training_plan_shares()'
        );
    else
        raise notice 'pg_cron not available: purge_expired_training_plan_shares() was created but not scheduled.';
    end if;
end
$$;

-- 6. training_plan_drafts: link the primary race (cleared if the race is
-- deleted) and let a client create drafts only in the statuses the app
-- inserts; 'confirmed' is reached only through the update policy.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'training_plan_drafts_primary_race_id_fkey'
          and conrelid = 'public.training_plan_drafts'::regclass
    ) and (
        select a.atttypid from pg_attribute a
        where a.attrelid = 'public.training_plan_drafts'::regclass and a.attname = 'primary_race_id'
    ) = (
        select a.atttypid from pg_attribute a
        where a.attrelid = 'public.training_races'::regclass and a.attname = 'id'
    ) then
        alter table public.training_plan_drafts
            add constraint training_plan_drafts_primary_race_id_fkey
            foreign key (primary_race_id) references public.training_races (id)
            on delete set null not valid;
    end if;
end
$$;

drop policy if exists "Users can create their own plan draft requests"
    on public.training_plan_drafts;
create policy "Users can create their own plan draft requests"
    on public.training_plan_drafts for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and status in ('awaiting_methodology', 'draft_generated')
    );

-- 7. profiles.birth_date: a CHECK using current_date is not immutable, so the
-- check keeps only the fixed lower bound and a trigger rejects future dates.
alter table public.profiles
    drop constraint if exists profiles_personal_data_check;

alter table public.profiles
    add constraint profiles_personal_data_check check (
        (full_name is null or length(btrim(full_name)) <= 120)
        and (birth_date is null or birth_date >= date '1900-01-01')
        and (sex is null or sex in ('female', 'male', 'other', 'prefer_not_to_say'))
        and (city is null or length(btrim(city)) <= 80)
        and (phone is null or length(btrim(phone)) <= 30)
        and (height_cm is null or height_cm between 100 and 250)
        and (weight_kg is null or weight_kg between 25 and 250)
    ) not valid;

create or replace function public.validate_profile_birth_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- On update only check when the date actually changes, so an old
    -- invalid value never blocks unrelated profile edits.
    if new.birth_date is not null
       and new.birth_date > current_date
       and (tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date) then
        raise exception 'La data di nascita non può essere nel futuro.';
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_validate_birth_date on public.profiles;
create trigger profiles_validate_birth_date
    before insert or update on public.profiles
    for each row execute function public.validate_profile_birth_date();
