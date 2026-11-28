import { inviteRedirectUrl, normalizeInviteEmail, sendUserInvite } from './user-invites.js';

/**
 * Scheda Amministrazione: visibile solo agli admin. Il controllo vero è nella
 * Edge Function; qui si nasconde solo ciò che un atleta non può usare.
 */
export function initUserInvitesModule(supabaseClient, profile) {
    if (profile?.role !== 'admin') return;
    const tab = document.querySelector('.tab-btn[data-target="section-admin"]');
    const form = document.getElementById('admin-invite-form');
    if (!tab || !form) return;
    tab.classList.remove('hidden');

    const status = document.getElementById('admin-invite-status');
    const input = form.elements.namedItem('email');
    const button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const email = normalizeInviteEmail(input.value);
        if (!email) {
            showStatus(status, 'Inserisci un indirizzo email valido.', 'error');
            input.focus();
            return;
        }
        const label = button.textContent;
        button.disabled = true;
        button.textContent = 'Invio in corso…';
        try {
            const { data } = await supabaseClient.auth.getSession();
            await sendUserInvite({
                url: window.SUPABASE_CONFIG.URL,
                apikey: window.SUPABASE_CONFIG.KEY,
                accessToken: data?.session?.access_token,
                email,
                redirectTo: inviteRedirectUrl(window.location)
            });
            form.reset();
            showStatus(status, `Invito inviato a ${email}. Il link vale una sola volta.`, 'success');
        } catch (error) {
            console.error('Invito non riuscito:', error);
            showStatus(status, error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    });
}

function showStatus(element, message, kind) {
    if (!element) return;
    element.textContent = message;
    element.className = `rounded-xl border p-3 text-sm ${
        kind === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    }`;
}
