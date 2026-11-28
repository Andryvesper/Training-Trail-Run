// Mappa di un percorso (traccia GPX o percorso GPS di un'attività) con Leaflet.
// Leaflet è in vendor/ e si carica solo quando serve una mappa. Le tile
// arrivano da OpenTopoMap (curve di livello, utile per il trail) o da
// OpenStreetMap: sono gli unici domini esterni ammessi in img-src dalla CSP.
// Nessuno stile inline nell'HTML (la CSP lo blocca): i colori dei punti si
// impostano da JavaScript sugli elementi.

const LEAFLET_BASE = new URL('../../vendor/leaflet-1.9.4/', import.meta.url);
const OSM_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
const TILE_LAYERS = Object.freeze([
    {
        name: 'Topografica (OpenTopoMap)',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        options: {
            subdomains: 'abc',
            maxZoom: 17,
            attribution: `Mappa &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA) · Dati ${OSM_ATTRIBUTION}`
        }
    },
    {
        name: 'Stradale (OpenStreetMap)',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: { maxZoom: 19, attribution: OSM_ATTRIBUTION }
    }
]);
const TRACK_COLOR = '#c084fc';
const TRACK_HALO = '#0f172a';
const MAX_DRAWN_POINTS = 5000;

let leafletPromise = null;

/** Carica Leaflet (script e foglio di stile) una sola volta. */
export function loadLeaflet() {
    if (window.L?.map) return Promise.resolve(window.L);
    leafletPromise ??= new Promise((resolve, reject) => {
        const fail = () => {
            leafletPromise = null;
            reject(new Error('libreria della mappa non caricata'));
        };
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('leaflet.css', LEAFLET_BASE).href;
        const styleLoaded = new Promise((done, error) => {
            link.onload = done;
            link.onerror = error;
        });
        const script = document.createElement('script');
        script.src = new URL('leaflet.js', LEAFLET_BASE).href;
        const scriptLoaded = new Promise((done, error) => {
            script.onload = done;
            script.onerror = error;
        });
        document.head.append(link, script);
        Promise.all([styleLoaded, scriptLoaded]).then(() => (window.L?.map ? resolve(window.L) : fail()), fail);
    });
    return leafletPromise;
}

/**
 * Riduce i punti da disegnare tenendo sempre il primo e l'ultimo.
 * @param {[number, number][]} points
 */
export function thinLatLngs(points, max = MAX_DRAWN_POINTS) {
    if (points.length <= max) return points;
    const step = (points.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

/** Partenza e arrivo coincidono (entro 200 m): percorso ad anello. */
export function isLoop(points, toleranceM = 200) {
    if (points.length < 2) return false;
    const [lat1, lon1] = points[0];
    const [lat2, lon2] = points[points.length - 1];
    const cosLat = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    const dy = (lat2 - lat1) * 111320;
    const dx = (lon2 - lon1) * 111320 * cosLat;
    return Math.hypot(dx, dy) <= toleranceM;
}

/**
 * Disegna la mappa nel contenitore.
 * @param {HTMLElement} container
 * @param {{ points: [number, number][], markers?: { lat: number, lon: number, label: string, title: string, color: string }[], label?: string }} options
 * @returns {Promise<{ remove: () => void }>}
 */
export async function renderTrackMap(container, { points, markers = [], label = 'Mappa del percorso' }) {
    const L = await loadLeaflet();
    const element = document.createElement('div');
    element.className = 'track-map isolate h-80 w-full overflow-hidden rounded-xl border border-slate-800 sm:h-[28rem]';
    element.setAttribute('role', 'region');
    element.setAttribute('aria-label', label);
    container.append(element);

    // La rotella zooma solo dopo un clic sulla mappa: altrimenti scorrere la pagina la "cattura".
    const map = L.map(element, { scrollWheelZoom: false, zoomSnap: 0.5 });
    const layers = TILE_LAYERS.map(layer => L.tileLayer(layer.url, layer.options));
    layers[0].addTo(map);
    L.control
        .layers(Object.fromEntries(TILE_LAYERS.map((layer, index) => [layer.name, layers[index]])), null, { collapsed: true })
        .addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.on('click', () => map.scrollWheelZoom.enable());
    element.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());

    const drawn = thinLatLngs(points);
    L.polyline(drawn, { color: TRACK_HALO, weight: 7, opacity: 0.55, interactive: false }).addTo(map);
    const line = L.polyline(drawn, { color: TRACK_COLOR, weight: 4, opacity: 0.95, interactive: false }).addTo(map);

    const loop = isLoop(points);
    const pin = (latLng, text, title, color) =>
        L.marker(latLng, { icon: pinIcon(L, text, color), title, keyboard: true, riseOnHover: true })
            .bindTooltip(title, { direction: 'top', offset: [0, -12] })
            .addTo(map);
    if (!loop) pin(points[points.length - 1], 'A', 'Arrivo', '#e2e8f0');
    pin(points[0], loop ? 'P/A' : 'P', loop ? 'Partenza e arrivo' : 'Partenza', '#e2e8f0');
    markers.forEach(marker => pin([marker.lat, marker.lon], marker.label, marker.title, marker.color));

    map.fitBounds(line.getBounds(), { padding: [24, 24] });
    // Nel dialog la dimensione finale arriva dopo l'apertura.
    requestAnimationFrame(() => map.invalidateSize());
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(element);

    return {
        remove() {
            resize.disconnect();
            map.remove();
        }
    };
}

function pinIcon(L, text, color) {
    const html = document.createElement('span');
    html.className =
        'flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-slate-900 px-1 text-[10px] font-bold text-slate-900 shadow';
    html.style.backgroundColor = color;
    html.textContent = text;
    return L.divIcon({ html, className: 'track-map-pin', iconSize: [24, 24], iconAnchor: [12, 12] });
}
