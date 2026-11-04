import { getLastSevenDaysRange, IntervalsService, summarizeIntervalsData } from './intervals.js';

const METRICS = [
    ['ctl', 'metric-ctl'],
    ['atl', 'metric-atl'],
    ['tsb', 'metric-tsb'],
    ['load', 'metric-load']
];

export async function initIntervalsModule(supabaseClient, userId) {
    const athleteInput = document.getElementById('intervals-athlete-id');
    const apiKeyInput = document.getElementById('intervals-api-key');
    const btnSave = document.getElementById('btn-save-intervals');
    const btnTest = document.getElementById('btn-test-intervals');
    const statusMsg = document.getElementById('intervals-status-msg');

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;

        const athleteId = data?.intervals_id || data?.intervals_athlete_id || '';
        const apiKey = data?.intervals_key || data?.intervals_api_key || '';
        athleteInput.value = athleteId;
        apiKeyInput.value = apiKey;

        if (athleteId && apiKey) {
            try {
                await syncDashboard(athleteId, apiKey);
            } catch (syncError) {
                console.error('Errore nella sincronizzazione iniziale Intervals.icu:', syncError);
                setDashboardStatus(
                    `Collegamento non riuscito: ${syncError.message}`,
                    'error'
                );
            }
        } else {
            setDashboardStatus(
                'Intervals.icu non è ancora collegato. Inserisci il tuo Athlete ID e la tua API Key per visualizzare i dati reali.',
                'empty'
            );
        }
    } catch (error) {
        console.error('Errore nel caricamento della configurazione Intervals:', error);
        setDashboardStatus(`Impossibile leggere la configurazione Intervals.icu: ${error.message}`, 'error');
    }

    btnSave?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus(statusMsg, 'Inserisci Athlete ID e API Key.', 'error');
            return;
        }

        btnSave.disabled = true;
        showStatus(statusMsg, 'Salvataggio credenziali…', 'loading');
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({
                    intervals_id: athleteId,
                    intervals_key: apiKey,
                    intervals_athlete_id: athleteId,
                    intervals_api_key: apiKey
                })
                .eq('id', userId);

            if (error) throw error;
        } catch (error) {
            console.error('Errore nel salvataggio delle credenziali Intervals.icu:', error);
            showStatus(statusMsg, `Operazione non completata: ${error.message}`, 'error');
            btnSave.disabled = false;
            return;
        }

        document.dispatchEvent(new CustomEvent('intervals:sync'));
        try {
            await syncDashboard(athleteId, apiKey);
            showStatus(statusMsg, 'Credenziali salvate e dati sincronizzati.', 'success');
        } catch (error) {
            console.error('Errore nella sincronizzazione dopo il salvataggio delle credenziali:', error);
            setDashboardStatus(`Credenziali salvate, ma sincronizzazione non riuscita: ${error.message}`, 'error');
            showStatus(statusMsg, `Credenziali salvate, ma sincronizzazione non riuscita: ${error.message}`, 'error');
        } finally {
            btnSave.disabled = false;
        }
    });

    btnTest?.addEventListener('click', async () => {
        const athleteId = athleteInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!athleteId || !apiKey) {
            showStatus(statusMsg, 'Inserisci Athlete ID e API Key.', 'error');
            return;
        }

        btnTest.disabled = true;
        showStatus(statusMsg, 'Verifica del collegamento e sincronizzazione…', 'loading');
        try {
            await syncDashboard(athleteId, apiKey);
            showStatus(statusMsg, 'Collegamento verificato: dati aggiornati da Intervals.icu.', 'success');
        } catch (error) {
            console.error('Errore durante il test Intervals.icu:', error);
            setDashboardStatus(`Sincronizzazione non riuscita: ${error.message}`, 'error');
            showStatus(statusMsg, `Verifica non riuscita: ${error.message}`, 'error');
        } finally {
            btnTest.disabled = false;
        }
    });
}

async function syncDashboard(athleteId, apiKey) {
    clearDashboardData();
    setDashboardStatus('Caricamento dei dati reali da Intervals.icu…', 'loading');

    const today = new Date();
    const newest = formatDateKey(today);
    const oldestWellness = formatDateKey(addDays(today, -30));
    const { oldest: oldestActivities } = getLastSevenDaysRange(today);
    const service = new IntervalsService(athleteId, apiKey);
    const [wellness, activities] = await Promise.all([
        service.getWellness(oldestWellness, newest),
        service.getActivities(oldestActivities, newest)
    ]);

    const summary = summarizeIntervalsData(wellness, activities);
    renderMetrics(summary.metrics);
    renderActivities(summary.activities);

    const activityLabel = summary.activities.count === 1
        ? '1 attività negli ultimi 7 giorni'
        : `${summary.activities.count} attività negli ultimi 7 giorni`;
    setDashboardStatus(
        `Collegato · dati aggiornati ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ${activityLabel}.`,
        'success'
    );
}

