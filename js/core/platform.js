// js/core/platform.js - Gestione Piattaforma e Ruoli Utente

export async function initializePlatform(supabaseClient, user) {
    if (!user) return null;

    try {
        // Recuperiamo il profilo dal database Supabase
        let { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error || !profile) {
            // Assegnazione del ruolo predefinito senza chiavi o segreti hardcoded
            const defaultRole = user.email.includes('admin') ? 'admin' : 'athlete';
            
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

    const emailDisplay = document.getElementById('logged-user-email');
    if (emailDisplay) emailDisplay.textContent = profile.email;
}
