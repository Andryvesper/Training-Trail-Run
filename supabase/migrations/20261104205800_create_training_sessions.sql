create table if not exists public.training_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    scheduled_date date not null,
    session_order integer not null default 1 check (session_order > 0),
    title text not null check (length(btrim(title)) > 0),
    sport_type text not null check (length(btrim(sport_type)) > 0),
    distance_km numeric(7, 2) check (distance_km is null or distance_km >= 0),
    duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
    notes text
);

create index if not exists training_sessions_user_date_order_idx
    on public.training_sessions (user_id, scheduled_date, session_order);

alter table public.training_sessions enable row level security;

grant select, insert, update, delete on public.training_sessions to authenticated;

drop policy if exists "Users can read their own training sessions" on public.training_sessions;
create policy "Users can read their own training sessions"
    on public.training_sessions for select
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own training sessions" on public.training_sessions;
create policy "Users can create their own training sessions"
    on public.training_sessions for insert
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own training sessions" on public.training_sessions;
create policy "Users can update their own training sessions"
    on public.training_sessions for update
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own training sessions" on public.training_sessions;
create policy "Users can delete their own training sessions"
    on public.training_sessions for delete
    using ((select auth.uid()) = user_id);
