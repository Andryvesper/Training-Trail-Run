const TABLE_NAME = 'training_sessions';
const SESSION_FIELDS = 'id, user_id, scheduled_date, session_order, title, sport_type, distance_km, duration_minutes, notes';

export class TrainingPlanService {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async listSessions(userId, startDate, endDate) {
        const { data, error } = await this.supabaseClient
            .from(TABLE_NAME)
            .select(SESSION_FIELDS)
            .eq('user_id', userId)
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate)
            .order('scheduled_date')
            .order('session_order');

        if (error) throw error;
        return data;
    }

    async saveSession(userId, session) {
        const sessionData = validateSession(session);
        const record = { ...sessionData, user_id: userId };
        const query = session.id
            ? this.supabaseClient
                .from(TABLE_NAME)
                .update(record)
                .eq('id', session.id)
                .eq('user_id', userId)
            : this.supabaseClient
                .from(TABLE_NAME)
                .insert(record);
        const { data, error } = await query.select(SESSION_FIELDS).single();

        if (error) throw error;
        if (!data) throw new Error('La seduta non è stata salvata.');
        return data;
    }

    async deleteSession(userId, sessionId) {
        const { data, error } = await this.supabaseClient
            .from(TABLE_NAME)
            .delete()
            .eq('id', sessionId)
            .eq('user_id', userId)
            .select('id')
            .single();

        if (error) throw error;
        if (!data) throw new Error('La seduta non è stata eliminata.');
    }
}

function validateSession(session) {
    const title = session.title.trim();
    const sportType = session.sport_type.trim();

    if (!title) throw new Error('Inserisci il titolo della seduta.');
    if (!sportType) throw new Error('Seleziona il tipo di attività.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.scheduled_date)) {
        throw new Error('La data della seduta non è valida.');
    }
    if (!Number.isInteger(session.session_order) || session.session_order < 1) {
        throw new Error('L’ordine della seduta non è valido.');
    }

    const distance = session.distance_km === '' || session.distance_km == null
        ? null
        : Number(session.distance_km);
    const duration = session.duration_minutes === '' || session.duration_minutes == null
        ? null
        : Number(session.duration_minutes);

    if (distance !== null && (!Number.isFinite(distance) || distance < 0)) {
        throw new Error('La distanza deve essere un numero non negativo.');
    }
    if (duration !== null && (!Number.isInteger(duration) || duration < 0)) {
        throw new Error('La durata deve essere un numero intero non negativo.');
    }

    return {
        scheduled_date: session.scheduled_date,
        session_order: session.session_order,
        title,
        sport_type: sportType,
        distance_km: distance,
        duration_minutes: duration,
        notes: session.notes.trim() || null
    };
}
