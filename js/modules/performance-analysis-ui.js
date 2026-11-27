// Sezione "Analisi prestazione" della dashboard: scarica gli stream delle
// corse recenti da Intervals.icu, calcola le metriche avanzate, le salva in
// Supabase e mostra prontezza, revisione delle soglie, grafici e tabella.

import { createEmptyState } from '../core/ui-feedback.js';
import { PERFORMANCE_CONFIG, PERFORMANCE_CONFIG_VERSION } from './performance-config.js';
import { requestedStreamTypes } from './activity-streams.js';
import { activitiesToAnalyze, analyzeActivity, eccentricEntries, efficiencyTrend } from './performance-analysis.js';
import { classifyDecoupling } from './performance-decoupling.js';
import { biomechanicsAlerts } from './performance-biomechanics.js';
import { addDays, computeReadiness } from './mechanical-readiness.js';
import {
    applyChanges,
    effectiveConfig,
    effectiveThresholds,
    isReviewDue,
    nextReviewDate,
    pendingReview,
    proposeThresholdReview
} from './performance-calibration.js';
import { analysisFromRecord, PerformanceAnalysisService } from './performance-analysis-service.js';
import { CHART_COLORS, renderBarChart, renderLineChart } from './dashboard-charts.js';

const state = {
    analyses: new Map(),
    activities: [],
    wellness: [],
    today: null,
    reviews: [],
    config: PERFORMANCE_CONFIG,
    trendDays: 90,
    runToken: 0,
    store: null,
    userId: null,
    cacheAvailable: true
};

let controlsBound = false;

export function resetPerformanceSection() {
    state.runToken += 1;
    state.analyses = new Map();
    ['dashboard-readiness', 'dashboard-threshold-review', 'dashboard-performance-charts', 'dashboard-performance-table', 'dashboard-performance-streams']
        .forEach(id => document.getElementById(id)?.replaceChildren());
    setStatus('In attesa dei dati Intervals.icu.', 'idle');
}

/**
 * @param {{ supabaseClient: object, userId: string, intervalsService: { getActivityStreams: Function },
 *   activities: object[], wellness: object[], today: string }} input
 */
export async function runPerformanceAnalysis({ supabaseClient, userId, intervalsService, activities, wellness, today }) {
    bindControls();
    const token = ++state.runToken;
    const alive = () => token === state.runToken;
    state.store = new PerformanceAnalysisService(supabaseClient);
    state.userId = userId;
    state.activities = Array.isArray(activities) ? activities : [];
    state.wellness = Array.isArray(wellness) ? wellness : [];
    state.today = today;
    state.analyses = new Map();
    state.cacheAvailable = true;

    setStatus('Caricamento delle analisi salvate…', 'loading');
    const from = addDays(today, -(PERFORMANCE_CONFIG.streams.historyDays + PERFORMANCE_CONFIG.readiness.chronicDays));
    try {
        const records = await state.store.listAnalyses(userId, from);
        records.map(analysisFromRecord).filter(Boolean).forEach(analysis => state.analyses.set(analysis.activityId, analysis));
    } catch (error) {
        console.error('Analisi prestazioni salvate non disponibili:', error);
        state.cacheAvailable = false;
    }
    try {
        state.reviews = await state.store.listReviews(userId);
    } catch (error) {
        console.error('Revisioni delle soglie non disponibili:', error);
        state.reviews = [];
    }
    if (!alive()) return;
    state.config = effectiveConfig(state.reviews);
    render();

    const versions = new Map([...state.analyses.values()].map(item => [item.activityId, item.configVersion]));
    const { pending, skipped } = activitiesToAnalyze(state.activities, versions, today, state.config);
    let done = 0;
    let failed = 0;
    if (pending.length) {
        const queue = pending.slice();
        const worker = async () => {
            while (queue.length && alive()) {
                const activity = queue.shift();
                try {
                    const streams = await intervalsService.getActivityStreams(activity.id, requestedStreamTypes(activity));
                    const analysis = analyzeActivity(activity, streams, state.config);
                    if (!alive()) return;
                    state.analyses.set(analysis.activityId, analysis);
                    if (state.cacheAvailable) {
                        await state.store.saveAnalysis(userId, analysis).catch(error => {
                            console.error('Analisi non salvata:', error);
                            state.cacheAvailable = false;
                        });
                    }
                } catch (error) {
                    console.error(`Stream non disponibili per l'attività ${activity.id}:`, error);
                    failed += 1;
                }
                done += 1;
                if (!alive()) return;
                setStatus(`Analisi degli stream: ${done} di ${pending.length} corse…`, 'loading');
                if (done % 5 === 0) render();
            }
        };
        await Promise.all(Array.from({ length: PERFORMANCE_CONFIG.streams.concurrency }, worker));
    }
    if (!alive()) return;

    await maybeCreateReview(userId, today);
    if (!alive()) return;
    render();
    const runs = [...state.analyses.values()].filter(item => !item.summaryOnly).length;
    const notes = [
        `${runs} corse analizzate negli ultimi ${PERFORMANCE_CONFIG.streams.historyDays} giorni`,
        pending.length ? `${pending.length - failed} nuove` : null,
        failed ? `${failed} senza stream (riprovo al prossimo aggiornamento)` : null,
        skipped ? `${skipped} rimandate al prossimo aggiornamento` : null,
        state.cacheAvailable ? null : 'analisi non salvate: tabella Supabase non disponibile'
    ].filter(Boolean);
    setStatus(`${notes.join(' · ')}.`, failed || !state.cacheAvailable ? 'warning' : 'success');
}

