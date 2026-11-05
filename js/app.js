// js/app.js - Entry Point della Piattaforma Modulare con Debug
import { initializePlatform } from './core/platform.js';
import { initIntervalsModule } from './modules/intervals-ui.js';
import { initCalendarModule } from './modules/calendar-ui.js';
import { initRacesModule } from './modules/races-ui.js';
import { initTrainingPlannerModule } from './modules/training-planner-ui.js';

const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL, 
    window.SUPABASE_CONFIG.KEY
);

document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupSidebar();

    try {
        // Verifichiamo la sessione Supabase attiva
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) console.error("Errore sessione:", sessionError);
        
        if (session) {
            console.log("Sessione trovata per:", session.user.email);
            await startApp(session.user);
        } else {
            console.log("Nessuna sessione attiva, mostro login.");
            showAuthScreen();
        }
    } catch (err) {
        console.error("Errore critico in avvio:", err);
    }

    // Listener per il form di Login
    document.getElementById('btn-login')?.addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorElement = document.getElementById('auth-error');

        if (!email || !password) {
            errorElement.textContent = "Inserisci email e password.";
            errorElement.classList.remove('hidden');
            return;
        }

        console.log("Tentativo di login per:", email);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.error("Errore di autenticazione:", error.message);
            errorElement.textContent = "Credenziali non valide: " + error.message;
            errorElement.classList.remove('hidden');
        } else {
            console.log("Login riuscito, avvio app...");
            errorElement.classList.add('hidden');
            await startApp(data.user);
        }
    });

    // Listener per il Logout
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });
});

/**
 * Avvia l'applicazione inizializzando core e moduli attivi
 */
async function startApp(user) {
    try {
        console.log("Inizializzazione piattaforma per utente ID:", user.id);
        const profile = await initializePlatform(supabase, user);
        console.log("Profilo caricato:", profile);
        
        console.log("Inizializzazione Modulo Intervals...");
        await initIntervalsModule(supabase, user.id);
        
        console.log("Inizializzazione Modulo Calendario...");
        initCalendarModule(supabase, user.id);

        console.log("Inizializzazione Modulo Gare...");
        await initRacesModule(supabase, user.id);

        console.log("Inizializzazione Motore piani...");
        await initTrainingPlannerModule(supabase, user.id);

        console.log("Mostro la dashboard principale...");
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').classList.remove('hidden');
    } catch (err) {
        console.error("Errore durante l'avvio dei moduli in startApp:", err);
    }
}

/**
 * Mostra la schermata di login
 */
function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').classList.add('hidden');
}

/**
 * Gestione centralizzata della navigazione a schede
 */
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            document.querySelectorAll('#module-container > div').forEach(div => div.classList.add('hidden'));
            document.getElementById(targetId)?.classList.remove('hidden');
            
            tabButtons.forEach(b => {
                b.classList.remove('bg-emerald-500', 'text-slate-950');
                b.classList.remove('bg-slate-900', 'text-slate-400');
                b.classList.add('text-slate-300');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.remove('text-slate-300', 'hover:bg-slate-900', 'hover:text-white');
            btn.classList.add('bg-emerald-500', 'text-slate-950');
            btn.setAttribute('aria-selected', 'true');
            closeMobileSidebar();
        });
    });
}

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
    closeButton?.addEventListener('click', closeMobileSidebar);
    backdrop?.addEventListener('click', closeMobileSidebar);

    collapseButton?.addEventListener('click', () => {
        const isExpanded = collapseButton.getAttribute('aria-expanded') === 'true';
        sidebar.classList.toggle('is-collapsed', isExpanded);
        collapseButton.setAttribute('aria-expanded', String(!isExpanded));
        collapseButton.setAttribute('aria-label', isExpanded ? 'Espandi menu' : 'Riduci menu');
        collapseButton.textContent = isExpanded ? '⇥' : '⇤';
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMobileSidebar();
    });
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
}

function closeMobileSidebar() {
    setMobileSidebarOpen(false);
}
