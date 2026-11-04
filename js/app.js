// js/app.js - Entry Point della Piattaforma Modulare
import { initializePlatform } from './core/platform.js';

const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL, 
    window.SUPABASE_CONFIG.KEY
);

document.addEventListener('DOMContentLoaded', async () => {
    // Verifichiamo la sessione Supabase attiva
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        // Se loggato, inizializziamo piattaforma e ruoli
        const userProfile = await initializePlatform(supabase, session.user);
        
        console.log("Piattaforma inizializzata per:", userProfile);
        
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').classList.remove('hidden');
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('main-app').classList.add('hidden');
    }
});