async function maybeCreateReview(userId, today) {
    if (!isReviewDue(state.reviews, today, state.config)) return;
    const proposal = proposeThresholdReview({
        analyses: [...state.analyses.values()].filter(item => !item.summaryOnly),
        eccentricEntries: currentEccentricEntries(),
        wellness: state.wellness,
        today,
        config: state.config
    });
    const review = {
        reviewed_at: today,
        window_from: proposal.windowFrom,
        window_to: proposal.windowTo,
        status: proposal.changes.length ? 'proposed' : 'no_change',
        proposal: { changes: proposal.changes, observations: proposal.observations, configVersion: PERFORMANCE_CONFIG_VERSION },
        thresholds: proposal.changes.length ? {} : effectiveThresholds(state.reviews)
    };
    try {
        const saved = await state.store.createReview(userId, review);
        state.reviews = [...state.reviews, saved];
    } catch (error) {
        console.error('Revisione delle soglie non salvata:', error);
    }
}

async function decide(review, status) {
    const thresholds = status === 'approved'
        ? applyChanges(effectiveThresholds(state.reviews), review.proposal?.changes)
        : {};
    const container = document.getElementById('dashboard-threshold-review');
    container?.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
        const saved = await state.store.decideReview(state.userId, review.id, status, thresholds);
        state.reviews = state.reviews.map(item => (item.id === review.id ? saved : item));
        state.config = effectiveConfig(state.reviews);
        render();
    } catch (error) {
        console.error('Decisione sulla revisione non salvata:', error);
        container?.append(el('p', 'text-sm text-rose-300', `Operazione non completata: ${error.message}`));
        container?.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
}

function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    document.querySelectorAll('[data-performance-days]').forEach(button => {
        button.addEventListener('click', () => {
            state.trendDays = Number(button.dataset.performanceDays) || 90;
            document.querySelectorAll('[data-performance-days]').forEach(item => {
                item.setAttribute('aria-pressed', String(item === button));
            });
            if (state.today) renderCharts();
        });
    });
}

function currentEccentricEntries() {
    return eccentricEntries(state.activities, state.analyses, state.today, state.config);
}

function render() {
    if (!state.today) return;
    renderReadiness();
    renderReview();
    renderCharts();
    renderTable();
    renderStreams();
}

