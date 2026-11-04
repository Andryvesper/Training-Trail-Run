// js/modules/intervals-ui.js - Gestione Credentials & Fetch Metriche da Intervals.icu
import { IntervalsService } from './intervals.js';

export async function initIntervalsModule(supabaseClient, userId) {
    const athleteInput = document.getElementById('intervals-athlete-id');
    const apiKeyInput = document.getElementById('intervals-api-key');
    const btnSave = document.getElementById('btn-save-intervals');
    const btnTest = document.getElementById('btn-test-intervals');
    const statusMsg = document.getElementById('intervals-status-msg');

    // 1. Carichiamo le credenziali salvate in precedenza dal database (compatibilità con sia intervals_id che intervals_athlete_id)
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
            .eq('id', userId)
            .single();

        if (data) {
            const athleteId = data.intervals_id || data.intervals_athlete_id || '';
            const apiKey = data.intervals_key || data.intervals_api_key || '';

            if (athleteInput) athleteInput.value = athleteId;
            if (apiKeyInput) apiKeyInput.value = apiKey;

            // Se le credenziali sono presenti, scarichiamo subito le metriche reali per la Dashboard
            if (athleteId && apiKey) {
                await loadDashboardMetrics(athleteId, apiKey);
            }
        }
    } catch (err) {
        console.error("Errore nel caricamento credenziali Intervals:", err);
    }

    // 2. Salvataggio su Supabase
    btnSave?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus("Compila tutti i campi prima di salvare.", "rose");
            return;
        }

        const { error } = await supabaseClient
            .from('profiles')
            .update({
                intervals_id: athleteId,
                intervals_key: apiKey,
                intervals_athlete_id: athleteId,
                intervals_api_key: apiKey
            })
            .eq('id', userId);

        if (error) {
            showStatus("Errore durante il salvataggio nel database.", "rose");
        } else {
            showStatus("Configurazione salvata con successo!", "emerald");
            await loadDashboardMetrics(athleteId, apiKey);
        }
    });

    // 3. Test Connessione
    btnTest?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus("Inserisci ID e API Key per testare la connessione.", "rose");
            return;
        }

        showStatus("Connessione in corso...", "amber");
        const success = await loadDashboardMetrics(athleteId, apiKey);
        
        if (success) {
            showStatus("Connessione riuscita! Metriche aggiornate nella Dashboard.", "emerald");
        } else {
            showStatus("Connessione fallita. Verificare credenziali.", "rose");
        }
    });

    function showStatus(text, color) {
        if (!statusMsg) return;
        statusMsg.textContent = text;
        statusMsg.className = `text-xs text-center text-${color}-400 block mt-2 p-2 rounded-xl bg-slate-900 border border-slate-800`;
        statusMsg.classList.remove('hidden');
    }
}

/**
 * Recupera i dati Wellness / Athlete da Intervals.icu e aggiorna i box della Dashboard
 */
async function loadDashboardMetrics(athleteId, apiKey) {
    try {
        const service = new IntervalsService(athleteId, apiKey);
        
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const wellness = await service.getWellness(thirtyDaysAgo, today);

        if (wellness && Array.isArray(wellness) && wellness.length > 0) {
            // Prendiamo il valore più recente
            const latest = wellness[wellness.length - 1];

            const ctl = latest.ctl ? Math.round(latest.ctl) : '--';
            const atl = latest.atl ? Math.round(latest.atl) : '--';
            const tsb = (latest.ctl !== undefined && latest.atl !== undefined) ? Math.round(latest.ctl - latest.atl) : '--';

            // Popoliamo i box della Dashboard
            const elCtl = document.getElementById('metric-ctl');
            const elAtl = document.getElementById('metric-atl');
            const elTsb = document.getElementById('metric-tsb');
            const elLoad = document.getElementById('metric-load');

            if (elCtl) elCtl.textContent = ctl;
            if (elAtl) elAtl.textContent = atl;
            if (elTsb) {
                elTsb.textContent = (tsb > 0 ? `+${tsb}` : tsb);
                elTsb.className = `text-2xl font-bold ${tsb >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }
            if (elLoad) elLoad.textContent = latest.load ? `${Math.round(latest.load)}` : '180';

            return true;
        }
    } catch (err) {
        console.error("Errore recupero metriche Intervals:", err);
    }
    return false;
}
