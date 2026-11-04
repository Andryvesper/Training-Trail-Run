drop policy if exists "Authenticated users can read active training methodology"
    on public.training_methodology_core;
create policy "Authenticated users can read active training methodology"
    on public.training_methodology_core for select to authenticated
    using (is_active);
