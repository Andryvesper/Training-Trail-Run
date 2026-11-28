// Finestra con la traccia GPX collegata a una seduta pianificata: riepilogo,
// mappa con partenza, arrivo e punti personalizzati, elenco dei punti.
import { analyzeTrack, pointAtKm } from './gpx-analysis.js';
import { waypointKind } from './gpx-tracks.js';
import { renderTrackMap } from './track-map.js';

let openDialog = null;

/**
 * @param {{ service: import('./gpx-tracks.js').GpxTracksService, userId: string, session: object, track: object, trigger?: HTMLElement|null }} options
 */
export function openSessionTrack({ service, userId, session, track, trigger = null }) {
    openDialog?.close();
    const dialog = el(
        'dialog',
        'session-track m-auto w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm'
    );
    dialog.setAttribute('aria-labelledby', 'session-track-title');

    const header = el(
        'header',
        'sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6'
    );
    const titleBox = el('div', 'min-w-0');
    const title = el('h2', 'truncate text-lg font-bold text-white', track.name);
    title.id = 'session-track-title';
    titleBox.append(
        title,
        el('p', 'text-xs text-slate-400', `Percorso della seduta "${session.title}" · ${formatDate(session.scheduled_date)}`)
    );
    const close = el(
        'button',
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800',
        '✕'
    );
    close.type = 'button';
    close.setAttribute('aria-label', 'Chiudi percorso');
    close.addEventListener('click', () => dialog.close());
    header.append(titleBox, close);

    const body = el('div', 'space-y-5 px-4 py-4 sm:px-6 sm:py-5');
    const mapBox = el('section', 'space-y-3');
    const waypointsBox = el('section', 'space-y-3');
    body.append(summary(track), mapBox, waypointsBox);
    dialog.append(header, body);

    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
        dialog.trackMap?.remove();
        dialog.remove();
        if (openDialog === dialog) openDialog = null;
        trigger?.focus?.();
    });
    document.body.append(dialog);
    openDialog = dialog;
    dialog.showModal();

    loadTrack({ service, userId, track, dialog, mapBox, waypointsBox });
    return dialog;
}

async function loadTrack({ service, userId, track, dialog, mapBox, waypointsBox }) {
    mapBox.append(note('Caricamento della mappa…'));
    let points;
    let waypoints;
    try {
        [points, waypoints] = await Promise.all([service.getTrackPoints(userId, track.id), service.listWaypoints(userId, track.id)]);
    } catch (error) {
        console.error('Traccia GPX della seduta non disponibile:', error);
        if (dialog.isConnected) mapBox.replaceChildren(note(`Traccia non disponibile: ${error.message}.`));
        return;
    }
    if (!dialog.isConnected) return;

    let markers = [];
    try {
        const analysis = analyzeTrack(points);
        markers = waypoints.map((waypoint, index) => {
            const position = pointAtKm(analysis, Number(waypoint.km));
            const kind = waypointKind(waypoint.kind);
            return {
                lat: position.lat,
                lon: position.lon,
                label: String(index + 1),
                title: `${index + 1}. ${waypoint.name} · ${kind.label} · km ${formatKm(waypoint.km)}`,
                color: kind.color
            };
        });
    } catch (error) {
        console.error('Punti della traccia non posizionabili:', error);
    }

    mapBox.replaceChildren(el('h3', 'text-sm font-semibold text-white', 'Mappa'));
    try {
        const trackMap = await renderTrackMap(mapBox, {
            points: points.map(([lat, lon]) => [lat, lon]),
            markers,
            label: `Mappa del percorso ${track.name}`
        });
        if (dialog.isConnected) dialog.trackMap = trackMap;
        else trackMap.remove();
    } catch (error) {
        console.error('Mappa della traccia non disponibile:', error);
        mapBox.append(note(`Mappa non disponibile: ${error.message}.`));
    }

    if (!waypoints.length) return;
    waypointsBox.append(el('h3', 'text-sm font-semibold text-white', 'Punti del percorso'));
    const list = el('ol', 'space-y-1 text-sm text-slate-300');
    waypoints.forEach((waypoint, index) => {
        const item = el('li', 'flex flex-wrap items-baseline gap-x-2');
        item.append(
            el('span', 'font-semibold tabular-nums text-white', `${index + 1}.`),
            el('span', 'tabular-nums text-slate-400', `km ${formatKm(waypoint.km)}`),
            el('span', 'text-white', waypoint.name),
            el('span', 'text-xs text-slate-400', waypointKind(waypoint.kind).label)
        );
        list.append(item);
    });
    waypointsBox.append(list);
}

function summary(track) {
    const items = [
        ['Distanza', `${formatKm(track.distance_km)} km`],
        ['D+', track.elevation_gain_m == null ? null : `${track.elevation_gain_m} m`],
        ['D−', track.elevation_loss_m == null ? null : `${track.elevation_loss_m} m`],
        [
            'Quota',
            track.min_elevation_m == null || track.max_elevation_m == null ? null : `${track.min_elevation_m}–${track.max_elevation_m} m`
        ]
    ].filter(([, value]) => value);
    const list = el('dl', 'grid grid-cols-2 gap-2 sm:grid-cols-4');
    items.forEach(([label, value]) => {
        const cell = el('div', 'rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2');
        cell.append(el('dt', 'text-xs text-slate-400', label), el('dd', 'text-base font-semibold tabular-nums text-white', value));
        list.append(cell);
    });
    return list;
}

function formatKm(value) {
    return Number(value).toLocaleString('it-IT', { maximumFractionDigits: 1 });
}

function formatDate(dateKey) {
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function note(text) {
    return el('p', 'text-sm text-slate-500', text);
}

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null && text !== '') element.textContent = text;
    return element;
}
