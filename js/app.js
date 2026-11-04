// js/app.js - Entry Point della Piattaforma Modulare
import { initializePlatform } from './core/platform.js';
import { initIntervalsModule } from './modules/intervals-ui.js';
import { initCalendarModule } from './modules/calendar-ui.js';

const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL, 
    window.SUPABASE_CONFIG.KEY
);

document.addEventListener('DOMContentLoaded', async () => {
    // Configura i listener per la navigazione a schede (Tab)
    setupTabNavigation();

    // Verifichiamo la sessione Supabase attiva
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        await startApp(session.user);
    } else {
        showAuthScreen();
    }

    // Listener per il form di Login
    document.getElementById('btn-login')?.addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const errorElement = document.getElementById('auth-error');

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            errorElement.textContent = "Credenziali non valide.";
            errorElement.classList.remove('hidden');
        } else {
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
    // 1. Inizializziamo il core (profilo e ruoli)
    const profile = await initializePlatform(supabase, user);
    
    // 2. Inizializziamo il Modulo 1 (Intervals.icu) e il Modulo 2 (Calendario)
    await initIntervalsModule(supabase, user.id);
    initCalendarModule(supabase, user.id);

    // 3. Mostriamo l'applicazione principale
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
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
            
            // Nascondi tutte le sezioni
            document.querySelectorAll('#module-container > div').forEach(div => div.classList.add('hidden'));
            // Mostra la sezione selezionata
            document.getElementById(targetId)?.classList.remove('hidden');
            
            // Aggiorna lo stile visivo dei pulsanti Tab
            tabButtons.forEach(b => {
                b.classList.remove('bg-emerald-500', 'text-slate-950');
                b.classList.add('bg-slate-900', 'text-slate-400');
            });
            btn.classList.remove('bg-slate-900', 'text-slate-400');
            btn.classList.add('bg-emerald-500', 'text-slate-950');
        });
    });
}
