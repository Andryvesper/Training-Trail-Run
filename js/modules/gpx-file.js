// Lettura e scrittura di file GPX 1.0/1.1. Funzioni pure (niente DOM): girano
// anche nei test Node. Il GPX ha una struttura semplice e regolare, quindi
// basta un lettore a espressioni regolari per punti traccia, punti percorso e
// waypoint, compresi prefissi di namespace (es. <gpx:trkpt>).

export const MAX_GPX_FILE_BYTES = 25 * 1024 * 1024;
// Quote fuori da questo intervallo (errori di unità o del GPS) valgono come mancanti.
// Coincide con i vincoli della tabella gpx_tracks.
const MIN_ELEVATION_M = -500;
const MAX_ELEVATION_M = 9000;

const POINT_PATTERN = /<(?:[\w-]+:)?(trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?\1\s*>)/g;

/**
 * Legge il testo di un file GPX.
 * @param {string} text
 * @returns {{ name: string|null, points: {lat:number, lon:number, ele:number|null}[], waypoints: {lat:number, lon:number, ele:number|null, name:string|null, description:string|null, symbol:string|null, type:string|null}[] }}
 */
export function parseGpx(text) {
    const source = String(text ?? '');
    if (!/<(?:[\w-]+:)?gpx\b/.test(source)) throw new Error('Il file non è un GPX valido.');

    const trackPoints = [];
    const routePoints = [];
    const waypoints = [];
    for (const match of source.matchAll(POINT_PATTERN)) {
        const [, tag, attributes, body = ''] = match;
        const lat = Number(attribute(attributes, 'lat'));
        const lon = Number(attribute(attributes, 'lon'));
        if (!isValidCoordinate(lat, lon)) continue;
        const eleText = childText(body, 'ele');
        const ele = eleText === null || eleText === '' ? null : Number(eleText);
        const point = { lat, lon, ele: Number.isFinite(ele) && ele >= MIN_ELEVATION_M && ele <= MAX_ELEVATION_M ? ele : null };
        if (tag === 'trkpt') trackPoints.push(point);
        else if (tag === 'rtept') routePoints.push(point);
        else {
            waypoints.push({
                ...point,
                name: childText(body, 'name'),
                description: childText(body, 'desc') ?? childText(body, 'cmt'),
                symbol: childText(body, 'sym'),
                type: childText(body, 'type')
            });
        }
    }

    // Una traccia registrata prevale sul percorso pianificato (rte), se ci sono entrambi.
    const points = trackPoints.length >= 2 ? trackPoints : routePoints;
    if (points.length < 2) throw new Error('Il file GPX non contiene una traccia (servono almeno 2 punti).');

    return { name: documentName(source), points, waypoints };
}

/**
 * Crea un GPX 1.1 con la traccia e i punti personalizzati.
 * @param {{ name: string, points: [number, number, number|null][], waypoints?: {lat:number, lon:number, ele?:number|null, name:string, description?:string|null, symbol?:string|null, type?:string|null}[] }} track
 */
export function buildGpx({ name, points, waypoints = [] }) {
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="Training Trail Run" xmlns="http://www.topografix.com/GPX/1/1">',
        `  <metadata><name>${escapeXml(name)}</name></metadata>`
    ];
    waypoints.forEach(point => {
        lines.push(`  <wpt lat="${point.lat.toFixed(6)}" lon="${point.lon.toFixed(6)}">`);
        if (Number.isFinite(point.ele)) lines.push(`    <ele>${point.ele.toFixed(1)}</ele>`);
        lines.push(`    <name>${escapeXml(point.name)}</name>`);
        if (point.description) lines.push(`    <desc>${escapeXml(point.description)}</desc>`);
        if (point.symbol) lines.push(`    <sym>${escapeXml(point.symbol)}</sym>`);
        if (point.type) lines.push(`    <type>${escapeXml(point.type)}</type>`);
        lines.push('  </wpt>');
    });
    lines.push('  <trk>', `    <name>${escapeXml(name)}</name>`, '    <trkseg>');
    points.forEach(([lat, lon, ele]) => {
        lines.push(
            Number.isFinite(ele)
                ? `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
                : `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`
        );
    });
    lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
    return lines.join('\n');
}

export function gpxFileName(name) {
    const slug = String(name ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return `${slug || 'traccia'}.gpx`;
}

// Solo browser: Blob + ancora temporanea (come l'esportazione del calendario).
export function downloadGpx(content, fileName) {
    const blob = new Blob([content], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function documentName(source) {
    // Nome dei metadati, altrimenti della prima traccia o del primo percorso.
    const metadata = /<(?:[\w-]+:)?metadata\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?metadata\s*>/.exec(source);
    const fromMetadata = metadata ? childText(metadata[1], 'name') : null;
    if (fromMetadata) return fromMetadata;
    const container = /<(?:[\w-]+:)?(trk|rte)\b[^>]*>([\s\S]*?)<(?:[\w-]+:)?(?:trkseg|rtept|trkpt)\b/.exec(source);
    return container ? childText(container[2], 'name') : null;
}

function attribute(attributes, name) {
    const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attributes);
    return match ? (match[2] ?? match[3]) : null;
}

// Un'espressione per tag, creata una volta sola: childText gira per ogni punto.
const CHILD_PATTERNS = new Map();

function childText(body, tag) {
    if (!CHILD_PATTERNS.has(tag)) {
        CHILD_PATTERNS.set(tag, new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}\\s*>`));
    }
    const match = CHILD_PATTERNS.get(tag).exec(body);
    if (!match) return null;
    const text = decodeXml(match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim();
    return text || null;
}

function isValidCoordinate(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function decodeXml(text) {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, decimal) => safeCodePoint(Number(decimal)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

// Solo caratteri ammessi in XML 1.0: niente controlli, surrogati isolati, U+FFFE/U+FFFF.
function isXmlCodePoint(code) {
    return (
        Number.isInteger(code) &&
        (code === 0x9 ||
            code === 0xa ||
            code === 0xd ||
            (code >= 0x20 && code <= 0xd7ff) ||
            (code >= 0xe000 && code <= 0xfffd) ||
            (code >= 0x10000 && code <= 0x10ffff))
    );
}

function safeCodePoint(code) {
    return isXmlCodePoint(code) ? String.fromCodePoint(code) : '';
}

function escapeXml(text) {
    // Array.from scorre per code point: un surrogato isolato resta un elemento a sé e viene scartato.
    return Array.from(String(text ?? ''), char => (isXmlCodePoint(char.codePointAt(0)) ? char : ''))
        .join('')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
