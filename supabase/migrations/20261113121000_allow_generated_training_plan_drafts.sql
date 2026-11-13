-- Draft requests can now carry a generated cycle draft. The athlete confirms it
-- explicitly before any session is written to the calendar.
alter table public.training_plan_drafts
    drop constraint if exists training_plan_drafts_status_check;

alter table public.training_plan_drafts
    add constraint training_plan_drafts_status_check
    check (status in ('awaiting_methodology', 'draft_generated', 'confirmed'));

drop policy if exists "Users can confirm their own training plan drafts"
    on public.training_plan_drafts;
create policy "Users can confirm their own training plan drafts"
    on public.training_plan_drafts for update to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        -- 'draft_generated' lets the client release its claim if writing
        -- the sessions fails after the draft was marked as confirmed.
        and status in ('confirmed', 'draft_generated')
    );

grant update (status) on public.training_plan_drafts to authenticated;
