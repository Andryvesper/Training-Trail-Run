// Service worker minimo: rende l'app installabile.
// Strategia "prima la rete": ogni deploy arriva subito. La cache serve solo
// quando la rete manca, per mostrare almeno la struttura dell'app.
// Le richieste verso altri domini (Supabase, Intervals.icu, CDN) non passano di qui.
const CACHE = 'ttr-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            // Solo risposte complete dello stesso sito: una 206 parziale fa fallire cache.put.
            if (response.status === 200 && response.type === 'basic') {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
            if (cached) return cached;
            throw error;
        }
    })());
});
