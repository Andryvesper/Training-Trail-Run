-- GPX tracks uploaded by the athlete and their custom points (aid stations,
-- refreshment points, water, checkpoints, cutoffs...).
-- points holds the simplified track as [lat, lon, elevation|null] arrays
-- (at most one every 10 m, at most 20000 points): the analysis is computed in
-- the browser from these points, so the original file is not stored.
-- The summary columns let the list load without the points.
-- race_id optionally links the track to one of the athlete's races.
create table if not exists public.gpx_tracks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    race_id uuid references public.training_races(id) on delete set null,
    name text not null check (char_length(btrim(name)) between 1 and 120),
    notes text check (notes is null or char_length(notes) <= 2000),
    file_name text check (file_name is null or char_length(file_name) <= 200),
    distance_km numeric(8, 3) not null check (distance_km > 0 and distance_km <= 2000),
    elevation_gain_m integer check (elevation_gain_m is null or elevation_gain_m between 0 and 100000),
    elevation_loss_m integer check (elevation_loss_m is null or elevation_loss_m between 0 and 100000),
    min_elevation_m integer check (min_elevation_m is null or min_elevation_m between -500 and 9000),
    max_elevation_m integer check (max_elevation_m is null or max_elevation_m between -500 and 9000),
    point_count integer not null check (point_count between 2 and 20000),
    points jsonb not null check (
        jsonb_typeof(points) = 'array'
        and jsonb_array_length(points) between 2 and 20000
        and pg_column_size(points) < 4000000
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists gpx_tracks_user_created_idx
    on public.gpx_tracks (user_id, created_at desc);

create index if not exists gpx_tracks_race_idx
    on public.gpx_tracks (race_id);

alter table public.gpx_tracks enable row level security;

revoke all on public.gpx_tracks from anon, authenticated;
grant select, insert, update, delete on public.gpx_tracks to authenticated;

drop policy if exists "Users can read their own gpx tracks" on public.gpx_tracks;
create policy "Users can read their own gpx tracks"
    on public.gpx_tracks for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own gpx tracks" on public.gpx_tracks;
-- A track can only be linked to a race owned by the same user.
create policy "Users can create their own gpx tracks"
    on public.gpx_tracks for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and (
            race_id is null
            or exists (
                select 1 from public.training_races r
                where r.id = race_id and r.user_id = (select auth.uid())
            )
        )
    );

drop policy if exists "Users can update their own gpx tracks" on public.gpx_tracks;
create policy "Users can update their own gpx tracks"
    on public.gpx_tracks for update to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and (
            race_id is null
            or exists (
                select 1 from public.training_races r
                where r.id = race_id and r.user_id = (select auth.uid())
            )
        )
    );

drop policy if exists "Users can delete their own gpx tracks" on public.gpx_tracks;
create policy "Users can delete their own gpx tracks"
    on public.gpx_tracks for delete to authenticated
    using ((select auth.uid()) = user_id);

-- Custom points along a track, positioned by distance from the start (km).
create table if not exists public.gpx_track_waypoints (
    id uuid primary key default gen_random_uuid(),
    track_id uuid not null references public.gpx_tracks(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('refreshment', 'water', 'aid_station', 'checkpoint', 'cutoff', 'danger', 'other')),
    name text not null check (char_length(btrim(name)) between 1 and 80),
    km numeric(8, 3) not null check (km >= 0 and km <= 2000),
    notes text check (notes is null or char_length(notes) <= 500),
    created_at timestamptz not null default now()
);

create index if not exists gpx_track_waypoints_track_km_idx
    on public.gpx_track_waypoints (track_id, km);

create index if not exists gpx_track_waypoints_user_idx
    on public.gpx_track_waypoints (user_id);

alter table public.gpx_track_waypoints enable row level security;

revoke all on public.gpx_track_waypoints from anon, authenticated;
grant select, insert, update, delete on public.gpx_track_waypoints to authenticated;

drop policy if exists "Users can read their own gpx waypoints" on public.gpx_track_waypoints;
create policy "Users can read their own gpx waypoints"
    on public.gpx_track_waypoints for select to authenticated
    using ((select auth.uid()) = user_id);

-- A point can only be attached to a track owned by the same user.
drop policy if exists "Users can create their own gpx waypoints" on public.gpx_track_waypoints;
create policy "Users can create their own gpx waypoints"
    on public.gpx_track_waypoints for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1 from public.gpx_tracks t
            where t.id = track_id and t.user_id = (select auth.uid())
        )
    );

drop policy if exists "Users can update their own gpx waypoints" on public.gpx_track_waypoints;
create policy "Users can update their own gpx waypoints"
    on public.gpx_track_waypoints for update to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1 from public.gpx_tracks t
            where t.id = track_id and t.user_id = (select auth.uid())
        )
    );

drop policy if exists "Users can delete their own gpx waypoints" on public.gpx_track_waypoints;
create policy "Users can delete their own gpx waypoints"
    on public.gpx_track_waypoints for delete to authenticated
    using ((select auth.uid()) = user_id);
