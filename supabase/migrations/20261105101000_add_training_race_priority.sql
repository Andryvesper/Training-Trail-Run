alter table public.training_races
    add column if not exists priority smallint not null default 2
    check (priority between 1 and 3);
