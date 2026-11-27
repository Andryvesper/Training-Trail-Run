// Grafici SVG leggeri per la dashboard: linee con mirino e barre con
// tooltip per barra. Ogni grafico ha una tabella dati consultabile.
// Colori: palette categoriale validata per il tema scuro (#0f172a).

export const CHART_COLORS = Object.freeze({
    blue: '#3987e5',
    orange: '#d95926',
    aqua: '#199e70'
});

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = Object.freeze({ top: 14, right: 16, bottom: 26, left: 44 });
const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID = '#1e293b';
const AXIS_TEXT = '#94a3b8';

export function renderLineChart(
    container,
    { title, description, dates, series, valueFormat = value => String(value), zeroLine = false, xLabel = 'Data' }
) {
    const visible = series.filter(item => item.values.some(value => value !== null));
    const card = chartCard(title, description);
    container.append(card.root);
    if (!visible.length || dates.length < 2) {
        card.body.append(textNode('p', 'text-sm text-slate-500', 'Dati non sufficienti per il grafico.'));
        return;
    }
    if (visible.length > 1) card.body.append(legend(visible));

    const allValues = visible.flatMap(item => item.values).filter(value => value !== null);
    const [minY, maxY] = niceRange(Math.min(...allValues, zeroLine ? 0 : Infinity), Math.max(...allValues, zeroLine ? 0 : -Infinity));
    const x = index => MARGIN.left + (index * (WIDTH - MARGIN.left - MARGIN.right)) / Math.max(1, dates.length - 1);
    const y = value => MARGIN.top + ((maxY - value) * (HEIGHT - MARGIN.top - MARGIN.bottom)) / (maxY - minY || 1);

    const { wrapper, svg, tooltip } = chartFrame(title);
    drawYAxis(svg, minY, maxY, y, valueFormat);
    drawXLabels(svg, dates, x, formatShortDate);
    if (zeroLine && minY < 0 && maxY > 0) {
        svg.append(
            svgNode('line', { x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: y(0), y2: y(0), stroke: AXIS_TEXT, 'stroke-width': 1 })
        );
    }
    visible.forEach(item => {
        svg.append(
            svgNode('path', {
                d: linePath(item.values, x, y),
                fill: 'none',
                stroke: item.color,
                'stroke-width': 2,
                'stroke-linejoin': 'round',
                'stroke-linecap': 'round'
            })
        );
    });
    if (visible.length > 1) drawEndLabels(svg, visible, x, y);

    const crosshair = svgNode('line', {
        y1: MARGIN.top,
        y2: HEIGHT - MARGIN.bottom,
        stroke: AXIS_TEXT,
        'stroke-width': 1,
        visibility: 'hidden'
    });
    const markers = visible.map(item =>
        svgNode('circle', { r: 4, fill: item.color, stroke: '#0f172a', 'stroke-width': 2, visibility: 'hidden' })
    );
    svg.append(crosshair, ...markers);
    const overlay = svgNode('rect', {
        x: MARGIN.left,
        y: MARGIN.top,
        width: WIDTH - MARGIN.left - MARGIN.right,
        height: HEIGHT - MARGIN.top - MARGIN.bottom,
        fill: 'transparent'
    });
    svg.append(overlay);
    const hide = () => {
        crosshair.setAttribute('visibility', 'hidden');
        markers.forEach(marker => marker.setAttribute('visibility', 'hidden'));
        tooltip.hidden = true;
    };
    overlay.addEventListener('pointermove', event => {
        const index = nearestIndex(svg, event, dates.length, x);
        crosshair.setAttribute('x1', x(index));
        crosshair.setAttribute('x2', x(index));
        crosshair.setAttribute('visibility', 'visible');
        const rows = [];
        visible.forEach((item, seriesIndex) => {
            const value = item.values[index];
            const marker = markers[seriesIndex];
            if (value === null) {
                marker.setAttribute('visibility', 'hidden');
                return;
            }
            marker.setAttribute('cx', x(index));
            marker.setAttribute('cy', y(value));
            marker.setAttribute('visibility', 'visible');
            rows.push([item.label, valueFormat(value), item.color]);
        });
        showTooltip(tooltip, wrapper, svg, x(index), formatLongDate(dates[index]), rows);
    });
    overlay.addEventListener('pointerleave', hide);
    card.body.append(wrapper);
    card.body.append(
        dataTable(
            [xLabel, ...visible.map(item => item.label)],
            dates.map((date, index) => [
                formatLongDate(date),
                ...visible.map(item => (item.values[index] === null ? '—' : valueFormat(item.values[index])))
            ])
        )
    );
}

