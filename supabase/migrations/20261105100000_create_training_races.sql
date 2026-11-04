create table if not exists public.training_races (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 120),
    event_date date,
    target_period text,
    distance_km numeric(7, 3) not null check (distance_km > 0),
    elevation_gain_m integer check (elevation_gain_m is null or elevation_gain_m >= 0),
    priority smallint not null default 2 check (priority between 1 and 3),
    goal text,
    status text not null default 'planned' check (status in ('planned', 'completed')),
    official_time_seconds integer check (official_time_seconds is null or official_time_seconds > 0),
    chip_time_seconds integer check (chip_time_seconds is null or chip_time_seconds > 0),
    overall_position integer check (overall_position is null or overall_position > 0),
    gender_position integer check (gender_position is null or gender_position > 0),
    category_position integer check (category_position is null or category_position > 0),
    category text,
    bib_number text,
    result_source_url text check (result_source_url is null or result_source_url like 'https://%'),
    created_at timestamptz not null default now(),
    check (event_date is not null or nullif(btrim(target_period), '') is not null),
    check (event_date is null or target_period is null),
    check (status <> 'completed' or event_date is not null),
    check (status = 'completed' or (
        official_time_seconds is null
        and chip_time_seconds is null
        and overall_position is null
        and gender_position is null
        and category_position is null
        and category is null
        and bib_number is null
        and result_source_url is null
    ))
);

create index if not exists training_races_user_date_idx
    on public.training_races (user_id, event_date);

alter table public.training_races enable row level security;

revoke all on public.training_races from anon, authenticated;
grant select, insert, update, delete on public.training_races to authenticated;

drop policy if exists "Users can read their own races" on public.training_races;
create policy "Users can read their own races"
    on public.training_races for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own races" on public.training_races;
create policy "Users can create their own races"
    on public.training_races for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own races" on public.training_races;
create policy "Users can update their own races"
    on public.training_races for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own races" on public.training_races;
create policy "Users can delete their own races"
    on public.training_races for delete to authenticated
    using ((select auth.uid()) = user_id);
