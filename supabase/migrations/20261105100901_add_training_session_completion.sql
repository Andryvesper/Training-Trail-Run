alter table public.training_sessions
    add column intervals_activity_id text,
    add column completed_at timestamptz,
    add column adherence_score smallint,
    add column completed_activity jsonb;

alter table public.training_sessions
    add constraint training_sessions_adherence_score_check
        check (adherence_score is null or adherence_score between 1 and 5),
    add constraint training_sessions_completion_data_check
        check (
            (
                intervals_activity_id is null
                and completed_at is null
                and adherence_score is null
                and completed_activity is null
            )
            or (
                intervals_activity_id is not null
                and completed_at is not null
                and adherence_score is not null
                and completed_activity is not null
                and jsonb_typeof(completed_activity) = 'object'
            )
        );

create unique index training_sessions_user_intervals_activity_idx
    on public.training_sessions (user_id, intervals_activity_id)
    where intervals_activity_id is not null;
