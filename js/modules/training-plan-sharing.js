export class TrainingPlanSharingService {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    async listSessions(userId, startDate, endDate) {
        if (!userId) throw new Error('Utente non autenticato.');
        validateDateRange(startDate, endDate);

        const { data, error } = await this.supabase
            .from('training_sessions')
            .select('id, scheduled_date, session_order, title, sport_type, distance_km, duration_minutes, target_pace_seconds_per_km')
            .eq('user_id', userId)
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate)
            .order('scheduled_date')
            .order('session_order');

        if (error) throw error;
        return data || [];
    }

    async createShare({ title, sessionIds, expiresInDays = 14, sourceReferencePace }) {
        if (!String(title || '').trim() || String(title).trim().length > 120) {
            throw new Error('Il titolo deve contenere da 1 a 120 caratteri.');
        }
        if (!Array.isArray(sessionIds) || sessionIds.length < 1 || sessionIds.length > 200) {
            throw new Error('Seleziona da 1 a 200 sedute.');
        }
        if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
            throw new Error('La condivisione deve scadere entro 1-30 giorni.');
        }
        validateOptionalPace(sourceReferencePace);

        const { data, error } = await this.supabase.rpc('create_training_plan_share', {
            p_title: String(title).trim(),
            p_session_ids: sessionIds,
            p_expires_in_days: expiresInDays,
            p_source_reference_pace_seconds_per_km: sourceReferencePace
        });
        if (error) throw error;
        return data;
    }

    async previewShare(shareCode) {
        const { data, error } = await this.supabase.rpc('preview_training_plan_share', {
            p_share_code: validateShareCode(shareCode)
        });
        if (error) throw error;
        return data;
    }

    async importShare({ shareCode, newStartDate, targetReferencePace, confirmOverlaps = false }) {
        if (!isDateKey(newStartDate)) throw new Error('Indica una data di inizio valida.');
        validateOptionalPace(targetReferencePace);
        if (typeof confirmOverlaps !== 'boolean') {
            throw new Error('La conferma delle sovrapposizioni non è valida.');
        }

        const { data, error } = await this.supabase.rpc('import_training_plan_share', {
            p_share_code: validateShareCode(shareCode),
            p_new_start_date: newStartDate,
            p_target_reference_pace_seconds_per_km: targetReferencePace,
            p_confirm_overlaps: confirmOverlaps
        });
        if (error) throw error;
        return data;
    }

    async revokeShare(shareCode) {
        const { data, error } = await this.supabase.rpc('revoke_training_plan_share', {
            p_share_code: validateShareCode(shareCode)
        });
        if (error) throw error;
        return data;
    }
}

export function parsePace(value) {
    const pace = String(value || '').trim();
    if (!pace) return null;
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(pace);
    if (!match) throw new Error('Inserisci il passo nel formato min:ss/km, ad esempio 5:20.');
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    validateOptionalPace(seconds);
    return seconds;
}

export function formatPace(secondsPerKm) {
    const value = Number(secondsPerKm);
    if (!Number.isInteger(value) || value < 0) return '';
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function scaleTrainingPace(sessionPace, sourceReferencePace, targetReferencePace) {
    if (sessionPace == null) return null;
    validateOptionalPace(sessionPace);
    if (sourceReferencePace == null || targetReferencePace == null) {
        throw new Error('Servono entrambi i passi di riferimento per adattare il ritmo.');
    }
    validateOptionalPace(sourceReferencePace);
    validateOptionalPace(targetReferencePace);
    return Math.max(120, Math.min(1800, Math.round(sessionPace * targetReferencePace / sourceReferencePace)));
}

function validateDateRange(startDate, endDate) {
    if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) {
        throw new Error('Indica un intervallo di date valido.');
    }
}

function isDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateShareCode(value) {
    const code = String(value || '').trim();
    if (!/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(code)) {
        throw new Error('Il codice deve essere un UUID valido.');
    }
    return code;
}

function validateOptionalPace(value) {
    if (value !== null && value !== undefined
        && (!Number.isInteger(value) || value < 120 || value > 1800)) {
        throw new Error('Il passo deve essere compreso tra 2:00 e 30:00 min/km.');
    }
}
