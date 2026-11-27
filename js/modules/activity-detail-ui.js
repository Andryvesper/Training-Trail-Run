// js/modules/activity-detail-ui.js - Finestra con il dettaglio di un'attività svolta.
import { requestedStreamTypes } from './activity-streams.js';
import {
    activityProfile,
    activitySummaryItems,
    formatClock,
    intervalsActivityUrl,
    lapRows,
    usesPace
} from './activity-detail.js';
import { CHART_COLORS, renderLineChart } from './dashboard-charts.js';
import { analyzeActivity, isRunActivity } from './performance-analysis.js';
import { classifyDecoupling } from './performance-decoupling.js';

let openDialog = null;

const SPORT_LABELS = {
    Run: 'Corsa', TrailRun: 'Trail', VirtualRun: 'Corsa al chiuso', Walk: 'Camminata', Hike: 'Escursione',
    Ride: 'Bici', VirtualRide: 'Bici al chiuso', GravelRide: 'Gravel', MountainBikeRide: 'Mountain bike',
    Swim: 'Nuoto', OpenWaterSwim: 'Nuoto in acque libere', WeightTraining: 'Pesi', Workout: 'Allenamento'
};

/**
 * Apre il dettaglio dell'attività. Il riepilogo arriva subito; profilo,
 * analisi e giri si caricano da Intervals.icu (senza servizio: solo riepilogo).
 */
export function openActivityDetail({ activity, intervalsService = null, trigger = null }) {
    openDialog?.close();
    const dialog = el('dialog', 'activity-detail m-auto w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm');
    dialog.setAttribute('aria-labelledby', 'activity-detail-title');

    const header = el('header', 'sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6');
    const titleBox = el('div', 'min-w-0');
    const title = el('h2', 'truncate text-lg font-bold text-white', activity.name || activity.type || 'Attività');
    title.id = 'activity-detail-title';
    titleBox.append(title, el('p', 'text-xs text-slate-400', subtitle(activity)));
    const close = el('button', 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Chiudi dettaglio');
    close.addEventListener('click', () => dialog.close());
    header.append(titleBox, close);

    const body = el('div', 'space-y-5 px-4 py-4 sm:px-6 sm:py-5');
    body.append(summarySection(activity));
    const url = intervalsActivityUrl(activity.id);
    if (url) {
        const link = el('a', 'inline-flex min-h-11 items-center text-sm font-medium text-brand-300 underline underline-offset-2 hover:text-brand-200', 'Apri in Intervals.icu ↗');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        body.append(link);
    }
    const analysisBox = el('section', 'space-y-3');
    const profileBox = el('section', 'space-y-3');
    const lapsBox = el('section', 'space-y-3');
    body.append(analysisBox, profileBox, lapsBox);
    dialog.append(header, body);

    // Clic sullo sfondo: chiude.
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (openDialog === dialog) openDialog = null;
        trigger?.focus?.();
    });
    document.body.append(dialog);
    openDialog = dialog;
    dialog.showModal();

    const activityId = activity.id === null || activity.id === undefined ? '' : String(activity.id);
    if (!intervalsService || !activityId) {
        profileBox.append(note('Collega Intervals.icu per vedere profilo, analisi e giri.'));
        return dialog;
    }
    loadDetails({ activity, activityId, intervalsService, analysisBox, profileBox, lapsBox, dialog });
    return dialog;
}

async function loadDetails({ activity, activityId, intervalsService, analysisBox, profileBox, lapsBox, dialog }) {
    profileBox.append(note('Caricamento del profilo…'));
    lapsBox.append(note('Caricamento dei giri…'));
    const [streams, intervals] = await Promise.allSettled([
        intervalsService.getActivityStreams(activityId, requestedStreamTypes(activity)),
        intervalsService.getActivityIntervals(activityId)
    ]);
    if (!dialog.isConnected) return;

    profileBox.replaceChildren();
    if (streams.status === 'fulfilled') {
        try {
            renderProfile(profileBox, activity, streams.value);
            if (isRunActivity(activity)) renderAnalysis(analysisBox, activity, streams.value);
        } catch (error) {
            console.error("Profilo dell'attività non leggibile:", error);
            profileBox.replaceChildren(note("Profilo non disponibile: dati dell'attività non leggibili."));
        }
    } else {
        console.error('Stream dell\'attività non disponibili:', streams.reason);
        profileBox.append(note(`Profilo non disponibile: ${streams.reason?.message || 'errore sconosciuto'}.`));
    }

    lapsBox.replaceChildren();
    if (intervals.status === 'fulfilled') {
        try {
            renderLaps(lapsBox, activity, intervals.value);
        } catch (error) {
            console.error("Giri dell'attività non leggibili:", error);
            lapsBox.replaceChildren(note("Giri non disponibili: dati dell'attività non leggibili."));
        }
    } else {
        console.error('Giri dell\'attività non disponibili:', intervals.reason);
        lapsBox.append(note(`Giri non disponibili: ${intervals.reason?.message || 'errore sconosciuto'}.`));
    }
}

