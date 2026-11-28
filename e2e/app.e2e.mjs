// E2E UI: Playwright (Edge di sistema) contro il repo servito in locale.
// Tutta la rete esterna e' bloccata o simulata: nessun servizio reale o dato reale.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json'
};

// Date locali (come fa l'app), sempre relative a oggi.
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = n => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return key(d);
};

const USER = { id: 'e2e-user', email: 'atleta@e2e.invalid' };
const AVAIL = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, { available: true, max_minutes: 90 }]));

const FAKE_DB = {
    profiles: [{ id: USER.id, email: USER.email, role: 'athlete' }],
    training_sessions: Array.from({ length: 12 }, (_, i) => ({
        id: `s${i + 1}`,
        user_id: USER.id,
        scheduled_date: inDays(i + 1),
        session_order: 1,
        title: `Seduta e2e ${i + 1}`,
        sport_type: 'run',
        distance_km: 8 + i,
        duration_minutes: 50,
        target_pace_seconds_per_km: 330,
        notes: null,
        intervals_activity_id: null,
        completed_at: null,
        adherence_score: null,
        completed_activity: null
    })),
    training_races: [
        {
            id: 'race1',
            user_id: USER.id,
            name: 'Dieci km e2e',
            event_date: inDays(16 * 7),
            target_period: null,
            distance_km: 10,
            elevation_gain_m: 0,
            elevation_loss_m: null,
            priority: 1,
            goal: null,
            status: 'planned'
        }
    ],
    training_planning_profiles: [
        {
            user_id: USER.id,
            updated_at: new Date().toISOString(),
            questionnaire: {
                goal_mode: 'race',
                primary_race_id: 'race1',
                self_profile: 'regular_recreational',
                consistency_status: 'consistent',
                target_running_sessions_per_week: 4,
                peak_week_proposal_mode: 'disabled',
                preferred_terrains: ['road'],
                preferred_cycle_method: 'distance_time',
                weekly_availability: AVAIL
            }
        }
    ],
    training_plan_drafts: []
};

// Sostituisce supabase-js: sessione finta e query builder in memoria.
const fakeSupabaseJs = (db, user = USER) => `(() => {
  const DB = ${JSON.stringify(db)};
  let USER = ${JSON.stringify(user)};
  function builder(table) {
    let rows = (DB[table] || []).slice();
    let mode = 'many';
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(f, v) { if (f !== 'user_id' && f !== 'id') rows = rows.filter(r => r[f] === v); return b; },
      gte(f, v) { rows = rows.filter(r => r[f] >= v); return b; },
      lte(f, v) { rows = rows.filter(r => r[f] <= v); return b; },
      insert(p) { rows = (Array.isArray(p) ? p : [p]).map((r, i) => Object.assign({ id: 'new' + (i || ''), created_at: new Date().toISOString() }, r)); return b; },
      upsert(p) { rows = [p]; return b; },
      update(p) { rows = rows.map(r => Object.assign({}, r, p)); return b; },
      delete() { return b; },
      single() { mode = 'one'; return b; },
      maybeSingle() { mode = 'maybe'; return b; },
      then(res, rej) {
        const data = mode === 'many' ? rows : (rows[0] || null);
        return Promise.resolve({ data, error: null }).then(res, rej);
      }
    };
    return b;
  }
  window.supabase = { createClient() { return {
    auth: {
      getSession: async () => ({ data: { session: { user: USER, access_token: 'e2e-token' } }, error: null }),
      signInWithPassword: async () => ({ data: { user: USER }, error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async ({ password, data }) => {
        window.__updatedPassword = password;
        USER = Object.assign({}, USER, { user_metadata: Object.assign({}, USER.user_metadata, data) });
        return { data: { user: USER }, error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    from: builder,
    rpc: async name => {
      // Stato del collegamento Intervals senza esporre la chiave (come la RPC reale).
      if (name === 'get_intervals_connection') {
        const p = (DB.profiles || [])[0] || {};
        return { data: [{ athlete_id: p.intervals_id || null, has_key: Boolean(p.intervals_key) }], error: null };
      }
      return { data: [], error: null };
    }
  }; } };
})();`;
const FAKE_SUPABASE_JS = fakeSupabaseJs(FAKE_DB);

