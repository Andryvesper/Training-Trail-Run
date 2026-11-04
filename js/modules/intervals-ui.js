// js/modules/intervals-ui.js - Sincronizzazione Completa Dashboard e Metriche Avanzate
import { IntervalsService } from './intervals.js';

export async function initIntervalsModule(supabaseClient, userId) {
    const athleteInput = document.getElementById('intervals-athlete-id');
    const apiKeyInput = document.getElementById('intervals-api-key');
    const btnSave = document.getElementById('btn-save-intervals');
    const btnTest = document.getElementById('btn-test-intervals');
    const statusMsg = document.getElementById('intervals-status-msg');

    try {
        const { data } = await supabaseClient
            .from('profiles')
            .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
            .eq('id', userId)
            .single();

        if (data) {
            const athleteId = data.intervals_id || data.intervals_athlete_id || '';
            const apiKey = data.intervals_key || data.intervals_api_key || '';

            if (athleteInput) athleteInput.value = athleteId;
            if (apiKeyInput) apiKeyInput.value = apiKey;

            if (athleteId && apiKey) {
                await loadDashboardData(athleteId, apiKey);
            }
        }
    } catch (err) {
        console.error("Errore nel caricamento credenziali Intervals:", err);
    }

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
            await loadDashboardData(athleteId, apiKey);
        }
    });

    btnTest?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus("Inserisci ID e API Key per testare la connessione.", "rose");
            return;
        }

        showStatus("Sincronizzazione in corso...", "amber");
        const success = await loadDashboardData(athleteId, apiKey);
        
        if (success) {
            showStatus("Sincronizzazione riuscita! Statistiche aggiornate.", "emerald");
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
 * Scarica wellness e attività recenti, calcolando tutte le metriche avanzate
 */
async function loadDashboardData(athleteId, apiKey) {
    try {
        const service = new IntervalsService(athleteId, apiKey);
        
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Fetch parallela di wellness e attività
        const [wellness, activities] = await Promise.all([
            service.getWellness(thirtyDaysAgo, today),
            service.getActivities(sevenDaysAgo, today)
        ]);

        // 1. Elaborazione Metriche di Carico (Wellness)
        if (wellness && Array.isArray(wellness) && wellness.length > 0) {
            const latest = wellness[wellness.length - 1];
            const ctl = latest.ctl ? Math.round(latest.ctl) : '--';
            const atl = latest.atl ? Math.round(latest.atl) : '--';
            const tsb = (latest.ctl !== undefined && latest.atl !== undefined) ? Math.round(latest.ctl - latest.atl) : '--';

            document.getElementById('metric-ctl').textContent = ctl;
            document.getElementById('metric-atl').textContent = atl;
            
            const elTsb = document.getElementById('metric-tsb');
            if (elTsb) {
                elTsb.textContent = (tsb > 0 ? `+${tsb}` : tsb);
                elTsb.className = `text-2xl font-bold ${tsb >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }
            document.getElementById('metric-load').textContent = latest.load ? `${Math.round(latest.load)}` : '180';
        }

        // 2. Elaborazione Statistiche Attività Ultimi 7 Giorni (Km corsa, metri nuoto, ritmo)
        if (activities && Array.isArray(activities)) {
            let runKm = 0;
            let swimMeters = 0;
            let totalSeconds = 0;
            let totalMeters = 0;

            activities.forEach(act => {
                const type = (act.type || '').toLowerCase();
                const distance = act.distance || 0; // in metri
                const movingTime = act.moving_time || 0; // in secondi

                if (type.includes('run') || type.includes('trail')) {
                    runKm += distance / 1000;
                } else if (type.includes('swim') || type.includes('nuoto')) {
                    swimMeters += distance;
                }

                if (distance > 0 && movingTime > 0) {
                    totalSeconds += movingTime;
                    totalMeters += distance;
                }
            });

            // Calcolo Ritmo Medio generale (min/km)
            let avgPaceFormatted = '--';
            if (totalMeters > 0) {
                const secPerKm = (totalSeconds / (totalMeters / 1000));
                const minutes = Math.floor(secPerKm / 60);
                const seconds = Math.round(secPerKm % 60);
                avgPaceFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds} /km`;
            }

            // Aggiorniamo i contenitori dedicati nella Dashboard se presenti
            updateOrCreateStatCards({
                runKm: runKm.toFixed(1),
                swimMeters: Math.round(swimMeters),
                avgPace: avgPaceFormatted,
                activitiesCount: activities.length
            });
        }

        return true;
    } catch (err) {
        console.error("Errore sincronizzazione dati Dashboard:", err);
    }
    return false;
}

function updateOrCreateStatCards(stats) {
    let container = document.getElementById('advanced-stats-container');
    if (!container) {
        const dashboard = document.getElementById('section-dashboard');
        if (!dashboard) return;
        
        container = document.createElement('div');
        container.id = 'advanced-stats-container';
        container.className = 'grid grid-cols-1 md:grid-cols-4 gap-4 mt-4';
        dashboard.insertBefore(container, dashboard.children[1]);
    }

    container.innerHTML = `
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Km Corsi (Ultimi 7 gg)</span>
            <div class="text-2xl font-bold text-emerald-400">${stats.runKm} km</div>
            <span class="text-[10px] text-slate-400">Target Trail & Asfalto</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Metri Nuotati (7 gg)</span>
            <div class="text-2xl font-bold text-cyan-400">${stats.swimMeters} m</div>
            <span class="text-[10px] text-slate-400">Sessioni fisse vasca</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Ritmo Medio Globale</span>
            <div class="text-2xl font-bold text-white">${stats.avgPace}</div>
            <span class="text-[10px] text-slate-400">PAS / GAP medio</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Attività Registrate</span>
            <div class="text-2xl font-bold text-amber-400">${stats.activitiesCount} sessioni</div>
            <span class="text-[10px] text-slate-400">Sincronizzate da Intervals</span>
        </div>
    `;
}
