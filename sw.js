// Service worker: rende l'app installabile e mostra la struttura senza rete.
// Strategia "prima la rete": ogni deploy arriva subito. La cache serve solo
// quando la rete manca. Le richieste verso altri domini (Supabase,
// Intervals.icu) non passano di qui.
const CACHE = 'ttr-shell-v2';
const SHELL = [
    './',
    'index.html',
    'css/app.css',
    'config.js',
    'vendor/supabase-js-2.119.0.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/favicon-64.png'
];

self.addEventListener('install', event => {
    // Un file mancante non deve impedire l'installazione.
    event.waitUntil(caches.open(CACHE)
        .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
        .then(() => self.skipWaiting()));
});

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
