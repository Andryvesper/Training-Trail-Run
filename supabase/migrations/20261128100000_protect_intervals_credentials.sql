-- The Intervals.icu API key must not be readable from the browser any more:
-- the Edge Function "intervals-proxy" reads it with the service role and adds
-- it server side. Deploy that function BEFORE applying this migration,
-- otherwise the app can no longer reach Intervals.icu.
--
-- Users can still write their key (table-level update stays), and can only
-- learn whether a key is saved, through get_intervals_connection().

create or replace function public.get_intervals_connection()
returns table (athlete_id text, has_key boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select
        coalesce(nullif(btrim(p.intervals_id), ''), nullif(btrim(p.intervals_athlete_id), '')),
        coalesce(nullif(btrim(p.intervals_key), ''), nullif(btrim(p.intervals_api_key), '')) is not null
    from public.profiles p
    where p.id = (select auth.uid());
$$;

revoke all on function public.get_intervals_connection() from public, anon;
grant execute on function public.get_intervals_connection() to authenticated;

-- A column revoke has no effect while a table-level select grant exists, so
-- the table grant is replaced by a grant on every column except the keys.
-- The column list is read from the catalog, so columns added outside the
-- migrations stay readable.
do $$
declare
    readable_columns text;
begin
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into readable_columns
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name not in ('intervals_key', 'intervals_api_key');

    execute 'revoke select on public.profiles from anon, authenticated';
    execute format('grant select (%s) on public.profiles to authenticated', readable_columns);
end;
$$;
