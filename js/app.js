// js/app.js - Entry point della piattaforma modulare
import { initializePlatform } from './core/platform.js';
import { initIntervalsModule } from './modules/intervals-ui.js';
import { initCalendarModule } from './modules/calendar-ui.js';
import { initRacesModule } from './modules/races-ui.js';
import { initTrainingPlannerModule } from './modules/training-planner-ui.js';
import { initAthleteProfileModule } from './modules/athlete-profile-ui.js';
import { clearActivityCache } from './modules/intervals-cache.js';

// App installabile: registra il service worker (solo su HTTPS o localhost).
if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non registrato:', err));
    });
}

// Ordine di avvio: prima i moduli leggeri, per ultimo Intervals.icu, che scarica
// tutto lo storico e non deve ritardare calendario, gare e piani.
const MODULES = [
    ['Calendario', initCalendarModule],
    ['Gare', initRacesModule],
    ['Piani di allenamento', initTrainingPlannerModule],
    ['Profilo', initAthleteProfileModule],
    ['Intervals.icu', initIntervalsModule]
];

let supabase = null;
let appStarted = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupSidebar();

    if (!window.supabase?.createClient || !window.SUPABASE_CONFIG?.URL) {
        hideBootScreen();
        showAuthScreen();
        showAuthError('Impossibile caricare i servizi dell’app. Controlla la connessione e ricarica la pagina.');
        return;
    }
    supabase = window.supabase.createClient(window.SUPABASE_CONFIG.URL, window.SUPABASE_CONFIG.KEY);

    // I gestori di accesso e uscita sono attivi subito, anche durante l'avvio.
    setupLogin();
    setupLogout();
    supabase.auth.onAuthStateChange(event => {
        // Uscita da un'altra scheda o sessione scaduta: si torna al login pulito.
        if (event === 'SIGNED_OUT' && appStarted) clearActivityCache().finally(() => window.location.reload());
    });

    try {
        const {
            data: { session },
            error
        } = await supabase.auth.getSession();
        if (error) console.error('Errore nel recupero della sessione:', error);
        if (session?.user) {
            await startApp(session.user);
        } else {
            showAuthScreen();
        }
    } catch (err) {
        console.error('Errore critico in avvio:', err);
        showAuthScreen();
        showAuthError('Avvio non riuscito. Controlla la connessione e riprova.');
    } finally {
        hideBootScreen();
    }
});

function setupLogin() {
    const form = document.getElementById('login-form');
    const button = document.getElementById('btn-login');
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;

        if (!email || !password) {
            showAuthError('Inserisci email e password.');
            return;
        }

        const label = button.textContent;
        button.disabled = true;
        button.textContent = 'Accesso in corso…';
        hideAuthError();
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                showAuthError(loginErrorMessage(error));
                return;
            }
            await startApp(data.user);
        } catch (err) {
            console.error('Errore di rete durante l’accesso:', err);
            showAuthError('Connessione non riuscita. Controlla la rete e riprova.');
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    });
}

function loginErrorMessage(error) {
    const status = Number(error?.status);
    const code = String(error?.code || '');
    if (code === 'invalid_credentials' || status === 400) return 'Email o password non corrette.';
    if (code === 'email_not_confirmed') return 'Conferma l’indirizzo email prima di accedere.';
    if (status === 429) return 'Troppi tentativi. Attendi qualche minuto e riprova.';
    if (status >= 500) return 'Servizio di accesso non disponibile. Riprova più tardi.';
    return 'Accesso non riuscito. Riprova.';
}

function setupLogout() {
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        try {
            await clearActivityCache();
            await supabase.auth.signOut();
        } catch (err) {
            console.error('Errore durante l’uscita:', err);
        } finally {
            window.location.reload();
        }
    });
}

/**
 * Avvia l'applicazione: profilo, interfaccia e moduli, ognuno isolato dagli altri.
 */
async function startApp(user) {
    if (appStarted) return;
    appStarted = true;

    const profile = await initializePlatform(supabase, user);
    if (!profile) showAppError('Profilo utente non disponibile: alcune funzioni potrebbero non funzionare.');

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    const failed = [];
    for (const [name, init] of MODULES) {
        try {
            await init(supabase, user.id);
        } catch (err) {
            console.error(`Errore nell'avvio del modulo ${name}:`, err);
            failed.push(name);
        }
    }
    if (failed.length) {
        showAppError(`Non è stato possibile caricare: ${failed.join(', ')}. Ricarica la pagina per riprovare.`);
    }
}

function showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function hideBootScreen() {
    document.getElementById('boot-screen')?.classList.add('hidden');
}

