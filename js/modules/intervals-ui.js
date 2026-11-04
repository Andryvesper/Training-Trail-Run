// js/modules/intervals-ui.js - Sincronizzazione Reale e Parsing Ottimizzato Intervals.icu
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
                await loadRealDashboardData(athleteId, apiKey);
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
            await loadRealDashboardData(athleteId, apiKey);
        }
    });

    btnTest?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus("Inserisci ID e API Key per testare la connessione.", "rose");
            return;
        }

        showStatus("Sincronizzazione reale in corso...", "amber");
        const success = await loadRealDashboardData(athleteId, apiKey);
        
        if (success) {
            showStatus("Sincronizzazione completata con i tuoi dati reali!", "emerald");
        } else {
            showStatus("Errore di connessione o credenziali non valide.", "rose");
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
 * Elaborazione puntuale dei dati reali restituiti dalle API di Intervals.icu
 */
async function loadRealDashboardData(athleteId, apiKey) {
    try {
        const service = new IntervalsService(athleteId, apiKey);
        
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [wellness, activities] = await Promise.all([
            service.getWellness(thirtyDaysAgo, today),
            service.getActivities(sevenDaysAgo, today)
        ]);

        // 1. Estrazione CTL, ATL, TSB e Load dai dati di Wellness
        let ctl = '--', atl = '--', tsb = '--', load = '--';

        if (wellness && Array.isArray(wellness) && wellness.length > 0) {
            // Cerchiamo l'ultimo record che contiene effettivamente ctl/atl
            const validWellness = wellness.reverse().find(w => w.ctl !== undefined || w.atl !== undefined) || wellness[0];
            
            if (validWellness) {
                ctl = validWellness.ctl !== undefined ? Math.round(validWellness.ctl) : '--';
                atl = validWellness.atl !== undefined ? Math.round(validWellness.atl) : '--';
                load = validWellness.load !== undefined ? Math.round(validWellness.load) : '--';
                
                if (typeof ctl === 'number' && typeof atl === 'number') {
                    tsb = ctl - atl;
                }
            }
        }

        document.getElementById('metric-ctl').textContent = ctl;
        document.getElementById('metric-atl').textContent = atl;
        
        const elTsb = document.getElementById('metric-tsb');
        if (elTsb) {
            elTsb.textContent = (typeof tsb === 'number' ? (tsb > 0 ? `+${tsb}` : tsb) : '--');
            elTsb.className = `text-2xl font-bold ${typeof tsb === 'number' && tsb >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
        document.getElementById('metric-load').textContent = load;

        // 2. Calcolo Attività Ultimi 7 Giorni (Km corsa, metri nuoto, ritmo medio)
        let runKm = 0;
        let swimMeters = 0;
        let totalSeconds = 0;
        let totalMeters = 0;
        let validActivitiesCount = 0;

        if (activities && Array.isArray(activities)) {
            activities.forEach(act => {
                validActivitiesCount++;
                const type = (act.type || act.sport_settings?.type || '').toLowerCase();
                const distance = act.distance || 0; // metri
                const movingTime = act.moving_time || act.elapsed_time || 0; // secondi

                if (type.includes('run') || type.includes('trail') || type.includes('virtualrun')) {
                    runKm += distance / 1000;
                } else if (type.includes('swim') || type.includes('nuoto')) {
                    swimMeters += distance;
                }

                if (distance > 0 && movingTime > 0) {
                    totalSeconds += movingTime;
                    totalMeters += distance;
                }
            });
        }

        let avgPaceFormatted = '--';
        if (totalMeters > 0 && totalSeconds > 0) {
            const secPerKm = (totalSeconds / (totalMeters / 1000));
            const minutes = Math.floor(secPerKm / 60);
            const seconds = Math.round(secPerKm % 60);
            avgPaceFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds} /km`;
        }

        updateOrCreateStatCards({
            runKm: runKm.toFixed(1),
            swimMeters: Math.round(swimMeters),
            avgPace: avgPaceFormatted,
            activitiesCount: validActivitiesCount
        });

        return true;
    } catch (err) {
        console.error("Errore elaborazione dati reali Intervals:", err);
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
            <span class="text-[10px] text-slate-400">Sincronizzato da Intervals</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Metri Nuotati (7 gg)</span>
            <div class="text-2xl font-bold text-cyan-400">${stats.swimMeters} m</div>
            <span class="text-[10px] text-slate-400">Vasche / Acque libere</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Ritmo Medio Globale</span>
            <div class="text-2xl font-bold text-white">${stats.avgPace}</div>
            <span class="text-[10px] text-slate-400">Media ultimi 7 giorni</span>
        </div>
        <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
            <span class="text-xs text-slate-400 font-medium">Attività Registrate</span>
            <div class="text-2xl font-bold text-amber-400">${stats.activitiesCount} sessioni</div>
            <span class="text-[10px] text-slate-400">Lette dal tuo account</span>
        </div>
    `;
}