// Intervals.icu finto: una corsa trail di ieri con stream e dinamiche di corsa.
const INTERVALS_DB = { ...FAKE_DB, profiles: [{ ...FAKE_DB.profiles[0], intervals_id: 'i0', intervals_key: 'chiave-finta' }] };
function fakeIntervals(url) {
    if (url.includes('/wellness')) {
        return Array.from({ length: 40 }, (_, i) => ({ id: inDays(-i), hrv: 60 + ((i % 5) - 2), restingHR: 48, ctl: 40, atl: 45 }));
    }
    if (url.includes('/streams')) {
        const n = 4200;
        const time = [],
            distance = [],
            altitude = [],
            heartrate = [],
            stance = [];
        for (let t = 0; t <= n; t += 1) {
            const d = t * 3;
            time.push(t);
            distance.push(d);
            altitude.push(400 + 80 * Math.sin((d / 4000) * 2 * Math.PI));
            heartrate.push(140 + (10 * t) / n);
            stance.push(245 + (15 * t) / n);
        }
        return [
            { type: 'time', data: time },
            { type: 'distance', data: distance },
            { type: 'fixed_altitude', data: altitude },
            { type: 'heartrate', data: heartrate },
            { type: 'stance_time', data: stance },
            { type: 'latlng', data: [] }
        ];
    }
    if (url.includes('/activity/i9001/intervals')) {
        return {
            id: 'i9001',
            icu_intervals: [
                { type: 'WARMUP', distance: 3000, moving_time: 1000, average_heartrate: 135, max_heartrate: 142 },
                {
                    type: 'WORK',
                    label: 'Salita',
                    distance: 6000,
                    moving_time: 2000,
                    average_heartrate: 152,
                    max_heartrate: 165,
                    total_elevation_gain: 300
                },
                { type: 'COOLDOWN', distance: 3600, moving_time: 1200, average_heartrate: 140 }
            ]
        };
    }
    if (url.includes('/activities')) {
        return [
            {
                // Oggi: sempre nella settimana in vista del calendario.
                id: 'i9001',
                name: 'Trail e2e',
                type: 'TrailRun',
                start_date_local: `${inDays(0)}T08:00:00`,
                distance: 12600,
                moving_time: 4200,
                elapsed_time: 4300,
                total_elevation_gain: 300,
                total_elevation_loss: 300,
                average_heartrate: 145,
                icu_training_load: 80,
                stream_types: ['time', 'distance', 'fixed_altitude', 'heartrate', 'stance_time', 'latlng']
            }
        ];
    }
    return [];
}

let server, baseUrl, browser;
const blockedExternal = [];
const proxiedIntervals = [];

