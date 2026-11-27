import { IntervalsService, summarizeIntervalsData } from './intervals.js';
import {
    addDays as addDateKeyDays,
    computeRecords,
    normalizeActivities,
    summarizePeriod,
    weeklyVolumes,
    WELLNESS_FIELDS,
    wellnessSeries
} from './dashboard-stats.js';
import { CHART_COLORS, renderBarChart, renderLineChart } from './dashboard-charts.js';
import { TrainingRacesService } from './training-races.js';
import { resetPerformanceSection, runPerformanceAnalysis } from './performance-analysis-ui.js';
import { TrainingPlanService } from './training-plan.js';
import {
    describeIncreases,
    LOAD_RULE_LABEL,
    recentDoneLoad,
    recentWeekStarts,
    weeklyAdherence
} from './training-load.js';

const LOAD_WEEKS = 8;
const ADHERENCE_WEEKS = 4;

// Lo storico completo serve ai record personali; i grafici ne usano una parte.
const ACTIVITY_HISTORY_START = '2000-01-01';
const WELLNESS_HISTORY_DAYS = 365;

const dashboardState = {
    activities: [],
    wellness: [],
    races: [],
    sessions: null,
    today: null,
    summaryPeriod: '7',
    chartWeeks: 26
};

const METRICS = [
    ['ctl', 'metric-ctl'],
    ['atl', 'metric-atl'],
    ['tsb', 'metric-tsb'],
    ['load', 'metric-load']
];

let adherenceHandler = null;

