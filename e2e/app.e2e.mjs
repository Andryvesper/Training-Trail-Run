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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

// Date locali (come fa l'app), sempre relative a oggi.
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return key(d); };

const USER = { id: 'e2e-user', email: 'atleta@e2e.invalid' };
const AVAIL = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, { available: true, max_minutes: 90 }]));

const FAKE_DB = {
    profiles: [{ id: USER.id, email: USER.email, role: 'athlete' }],
    training_sessions: Array.from({ length: 12 }, (_, i) => ({
        id: `s${i + 1}`, user_id: USER.id, scheduled_date: inDays(i + 1), session_order: 1,
        title: `Seduta e2e ${i + 1}`, sport_type: 'run', distance_km: 8 + i, duration_minutes: 50,
        target_pace_seconds_per_km: 330, notes: null, intervals_activity_id: null,
        completed_at: null, adherence_score: null, completed_activity: null
    })),
    training_races: [{
        id: 'race1', user_id: USER.id, name: 'Dieci km e2e', event_date: inDays(16 * 7), target_period: null,
        distance_km: 10, elevation_gain_m: 0, elevation_loss_m: null, priority: 1, goal: null, status: 'planned'
    }],
    training_planning_profiles: [{
        user_id: USER.id, updated_at: new Date().toISOString(),
        questionnaire: {
            goal_mode: 'race', primary_race_id: 'race1', self_profile: 'regular_recreational',
            consistency_status: 'consistent', target_running_sessions_per_week: 4,
            peak_week_proposal_mode: 'disabled', preferred_terrains: ['road'],
            preferred_cycle_method: 'distance_time', weekly_availability: AVAIL
        }
    }],
    training_plan_drafts: []
};

// Sostituisce supabase-js: sessione finta e query builder in memoria.
const FAKE_SUPABASE_JS = `(() => {
  const DB = ${JSON.stringify(FAKE_DB)};
  const USER = ${JSON.stringify(USER)};
  function builder(table) {
    let rows = (DB[table] || []).slice();
    let mode = 'many';
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(f, v) { if (f !== 'user_id' && f !== 'id') rows = rows.filter(r => r[f] === v); return b; },
      gte(f, v) { rows = rows.filter(r => r[f] >= v); return b; },
      lte(f, v) { rows = rows.filter(r => r[f] <= v); return b; },
      insert(p) { rows = [Object.assign({ id: 'new' }, p)]; return b; },
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
      getSession: async () => ({ data: { session: { user: USER } }, error: null }),
      signInWithPassword: async () => ({ data: { user: USER }, error: null }),
      signOut: async () => ({ error: null })
    },
    from: builder,
    rpc: async () => ({ data: [], error: null })
  }; } };
})();`;

// Tailwind finto: solo le regole necessarie a rendere significativa la visibilita'.
const FAKE_TAILWIND = [
    'window.tailwind = {};',
    'const s = document.createElement("style");',
    's.textContent = ".hidden{display:none}@media(min-width:1024px){.lg\\\\:flex{display:flex!important}.lg\\\\:hidden{display:none!important}}";',
    'document.head.append(s);'
].join('\n');

let server, baseUrl, browser;
const blockedExternal = [];

test.before(async () => {
    server = http.createServer(async (req, res) => {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
        const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
        if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}.git${path.sep}`)) { res.writeHead(403); res.end(); return; }
        try {
            const body = await fs.readFile(file);
            res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        } catch { res.writeHead(404); res.end('not found'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge' });
});

test.after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

async function openApp() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));
    await page.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(baseUrl)) return route.continue();
        if (url.includes('cdn.tailwindcss.com')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_TAILWIND });
        if (url.includes('@supabase/supabase-js')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE_JS });
        blockedExternal.push(url);
        return route.abort();
    });
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.locator('#main-app').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#calendar-multi-container .calendar-week').first().waitFor({ timeout: 15000 });
    return { context, page, consoleErrors };
}

test('l\'app si carica senza errori in console e senza rete esterna reale', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        assert.equal(await page.locator('#auth-screen').isVisible(), false);
        assert.match(await page.locator('#logged-user-email').textContent(), /atleta@e2e\.invalid/);
        assert.deepEqual(consoleErrors, []);
        // Nessuna richiesta oltre alle due CDN gia' simulate.
        assert.deepEqual(blockedExternal, []);
    } finally { await context.close(); }
});

test('navigazione tra Calendario, Piani di allenamento, Profilo e Dashboard', async () => {
    const { context, page, consoleErrors } = await openApp();
    try {
        const panels = ['section-calendar', 'section-planner', 'section-profile', 'section-dashboard'];
        const tabs = { 'section-calendar': 'Calendario', 'section-planner': 'Piani di allenamento', 'section-profile': 'Profilo', 'section-dashboard': 'Dashboard e metriche' };
        for (const target of ['section-planner', 'section-profile', 'section-dashboard', 'section-calendar']) {
            await page.getByRole('tab', { name: tabs[target], exact: true }).click();
            for (const id of panels) {
                assert.equal(await page.locator(`#${id}`).isVisible(), id === target, `${id} visibile=${id === target} dopo click su ${target}`);
            }
            assert.equal(await page.locator(`.tab-btn[data-target="${target}"]`).getAttribute('aria-selected'), 'true');
        }
        assert.deepEqual(consoleErrors, []);
    } finally { await context.close(); }
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
    } finally { await context.close(); }
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
        assert.ok(await container.getByText('Seduta e2e 1', { exact: true }).count() >= 1);

        const future = container.locator('> details', { hasText: 'Settimane successive' });
        const past = container.locator('> details', { hasText: 'Settimane precedenti' });
        assert.equal(await future.count(), 1);
        assert.equal(await past.count(), 1);
        assert.equal(await future.evaluate(el => el.open), false);
        await future.locator('> summary').click();
        assert.equal(await future.evaluate(el => el.open), true);
        // Dentro l'archivio i raggruppamenti sono per anno.
        assert.ok(await future.locator('details').count() >= 1);
        await past.locator('> summary').click();
        assert.equal(await past.evaluate(el => el.open), true);
    } finally { await context.close(); }
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
    } finally { await context.close(); }
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
    } finally { await context.close(); }
});
