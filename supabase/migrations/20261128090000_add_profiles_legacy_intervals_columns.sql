-- The client still reads and writes the legacy column names
-- (intervals_athlete_id, intervals_api_key) next to intervals_id/intervals_key,
-- but no earlier migration created them. Nullable, so existing rows are untouched.
alter table public.profiles
    add column if not exists intervals_athlete_id text,
    add column if not exists intervals_api_key text;