function summarySection(activity) {
    const section = el('section', 'space-y-3');
    section.append(el('h3', 'text-sm font-semibold text-white', 'Riepilogo'));
    const items = activitySummaryItems(activity);
    if (!items.length) {
        section.append(note('Intervals.icu non ha fornito dati di riepilogo.'));
        return section;
    }
    section.append(metricGrid(items));
    return section;
}

function renderAnalysis(container, activity, streams) {
    let analysis;
    try {
        analysis = analyzeActivity(activity, streams);
    } catch (error) {
        console.error('Analisi dell\'attività non riuscita:', error);
        return;
    }
    const items = [];
    const add = (label, value) => { if (value) items.push({ label, value }); };
    add('Passo GAP (Minetti)', pace(analysis.gap?.gapPaceSecondsPerKm));
    add('Efficiency Factor', number(analysis.efficiency?.ef, 2));
    add('EF in salita (> +6%)', number(analysis.uphill?.ef, 2));
    add('VAM migliore', Number.isFinite(analysis.climbs?.bestVam) ? `${analysis.climbs.bestVam} m/h` : null);
    add('Salite continue', analysis.climbs?.climbs?.length ? String(analysis.climbs.climbs.length) : null);
    const drift = analysis.decoupling?.driftPercent;
    const driftClass = classifyDecoupling(drift);
    // Ritmo non costante: la classe non vale, il numero resta indicativo.
    const driftNote = analysis.decoupling?.steady === false ? 'poco affidabile' : driftClass?.label;
    add('Deriva cardiaca', Number.isFinite(drift) ? `${signed(drift)}%${driftNote ? ` · ${driftNote}` : ''}` : null);
    add('Variazione GCT', Number.isFinite(analysis.biomechanics?.metrics?.gct?.changePercent) ? `${signed(analysis.biomechanics.metrics.gct.changePercent)}%` : null);
    add('Variazione oscillazione verticale', Number.isFinite(analysis.biomechanics?.metrics?.verticalOscillation?.changePercent) ? `${signed(analysis.biomechanics.metrics.verticalOscillation.changePercent)}%` : null);
    const load = analysis.mechanicalLoad;
    add('Mechanical Load Score', Number.isFinite(load?.score) ? `${number(load.score, 0)} (eccentrico ${number(load.eccentricPoints, 0)})` : null);
    add('D- pesato per pendenza', Number.isFinite(load?.eccentric?.weightedDescentM) ? `${Math.round(load.eccentric.weightedDescentM)} m` : null);
    if (!items.length) return;
    container.append(el('h3', 'text-sm font-semibold text-white', 'Analisi prestazione'));
    container.append(metricGrid(items));
    const notes = [
        analysis.decoupling?.status !== 'ok' ? analysis.decoupling?.reason : null,
        analysis.biomechanics?.status === 'unavailable' ? analysis.biomechanics.reason : null
    ].filter(Boolean);
    if (notes.length) container.append(note(notes.join(' ')));
}

