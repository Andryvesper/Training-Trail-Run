-- Lets owners list their own active shares, so a share can be revoked
-- even after the one-time code shown at creation has been lost.
create or replace function public.list_my_training_plan_shares()
returns table (
    share_code uuid,
    title text,
    session_count integer,
    created_at timestamptz,
    expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Autenticazione richiesta.';
    end if;

    return query
    select s.share_code,
           s.title,
           jsonb_array_length(s.session_snapshot)::integer,
           s.created_at,
           s.expires_at
    from public.training_plan_shares s
    where s.owner_id = auth.uid()
      and s.revoked_at is null
      and s.expires_at > now()
    order by s.created_at desc
    limit 50;
end;
$$;

revoke all on function public.list_my_training_plan_shares() from public, anon;
grant execute on function public.list_my_training_plan_shares() to authenticated;