test.before(async () => {
    server = http.createServer(async (req, res) => {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (rel === '/favicon.ico') {
            res.writeHead(204);
            res.end();
            return;
        }
        const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
        if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}.git${path.sep}`)) {
            res.writeHead(403);
            res.end();
            return;
        }
        try {
            const body = await fs.readFile(file);
            res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404);
            res.end('not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge' });
});

test.after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

// Il service worker resta bloccato nei test dell'app: le route finte devono vedere ogni richiesta.
async function openApp({
    intervals = false,
    serviceWorkers = 'block',
    viewport = { width: 1280, height: 900 },
    supabaseJs = null,
    onRoute = null,
    waitForApp = true
} = {}) {
    const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));
    await page.route('**/*', route => {
        const url = route.request().url();
        if (url.includes('/vendor/supabase-js-'))
            return route.fulfill({
                contentType: 'text/javascript',
                body: supabaseJs ?? (intervals ? fakeSupabaseJs(INTERVALS_DB) : FAKE_SUPABASE_JS)
            });
        if (url.startsWith(baseUrl)) return route.continue();
        if (onRoute?.(route)) return;
        // Proxy Supabase "intervals-proxy": la chiave resta lato server.
        if (intervals && url.includes('/functions/v1/intervals-proxy/')) {
            const cors = {
                'access-control-allow-origin': '*',
                'access-control-allow-headers': 'authorization, apikey',
                'access-control-expose-headers': 'x-intervals-proxy'
            };
            if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            proxiedIntervals.push(url);
            return route.fulfill({
                contentType: 'application/json',
                headers: { ...cors, 'x-intervals-proxy': '1' },
                body: JSON.stringify(fakeIntervals(url))
            });
        }
        blockedExternal.push(url);
        return route.abort();
    });
    await page.goto(baseUrl, { waitUntil: 'load' });
    if (waitForApp) {
        await page.locator('#main-app').waitFor({ state: 'visible', timeout: 15000 });
        await page.locator('#calendar-multi-container .calendar-week').first().waitFor({ timeout: 15000 });
    }
    return { context, page, consoleErrors };
}

test("l'app si carica senza errori in console e senza rete esterna reale", async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        assert.equal(await page.locator('#auth-screen').isVisible(), false);
        assert.match(await page.locator('#logged-user-email').textContent(), /atleta@e2e\.invalid/);
        assert.deepEqual(consoleErrors, []);
        // Nessuna richiesta oltre alle due CDN gia' simulate.
        assert.deepEqual(blockedExternal, []);
    } finally {
        await context.close();
    }
});

test('navigazione tra Calendario, Piani di allenamento, Profilo e Dashboard', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        const panels = ['section-calendar', 'section-planner', 'section-profile', 'section-dashboard'];
        const tabs = {
            'section-calendar': 'Calendario',
            'section-planner': 'Piani di allenamento',
            'section-profile': 'Profilo',
            'section-dashboard': 'Dashboard e metriche'
        };
        for (const target of ['section-planner', 'section-profile', 'section-dashboard', 'section-calendar']) {
            await page.getByRole('tab', { name: tabs[target], exact: true }).click();
            for (const id of panels) {
                assert.equal(
                    await page.locator(`#${id}`).isVisible(),
                    id === target,
                    `${id} visibile=${id === target} dopo click su ${target}`
                );
            }
            assert.equal(await page.locator(`.tab-btn[data-target="${target}"]`).getAttribute('aria-selected'), 'true');
        }
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('la sidebar si riduce e si espande', async () => {
    const { context, page } = await openApp();
    try {
        const button = page.locator('#btn-sidebar-collapse');
        const sidebar = page.locator('#app-sidebar');
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
        assert.equal(await sidebar.evaluate(el => el.classList.contains('is-collapsed')), true);
        await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        assert.equal(await sidebar.evaluate(el => el.classList.contains('is-collapsed')), false);
    } finally {
        await context.close();
    }
});

