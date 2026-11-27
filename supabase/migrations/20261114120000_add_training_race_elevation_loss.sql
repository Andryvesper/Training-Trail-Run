-- Optional negative elevation (D-) of a race, in metres. The planner passes
-- it to the cycle engine; when it is null the engine assumes D- = D+.
alter table public.training_races
    add column if not exists elevation_loss_m integer;

alter table public.training_races
    drop constraint if exists training_races_elevation_loss_m_check;

alter table public.training_races
    add constraint training_races_elevation_loss_m_check check (
        elevation_loss_m is null or elevation_loss_m between 0 and 100000
    );
