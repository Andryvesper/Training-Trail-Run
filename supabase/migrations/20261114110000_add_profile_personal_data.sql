-- Personal data the athlete can edit in the "Profilo" tab. Every field is
-- optional; the existing row-level policies already limit each user to
-- their own profile, and the role trigger still blocks role changes.
alter table public.profiles
    add column if not exists full_name text,
    add column if not exists birth_date date,
    add column if not exists sex text,
    add column if not exists city text,
    add column if not exists phone text,
    add column if not exists height_cm smallint,
    add column if not exists weight_kg numeric(5, 1),
    add column if not exists updated_at timestamptz;

alter table public.profiles
    drop constraint if exists profiles_personal_data_check;

alter table public.profiles
    add constraint profiles_personal_data_check check (
        (full_name is null or length(btrim(full_name)) <= 120)
        and (birth_date is null or birth_date between date '1900-01-01' and current_date)
        and (sex is null or sex in ('female', 'male', 'other', 'prefer_not_to_say'))
        and (city is null or length(btrim(city)) <= 80)
        and (phone is null or length(btrim(phone)) <= 30)
        and (height_cm is null or height_cm between 100 and 250)
        and (weight_kg is null or weight_kg between 25 and 250)
    ) not valid;
