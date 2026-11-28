-- A planned session (run, trail...) can point to one of the athlete's GPX
-- tracks, so the calendar can show the course on a map.
-- Deleting the track keeps the session and clears the link.
-- Plan sharing copies explicit columns only, so the link never reaches
-- another athlete (the track belongs to its owner).
alter table public.training_sessions
    add column if not exists gpx_track_id uuid references public.gpx_tracks(id) on delete set null;

create index if not exists training_sessions_gpx_track_idx
    on public.training_sessions (gpx_track_id);

-- Insert and update: same rules as before, plus the linked track must belong
-- to the same user.
drop policy if exists "Users can create their own training sessions" on public.training_sessions;
create policy "Users can create their own training sessions"
    on public.training_sessions for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and (
            gpx_track_id is null
            or exists (
                select 1 from public.gpx_tracks t
                where t.id = gpx_track_id and t.user_id = (select auth.uid())
            )
        )
    );

drop policy if exists "Users can update their own training sessions" on public.training_sessions;
create policy "Users can update their own training sessions"
    on public.training_sessions for update to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and (
            gpx_track_id is null
            or exists (
                select 1 from public.gpx_tracks t
                where t.id = gpx_track_id and t.user_id = (select auth.uid())
            )
        )
    );
