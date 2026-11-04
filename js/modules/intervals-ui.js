// js/modules/intervals-ui.js - Gestione UI e Persistenza Credenziali Intervals
import { IntervalsService } from './intervals.js';

export async function initIntervalsModule(supabaseClient, userId) {
    const athleteInput = document.getElementById('intervals-athlete-id');
    const apiKeyInput = document.getElementById('intervals-api-key');
    const btnSave = document.getElementById('btn-save-intervals');
    const btnTest = document.getElementById('btn-test-intervals');
    const statusMsg = document.getElementById('intervals-status-msg');

    if (!athleteInput || !apiKeyInput) return;

    // 1. Carichiamo le credenziali salvate in precedenza dal database
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('intervals_athlete_id, intervals_api_key')
            .eq('id', userId)
            .single();

        if (data) {
            athleteInput.value = data.intervals_athlete_id || '';
            apiKeyInput.value = data.intervals_api_key || '';
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
                intervals_athlete_id: athleteId,
                intervals_api_key: apiKey
            })
            .eq('id', userId);

        if (error) {
            showStatus("Errore durante il salvataggio nel database.", "rose");
        } else {
            showStatus("Configurazione salvata con successo!", "emerald");
        }
    });

    // 3. Test della connessione API
    btnTest?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus("Inserisci ID e API Key per testare la connessione.", "rose");
            return;
        }

        showStatus("Connessione in corso...", "amber");
        const service = new IntervalsService(athleteId, apiKey);
        
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
        
        const wellnessData = await service.getWellness(weekAgo, today);

        if (wellnessData && Array.isArray(wellnessData)) {
            showStatus(`Connessione riuscita! Dati sincronizzati (${wellnessData.length} record).`, "emerald");
        } else {
            showStatus("Connessione fallita. Controlla le credenziali.", "rose");
        }
    });

    function showStatus(text, color) {
        if (!statusMsg) return;
        statusMsg.textContent = text;
        statusMsg.className = `text-xs text-center text-${color}-400 block mt-2`;
        statusMsg.classList.remove('hidden');
    }
}
