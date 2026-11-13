-- Profiles: each user reads and edits only their own row, and can never
-- assign or change their own role. Promotion to admin is done by an
-- administrator with the service role or the SQL editor.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    role text not null default 'athlete',
    intervals_id text,
    intervals_key text,
    created_at timestamptz not null default now()
);

alter table public.profiles
    add column if not exists role text not null default 'athlete';

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
    on public.profiles for insert to authenticated
    with check ((select auth.uid()) = id and role = 'athlete');

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

-- The trigger also covers any pre-existing permissive policy: an end user
-- (anon or authenticated JWT) can only create 'athlete' rows and can never
-- change the role column.
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
        return new;
    end if;
    if tg_op = 'INSERT' and new.role is distinct from 'athlete' then
        raise exception 'Il ruolo del profilo non può essere scelto dal client.';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
        raise exception 'Il ruolo del profilo non può essere modificato dal client.';
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
    before insert or update on public.profiles
    for each row execute function public.prevent_profile_role_escalation();
