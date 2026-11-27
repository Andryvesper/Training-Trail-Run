-- When the athlete confirms a generated draft, the choices made in the UI
-- (intermediate races, extra sessions) change the draft that is written to the
-- calendar. Later features ("settimana saltata") read the stored draft, so it
-- must match what was written. Clients can only update the status column, so
-- this narrow function stores the final draft, only for the owner's own
-- confirmed drafts.

create or replace function public.record_confirmed_draft_choices(
    p_draft_id uuid,
    p_generated_draft jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_generated_draft is null or jsonb_typeof(p_generated_draft) <> 'object' then
        raise exception 'Bozza non valida.';
    end if;
    if pg_column_size(p_generated_draft) > 524288 then
        raise exception 'Bozza troppo grande.';
    end if;

    update public.training_plan_drafts
       set profile_snapshot = jsonb_set(
               coalesce(profile_snapshot, '{}'::jsonb),
               '{generated_draft}',
               p_generated_draft
           )
     where id = p_draft_id
       and user_id = (select auth.uid())
       and status = 'confirmed';

    if not found then
        raise exception 'Bozza confermata non trovata.';
    end if;
end;
$$;

revoke all on function public.record_confirmed_draft_choices(uuid, jsonb) from public, anon;
grant execute on function public.record_confirmed_draft_choices(uuid, jsonb) to authenticated;