export function renderBarChart(
    container,
    {
        title,
        description,
        labels,
        values,
        color,
        valueFormat = value => String(value),
        labelFormat = formatShortDate,
        tooltipLabel = label => label,
        extraTooltip = () => []
    }
) {
    const card = chartCard(title, description);
    container.append(card.root);
    if (!values.some(value => value > 0)) {
        card.body.append(textNode('p', 'text-sm text-slate-500', 'Nessun dato nel periodo.'));
        return;
    }
    const [, maxY] = niceRange(0, Math.max(...values));
    const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
    const slot = plotWidth / values.length;
    const barWidth = Math.max(2, slot - 2);
    const y = value => MARGIN.top + ((maxY - value) * (HEIGHT - MARGIN.top - MARGIN.bottom)) / (maxY || 1);
    const x = index => MARGIN.left + index * slot + slot / 2;

    const { wrapper, svg, tooltip } = chartFrame(title);
    drawYAxis(svg, 0, maxY, y, valueFormat);
    drawXLabels(svg, labels, x, labelFormat);
    const baseline = y(0);
    values.forEach((value, index) => {
        if (value > 0) {
            const top = y(value);
            const radius = Math.min(4, barWidth / 2, baseline - top);
            svg.append(
                svgNode('path', {
                    d: roundedTopBar(x(index) - barWidth / 2, top, barWidth, baseline - top, radius),
                    fill: color
                })
            );
        }
        const hit = svgNode('rect', {
            x: MARGIN.left + index * slot,
            y: MARGIN.top,
            width: slot,
            height: HEIGHT - MARGIN.top - MARGIN.bottom,
            fill: 'transparent'
        });
        hit.addEventListener('pointerenter', () => {
            showTooltip(tooltip, wrapper, svg, x(index), tooltipLabel(labels[index]), [
                [title, valueFormat(value), color],
                ...extraTooltip(index)
            ]);
        });
        hit.addEventListener('pointerleave', () => {
            tooltip.hidden = true;
        });
        svg.append(hit);
    });
    card.body.append(wrapper);
    card.body.append(
        dataTable(
            ['Periodo', title],
            labels.map((label, index) => [tooltipLabel(label), valueFormat(values[index])])
        )
    );
}

function chartCard(title, description) {
    const root = textNode('section', 'space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5');
    const header = textNode('div', '');
    header.append(textNode('h4', 'text-sm font-semibold text-white', title));
    if (description) header.append(textNode('p', 'mt-1 text-xs text-slate-400', description));
    const body = textNode('div', 'space-y-3');
    root.append(header, body);
    return { root, body };
}

function chartFrame(title) {
    const wrapper = textNode('div', 'relative');
    const svg = svgNode('svg', {
        viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
        role: 'img',
        'aria-label': title,
        class: 'block h-auto w-full touch-pan-y select-none'
    });
    const tooltip = textNode(
        'div',
        'pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-slate-700 bg-slate-950/95 p-2 text-xs text-slate-200 shadow-lg'
    );
    tooltip.hidden = true;
    wrapper.append(svg, tooltip);
    return { wrapper, svg, tooltip };
}

function legend(series) {
    const list = textNode('ul', 'flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300');
    series.forEach(item => {
        const entry = textNode('li', 'flex items-center gap-1.5');
        const swatch = textNode('span', 'inline-block h-0.5 w-4 rounded');
        swatch.style.backgroundColor = item.color;
        entry.append(swatch, document.createTextNode(item.label));
        list.append(entry);
    });
    return list;
}

function dataTable(headers, rows) {
    const details = textNode('details', 'text-xs text-slate-400');
    details.append(textNode('summary', 'min-h-11 cursor-pointer py-2', 'Mostra i dati in tabella'));
    const scroller = textNode('div', 'max-h-64 overflow-auto');
    const table = textNode('table', 'w-full text-left');
    const head = textNode('tr', '');
    headers.forEach(header => head.append(textNode('th', 'px-2 py-1 font-semibold text-slate-300', header)));
    table.append(head);
    rows.forEach(row => {
        const line = textNode('tr', 'border-t border-slate-800');
        row.forEach(cell => line.append(textNode('td', 'px-2 py-1 tabular-nums', cell)));
        table.append(line);
    });
    scroller.append(table);
    details.append(scroller);
    return details;
}