function renderReadiness() {
    const container = document.getElementById('dashboard-readiness');
    if (!container) return;
    container.replaceChildren();
    const readiness = computeReadiness({
        eccentricEntries: currentEccentricEntries(),
        wellness: state.wellness,
        today: state.today,
        config: state.config
    });
    const styles = {
        green: ['border-emerald-500/30 bg-emerald-500/10', 'text-emerald-300', '✓', 'Pronto'],
        amber: ['border-amber-400/40 bg-amber-400/10', 'text-amber-200', '!', readiness.kind === 'muscular' ? 'Attenzione: muscoli' : 'Attenzione: fatica sistemica'],
        red: ['border-rose-500/40 bg-rose-500/10', 'text-rose-300', '✕', 'Solo recupero'],
        unavailable: ['border-slate-700 bg-slate-900', 'text-slate-300', '?', 'Non disponibile']
    };
    const [box, tone, icon, label] = styles[readiness.level];
    const card = el('div', `rounded-2xl border p-4 space-y-2 ${box}`);
    card.dataset.readinessLevel = readiness.level;
    const title = el('p', `flex items-center gap-2 text-sm font-bold ${tone}`);
    const badge = el('span', 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs', icon);
    badge.setAttribute('aria-hidden', 'true');
    title.append(badge, document.createTextNode(`Prontezza muscolare e sistemica: ${label}`));
    card.append(title, el('p', 'text-sm text-slate-100', readiness.headline));
    if (readiness.advice.length) {
        const list = el('ul', 'list-disc space-y-1 pl-5 text-xs text-slate-300');
        readiness.advice.forEach(item => list.append(el('li', '', item)));
        card.append(list);
    }
    const details = [];
    const ecc = readiness.eccentric;
    details.push(`Carico eccentrico 7 giorni: ${formatNumber(ecc.acutePoints)} punti${ecc.ratio !== null ? `, ${formatNumber(ecc.ratio, 2)} volte la tua media a 28 giorni` : ecc.noChronicBase ? ', nessuna discesa nei 28 giorni precedenti' : ''} (stato ${({ low: 'basso', moderate: 'medio', high: 'alto' })[ecc.level]}).`);
    if (readiness.hrv.status === 'ok') {
        details.push(`HRV media 7 giorni ${readiness.hrv.shortMeanMs} ms, range normale ${readiness.hrv.normalRangeMs[0]}-${readiness.hrv.normalRangeMs[1]} ms (baseline 30 giorni).`);
    }
    card.append(el('p', 'text-[11px] text-slate-400', details.join(' ')));
    container.append(card);
}

function renderReview() {
    const container = document.getElementById('dashboard-threshold-review');
    if (!container) return;
    container.replaceChildren();
    const pending = pendingReview(state.reviews);
    const approvedOverrides = effectiveThresholds(state.reviews);
    if (pending) {
        const card = el('div', 'rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-3');
        card.append(el('p', 'text-sm font-bold text-sky-200', `Revisione delle soglie del ${formatDate(pending.reviewed_at)}: proposta da approvare`));
        const list = el('ul', 'space-y-2 text-xs text-slate-200');
        (pending.proposal?.changes || []).forEach(change => {
            const item = el('li', '');
            item.append(el('span', 'font-semibold', `${change.label}: ${formatNumber(change.current, 2)} → ${formatNumber(change.proposed, 2)}. `), document.createTextNode(change.reason));
            list.append(item);
        });
        card.append(list, observationsDetails(pending.proposal?.observations));
        const actions = el('div', 'flex flex-wrap gap-2');
        const approve = el('button', 'min-h-11 rounded-xl bg-brand-500 px-4 text-sm font-bold text-white hover:bg-brand-600', 'Approva le nuove soglie');
        const reject = el('button', 'min-h-11 rounded-xl border border-slate-600 px-4 text-sm font-medium text-slate-200 hover:bg-slate-800', 'Mantieni le soglie attuali');
        approve.type = 'button';
        reject.type = 'button';
        approve.addEventListener('click', () => decide(pending, 'approved'));
        reject.addEventListener('click', () => decide(pending, 'rejected'));
        actions.append(approve, reject);
        card.append(actions);
        container.append(card);
        return;
    }
    const last = [...state.reviews].reverse().find(review => review.status !== 'proposed');
    const text = [
        `Soglie considerate valide da ${PERFORMANCE_CONFIG.review.approvedBy} il ${formatDate(PERFORMANCE_CONFIG.review.approvedAt)}, rivalutate ogni ${PERFORMANCE_CONFIG.review.intervalDays} giorni sui tuoi dati.`,
        Object.keys(approvedOverrides).length ? `${Object.keys(approvedOverrides).length} soglie modificate nelle revisioni approvate.` : null,
        last ? `Ultima revisione: ${formatDate(last.reviewed_at)} (${({ approved: 'approvata', rejected: 'soglie mantenute', no_change: 'nessuna modifica necessaria' })[last.status]}).` : null,
        `Prossima revisione: ${formatDate(nextReviewDate(state.reviews, state.config))}.`
    ].filter(Boolean).join(' ');
    const box = el('div', 'space-y-1');
    box.append(el('p', 'text-xs text-slate-400', text));
    if (last?.proposal?.observations?.length) box.append(observationsDetails(last.proposal.observations));
    container.append(box);
}

function observationsDetails(observations) {
    const details = el('details', 'text-xs text-slate-400');
    details.append(el('summary', 'min-h-11 cursor-pointer py-2', 'Cosa mostrano i tuoi dati'));
    const list = el('ul', 'list-disc space-y-1 pl-5');
    (observations || []).forEach(item => list.append(el('li', '', item)));
    details.append(list);
    return details;
}

function renderCharts() {
    const container = document.getElementById('dashboard-performance-charts');
    if (!container) return;
    container.replaceChildren();
    const analyses = runAnalyses();
    const trend = efficiencyTrend(analyses, state.today, state.trendDays, state.config);
    const trendText = trend.changePercent === null
        ? 'Velocità GAP in m/min divisa per la FC media: più alto = più veloce a parità di battito.'
        : `Velocità GAP (m/min) / FC media. Andamento ${trend.changePercent > 0 ? '+' : ''}${formatNumber(trend.changePercent)}% in ${state.trendDays} giorni: a ${trend.referenceHr} bpm il GAP passa da ${formatPace(trend.start.gapPaceAtReferenceHr)} a ${formatPace(trend.end.gapPaceAtReferenceHr)}.`;
    renderLineChart(container, {
        title: 'Efficiency Factor (GAP / FC)',
        description: trendText,
        dates: trend.points.map(point => point.date),
        series: [
            { label: 'EF attività', color: CHART_COLORS.blue, values: trend.points.map(point => point.ef) },
            { label: 'EF in salita (> +6%)', color: CHART_COLORS.orange, values: trend.points.map(point => point.efUphill) }
        ],
        valueFormat: value => formatNumber(value, 2)
    });

    const from = addDays(state.today, -(state.trendDays - 1));
    const endurance = analyses.filter(item => item.date >= from && Number.isFinite(item.decoupling?.driftPercent));
    // Linee con zero: deriva e variazione del GCT possono essere negative.
    renderLineChart(container, {
        title: 'Deriva cardiaca (Pa:Hr su GAP)',
        description: `Sedute oltre 60 minuti o 12 km, primi 10 minuti esclusi. Sotto ${formatNumber(state.config.decoupling.excellentMaxPercent)}% ottima, fino a ${formatNumber(state.config.decoupling.goodMaxPercent)}% buona, oltre significativa. Sotto zero: seconda metà più efficiente.`,
        dates: endurance.map(item => item.date),
        series: [{ label: 'Deriva', color: CHART_COLORS.aqua, values: endurance.map(item => item.decoupling.driftPercent) }],
        valueFormat: value => `${formatNumber(value)}%`,
        zeroLine: true
    });

    const gctRuns = analyses.filter(item => item.date >= from && Number.isFinite(item.biomechanics?.metrics?.gct?.changePercent));
    if (gctRuns.length) {
        renderLineChart(container, {
            title: 'Variazione del GCT nel finale',
            description: `Mediana dell'ultimo 20% contro l'inizio dopo il riscaldamento, in piano e a passo simile quando possibile. Allarme oltre +${formatNumber(state.config.biomechanics.gctAlertPercent)}%.`,
            dates: gctRuns.map(item => item.date),
            series: [{ label: 'Variazione GCT', color: CHART_COLORS.orange, values: gctRuns.map(item => item.biomechanics.metrics.gct.changePercent) }],
            valueFormat: value => `${value > 0 ? '+' : ''}${formatNumber(value)}%`,
            zeroLine: true
        });
    }

    const days = Array.from({ length: 28 }, (_, index) => addDays(state.today, index - 27));
    const entries = currentEccentricEntries();
    const byDay = new Map(days.map(day => [day, { score: 0, eccentric: 0 }]));
    entries.forEach(entry => {
        const bucket = byDay.get(entry.date);
        if (!bucket) return;
        bucket.score += entry.score;
        bucket.eccentric += entry.eccentricPoints;
    });
    renderBarChart(container, {
        title: 'Mechanical Load Score giornaliero',
        description: `Carico cardio (Intervals) più ${PERFORMANCE_CONFIG.mechanicalLoad.pointsPer100m} punti ogni 100 m di D- pesato per pendenza (×1 fino a -8%, ×1,5 fino a -15%, ×2 oltre). Ultimi 28 giorni.`,
        labels: days,
        values: days.map(day => Math.round(byDay.get(day).score)),
        color: CHART_COLORS.blue,
        valueFormat: value => formatNumber(value, 0),
        tooltipLabel: label => formatDate(label),
        extraTooltip: index => [['Di cui eccentrico', formatNumber(byDay.get(days[index]).eccentric)]]
    });
}

function renderTable() {
    const container = document.getElementById('dashboard-performance-table');
    if (!container) return;
    container.replaceChildren();
    const rows = runAnalyses().slice().reverse().slice(0, 15);
    if (!rows.length) {
        container.append(createEmptyState('Nessuna corsa analizzata negli ultimi 90 giorni.', { hint: 'Le corse con stream di frequenza cardiaca e altitudine compaiono qui dopo la sincronizzazione.' }));
        return;
    }
    const headers = ['Data', 'Attività', 'Passo', 'GAP', 'EF', 'EF salita', 'VAM migliore', 'Deriva', 'Δ GCT', 'Δ VO', 'Load (ecc.)', 'Note'];
    const wrapper = el('div', 'overflow-x-auto');
    const table = el('table', 'w-full min-w-[56rem] text-left text-xs');
    table.append(el('caption', 'sr-only', 'Analisi delle ultime corse'));
    const head = el('tr', 'border-b border-slate-800 text-slate-400');
    headers.forEach(header => {
        const cell = el('th', 'px-2 py-2 font-medium', header);
        cell.scope = 'col';
        head.append(cell);
    });
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    rows.forEach(item => {
        const drift = item.decoupling?.driftPercent;
        const decouplingClass = classifyDecoupling(drift, state.config);
        const gct = item.biomechanics?.metrics?.gct?.changePercent;
        const vo = item.biomechanics?.metrics?.verticalOscillation?.changePercent;
        const notes = [
            ...biomechanicsAlerts(item.biomechanics, state.config),
            item.decoupling?.status === 'partial' ? item.decoupling.reason : null,
            item.efficiency?.status === 'unavailable' ? item.efficiency.reason : null
        ].filter(Boolean);
        const values = [
            formatDate(item.date),
            item.name,
            formatPace(item.gap?.paceSecondsPerKm),
            formatPace(item.gap?.gapPaceSecondsPerKm),
            Number.isFinite(item.efficiency?.ef) ? formatNumber(item.efficiency.ef, 2) : '—',
            Number.isFinite(item.uphill?.ef) ? formatNumber(item.uphill.ef, 2) : '—',
            Number.isFinite(item.climbs?.bestVam) ? `${item.climbs.bestVam} m/h` : '—',
            Number.isFinite(drift) ? `${formatNumber(drift)}% ${decouplingClass ? `(${({ excellent: 'ottima', good: 'buona', significant: 'significativa', negative: 'negativa' })[decouplingClass.key]})` : ''}` : '—',
            Number.isFinite(gct) ? `${gct > 0 ? '+' : ''}${formatNumber(gct)}%` : '—',
            Number.isFinite(vo) ? `${vo > 0 ? '+' : ''}${formatNumber(vo)}%` : '—',
            Number.isFinite(item.mechanicalLoad?.score) ? `${formatNumber(item.mechanicalLoad.score, 0)} (${formatNumber(item.mechanicalLoad.eccentricPoints, 0)})` : '—',
            notes.length ? notes.join(' ') : '—'
        ];
        const row = el('tr', 'border-b border-slate-800/60 last:border-0 align-top');
        values.forEach((value, index) => {
            const cell = el(index === 0 ? 'th' : 'td', `px-2 py-2 ${index === 1 || index === 11 ? '' : 'tabular-nums whitespace-nowrap'} ${index === 0 ? 'font-medium text-slate-300' : 'text-slate-200'}`, value);
            if (index === 0) cell.scope = 'row';
            if (index === 11 && notes.some(note => note.startsWith('GCT') || note.startsWith('Oscillazione') || note.startsWith('Vertical'))) cell.className += ' text-amber-200';
            row.append(cell);
        });
        tbody.append(row);
    });
    table.append(thead, tbody);
    wrapper.append(table);
    container.append(wrapper);
}

// Elenco degli stream trovati: serve a verificare i nomi delle dinamiche Garmin.
function renderStreams() {
    const container = document.getElementById('dashboard-performance-streams');
    if (!container) return;
    container.replaceChildren();
    const counts = new Map();
    const analyses = runAnalyses();
    analyses.forEach(item => (item.streams?.rawTypes || []).forEach(type => counts.set(type, (counts.get(type) || 0) + 1)));
    const details = el('details', 'text-xs text-slate-400');
    details.append(el('summary', 'min-h-11 cursor-pointer py-2', 'Stream trovati negli ultimi 90 giorni'));
    if (!counts.size) {
        details.append(el('p', '', 'Nessuno stream ancora scaricato.'));
    } else {
        const list = el('ul', 'flex flex-wrap gap-2');
        [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            list.append(el('li', 'rounded-full border border-slate-700 px-2 py-0.5', `${type} · ${count}`));
        });
        details.append(list);
        const withDynamics = analyses.filter(item => item.streams?.available?.includes('gct')).length;
        details.append(el('p', 'mt-2', withDynamics
            ? `${withDynamics} corse con dinamiche di corsa (GCT).`
            : 'Nessuna corsa con dinamiche di corsa riconosciute: se il tuo orologio le registra, i nomi degli stream sopra mostrano come Intervals le chiama.'));
    }
    container.append(details);
}

function runAnalyses() {
    return [...state.analyses.values()]
        .filter(item => !item.summaryOnly && item.date)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function setStatus(message, tone) {
    const container = document.getElementById('dashboard-performance-status');
    if (!container) return;
    const classes = { loading: 'text-slate-300', success: 'text-emerald-300', warning: 'text-amber-200', idle: 'text-slate-400' };
    container.replaceChildren(el('p', `text-sm ${classes[tone] || classes.idle}`, message));
}

function formatPace(secondsPerKm) {
    if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—';
    const rounded = Math.round(secondsPerKm);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}/km`;
}

function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function formatDate(dateKey) {
    if (!dateKey) return '';
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function el(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}