export async function initIntervalsModule(supabaseClient, userId) {
    const syncDashboard = (athleteId, apiKey) => syncDashboardData(supabaseClient, userId, athleteId, apiKey);
    bindDashboardControls();
    // Le sedute cambiano da pianificatore o condivisione: si aggiorna l'aderenza.
    const refreshAdherence = async () => {
        if (!dashboardState.today) return;
        dashboardState.sessions = await loadAdherenceSessions(supabaseClient, userId, dashboardState.today);
        renderLoadAndAdherence();
    };
    // Un solo gestore anche se il modulo viene inizializzato più volte.
    if (adherenceHandler) {
        document.removeEventListener('training-sessions:changed', adherenceHandler);
        document.removeEventListener('training-sessions:updated', adherenceHandler);
    }
    adherenceHandler = refreshAdherence;
    document.addEventListener('training-sessions:changed', adherenceHandler);
    document.addEventListener('training-sessions:updated', adherenceHandler);
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

async function syncDashboardData(supabaseClient, userId, athleteId, apiKey) {
    clearDashboardData();
    setDashboardStatus('Caricamento dei dati reali da Intervals.icu…', 'loading');

    const today = new Date();
    const newest = formatDateKey(today);
    const oldestWellness = formatDateKey(addDays(today, -WELLNESS_HISTORY_DAYS));
    const service = new IntervalsService(athleteId, apiKey);
    const [wellness, activities, races, sessions] = await Promise.all([
        service.getWellness(oldestWellness, newest),
        service.getActivities(ACTIVITY_HISTORY_START, newest),
        new TrainingRacesService(supabaseClient).listRaces(userId).catch(error => {
            console.error('Gare non disponibili per i record personali:', error);
            return [];
        }),
        loadAdherenceSessions(supabaseClient, userId, newest)
    ]);

    const summary = summarizeIntervalsData(wellness, []);
    renderMetrics(summary.metrics);
    dashboardState.activities = normalizeActivities(activities);
    dashboardState.wellness = wellness;
    dashboardState.races = Array.isArray(races) ? races : [];
    dashboardState.sessions = sessions;
    dashboardState.today = newest;
    renderRecords();
    renderSummary();
    renderLoadAndAdherence();
    renderCharts();
    // Analisi avanzata in background: scarica gli stream senza bloccare la dashboard.
    runPerformanceAnalysis({
        supabaseClient,
        userId,
        intervalsService: service,
        activities,
        wellness,
        today: newest
    }).catch(error => console.error('Analisi prestazioni non completata:', error));

    const lastWeek = summarizePeriod(dashboardState.activities, addDateKeyDays(newest, -6), newest);
    setDashboardStatus(
        `Collegato · dati aggiornati ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ${dashboardState.activities.length} attività nello storico, ${lastWeek.totalCount} negli ultimi 7 giorni.`,
        'success'
    );
}

function bindDashboardControls() {
    document.querySelectorAll('[data-summary-period]').forEach(button => {
        button.addEventListener('click', () => {
            dashboardState.summaryPeriod = button.dataset.summaryPeriod;
            setPressed('[data-summary-period]', button);
            if (dashboardState.today) renderSummary();
        });
    });
    document.querySelectorAll('[data-chart-weeks]').forEach(button => {
        button.addEventListener('click', () => {
            dashboardState.chartWeeks = Number(button.dataset.chartWeeks);
            setPressed('[data-chart-weeks]', button);
            if (dashboardState.today) renderCharts();
        });
    });
}

function setPressed(selector, active) {
    document.querySelectorAll(selector).forEach(button => {
        button.setAttribute('aria-pressed', String(button === active));
    });
}

function summaryRange() {
    const today = dashboardState.today;
    const period = dashboardState.summaryPeriod;
    if (period === 'ytd') return { from: `${today.slice(0, 4)}-01-01`, label: 'dall’inizio dell’anno' };
    const days = Number(period);
    return { from: addDateKeyDays(today, -(days - 1)), label: days === 365 ? 'negli ultimi 12 mesi' : `negli ultimi ${days} giorni` };
}

function renderSummary() {
    const container = document.getElementById('intervals-activity-summary');
    if (!container) return;
    const { from, label } = summaryRange();
    const summary = summarizePeriod(dashboardState.activities, from, dashboardState.today);
    const rangeText = document.getElementById('dashboard-summary-range');
    if (rangeText) rangeText.textContent = `Attività registrate ${label} (dal ${formatDisplayDate(from)}).`;
    container.replaceChildren();
    if (summary.totalCount === 0) {
        container.append(createElement(
            'p',
            'col-span-full rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400',
            `Nessuna attività registrata ${label}.`
        ));
        return;
    }
    const values = [
        ['Corse', String(summary.run.count), summary.run.count ? `${formatMetric(round1(summary.run.km))} km · ${formatDuration(summary.run.seconds)}` : 'nessuna corsa'],
        ['Ritmo medio corsa', formatPace(summary.run.averagePaceSecondsPerKm), summary.run.count ? `Più lunga: ${formatMetric(round1(summary.run.longestKm))} km` : ''],
        ['Dislivello corsa', summary.run.count ? `${Math.round(summary.run.elevationM)} m D+` : '—', ''],
        ['Nuotate', String(summary.swim.count), summary.swim.count ? `${formatThousands(summary.swim.meters)} m · ${formatDuration(summary.swim.seconds)}` : 'nessuna nuotata'],
        ['Altre attività', String(summary.otherCount), ''],
        ['Totale attività', String(summary.totalCount), formatDuration(summary.totalSeconds)]
    ];
    values.forEach(([title, value, detail]) => {
        const card = createElement('div', 'rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4');
        card.append(createElement('p', 'text-xs text-slate-400', title));
        card.append(createElement('p', 'mt-1 text-lg sm:text-xl font-semibold text-white', value));
        if (detail) card.append(createElement('p', 'mt-1 text-xs text-slate-400', detail));
        container.append(card);
    });

    const runs = dashboardState.activities
        .filter(activity => activity.sport === 'run' && activity.date >= from && activity.date <= dashboardState.today)
        .reverse();
    if (runs.length) {
        const details = createElement('details', 'col-span-full rounded-xl border border-slate-800 bg-slate-950/60');
        details.append(createElement(
            'summary',
            'min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-slate-200',
            `Corse conteggiate (${runs.length})`
        ));
        const list = createElement('ul', 'max-h-72 space-y-2 overflow-y-auto border-t border-slate-800 p-4');
        runs.forEach(activity => {
            const row = createElement('li', 'flex items-start justify-between gap-3 text-sm');
            row.append(
                createElement('span', 'min-w-0 text-slate-300', `${activity.date} · ${activity.name} (${activity.type})`),
                createElement('span', 'shrink-0 font-semibold text-white', activity.distanceM ? `${formatMetric(round1(activity.distanceM / 1000))} km` : 'distanza n/d')
            );
            list.append(row);
        });
        details.append(list);
        container.append(details);
    }
}

function renderRecords() {
    const container = document.getElementById('dashboard-records');
    if (!container) return;
    const records = computeRecords(dashboardState.activities, dashboardState.races);
    container.replaceChildren();
    records.distances.forEach(record => {
        const card = createElement('div', 'rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4');
        card.append(createElement('p', 'text-xs text-slate-400', record.label));
        if (!record.best) {
            card.append(createElement('p', 'mt-1 text-lg sm:text-xl font-semibold text-slate-500', '—'));
            card.append(createElement('p', 'mt-1 text-xs text-slate-500', 'Nessuna gara o attività sull’intera distanza.'));
        } else {
            card.append(createElement('p', 'mt-1 text-lg sm:text-xl font-semibold tabular-nums text-white', formatDuration(record.best.seconds, true)));
            card.append(createElement('p', 'mt-1 text-xs text-slate-300', `${formatPace(record.paceSecondsPerKm)} · ${formatDisplayDate(record.best.date)}`));
            card.append(createElement('p', 'mt-1 truncate text-xs text-slate-500', `${record.best.name} (${record.best.sourceLabel})`));
        }
        container.append(card);
    });
    const longest = createElement('div', 'rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4');
    longest.append(createElement('p', 'text-xs text-slate-400', 'Corsa più lunga'));
    if (records.longestRun) {
        longest.append(createElement('p', 'mt-1 text-lg sm:text-xl font-semibold tabular-nums text-white', `${formatMetric(round1(records.longestRun.km))} km`));
        longest.append(createElement('p', 'mt-1 text-xs text-slate-300', `${formatDisplayDate(records.longestRun.date)}${records.longestRun.seconds ? ` · ${formatDuration(records.longestRun.seconds)}` : ''}`));
        longest.append(createElement('p', 'mt-1 truncate text-xs text-slate-500', records.longestRun.name));
    } else {
        longest.append(createElement('p', 'mt-1 text-lg sm:text-xl font-semibold text-slate-500', '—'));
    }
    container.append(longest);
}

function renderCharts() {
    const container = document.getElementById('dashboard-charts');
    if (!container) return;
    container.replaceChildren();
    const weeks = dashboardState.chartWeeks;
    const today = dashboardState.today;
    const from = addDateKeyDays(today, -(weeks * 7 - 1));
    const volumes = weeklyVolumes(dashboardState.activities, weeks, today);
    const weekLabels = volumes.map(week => week.weekStart);
    const weekTitle = weekStart => `Settimana dal ${formatDisplayDate(weekStart)}`;
    const wellness = wellnessSeries(dashboardState.wellness, from);

    renderLineChart(container, {
        title: 'Forma: fitness e fatica',
        description: 'CTL (fitness, media a 42 giorni) e ATL (fatica, media a 7 giorni) calcolate da Intervals.icu.',
        dates: wellness.dates,
        series: [
            { label: 'Fitness (CTL)', color: CHART_COLORS.blue, values: wellness.series.ctl },
            { label: 'Fatica (ATL)', color: CHART_COLORS.orange, values: wellness.series.atl }
        ],
        valueFormat: value => formatMetric(round1(value))
    });
    renderLineChart(container, {
        title: 'Bilancio CTL − ATL',
        description: 'Sopra zero: più riposato; sotto zero: carico recente superiore alla media.',
        dates: wellness.dates,
        series: [{ label: 'Bilancio', color: CHART_COLORS.aqua, values: wellness.series.tsb }],
        valueFormat: value => formatMetric(round1(value), true),
        zeroLine: true
    });
    renderBarChart(container, {
        title: 'Km di corsa a settimana',
        description: 'Somma di corsa e trail per settimana (lunedì–domenica).',
        labels: weekLabels,
        values: volumes.map(week => week.runKm),
        color: CHART_COLORS.blue,
        valueFormat: value => `${formatMetric(round1(value))} km`,
        tooltipLabel: weekTitle,
        extraTooltip: index => [['Corse', String(volumes[index].runCount)]]
    });
    renderBarChart(container, {
        title: 'Dislivello positivo a settimana',
        description: 'D+ reale registrato da Intervals.icu per corsa e trail (lunedì–domenica).',
        labels: weekLabels,
        values: volumes.map(week => week.runElevationM),
        color: CHART_COLORS.orange,
        valueFormat: value => `${formatThousands(value)} m`,
        tooltipLabel: weekTitle,
        extraTooltip: index => [['Km', `${formatMetric(round1(volumes[index].runKm))} km`]]
    });
    renderBarChart(container, {
        title: 'Corse a settimana',
        description: 'Numero di uscite di corsa e trail.',
        labels: weekLabels,
        values: volumes.map(week => week.runCount),
        color: CHART_COLORS.blue,
        tooltipLabel: weekTitle
    });
    renderBarChart(container, {
        title: 'Metri di nuoto a settimana',
        description: 'Distanza nuotata per settimana.',
        labels: weekLabels,
        values: volumes.map(week => week.swimMeters),
        color: CHART_COLORS.aqua,
        valueFormat: value => `${formatThousands(value)} m`,
        tooltipLabel: weekTitle,
        extraTooltip: index => [['Nuotate', String(volumes[index].swimCount)]]
    });
    renderBarChart(container, {
        title: 'Ore di allenamento a settimana',
        description: 'Tempo in movimento di tutte le attività.',
        labels: weekLabels,
        values: volumes.map(week => week.hours),
        color: CHART_COLORS.orange,
        valueFormat: value => `${formatMetric(round1(value))} h`,
        tooltipLabel: weekTitle
    });
    WELLNESS_FIELDS
        .filter(field => wellness.available[field.key])
        .forEach(field => {
            renderLineChart(container, {
                title: field.label,
                description: 'Dato wellness registrato in Intervals.icu.',
                dates: wellness.dates,
                series: [{ label: field.label, color: CHART_COLORS.blue, values: wellness.series[field.key] }],
                valueFormat: value => `${field.decimals ? value.toFixed(field.decimals).replace('.', ',') : formatThousands(value)}${field.unit ? ` ${field.unit}` : ''}`
            });
        });
}

// Sedute delle ultime settimane per l'aderenza; null se non leggibili.
async function loadAdherenceSessions(supabaseClient, userId, today) {
    const [from] = recentWeekStarts(today, ADHERENCE_WEEKS);
    try {
        return await new TrainingPlanService(supabaseClient).listSessions(userId, from, today);
    } catch (error) {
        console.error('Sedute non disponibili per l’aderenza al piano:', error);
        return null;
    }
}

function renderLoadAndAdherence() {
    renderAdherence();
    renderDoneLoad();
}

// Aderenza al piano: sedute, km e D+ svolti rispetto al pianificato,
// contando solo le sedute fino a oggi.
function renderAdherence() {
    const container = document.getElementById('dashboard-adherence');
    if (!container) return;
    container.replaceChildren();
    if (!Array.isArray(dashboardState.sessions)) {
        container.append(createElement('p', 'text-sm text-slate-500', 'Sedute pianificate non disponibili.'));
        return;
    }
    const today = dashboardState.today;
    const sessions = dashboardState.sessions.filter(session => session.scheduled_date <= today);
    const activityById = new Map(dashboardState.activities
        .filter(activity => activity.id !== null)
        .map(activity => [String(activity.id), {
            distance: activity.distanceM,
            moving_time: activity.movingS,
            elapsed_time: activity.elapsedS,
            total_elevation_gain: activity.elevationM
        }]));
    const rows = weeklyAdherence(sessions, recentWeekStarts(today, ADHERENCE_WEEKS), activityById);
    if (!rows.some(row => row.plannedCount)) {
        container.append(createElement('p', 'text-sm text-slate-500', 'Nessuna seduta pianificata nelle ultime 4 settimane.'));
        return;
    }
    container.append(dashboardTable(
        ['Settimana', 'Sedute', 'Km', 'D+'],
        rows.map(row => [
            weekCell(row.weekStart),
            ratioCell(row.doneCount, row.plannedCount, String),
            ratioCell(row.doneKm, row.plannedKm, value => formatMetric(round1(value))),
            row.elevationPlannedSessions
                ? ratioCell(row.doneElevationM, row.plannedElevationM, formatThousands)
                : `${formatThousands(row.doneElevationM)} m svolti`
        ]),
        'Aderenza al piano nelle ultime 4 settimane'
    ));
}

// Carico svolto (corsa e trail) con avviso oltre +10% sulla settimana prima.
function renderDoneLoad() {
    const container = document.getElementById('dashboard-load');
    if (!container) return;
    container.replaceChildren();
    const weeks = recentDoneLoad(dashboardState.activities, dashboardState.today, LOAD_WEEKS);
    if (!weeks.some(week => week.count)) {
        container.append(createElement('p', 'text-sm text-slate-500', 'Nessuna corsa nelle ultime settimane.'));
        return;
    }
    container.append(dashboardTable(
        ['Settimana', 'Km', 'D+', 'Tempo', 'Avviso'],
        weeks.map(week => {
            const warning = week.warning
                ? createElement('span', 'rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200', describeIncreases(week.increases))
                : '—';
            if (week.warning) warning.title = `Aumento oltre il 10% sulla settimana precedente (${LOAD_RULE_LABEL}).`;
            return [
                weekCell(week.weekStart),
                `${formatMetric(round1(week.km))} km`,
                `${formatThousands(week.elevationM)} m`,
                formatDuration(week.seconds),
                warning
            ];
        }),
        'Carico settimanale di corsa e trail'
    ));
}

function weekCell(weekStart) {
    const current = weekStart === recentWeekStarts(dashboardState.today, 1)[0];
    return `${formatDisplayDate(weekStart)}${current ? ' (in corso)' : ''}`;
}

function ratioCell(done, planned, format) {
    const percent = planned > 0 ? ` (${Math.round(done / planned * 100)}%)` : '';
    return `${format(done)} / ${format(planned)}${percent}`;
}

function dashboardTable(headers, rows, caption) {
    const wrapper = createElement('div', 'overflow-x-auto');
    const table = createElement('table', 'w-full min-w-[28rem] text-left text-xs');
    table.append(createElement('caption', 'sr-only', caption));
    const head = createElement('tr', 'border-b border-slate-800 text-slate-400');
    headers.forEach(header => {
        const cell = createElement('th', 'px-2 py-2 font-medium', header);
        cell.scope = 'col';
        head.append(cell);
    });
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    rows.forEach(values => {
        const row = createElement('tr', 'border-b border-slate-800/60 last:border-0');
        values.forEach((value, index) => {
            const cell = createElement(index === 0 ? 'th' : 'td', `px-2 py-2 tabular-nums ${index === 0 ? 'font-medium text-slate-300' : 'text-slate-200'}`);
            if (index === 0) cell.scope = 'row';
            if (value instanceof Node) cell.append(value);
            else cell.textContent = value;
            row.append(cell);
        });
        tbody.append(row);
    });
    table.append(thead, tbody);
    wrapper.append(table);
    return wrapper;
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
    resetPerformanceSection();
    METRICS.forEach(([, elementId]) => {
        const element = document.getElementById(elementId);
        if (element) element.textContent = '—';
    });
    ['intervals-activity-summary', 'dashboard-records', 'dashboard-charts', 'dashboard-adherence', 'dashboard-load'].forEach(id => {
        document.getElementById(id)?.replaceChildren(createElement(
            'p',
            'col-span-full text-sm text-slate-400',
            'In attesa dei dati Intervals.icu.'
        ));
    });
}

function formatDuration(totalSeconds, precise = false) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—';
    const seconds = Math.round(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (precise) {
        return hours
            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
            : `${minutes}:${String(rest).padStart(2, '0')}`;
    }
    return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`;
}

function formatThousands(value) {
    return Math.round(value).toLocaleString('it-IT');
}

function formatDisplayDate(dateKey) {
    if (!dateKey) return '';
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function round1(value) {
    return Math.round(value * 10) / 10;
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
        'mt-3 min-h-11 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600',
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