function showAuthError(message) {
    const element = document.getElementById('auth-error');
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideAuthError() {
    document.getElementById('auth-error').classList.add('hidden');
}

document.addEventListener('click', event => {
    if (event.target.closest('[data-app-error-close]')) document.getElementById('app-error')?.classList.add('hidden');
});

function showAppError(message) {
    const banner = document.getElementById('app-error');
    if (!banner) return;
    banner.querySelector('[data-app-error-text]').textContent = message;
    banner.classList.remove('hidden');
}

/**
 * Navigazione a schede (pattern WAI-ARIA "tabs" verticale): clic, frecce,
 * Home/Fine; ogni scheda è collegata al suo pannello.
 */
function setupTabNavigation() {
    const tabButtons = [...document.querySelectorAll('.tab-btn')];
    const ACTIVE = ['bg-brand-500', 'text-white', 'font-semibold'];
    const INACTIVE = ['text-slate-300', 'font-medium', 'hover:bg-slate-900', 'hover:text-white'];

    tabButtons.forEach(btn => {
        const panel = document.getElementById(btn.dataset.target);
        btn.id = `tab-${btn.dataset.target}`;
        btn.setAttribute('aria-controls', btn.dataset.target);
        btn.tabIndex = btn.getAttribute('aria-selected') === 'true' ? 0 : -1;
        if (panel && !panel.hasAttribute('aria-labelledby')) panel.setAttribute('aria-labelledby', btn.id);
    });

    const activate = btn => {
        document.querySelectorAll('#module-container > [role="tabpanel"]').forEach(panel => panel.classList.add('hidden'));
        document.getElementById(btn.dataset.target)?.classList.remove('hidden');

        tabButtons.forEach(b => {
            b.classList.remove(...ACTIVE);
            b.classList.add(...INACTIVE);
            b.setAttribute('aria-selected', 'false');
            b.tabIndex = -1;
        });
        btn.classList.remove(...INACTIVE);
        btn.classList.add(...ACTIVE);
        btn.setAttribute('aria-selected', 'true');
        btn.tabIndex = 0;
    };

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            activate(btn);
            closeMobileSidebar();
            window.scrollTo({ top: 0 });
        });
    });

    document.querySelector('[role="tablist"]')?.addEventListener('keydown', event => {
        const visible = tabButtons.filter(btn => !btn.classList.contains('hidden'));
        const index = visible.indexOf(document.activeElement);
        if (index < 0) return;
        const next = {
            ArrowDown: visible[(index + 1) % visible.length],
            ArrowRight: visible[(index + 1) % visible.length],
            ArrowUp: visible[(index - 1 + visible.length) % visible.length],
            ArrowLeft: visible[(index - 1 + visible.length) % visible.length],
            Home: visible[0],
            End: visible[visible.length - 1]
        }[event.key];
        if (!next) return;
        event.preventDefault();
        activate(next);
        next.focus();
    });
}

const DESKTOP = window.matchMedia('(min-width: 1024px)');

function setupSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const menuButton = document.getElementById('btn-menu-toggle');
    const closeButton = document.getElementById('btn-sidebar-close');
    const collapseButton = document.getElementById('btn-sidebar-collapse');

    menuButton?.addEventListener('click', () => {
        const isOpen = !sidebar.classList.contains('-translate-x-full');
        setMobileSidebarOpen(!isOpen);
    });
    closeButton?.addEventListener('click', () => {
        closeMobileSidebar();
        menuButton?.focus();
    });
    backdrop?.addEventListener('click', closeMobileSidebar);

    collapseButton?.addEventListener('click', () => {
        const isExpanded = collapseButton.getAttribute('aria-expanded') === 'true';
        sidebar.classList.toggle('is-collapsed', isExpanded);
        collapseButton.setAttribute('aria-expanded', String(!isExpanded));
        collapseButton.setAttribute('aria-label', isExpanded ? 'Espandi menu' : 'Riduci menu');
        collapseButton.textContent = isExpanded ? '⇥' : '⇤';
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
            closeMobileSidebar();
            menuButton.focus();
        }
    });

    DESKTOP.addEventListener('change', syncSidebarInert);
    syncSidebarInert();
}

// Da telefono il menu chiuso è fuori schermo: non deve ricevere il focus.
// Aperto, è il resto della pagina a diventare inerte (focus nel menu).
function syncSidebarInert() {
    const sidebar = document.getElementById('app-sidebar');
    const shell = document.getElementById('app-shell');
    const isOpen = document.getElementById('btn-menu-toggle')?.getAttribute('aria-expanded') === 'true';
    const mobile = !DESKTOP.matches;
    sidebar.inert = mobile && !isOpen;
    if (shell) shell.inert = mobile && isOpen;
}

function setMobileSidebarOpen(isOpen) {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const menuButton = document.getElementById('btn-menu-toggle');

    sidebar.classList.toggle('-translate-x-full', !isOpen);
    sidebar.classList.toggle('translate-x-0', isOpen);
    backdrop.classList.toggle('hidden', !isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Chiudi menu' : 'Apri menu');
    syncSidebarInert();
    if (isOpen) sidebar.querySelector('.tab-btn[aria-selected="true"]')?.focus();
}

function closeMobileSidebar() {
    setMobileSidebarOpen(false);
}
