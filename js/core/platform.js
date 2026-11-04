// js/core/platform.js - Gestione Piattaforma e Ruoli Utente

export async function initializePlatform(supabaseClient, user) {
    if (!user) return null;

    try {
        // Recuperiamo il profilo dal database Supabase (regola inderogabile: dati nel DB)
        let { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error || !profile) {
            // Se il profilo non esiste, lo creiamo di default come atleta (o admin se è il master)
            const defaultRole = user.email === 'andrea.baron.ing@gmail.com' ? 'admin' : 'athlete';
            const { data: newProfile, insertError } = await supabaseClient
                .from('profiles')
                .insert({
                    id: user.id,
                    email: user.email,
                    role: defaultRole
                })
                .select()
                .single();

            if (insertError) throw insertError;
            profile = newProfile;
        }

        // Applichiamo le regole di visualizzazione in base al ruolo
        setupUserInterfaceByRole(profile);

        return profile;
    } catch (err) {
        console.error("Errore nell'inizializzazione della piattaforma e dei ruoli:", err);
        return null;
    }
}

function setupUserInterfaceByRole(profile) {
    const roleBadge = document.getElementById('user-role-badge');
    const adminTabBtn = document.querySelector('[data-tab="admin"]');

    if (profile.role === 'admin') {
        if (roleBadge) roleBadge.textContent = "Ruolo: Amministratore";
        if (adminTabBtn) adminTabBtn.classList.remove('hidden');
    } else {
        if (roleBadge) roleBadge.textContent = "Ruolo: Atleta";
        if (adminTabBtn) adminTabBtn.classList.add('hidden');
    }

    // Impostiamo l'email dell'utente loggato nell'header
    const emailDisplay = document.getElementById('logged-user-email');
    if (emailDisplay) emailDisplay.textContent = profile.email;
}
