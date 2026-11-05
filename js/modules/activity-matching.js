export function getMatchingSessions(activity, sessions) {
    const activityDate = typeof activity?.start_date_local === 'string'
        ? activity.start_date_local.slice(0, 10)
        : null;
    const activityId = normalizeActivityId(activity?.id);
    const activitySport = activityCategory(activity?.type || activity?.sport_settings?.type);

    if (!activityDate || !activityId || !activitySport) return [];

    return sessions.filter(session =>
        session.scheduled_date === activityDate
        && activityCategory(session.sport_type) === activitySport
        && (!session.intervals_activity_id || session.intervals_activity_id === activityId)
    );
}

export function createActivitySnapshot(activity) {
    const id = normalizeActivityId(activity?.id);
    if (!id) throw new Error('Intervals non ha fornito un ID stabile per questa attività.');

    return {
        id,
        name: readText(activity.name) || readText(activity.type) || 'Attività',
        type: readText(activity.type) || readText(activity.sport_settings?.type),
        start_date_local: readText(activity.start_date_local),
        distance: readFiniteNumber(activity.distance),
        moving_time: readFiniteNumber(activity.moving_time),
        elapsed_time: readFiniteNumber(activity.elapsed_time)
    };
}

export function normalizeActivityId(value) {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
}

function activityCategory(value) {
    const type = String(value || '').toLowerCase();
    if (type.includes('run') || type.includes('trail')) return 'run';
    if (type.includes('swim')) return 'swim';
    if (type.includes('strength') || type.includes('weight') || type.includes('gym')) return 'strength';
    return null;
}

function readText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
