// js/app.js - Entry point della piattaforma modulare
import { initializePlatform } from './core/platform.js';
import { initIntervalsModule } from './modules/intervals-ui.js';
import { initCalendarModule } from './modules/calendar-ui.js';
import { initRacesModule } from './modules/races-ui.js';
import { initGpxTracksModule } from './modules/gpx-tracks-ui.js';
import { initTrainingPlannerModule } from './modules/training-planner-ui.js';
import { initAthleteProfileModule } from './modules/athlete-profile-ui.js';
import { initUserInvitesModule } from './modules/user-invites-ui.js';
import { clearActivityCache } from './modules/intervals-cache.js';
import {
    inviteRedirectUrl,
    isPasswordRecoveryLink,
    needsPasswordSetup,
    normalizeInviteEmail,
    passwordResetErrorMessage,
    passwordUpdateErrorMessage,
    readAuthRedirectError,
    validateNewPassword
} from './modules/user-invites.js';

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
    ['Tracce GPX', initGpxTracksModule],
    ['Piani di allenamento', initTrainingPlannerModule],
    ['Profilo', initAthleteProfileModule],
    ['Intervals.icu', initIntervalsModule]
];

let supabase = null;
let appStarted = false;
let passwordRecovery = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupSidebar();

    if (!window.supabase?.createClient || !window.SUPABASE_CONFIG?.URL) {
        hideBootScreen();
        showAuthScreen();
        showAuthError('Impossibile caricare i servizi dell’app. Controlla la connessione e ricarica la pagina.');
        return;
    }
    // Link di invito scaduto o già usato: l'errore arriva nell'indirizzo. Va letto
    // prima di creare il client e poi tolto, per non ripresentarlo al ricaricamento.
    const linkError = readAuthRedirectError(window.location.hash, window.location.search);
    if (linkError) window.history.replaceState(null, '', window.location.pathname);
    // Link "password dimenticata": dopo l'accesso si sceglie subito la nuova password.
    passwordRecovery = isPasswordRecoveryLink(window.location.hash);
    supabase = window.supabase.createClient(window.SUPABASE_CONFIG.URL, window.SUPABASE_CONFIG.KEY);

    // I gestori di accesso e uscita sono attivi subito, anche durante l'avvio.
    setupLogin();
    setupPasswordReset();
    setupPasswordSetup();
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
            if (linkError) showAuthError(linkError);
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

// "Password dimenticata?": Supabase invia un link che riporta all'app per
// scegliere una nuova password. La risposta non rivela se l'email esiste.
function setupPasswordReset() {
    const loginForm = document.getElementById('login-form');
    const form = document.getElementById('password-reset-form');
    const button = document.getElementById('btn-password-reset');
    const emailInput = document.getElementById('reset-email');

    document.getElementById('btn-forgot-password')?.addEventListener('click', () => {
        hideAuthError();
        hideAuthInfo();
        emailInput.value = document.getElementById('auth-email').value.trim();
        loginForm.classList.add('hidden');
        form.classList.remove('hidden');
        emailInput.focus();
    });
    document.getElementById('btn-password-reset-back')?.addEventListener('click', () => {
        hideAuthError();
        hideAuthInfo();
        form.classList.add('hidden');
        loginForm.classList.remove('hidden');
        document.getElementById('auth-email').focus();
    });

    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const email = normalizeInviteEmail(emailInput.value);
        hideAuthInfo();
        if (!email) {
            showAuthError('Inserisci un indirizzo email valido.');
            return;
        }
        const label = button.textContent;
        button.disabled = true;
        button.textContent = 'Invio in corso…';
        hideAuthError();
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: inviteRedirectUrl(window.location)
            });
            if (error) {
                showAuthError(passwordResetErrorMessage(error));
                return;
            }
            showAuthInfo(`Se ${email} è registrata, riceverai a breve un link per scegliere una nuova password.`);
        } catch (err) {
            console.error('Errore di rete durante la richiesta del link:', err);
            showAuthError('Connessione non riuscita. Controlla la rete e riprova.');
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    });
}

// Chi entra dal link di invito o da quello di recupero sceglie qui la
// password prima di vedere l'app.
function setupPasswordSetup() {
    const form = document.getElementById('password-setup-form');
    const button = document.getElementById('btn-password-setup');
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const password = document.getElementById('setup-password').value;
        const confirmation = document.getElementById('setup-password-confirm').value;
        const invalid = validateNewPassword(password, confirmation);
        if (invalid) {
            showAuthError(invalid);
            return;
        }

        const label = button.textContent;
        button.disabled = true;
        button.textContent = 'Salvataggio…';
        hideAuthError();
        try {
            const { data, error } = await supabase.auth.updateUser({ password, data: { must_set_password: false } });
            if (error) {
                showAuthError(passwordUpdateErrorMessage(error));
                return;
            }
            passwordRecovery = false;
            form.reset();
            form.classList.add('hidden');
            document.getElementById('login-form')?.classList.remove('hidden');
            await startApp(data.user);
        } catch (err) {
            console.error('Errore di rete durante il salvataggio della password:', err);
            showAuthError('Connessione non riuscita. Controlla la rete e riprova.');
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    });
    document.getElementById('btn-password-setup-cancel')?.addEventListener('click', async () => {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('Errore durante l’uscita:', err);
        } finally {
            window.location.reload();
        }
    });
}

function showPasswordSetup(user, { recovery = false } = {}) {
    document.getElementById('password-setup-title').textContent = recovery ? 'Scegli una nuova password' : 'Scegli la tua password';
    document.getElementById('password-setup-hint').textContent = recovery
        ? 'Sei entrato con il link di recupero. La nuova password sostituisce quella vecchia.'
        : 'Sei entrato con il link di invito. La password servirà per i prossimi accessi.';
    document.getElementById('login-form')?.classList.add('hidden');
    document.getElementById('password-reset-form')?.classList.add('hidden');
    document.getElementById('password-setup-form')?.classList.remove('hidden');
    document.getElementById('setup-email').value = user.email || '';
    hideAuthError();
    showAuthScreen();
    document.getElementById('setup-password')?.focus();
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
    if (passwordRecovery || needsPasswordSetup(user)) {
        showPasswordSetup(user, { recovery: passwordRecovery });
        return;
    }
    appStarted = true;

    const profile = await initializePlatform(supabase, user);
    if (!profile) showAppError('Profilo utente non disponibile: alcune funzioni potrebbero non funzionare.');
    initUserInvitesModule(supabase, profile);

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

function showAuthInfo(message) {
    const element = document.getElementById('auth-info');
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideAuthInfo() {
    document.getElementById('auth-info')?.classList.add('hidden');
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