function drawYAxis(svg, minY, maxY, y, format) {
    const steps = 4;
    for (let step = 0; step <= steps; step += 1) {
        const value = minY + ((maxY - minY) * step) / steps;
        svg.append(
            svgNode('line', { x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: y(value), y2: y(value), stroke: GRID, 'stroke-width': 1 })
        );
        svg.append(
            svgNode(
                'text',
                {
                    x: MARGIN.left - 6,
                    y: y(value) + 4,
                    fill: AXIS_TEXT,
                    'font-size': 11,
                    'text-anchor': 'end'
                },
                format(Math.round(value * 10) / 10)
            )
        );
    }
}

function drawXLabels(svg, labels, x, format) {
    const indexes = [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])];
    indexes.forEach(index => {
        svg.append(
            svgNode(
                'text',
                {
                    x: x(index),
                    y: HEIGHT - 6,
                    fill: AXIS_TEXT,
                    'font-size': 11,
                    'text-anchor': index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'
                },
                format(labels[index])
            )
        );
    });
}

function showTooltip(tooltip, wrapper, svg, plotX, heading, rows) {
    tooltip.replaceChildren(textNode('p', 'mb-1 font-semibold text-white', heading));
    rows.forEach(([label, value, color]) => {
        const row = textNode('p', 'flex items-center justify-between gap-3');
        const name = textNode('span', 'flex items-center gap-1.5 text-slate-300');
        const swatch = textNode('span', 'inline-block h-2 w-2 rounded-full');
        swatch.style.backgroundColor = color || 'transparent';
        name.append(swatch, document.createTextNode(label));
        row.append(name, textNode('span', 'font-semibold tabular-nums text-white', value));
        tooltip.append(row);
    });
    tooltip.hidden = false;
    const scale = svg.getBoundingClientRect().width / WIDTH;
    const left = plotX * scale;
    const width = tooltip.offsetWidth;
    const maxLeft = wrapper.clientWidth - width;
    tooltip.style.left = `${Math.max(0, Math.min(maxLeft, left + 12 > maxLeft ? left - width - 12 : left + 12))}px`;
}

function nearestIndex(svg, event, count, x) {
    const rect = svg.getBoundingClientRect();
    const plotX = ((event.clientX - rect.left) * WIDTH) / rect.width;
    let best = 0;
    for (let index = 1; index < count; index += 1) {
        if (Math.abs(x(index) - plotX) < Math.abs(x(best) - plotX)) best = index;
    }
    return best;
}

function linePath(values, x, y) {
    let path = '';
    let drawing = false;
    values.forEach((value, index) => {
        if (value === null) {
            drawing = false;
            return;
        }
        path += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
        drawing = true;
    });
    return path;
}

// Etichette dirette a fine linea, distanziate di almeno 13px in verticale
// perché non si sovrappongano quando le serie terminano vicine.
function drawEndLabels(svg, series, x, y) {
    const labels = series
        .map(item => ({ item, index: lastValueIndex(item.values) }))
        .filter(({ index }) => index >= 0)
        .map(({ item, index }) => ({ text: item.label, x: x(index), y: y(item.values[index]) - 6 }))
        .sort((left, right) => left.y - right.y);
    for (let index = 1; index < labels.length; index += 1) {
        labels[index].y = Math.max(labels[index].y, labels[index - 1].y + 13);
    }
    labels.forEach(label => {
        svg.append(
            svgNode(
                'text',
                {
                    x: Math.min(label.x - 4, WIDTH - MARGIN.right),
                    y: Math.max(MARGIN.top + 10, Math.min(label.y, HEIGHT - MARGIN.bottom - 2)),
                    fill: '#e2e8f0',
                    'font-size': 11,
                    'text-anchor': 'end',
                    stroke: '#0f172a',
                    'stroke-width': 3,
                    'paint-order': 'stroke'
                },
                label.text
            )
        );
    });
}

function lastValueIndex(values) {
    for (let index = values.length - 1; index >= 0; index -= 1) {
        if (values[index] !== null) return index;
    }
    return -1;
}

function roundedTopBar(left, top, width, height, radius) {
    const r = Math.max(0, radius);
    return `M${left},${top + height}V${top + r}Q${left},${top} ${left + r},${top}H${left + width - r}Q${left + width},${top} ${left + width},${top + r}V${top + height}Z`;
}

export function niceRange(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) return [min - 1, max + 1];
    const span = max - min;
    const step = niceStep(span / 4);
    return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

function niceStep(raw) {
    const power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / power;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return nice * power;
}

function formatShortDate(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return String(dateKey);
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function formatLongDate(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return String(dateKey);
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
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