test('schede da tastiera: frecce, Home e Fine con pannello collegato', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        const calendarTab = page.locator('#tab-section-calendar');
        assert.equal(await calendarTab.getAttribute('aria-controls'), 'section-calendar');
        assert.equal(await page.locator('#section-calendar').getAttribute('aria-labelledby'), 'tab-section-calendar');
        await calendarTab.focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator('#tab-section-races').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#section-races').isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-section-races');
        await page.keyboard.press('End');
        assert.equal(await page.locator('#section-profile').isVisible(), true);
        await page.keyboard.press('Home');
        assert.equal(await page.locator('#section-calendar').isVisible(), true);
        // Una sola scheda raggiungibile con Tab (roving tabindex).
        assert.equal(await page.locator('.tab-btn[tabindex="0"]').count(), 1);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('telefono: il menu chiuso non riceve il focus, aperto blocca il resto', async () => {
    const { context, page } = await openApp({ viewport: { width: 390, height: 844 } });
    try {
        const sidebar = page.locator('#app-sidebar');
        assert.equal(await sidebar.evaluate(el => el.inert), true);
        await page.locator('#btn-menu-toggle').click();
        assert.equal(await sidebar.evaluate(el => el.inert), false);
        assert.equal(await page.locator('#app-shell').evaluate(el => el.inert), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-section-calendar');
        await page.keyboard.press('Escape');
        assert.equal(await sidebar.evaluate(el => el.inert), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-menu-toggle');
    } finally {
        await context.close();
    }
});

test('calendario: settimana corrente + 3 future in vista, archivio successive e precedenti', async () => {
    const { context, page } = await openApp();
    try {
        const container = page.locator('#calendar-multi-container');
        assert.equal(await container.locator('> .calendar-week').count(), 4);
        const headings = await container.locator('> .calendar-week > div:first-child > h3').allTextContents();
        assert.match(headings[0], /Questa settimana/);
        assert.match(headings[1], /Prossima settimana/);
        assert.match(headings[2], /Tra 2 settimane/);
        assert.match(headings[3], /Tra 3 settimane/);
        // Le sedute finte (domani..+12 giorni) compaiono nelle settimane in vista.
        assert.ok((await container.getByText('Seduta e2e 1', { exact: true }).count()) >= 1);

        const future = container.locator('> details', { hasText: 'Settimane successive' });
        const past = container.locator('> details', { hasText: 'Settimane precedenti' });
        assert.equal(await future.count(), 1);
        assert.equal(await past.count(), 1);
        assert.equal(await future.evaluate(el => el.open), false);
        await future.locator('> summary').click();
        assert.equal(await future.evaluate(el => el.open), true);
        // Dentro l'archivio i raggruppamenti sono per anno.
        assert.ok((await future.locator('details').count()) >= 1);
        await past.locator('> summary').click();
        assert.equal(await past.evaluate(el => el.open), true);
    } finally {
        await context.close();
    }
});

test('piani: senza test VR valido compare la proposta del test', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        await page.getByRole('tab', { name: 'Piani di allenamento', exact: true }).click();
        const panel = page.locator('#planner-reference-test');
        await panel.waitFor({ state: 'visible', timeout: 10000 });
        const text = await panel.textContent();
        assert.match(text, /Test VR da fare/);
        assert.match(text, /non c'è un test valido delle ultime 6 settimane/);
        const options = await panel.locator('select[name="reference_test_proposal_protocol"] option').allTextContents();
        assert.deepEqual(options, ['Test 3 km + 10%', 'Test 10 km']);
        assert.equal(await panel.locator('button[data-action="add-reference-test"]').isDisabled(), false);
        assert.match(text, /Data proposta/);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('calendario: esportazione .ics scarica un file valido', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10000 }),
            page.getByRole('button', { name: 'Esporta calendario (.ics)' }).click()
        ]);
        assert.match(download.suggestedFilename(), /\.ics$/);
        const content = await fs.readFile(await download.path(), 'utf8');
        assert.match(content, /^BEGIN:VCALENDAR/);
        assert.match(content, /END:VCALENDAR\s*$/);
        assert.equal((content.match(/BEGIN:VEVENT/g) || []).length, 12);
        assert.match(content, /Seduta e2e 1/);
        await page.getByText('Esportate 12 sedute in formato .ics.').waitFor({ timeout: 5000 });
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('dashboard: analisi prestazione dagli stream Intervals (GAP, deriva, GCT, prontezza)', async () => {
    const { context, page, consoleErrors } = await openApp({ intervals: true });
    try {
        await page.getByRole('tab', { name: 'Dashboard e metriche', exact: true }).click();
        const status = page.locator('#dashboard-performance-status');
        await status.getByText(/corse analizzate/).waitFor({ timeout: 15000 });
        assert.match(await status.textContent(), /1 corse analizzate/);
        const readiness = page.locator('#dashboard-readiness [data-readiness-level]');
        assert.ok(['green', 'amber', 'red'].includes(await readiness.getAttribute('data-readiness-level')));
        const row = page.locator('#dashboard-performance-table tbody tr').first();
        const cells = await row.locator('th, td').allTextContents();
        assert.equal(cells[1], 'Trail e2e');
        assert.match(cells[3], /^\d:\d{2}\/km$/, 'GAP');
        assert.match(cells[7], /%/, 'deriva cardiaca');
        assert.match(cells[8], /^\+\d/, 'GCT in aumento');
        assert.match(await page.locator('#dashboard-performance-streams').textContent(), /stance_time/);
        assert.match(await page.locator('#dashboard-threshold-review').textContent(), /rivalutate ogni 15 giorni/);
        // Una sola corsa: le linee chiedono almeno 2 punti, il carico giornaliero si disegna.
        const charts = await page.locator('#dashboard-performance-charts h4').allTextContents();
        assert.deepEqual(charts, [
            'Efficiency Factor (GAP / FC)',
            'Deriva cardiaca (Pa:Hr su GAP)',
            'Variazione del GCT nel finale',
            'Mechanical Load Score giornaliero'
        ]);
        assert.ok((await page.locator('#dashboard-performance-charts svg').count()) >= 1);
        // Tutte le letture passano dal proxy: nessuna chiamata diretta con la chiave.
        assert.ok(proxiedIntervals.some(url => url.includes('/activities?')));
        assert.ok(!blockedExternal.some(url => url.startsWith('https://intervals.icu/')));
        assert.equal(await page.locator('#intervals-api-key').inputValue(), '');
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('PWA: manifest, icone e service worker attivo', async () => {
    const { context, page, consoleErrors } = await openApp({ serviceWorkers: 'allow' });
    try {
        const href = await page.locator('link[rel="manifest"]').getAttribute('href');
        const manifest = await (await page.request.get(`${baseUrl}/${href}`)).json();
        assert.equal(manifest.display, 'standalone');
        // Relativo: l'app è pubblicata in una sottocartella (GitHub Pages).
        assert.equal(manifest.start_url, './');
        assert.equal(manifest.scope, './');
        const sizes = manifest.icons.map(icon => `${icon.sizes}:${icon.purpose}`);
        for (const needed of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(sizes.includes(needed), needed);
        const icons = [...manifest.icons.map(icon => icon.src), 'icons/apple-touch-icon.png'];
        for (const src of icons) {
            const response = await page.request.get(`${baseUrl}/${src}`);
            assert.equal(response.status(), 200, src);
            assert.equal(response.headers()['content-type'], 'image/png', src);
        }
        const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
        assert.equal(scope, `${baseUrl}/`);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test("calendario: niente pianificazione nei giorni passati, dettaglio dell'attività", async () => {
    const { context, page, consoleErrors } = await openApp({ intervals: true });
    try {
        const container = page.locator('#calendar-multi-container');
        const today = inDays(0);
        const cards = await container.locator('> .calendar-week .day-card').evaluateAll(nodes =>
            nodes.map(node => ({
                date: node.dataset.date,
                add: node.querySelectorAll('[data-action="add-session"]').length
            }))
        );
        assert.equal(cards.length, 28);
        cards.forEach(card => assert.equal(card.add, card.date < today ? 0 : 1, card.date));

        const open = container.getByRole('button', { name: 'Dettaglio attività: Trail e2e' });
        await open.waitFor({ timeout: 15000 });
        await open.click();
        const dialog = page.getByRole('dialog', { name: 'Trail e2e' });
        await dialog.waitFor();
        assert.match(await dialog.textContent(), /12,6 km/);
        assert.equal(
            await dialog.getByRole('link', { name: /Apri in Intervals.icu/ }).getAttribute('href'),
            'https://intervals.icu/activities/i9001'
        );
        await dialog.getByRole('heading', { name: 'Giri e intervalli' }).waitFor({ timeout: 15000 });
        const laps = await dialog.locator('table tbody tr').count();
        assert.equal(laps, 3);
        assert.match(await dialog.locator('table tbody').textContent(), /Riscaldamento.*Salita.*Defaticamento/s);
        const charts = await dialog.locator('h4').allTextContents();
        assert.deepEqual(charts, ['Altitudine', 'Frequenza cardiaca', 'Passo']);
        assert.match(await dialog.textContent(), /Analisi prestazione/);
        assert.match(await dialog.textContent(), /Deriva cardiaca/);

        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

// GPX sintetico: 6 km verso nord, salita di 300 m nei primi 3 km poi discesa,
// con un waypoint "Ristoro" sul percorso e uno lontano (da escludere).
function syntheticGpx() {
    const points = [];
    for (let d = 0; d <= 6000; d += 10) {
        const ele = d <= 3000 ? 500 + d * 0.1 : 800 - (d - 3000) * 0.1;
        points.push(`<trkpt lat="${(45 + d / 111195).toFixed(6)}" lon="9.000000"><ele>${ele.toFixed(1)}</ele></trkpt>`);
    }
    return `<?xml version="1.0"?><gpx version="1.1"><metadata><name>Giro e2e</name></metadata>
<wpt lat="${(45 + 2000 / 111195).toFixed(6)}" lon="9.0"><name>Ristoro Malga</name></wpt>
<wpt lat="46.0" lon="10.0"><name>Lontano</name></wpt>
<trk><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

test('tracce GPX: caricamento, analisi, waypoint importati e punto aggiunto', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        await page.getByRole('tab', { name: 'Tracce GPX', exact: true }).click();
        const section = page.locator('#section-gpx');
        await section.getByText('Nessuna traccia salvata.').waitFor();
        await section.locator('input[name="file"]').setInputFiles({
            name: 'giro.gpx',
            mimeType: 'application/gpx+xml',
            buffer: Buffer.from(syntheticGpx())
        });
        await section.locator('#gpx-upload-preview').getByText('Traccia letta').waitFor();
        assert.equal(await section.locator('input[name="name"]').inputValue(), 'Giro e2e');
        assert.match(await section.locator('#gpx-import-waypoints-label').textContent(), /Importa 1 waypoint.*1 esclusi/);
        await section.locator('select[name="race_id"]').selectOption('race1');
        await section.getByRole('button', { name: 'Salva traccia' }).click();

        const detail = page.locator('#gpx-track-detail');
        await detail.getByText('Analisi della traccia').waitFor();
        assert.match(await page.locator('#gpx-status').textContent(), /Traccia salvata/);
        const text = await detail.textContent();
        assert.match(text, /6 km/);
        assert.ok(text.includes('Salite (1)'));
        assert.ok(text.includes('Discese (1)'));
        assert.equal(await detail.locator('[data-waypoint-list] li').count(), 1);
        assert.match(await detail.locator('[data-waypoint-list]').textContent(), /Ristoro Malga.*Ristoro · km 2/);
        // Tratte: partenza → ristoro → arrivo.
        assert.equal(await detail.locator('[data-body="gpx-segments"] tbody tr').count(), 2);

        // Clic sul profilo: imposta il km del nuovo punto.
        const profile = detail.locator('[data-body="gpx-profile"] svg');
        const box = await profile.boundingBox();
        await profile.click({ position: { x: box.width * 0.8, y: box.height * 0.6 } });
        const form = detail.locator('#gpx-waypoint-form');
        assert.ok(Number(await form.locator('input[name="km"]').inputValue()) > 4);
        await form.locator('select[name="kind"]').selectOption('water');
        await form.locator('input[name="name"]').fill('Fontana');
        await form.getByRole('button', { name: 'Aggiungi punto' }).click();
        await detail.locator('[data-waypoint-list] li').nth(1).waitFor();
        assert.equal(await detail.locator('[data-body="gpx-segments"] tbody tr').count(), 3);

        // Gara collegata: copia distanza e dislivelli dopo conferma; la scheda Gare si aggiorna.
        assert.match(await detail.textContent(), /Gara collegata: Dieci km e2e · 10 km/);
        page.once('dialog', dialog => dialog.accept());
        await detail.getByRole('button', { name: 'Copia distanza e dislivelli nella gara' }).click();
        await page.locator('#gpx-status', { hasText: 'aggiornata con distanza e dislivelli' }).waitFor();
        assert.ok((await detail.textContent()).includes('Gara collegata: Dieci km e2e · 6 km · D+ 29'));
        assert.match(await page.locator('#races-list').textContent(), /6 km/);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('amministrazione: scheda solo per admin, invito inviato alla Edge Function', async () => {
    const athlete = await openApp();
    try {
        assert.equal(await athlete.page.locator('.tab-btn[data-target="section-admin"]').isVisible(), false);
    } finally {
        await athlete.context.close();
    }

    const invites = [];
    const adminDb = { ...FAKE_DB, profiles: [{ ...FAKE_DB.profiles[0], role: 'admin' }] };
    const { context, page, consoleErrors } = await openApp({
        supabaseJs: fakeSupabaseJs(adminDb),
        onRoute: route => {
            if (!route.request().url().includes('/functions/v1/admin-invite')) return false;
            const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' };
            if (route.request().method() === 'OPTIONS') {
                route.fulfill({ status: 204, headers: cors });
            } else {
                invites.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
                route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ ok: true }) });
            }
            return true;
        }
    });
    try {
        await page.getByRole('tab', { name: 'Amministrazione' }).click();
        const form = page.locator('#admin-invite-form');
        await form.locator('input[name="email"]').fill('non-valida');
        await form.getByRole('button', { name: 'Invia invito' }).click();
        await page.locator('#admin-invite-status', { hasText: 'email valido' }).waitFor();
        assert.equal(invites.length, 0);

        await form.locator('input[name="email"]').fill('  Nuovo.Atleta@E2E.invalid ');
        await form.getByRole('button', { name: 'Invia invito' }).click();
        await page.locator('#admin-invite-status', { hasText: 'Invito inviato a nuovo.atleta@e2e.invalid' }).waitFor();
        assert.equal(invites.length, 1);
        assert.equal(invites[0].body.email, 'nuovo.atleta@e2e.invalid');
        assert.equal(invites[0].body.redirectTo, `${baseUrl}/`);
        assert.equal(invites[0].auth, 'Bearer e2e-token');
        assert.equal(await form.locator('input[name="email"]').inputValue(), '');
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('invito: al primo accesso dal link si sceglie la password, poi si entra', async () => {
    const invited = { ...USER, user_metadata: { must_set_password: true } };
    const { context, page, consoleErrors } = await openApp({ supabaseJs: fakeSupabaseJs(FAKE_DB, invited), waitForApp: false });
    try {
        const form = page.locator('#password-setup-form');
        await form.waitFor({ state: 'visible', timeout: 15000 });
        assert.equal(await page.locator('#main-app').isVisible(), false);
        assert.equal(await page.locator('#login-form').isVisible(), false);
        assert.equal(await page.locator('#setup-email').inputValue(), USER.email);

        await page.locator('#setup-password').fill('lunga-abbastanza');
        await page.locator('#setup-password-confirm').fill('diversa-abbastanza');
        await form.getByRole('button', { name: 'Salva password ed entra' }).click();
        await page.locator('#auth-error', { hasText: 'non coincidono' }).waitFor();
        assert.equal(await page.evaluate(() => window.__updatedPassword ?? null), null);

        await page.locator('#setup-password-confirm').fill('lunga-abbastanza');
        await form.getByRole('button', { name: 'Salva password ed entra' }).click();
        await page.locator('#main-app').waitFor({ state: 'visible', timeout: 15000 });
        assert.equal(await page.evaluate(() => window.__updatedPassword), 'lunga-abbastanza');
        assert.equal(await page.locator('#auth-screen').isVisible(), false);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await context.close();
    }
});

test('invito: link scaduto mostra il motivo nella schermata di accesso', async () => {
    const signedOut = FAKE_SUPABASE_JS.replace(
        "getSession: async () => ({ data: { session: { user: USER, access_token: 'e2e-token' } }, error: null })",
        'getSession: async () => ({ data: { session: null }, error: null })'
    );
    assert.notEqual(signedOut, FAKE_SUPABASE_JS);
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
        await page.route('**/*', route => {
            const url = route.request().url();
            if (url.includes('/vendor/supabase-js-')) return route.fulfill({ contentType: 'text/javascript', body: signedOut });
            return url.startsWith(baseUrl) ? route.continue() : route.abort();
        });
        await page.goto(`${baseUrl}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`);
        await page.locator('#auth-error', { hasText: 'scaduto o è già stato usato' }).waitFor({ timeout: 15000 });
        assert.equal(new URL(page.url()).hash, '');
    } finally {
        await context.close();
    }
});
