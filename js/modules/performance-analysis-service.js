// Lettura e salvataggio in Supabase delle analisi prestazioni e delle
// revisioni periodiche delle soglie.

import { PERFORMANCE_CONFIG_VERSION } from './performance-config.js';
import { REVIEW_STATUSES } from './performance-calibration.js';

const ANALYSES_TABLE = 'activity_performance_analyses';
const REVIEWS_TABLE = 'performance_threshold_reviews';
const ANALYSIS_FIELDS = 'intervals_activity_id, activity_date, sport, config_version, metrics, computed_at';
const REVIEW_FIELDS = 'id, reviewed_at, window_from, window_to, status, proposal, thresholds, decided_at, created_at';

export class PerformanceAnalysisService {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async listAnalyses(userId, fromDate) {
        const { data, error } = await this.supabaseClient
            .from(ANALYSES_TABLE)
            .select(ANALYSIS_FIELDS)
            .eq('user_id', userId)
            .gte('activity_date', fromDate)
            .order('activity_date', { ascending: true });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async saveAnalysis(userId, analysis) {
        if (!analysis?.activityId || !analysis.date) throw new Error('Analisi senza attività o data.');
        const record = {
            user_id: userId,
            intervals_activity_id: analysis.activityId,
            activity_date: analysis.date,
            sport: String(analysis.sport || 'run').slice(0, 40),
            config_version: PERFORMANCE_CONFIG_VERSION,
            metrics: analysis,
            computed_at: new Date().toISOString()
        };
        const { error } = await this.supabaseClient
            .from(ANALYSES_TABLE)
            .upsert(record, { onConflict: 'user_id,intervals_activity_id' });
        if (error) throw error;
        return record;
    }

    async listReviews(userId) {
        const { data, error } = await this.supabaseClient
            .from(REVIEWS_TABLE)
            .select(REVIEW_FIELDS)
            .eq('user_id', userId)
            .order('reviewed_at', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async createReview(userId, review) {
        if (!REVIEW_STATUSES.includes(review?.status)) throw new Error('Stato della revisione non valido.');
        const record = {
            user_id: userId,
            reviewed_at: review.reviewed_at,
            window_from: review.window_from,
            window_to: review.window_to,
            status: review.status,
            proposal: review.proposal || {},
            thresholds: review.thresholds || {},
            decided_at: review.status === 'proposed' ? null : new Date().toISOString()
        };
        const { data, error } = await this.supabaseClient
            .from(REVIEWS_TABLE)
            .insert(record)
            .select(REVIEW_FIELDS)
            .single();
        if (error) throw error;
        return data;
    }

    async decideReview(userId, reviewId, status, thresholds) {
        if (!['approved', 'rejected'].includes(status)) throw new Error('Decisione non valida.');
        const { data, error } = await this.supabaseClient
            .from(REVIEWS_TABLE)
            .update({ status, thresholds: status === 'approved' ? thresholds : {}, decided_at: new Date().toISOString() })
            .eq('id', reviewId)
            .eq('user_id', userId)
            .eq('status', 'proposed')
            .select(REVIEW_FIELDS)
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Questa revisione è già stata decisa, anche da un altro dispositivo: ricarica la pagina.');
        return data;
    }
}

// Record di Supabase -> analisi in memoria.
export function analysisFromRecord(record) {
    const metrics = record?.metrics && typeof record.metrics === 'object' ? record.metrics : null;
    if (!metrics) return null;
    return {
        ...metrics,
        activityId: String(record.intervals_activity_id),
        date: String(record.activity_date).slice(0, 10),
        configVersion: record.config_version
    };
}