function renderProfile(container, activity, streams) {
    const profile = activityProfile(streams);
    if (!profile) {
        container.append(note('Stream di tempo e distanza assenti: profilo non disponibile.'));
        return;
    }
    container.append(el('h3', 'text-sm font-semibold text-white', 'Profilo lungo il percorso'));
    const charts = el('div', 'grid gap-4');
    container.append(charts);
    const common = { dates: profile.labels, xLabel: 'Distanza' };
    if (profile.has.altitude) {
        renderLineChart(charts, { ...common, title: 'Altitudine', series: [{ label: 'Altitudine', color: CHART_COLORS.aqua, values: profile.altitude }], valueFormat: value => `${Math.round(value)} m` });
    }
    if (profile.has.heartrate) {
        renderLineChart(charts, { ...common, title: 'Frequenza cardiaca', series: [{ label: 'FC', color: CHART_COLORS.orange, values: profile.heartrate }], valueFormat: value => `${Math.round(value)} bpm` });
    }
    if (usesPace(activity) && profile.has.pace) {
        renderLineChart(charts, { ...common, title: 'Passo', description: 'Più in basso = più veloce. Tratti sotto 1 m/s esclusi.', series: [{ label: 'Passo', color: CHART_COLORS.blue, values: profile.pace }], valueFormat: value => `${formatClock(value)}/km` });
    } else if (!usesPace(activity) && profile.speed.some(value => value !== null)) {
        renderLineChart(charts, { ...common, title: 'Velocità', series: [{ label: 'Velocità', color: CHART_COLORS.blue, values: profile.speed }], valueFormat: value => `${value.toLocaleString('it-IT')} km/h` });
    }
    if (!charts.childElementCount) container.append(note('Nessuno stream di altitudine, frequenza cardiaca o velocità.'));
}

function renderLaps(container, activity, intervalsResponse) {
    const rows = lapRows(intervalsResponse, activity);
    container.append(el('h3', 'text-sm font-semibold text-white', 'Giri e intervalli'));
    if (rows.length < 2) {
        container.append(note(rows.length ? 'Un solo tratto registrato: nessuna suddivisione in giri.' : 'Nessun giro registrato.'));
        return;
    }
    const wrapper = el('div', 'overflow-x-auto rounded-xl border border-slate-800');
    const table = el('table', 'w-full min-w-[36rem] text-left text-xs');
    table.append(el('caption', 'sr-only', 'Giri e intervalli dell\'attività'));
    const headers = ['#', 'Tipo', 'Distanza', 'Tempo', usesPace(activity) ? 'Passo' : 'Velocità', 'FC media', 'FC max', 'D+'];
    const head = el('tr', 'border-b border-slate-800 bg-slate-900 text-slate-400');
    headers.forEach(text => {
        const cell = el('th', 'px-3 py-2 font-medium', text);
        cell.scope = 'col';
        head.append(cell);
    });
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const line = el('tr', `border-b border-slate-800/60 last:border-0 ${row.kind === 'WORK' ? 'bg-brand-500/5' : ''}`);
        [row.index, row.label, row.distance, row.duration, row.pace, row.heartrate, row.maxHeartrate, row.elevation].forEach((value, index) => {
            const cell = el(index === 0 ? 'th' : 'td', `px-3 py-2 tabular-nums whitespace-nowrap ${index === 0 ? 'font-medium text-slate-400' : 'text-slate-200'}`, String(value));
            if (index === 0) cell.scope = 'row';
            line.append(cell);
        });
        tbody.append(line);
    });
    table.append(thead, tbody);
    wrapper.append(table);
    container.append(wrapper);
}

function metricGrid(items) {
    const grid = el('dl', 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4');
    items.forEach(({ label, value }) => {
        const box = el('div', 'rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2');
        box.append(el('dt', 'text-[11px] text-slate-400', label), el('dd', 'text-sm font-semibold tabular-nums text-white', value));
        grid.append(box);
    });
    return grid;
}

function subtitle(activity) {
    const parts = [SPORT_LABELS[activity.type] || activity.type || null];
    const start = String(activity.start_date_local || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(start)) {
        const date = new Date(`${start.slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        parts.push(start.length >= 16 ? `${date}, ore ${start.slice(11, 16)}` : date);
    }
    return parts.filter(Boolean).join(' · ');
}

function note(text) {
    return el('p', 'text-sm text-slate-500', text);
}

function pace(secondsPerKm) {
    return Number.isFinite(secondsPerKm) && secondsPerKm > 0 ? `${formatClock(secondsPerKm)}/km` : null;
}

function number(value, digits) {
    return Number.isFinite(value) ? value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: digits }) : null;
}

function signed(value) {
    const text = number(value, 1);
    return value > 0 ? `+${text}` : text;
}

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null && text !== '') element.textContent = text;
    return element;
}
