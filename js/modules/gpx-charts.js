// Grafici SVG per le tracce GPX: profilo altimetrico colorato per pendenza,
// forma del percorso (senza mappa di sfondo: la CSP non ammette tile esterne)
// e distribuzione delle pendenze. Stesso stile dei grafici della dashboard.
//
// Colori delle pendenze: scala divergente blu (discesa) / rosso (salita) con
// grigio neutro in pianura; ogni braccio è validato come rampa ordinata sul
// fondo scuro #0f172a (più ripido = più chiaro).

import { bucketFor, GRADE_BUCKETS, GRID_STEP_M } from './gpx-analysis.js';
import { niceRange } from './dashboard-charts.js';
import { waypointKind } from './gpx-tracks.js';

export const GRADE_COLORS = Object.freeze({
    'down-steep': '#b6d5f8',
    'down-hard': '#6aabf1',
    'down-mid': '#338ced',
    'down-soft': '#1b64be',
    flat: '#4b5563',
    'up-soft': '#a33435',
    'up-mid': '#c93d3e',
    'up-hard': '#eb6263',
    'up-steep': '#f4a3a3'
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID = '#1e293b';
const AXIS_TEXT = '#94a3b8';
const SURFACE = '#0f172a';
const LINE = '#e2e8f0';
const PROFILE = Object.freeze({ width: 720, height: 260, top: 30, right: 16, bottom: 28, left: 52 });
const MAX_DRAWN_SAMPLES = 720;

/**
 * Profilo altimetrico interattivo.
 * @param {HTMLElement} container
 * @param {ReturnType<import('./gpx-analysis.js').analyzeTrack>} analysis
 * @param {{ kind: string, name: string, km: number }[]} waypoints ordinati per km
 * @param {{ onHover?: (index: number|null) => void, onPick?: (km: number) => void }} [handlers]
 */
export function renderElevationProfile(container, analysis, waypoints, { onHover = () => {}, onPick = () => {} } = {}) {
    const { profile } = analysis;
    if (!analysis.hasElevation) {
        container.append(textNode('p', 'text-sm text-slate-500', 'Il file non contiene quote: profilo altimetrico non disponibile.'));
        return;
    }
    const { width, height, top, right, bottom, left } = PROFILE;
    const totalKm = profile.totalM / 1000;
    const indexes = drawnIndexes(profile.distances.length);
    const elevations = profile.elevations;
    const [minEle, maxEle] = extent(elevations);
    const padding = Math.max(10, (maxEle - minEle) * 0.08);
    const [minY, maxY] = niceRange(minEle - padding, maxEle + padding);
    const x = km => left + (km / totalKm) * (width - left - right);
    const y = value => top + ((maxY - value) * (height - top - bottom)) / (maxY - minY || 1);
    const baseline = height - bottom;

    const wrapper = textNode('div', 'relative');
    const svg = svgNode('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': `Profilo altimetrico: da ${Math.round(minEle)} a ${Math.round(maxEle)} m su ${formatNumber(totalKm, 1)} km`,
        class: 'block h-auto w-full touch-pan-y select-none'
    });
    const tooltip = textNode(
        'div',
        'pointer-events-none absolute top-0 z-10 min-w-44 rounded-lg border border-slate-700 bg-slate-950/95 p-2 text-xs text-slate-200 shadow-lg'
    );
    tooltip.hidden = true;
    wrapper.append(svg, tooltip);

    // Griglia e assi.
    for (let step = 0; step <= 4; step += 1) {
        const value = minY + ((maxY - minY) * step) / 4;
        svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), stroke: GRID, 'stroke-width': 1 }));
        svg.append(
            svgNode(
                'text',
                { x: left - 6, y: y(value) + 4, fill: AXIS_TEXT, 'font-size': 11, 'text-anchor': 'end' },
                `${Math.round(value)} m`
            )
        );
    }
    kmTicks(totalKm).forEach(km => {
        svg.append(
            svgNode(
                'text',
                {
                    x: x(km),
                    y: height - 8,
                    fill: AXIS_TEXT,
                    'font-size': 11,
                    'text-anchor': km === 0 ? 'start' : km >= totalKm ? 'end' : 'middle'
                },
                `${formatNumber(km, 1)} km`
            )
        );
    });

    // Riempimento a fasce di pendenza, unendo i campioni consecutivi della stessa fascia.
    let runStart = 0;
    for (let position = 1; position <= indexes.length - 1; position += 1) {
        const bucket = displayBucket(profile, indexes[position - 1], indexes[position]);
        const nextBucket = position < indexes.length - 1 ? displayBucket(profile, indexes[position], indexes[position + 1]) : null;
        if (bucket === nextBucket) continue;
        const run = indexes.slice(runStart, position + 1);
        const topLine = run.map(index => `${x(profile.distances[index] / 1000).toFixed(1)},${y(elevations[index]).toFixed(1)}`);
        svg.append(
            svgNode('path', {
                d: `M${topLine[0].split(',')[0]},${baseline}L${topLine.join('L')}L${topLine.at(-1).split(',')[0]},${baseline}Z`,
                fill: GRADE_COLORS[bucket],
                // Bordo dello stesso colore: copre le giunture tra fasce vicine.
                stroke: GRADE_COLORS[bucket],
                'stroke-width': 0.8
            })
        );
        runStart = position;
    }
    svg.append(
        svgNode('path', {
            d: indexes
                .map(
                    (index, position) =>
                        `${position ? 'L' : 'M'}${x(profile.distances[index] / 1000).toFixed(1)},${y(elevations[index]).toFixed(1)}`
                )
                .join(''),
            fill: 'none',
            stroke: LINE,
            'stroke-width': 1.5,
            'stroke-linejoin': 'round'
        })
    );

    // Punti personalizzati: linea verticale e numero (lo stesso dell'elenco).
    waypoints.forEach((waypoint, position) => {
        const kind = waypointKind(waypoint.kind);
        const px = x(Math.min(waypoint.km, totalKm));
        const index = sampleIndex(profile, waypoint.km);
        svg.append(
            svgNode('line', {
                x1: px,
                x2: px,
                y1: 20,
                y2: y(elevations[index] ?? minEle),
                stroke: kind.color,
                'stroke-width': 1.5,
                'stroke-dasharray': '3 3'
            })
        );
        svg.append(svgNode('circle', { cx: px, cy: 12, r: 9, fill: kind.color, stroke: SURFACE, 'stroke-width': 2 }));
        svg.append(
            svgNode(
                'text',
                { x: px, y: 16, fill: SURFACE, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle' },
                String(position + 1)
            )
        );
    });

    // Mirino e tooltip.
    const crosshair = svgNode('line', { y1: top - 6, y2: baseline, stroke: AXIS_TEXT, 'stroke-width': 1, visibility: 'hidden' });
    const marker = svgNode('circle', { r: 5, fill: LINE, stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' });
    const overlay = svgNode('rect', {
        x: left,
        y: 0,
        width: width - left - right,
        height: baseline,
        fill: 'transparent',
        class: 'cursor-crosshair'
    });
    svg.append(crosshair, marker, overlay);

    const indexFromEvent = event => {
        const rect = svg.getBoundingClientRect();
        const plotX = ((event.clientX - rect.left) * width) / rect.width;
        const km = Math.max(0, Math.min(totalKm, ((plotX - left) / (width - left - right)) * totalKm));
        return sampleIndex(profile, km);
    };
    overlay.addEventListener('pointermove', event => {
        const index = indexFromEvent(event);
        const km = profile.distances[index] / 1000;
        const px = x(km);
        crosshair.setAttribute('x1', px);
        crosshair.setAttribute('x2', px);
        crosshair.setAttribute('visibility', 'visible');
        marker.setAttribute('cx', px);
        marker.setAttribute('cy', y(elevations[index]));
        marker.setAttribute('visibility', 'visible');
        const rows = [
            ['Quota', `${Math.round(elevations[index])} m`],
            ['Pendenza', `${formatSigned(profile.grades[index])}%`],
            ['D+ dalla partenza', `${Math.round(profile.cumGain[index])} m`],
            ['D- dalla partenza', `${Math.round(profile.cumLoss[index])} m`]
        ];
        const next = waypoints.find(waypoint => waypoint.km > km + 0.01);
        if (next) rows.push([`Prossimo: ${next.name}`, `tra ${formatNumber(next.km - km, 1)} km`]);
        tooltip.replaceChildren(textNode('p', 'mb-1 font-semibold text-white', `km ${formatNumber(km, 2)}`));
        rows.forEach(([label, value]) => {
            const row = textNode('p', 'flex items-center justify-between gap-3');
            row.append(textNode('span', 'text-slate-300', label), textNode('span', 'font-semibold tabular-nums text-white', value));
            tooltip.append(row);
        });
        tooltip.hidden = false;
        const scale = svg.getBoundingClientRect().width / width;
        const tooltipWidth = tooltip.offsetWidth;
        const maxLeft = wrapper.clientWidth - tooltipWidth;
        const plotLeft = px * scale;
        tooltip.style.left = `${Math.max(0, Math.min(maxLeft, plotLeft + 12 > maxLeft ? plotLeft - tooltipWidth - 12 : plotLeft + 12))}px`;
        onHover(index);
    });
    overlay.addEventListener('pointerleave', () => {
        crosshair.setAttribute('visibility', 'hidden');
        marker.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
        onHover(null);
    });
    overlay.addEventListener('click', event => onPick(Math.round(profile.distances[indexFromEvent(event)]) / 1000));

    container.append(wrapper, gradeLegend());
}

/**
 * Forma del percorso in pianta (nord in alto), con partenza, arrivo e punti.
 * @returns {{ setCursor: (index: number|null) => void }}
 */
export function renderTrackShape(container, analysis, waypoints) {
    const { profile } = analysis;
    const [minLat, maxLat] = extent(profile.lats);
    const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const projected = profile.lats.map((lat, index) => [profile.lons[index] * cosLat, -lat]);
    const [minX, maxX] = extent(projected.map(point => point[0]));
    const [minY, maxY] = extent(projected.map(point => point[1]));
    const spanX = Math.max(1e-9, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);
    const width = 400;
    const pad = 16;
    const height = Math.round(Math.min(400, Math.max(180, (width - pad * 2) * (spanY / spanX) + pad * 2)));
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const toSvg = index => [offsetX + (projected[index][0] - minX) * scale, offsetY + (projected[index][1] - minY) * scale];

    const svg = svgNode('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': 'Forma del percorso con partenza, arrivo e punti personalizzati',
        class: 'mx-auto block h-auto w-full max-w-md'
    });
    const indexes = drawnIndexes(profile.distances.length, 1500);
    svg.append(
        svgNode('path', {
            d: indexes
                .map((index, position) => {
                    const [px, py] = toSvg(index);
                    return `${position ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
                })
                .join(''),
            fill: 'none',
            stroke: '#c084fc',
            'stroke-width': 2.5,
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round'
        })
    );

    const lastIndex = profile.distances.length - 1;
    const drawEnd = (index, label, color) => {
        const [px, py] = toSvg(index);
        svg.append(svgNode('circle', { cx: px, cy: py, r: 8, fill: color, stroke: SURFACE, 'stroke-width': 2 }));
        svg.append(
            svgNode('text', { x: px, y: py + 4, fill: SURFACE, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle' }, label)
        );
    };
    if (!analysis.summary.isLoop) drawEnd(lastIndex, 'A', '#e2e8f0');
    drawEnd(0, analysis.summary.isLoop ? 'P/A' : 'P', '#e2e8f0');

    waypoints.forEach((waypoint, position) => {
        const index = sampleIndex(profile, waypoint.km);
        const [px, py] = toSvg(index);
        svg.append(
            svgNode('circle', { cx: px, cy: py, r: 8, fill: waypointKind(waypoint.kind).color, stroke: SURFACE, 'stroke-width': 2 })
        );
        svg.append(
            svgNode(
                'text',
                { x: px, y: py + 3.5, fill: SURFACE, 'font-size': 9, 'font-weight': 700, 'text-anchor': 'middle' },
                String(position + 1)
            )
        );
    });

    const cursor = svgNode('circle', { r: 6, fill: '#ffffff', stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' });
    svg.append(cursor);
    container.append(svg);

    return {
        setCursor(index) {
            if (index === null || index === undefined) {
                cursor.setAttribute('visibility', 'hidden');
                return;
            }
            const [px, py] = toSvg(index);
            cursor.setAttribute('cx', px);
            cursor.setAttribute('cy', py);
            cursor.setAttribute('visibility', 'visible');
        }
    };
}

/** Distribuzione della distanza per fascia di pendenza (barre orizzontali). */
export function renderGradeDistribution(container, distribution) {
    const list = textNode('ul', 'space-y-2');
    distribution.forEach(bucket => {
        const item = textNode('li', 'grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[10rem_1fr_auto]');
        const label = textNode('span', 'flex items-center gap-2 text-slate-300');
        const swatch = textNode('span', 'inline-block h-2.5 w-2.5 shrink-0 rounded-sm');
        swatch.style.backgroundColor = GRADE_COLORS[bucket.key];
        label.append(swatch, document.createTextNode(bucket.label));
        const track = textNode('span', 'h-3 overflow-hidden rounded bg-slate-800');
        const bar = textNode('span', 'block h-full rounded');
        bar.style.width = `${Math.min(100, bucket.share)}%`;
        bar.style.backgroundColor = GRADE_COLORS[bucket.key];
        track.append(bar);
        const value = textNode(
            'span',
            'tabular-nums text-slate-300',
            `${formatNumber(bucket.km, 2)} km · ${formatNumber(bucket.share, 1)}%`
        );
        item.append(label, track, value);
        list.append(item);
    });
    container.append(list);
}

function gradeLegend() {
    const list = textNode('ul', 'flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400');
    list.setAttribute('aria-label', 'Legenda delle pendenze');
    GRADE_BUCKETS.forEach(bucket => {
        const entry = textNode('li', 'flex items-center gap-1.5');
        const swatch = textNode('span', 'inline-block h-2.5 w-2.5 rounded-sm');
        swatch.style.backgroundColor = GRADE_COLORS[bucket.key];
        entry.append(swatch, document.createTextNode(bucket.label));
        list.append(entry);
    });
    return list;
}

// Fascia di un tratto disegnato: pendenza media tra due campioni.
function displayBucket(profile, from, to) {
    const run = profile.distances[to] - profile.distances[from];
    if (run <= 0) return bucketFor(profile.grades[from]).key;
    return bucketFor(((profile.elevations[to] - profile.elevations[from]) / run) * 100).key;
}

// Campione della griglia più vicino a un km (i campioni sono ogni GRID_STEP_M metri).
function sampleIndex(profile, km) {
    const last = profile.distances.length - 1;
    if (km * 1000 >= profile.totalM) return last;
    return Math.max(0, Math.min(last, Math.round((km * 1000) / GRID_STEP_M)));
}

// Minimo e massimo con un ciclo: Math.min(...array) supera lo stack oltre ~100k valori.
function extent(values) {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
        if (value < min) min = value;
        if (value > max) max = value;
    }
    return [min, max];
}

function drawnIndexes(count, max = MAX_DRAWN_SAMPLES) {
    const step = Math.max(1, Math.ceil(count / max));
    const indexes = [];
    for (let index = 0; index < count; index += step) indexes.push(index);
    if (indexes.at(-1) !== count - 1) indexes.push(count - 1);
    return indexes;
}

function kmTicks(totalKm) {
    const raw = totalKm / 6;
    const power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / power;
    const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
    const ticks = [];
    for (let km = 0; km < totalKm - step * 0.4; km += step) ticks.push(Math.round(km * 1000) / 1000);
    ticks.push(totalKm);
    return ticks;
}

export function formatNumber(value, digits = 1) {
    return Number(value).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatSigned(value, digits = 1) {
    const text = formatNumber(Math.abs(value), digits);
    if (value > 0) return `+${text}`;
    if (value < 0) return `−${text}`;
    return text;
}

function svgNode(tag, attributes, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
}

function textNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