function renderMetrics(metrics) {
    METRICS.forEach(([key, elementId]) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        const value = metrics[key];
        element.textContent = value === null
            ? '—'
            : key === 'tsb'
                ? formatMetric(value, true)
                : formatMetric(value);
    });
}

function clearDashboardData() {
    METRICS.forEach(([, elementId]) => {
        const element = document.getElementById(elementId);
        if (element) element.textContent = '—';
    });
    const activities = document.getElementById('intervals-activity-summary');
    activities?.replaceChildren(createElement(
        'p',
        'col-span-full text-sm text-slate-400',
        'In attesa dei dati Intervals.icu.'
    ));
}

function renderActivities(activities) {
    const container = document.getElementById('intervals-activity-summary');
    if (!container) return;
    container.replaceChildren();

    if (activities.count === 0) {
        container.append(createElement(
            'p',
            'col-span-full rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400',
            'Nessuna attività registrata negli ultimi 7 giorni.'
        ));
        return;
    }

    const values = [
        ['Attività', String(activities.count)],
        ['Corsa e trail', activities.runKm === null ? '—' : `${formatMetric(activities.runKm)} km`],
        ['Nuoto', activities.swimMeters === null ? '—' : `${Math.round(activities.swimMeters)} m`],
        ['Ritmo medio corsa', formatPace(activities.averageRunPaceSecondsPerKm)]
    ];
    values.forEach(([label, value]) => {
        const card = createElement('div', 'rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4');
        card.append(createElement('p', 'text-xs text-slate-400', label));
        card.append(createElement('p', 'mt-1 text-lg sm:text-xl font-semibold text-white', value));
        container.append(card);
    });

    if (activities.runBreakdown.length) {
        const details = createElement('details', 'col-span-full rounded-xl border border-slate-800 bg-slate-950/60');
        const summary = createElement(
            'summary',
            'min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-slate-200',
            `Attività conteggiate nella corsa (${activities.runBreakdown.length})`
        );
        details.append(summary);
        const list = createElement('ul', 'space-y-2 border-t border-slate-800 p-4');
        activities.runBreakdown.forEach(activity => {
            const row = createElement('li', 'flex items-start justify-between gap-3 text-sm');
            const name = createElement('span', 'min-w-0 text-slate-300');
            name.textContent = `${activity.date ? `${activity.date} · ` : ''}${activity.name} (${activity.type})`;
            const distance = createElement(
                'span',
                'shrink-0 font-semibold text-white',
                activity.distanceKm === null ? 'distanza n/d' : `${formatMetric(activity.distanceKm)} km`
            );
            row.append(name, distance);
            list.append(row);
        });
        details.append(list);
        container.append(details);
    }
}

function setDashboardStatus(message, state) {
    const container = document.getElementById('intervals-dashboard-status');
    if (!container) return;
    container.replaceChildren();
    const className = state === 'error'
        ? 'text-sm text-rose-300'
        : state === 'success'
            ? 'text-sm text-emerald-300'
            : 'text-sm text-slate-300';
    container.append(createElement('p', className, message));
    if (state === 'empty') showConnectionButton(container);
}

function showConnectionButton(container = document.getElementById('intervals-dashboard-status')) {
    if (!container) return;
    const button = createElement(
        'button',
        'mt-3 min-h-11 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400',
        'Collega Intervals.icu'
    );
    button.type = 'button';
    button.addEventListener('click', () => {
        document.querySelector('[data-target="section-intervals"]')?.click();
    });
    container.append(button);
}

function showStatus(element, message, state) {
    if (!element) return;
    const stateClasses = {
        error: 'bg-rose-500/10 text-rose-300 border border-rose-500/20',
        success: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
        loading: 'bg-slate-800 text-slate-300 border border-slate-700'
    };
    element.textContent = message;
    element.className = `text-sm p-3 rounded-xl ${stateClasses[state]}`;
}

function formatMetric(value, signed = false) {
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return signed && value > 0 ? `+${formatted}` : formatted;
}

function formatPace(secondsPerKm) {
    if (secondsPerKm === null || !Number.isFinite(secondsPerKm)) return '—';
    const roundedSeconds = Math.round(secondsPerKm);
    const minutes = Math.floor(roundedSeconds / 60);
    const seconds = String(roundedSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds} /km`;
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}
