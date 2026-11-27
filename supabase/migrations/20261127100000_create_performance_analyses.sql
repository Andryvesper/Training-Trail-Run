-- Advanced performance analysis: metrics computed in the browser from the
-- Intervals.icu activity streams (GAP, efficiency factor, aerobic decoupling,
-- biomechanical drift, mechanical load). Raw streams are not stored.
-- config_version tells the app when an analysis must be recomputed.
create table if not exists public.activity_performance_analyses (
    user_id uuid not null references auth.users(id) on delete cascade,
    intervals_activity_id text not null check (length(intervals_activity_id) between 1 and 64),
    activity_date date not null,
    sport text not null check (length(sport) between 1 and 40),
    config_version text not null check (length(config_version) between 1 and 20),
    metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
    computed_at timestamptz not null default now(),
    primary key (user_id, intervals_activity_id)
);

create index if not exists activity_performance_analyses_user_date_idx
    on public.activity_performance_analyses (user_id, activity_date desc);

alter table public.activity_performance_analyses enable row level security;

revoke all on public.activity_performance_analyses from anon, authenticated;
grant select, insert, update, delete on public.activity_performance_analyses to authenticated;

drop policy if exists "Users can read their own performance analyses"
    on public.activity_performance_analyses;
create policy "Users can read their own performance analyses"
    on public.activity_performance_analyses for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own performance analyses"
    on public.activity_performance_analyses;
create policy "Users can create their own performance analyses"
    on public.activity_performance_analyses for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own performance analyses"
    on public.activity_performance_analyses;
create policy "Users can update their own performance analyses"
    on public.activity_performance_analyses for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own performance analyses"
    on public.activity_performance_analyses;
create policy "Users can delete their own performance analyses"
    on public.activity_performance_analyses for delete to authenticated
    using ((select auth.uid()) = user_id);

-- Threshold reviews every 15 days. A proposal changes the thresholds only
-- after the athlete approves it; thresholds holds the effective values after
-- the review (only for approved rows).
create table if not exists public.performance_threshold_reviews (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    reviewed_at date not null,
    window_from date not null,
    window_to date not null,
    status text not null check (status in ('proposed', 'approved', 'rejected', 'no_change')),
    proposal jsonb not null default '{}'::jsonb check (jsonb_typeof(proposal) = 'object'),
    thresholds jsonb not null default '{}'::jsonb check (jsonb_typeof(thresholds) = 'object'),
    decided_at timestamptz,
    created_at timestamptz not null default now(),
    check (window_from <= window_to)
);

create index if not exists performance_threshold_reviews_user_idx
    on public.performance_threshold_reviews (user_id, reviewed_at desc, created_at desc);

alter table public.performance_threshold_reviews enable row level security;

revoke all on public.performance_threshold_reviews from anon, authenticated;
grant select, insert, update on public.performance_threshold_reviews to authenticated;

drop policy if exists "Users can read their own threshold reviews"
    on public.performance_threshold_reviews;
create policy "Users can read their own threshold reviews"
    on public.performance_threshold_reviews for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own threshold reviews"
    on public.performance_threshold_reviews;
create policy "Users can create their own threshold reviews"
    on public.performance_threshold_reviews for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own threshold reviews"
    on public.performance_threshold_reviews;
create policy "Users can update their own threshold reviews"
    on public.performance_threshold_reviews for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
