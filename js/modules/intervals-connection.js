// Collegamento a Intervals.icu salvato nel profilo.
// Con la migrazione 20261128100000 la chiave API non è più leggibile dal browser:
// la RPC get_intervals_connection dice solo se esiste. Senza quella migrazione
// si ripiega sulla lettura diretta delle colonne (comportamento precedente).
import { IntervalsService } from './intervals.js';

const PROXY_FUNCTION = 'intervals-proxy';

/**
 * @returns {Promise<{ athleteId: string, hasKey: boolean, apiKey: string|null }>}
 */
export async function loadIntervalsConnection(supabaseClient, userId) {
    const { data, error } = await supabaseClient.rpc('get_intervals_connection');
    if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        return { athleteId: row?.athlete_id || '', hasKey: Boolean(row?.has_key), apiKey: null };
    }
    if (!isMissingFunction(error)) throw error;

    const legacy = await supabaseClient
        .from('profiles')
        .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
        .eq('id', userId)
        .maybeSingle();
    if (legacy.error) throw legacy.error;
    const apiKey = legacy.data?.intervals_key || legacy.data?.intervals_api_key || null;
    return {
        athleteId: legacy.data?.intervals_id || legacy.data?.intervals_athlete_id || '',
        hasKey: Boolean(apiKey),
        apiKey
    };
}

export function isConnected(connection) {
    return Boolean(connection?.athleteId && connection?.hasKey);
}

/**
 * Salva le credenziali. Con `apiKey` vuota resta la chiave già salvata.
 */
export async function saveIntervalsCredentials(supabaseClient, userId, { athleteId, apiKey }) {
    const changes = { intervals_id: athleteId, intervals_athlete_id: athleteId };
    if (apiKey) Object.assign(changes, { intervals_key: apiKey, intervals_api_key: apiKey });
    const { data, error } = await supabaseClient.from('profiles').update(changes).eq('id', userId).select('id');
    if (error) throw error;
    // Nessuna riga aggiornata (profilo assente o non accessibile): non è un salvataggio riuscito.
    if (Array.isArray(data) && data.length === 0) throw new Error('profilo utente non trovato.');
}

/**
 * Servizio Intervals che passa dal proxy Supabase. `apiKey` (facoltativa) serve
 * solo come ripiego se la funzione non è distribuita.
 */
export function createIntervalsService(supabaseClient, { athleteId, apiKey = null }) {
    return new IntervalsService(athleteId, apiKey, { proxy: proxyConfig(supabaseClient) });
}

function proxyConfig(supabaseClient) {
    const config = globalThis.SUPABASE_CONFIG;
    if (!config?.URL) return null;
    return {
        url: `${String(config.URL).replace(/\/+$/, '')}/functions/v1/${PROXY_FUNCTION}`,
        apikey: config.KEY,
        getAccessToken: async () => {
            const { data } = await supabaseClient.auth.getSession();
            return data?.session?.access_token || null;
        }
    };
}

function isMissingFunction(error) {
    return error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''));
}
