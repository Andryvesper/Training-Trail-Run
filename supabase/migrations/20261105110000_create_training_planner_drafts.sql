create table if not exists public.training_planning_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    questionnaire jsonb not null default '{}'::jsonb
        check (jsonb_typeof(questionnaire) = 'object'),
    updated_at timestamptz not null default now()
);

alter table public.training_planning_profiles enable row level security;

revoke all on public.training_planning_profiles from anon, authenticated;
grant select, insert, update on public.training_planning_profiles to authenticated;

drop policy if exists "Users can read their own planning profile"
    on public.training_planning_profiles;
create policy "Users can read their own planning profile"
    on public.training_planning_profiles for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own planning profile"
    on public.training_planning_profiles;
create policy "Users can create their own planning profile"
    on public.training_planning_profiles for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own planning profile"
    on public.training_planning_profiles;
create policy "Users can update their own planning profile"
    on public.training_planning_profiles for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create table if not exists public.training_plan_drafts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    goal_mode text not null check (goal_mode in ('race', 'maintain', 'improve', 'other')),
    primary_race_id uuid,
    profile_snapshot jsonb not null check (jsonb_typeof(profile_snapshot) = 'object'),
    status text not null default 'awaiting_methodology'
        check (status = 'awaiting_methodology'),
    created_at timestamptz not null default now()
);

create index if not exists training_plan_drafts_user_created_idx
    on public.training_plan_drafts (user_id, created_at desc);

alter table public.training_plan_drafts enable row level security;

revoke all on public.training_plan_drafts from anon, authenticated;
grant select, insert on public.training_plan_drafts to authenticated;

drop policy if exists "Users can read their own plan draft requests"
    on public.training_plan_drafts;
create policy "Users can read their own plan draft requests"
    on public.training_plan_drafts for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own plan draft requests"
    on public.training_plan_drafts;
create policy "Users can create their own plan draft requests"
    on public.training_plan_drafts for insert to authenticated
    with check ((select auth.uid()) = user_id);
