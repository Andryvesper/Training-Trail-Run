// Inviti dei nuovi utenti e recupero password: chi apre il link ricevuto via
// email entra senza password e ne sceglie subito una.
// L'invio passa dalla Edge Function "admin-invite", che verifica il ruolo lato server.

const INVITE_FUNCTION = 'admin-invite';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
const REQUEST_TIMEOUT_MS = 30_000;

/** Email pulita e minuscola, oppure null se non valida. */
export function normalizeInviteEmail(value) {
    const email = String(value ?? '')
        .trim()
        .toLowerCase();
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
    return email;
}

/** Pagina dell'app a cui torna il link (senza query né hash). */
export function inviteRedirectUrl(location) {
    return `${location.origin}${location.pathname}`;
}

/**
 * Invia l'invito tramite la Edge Function.
 * @param {{ url: string, apikey: string, accessToken: string, email: string, redirectTo: string }} options
 */
export async function sendUserInvite({ url, apikey, accessToken, email, redirectTo }, fetchImpl = globalThis.fetch) {
    if (!accessToken) throw new Error('Sessione scaduta: esci e accedi di nuovo.');
    let response;
    try {
        response = await fetchImpl(`${String(url).replace(/\/+$/, '')}/functions/v1/${INVITE_FUNCTION}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, apikey, 'content-type': 'application/json' },
            body: JSON.stringify({ email, redirectTo }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch {
        throw new Error('Connessione non riuscita. Controlla la rete e riprova.');
    }
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (response.ok) return body;
    if (response.status === 404) {
        throw new Error('La funzione di invito non è attiva: distribuisci "admin-invite" (vedi README).');
    }
    throw new Error(body?.error || `Invio dell’invito non riuscito (errore ${response.status}).`);
}

/** Vero per chi è entrato da un link di invito e non ha ancora scelto la password. */
export function needsPasswordSetup(user) {
    return user?.user_metadata?.must_set_password === true;
}

/** Messaggio d'errore per la nuova password, oppure null se va bene. */
export function validateNewPassword(password, confirmation) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
    }
    if (password !== confirmation) return 'Le due password non coincidono.';
    return null;
}

export function passwordUpdateErrorMessage(error) {
    const code = String(error?.code || '');
    const status = Number(error?.status);
    if (code === 'weak_password') return 'Password troppo debole: usa lettere, numeri e simboli.';
    if (code === 'same_password') return 'Scegli una password diversa da quella attuale.';
    if (code === 'reauthentication_needed' || code === 'session_not_found' || status === 401) {
        return 'Sessione scaduta: richiedi un nuovo link con “Password dimenticata?”.';
    }
    if (status === 429) return 'Troppi tentativi. Attendi qualche minuto e riprova.';
    return 'Salvataggio della password non riuscito. Riprova.';
}

export function passwordResetErrorMessage(error) {
    const code = String(error?.code || '');
    const status = Number(error?.status);
    if (code === 'over_email_send_rate_limit' || status === 429) {
        return 'Troppe richieste. Attendi qualche minuto e riprova.';
    }
    return 'Invio del link non riuscito. Riprova più tardi.';
}

/** Vero quando l'app si apre dal link "password dimenticata" di Supabase. */
export function isPasswordRecoveryLink(hash = '') {
    return new URLSearchParams(String(hash).replace(/^#/, '')).get('type') === 'recovery';
}

/**
 * Errore restituito da Supabase nell'indirizzo del link (es. link scaduto).
 * Va letto prima di creare il client, che ripulisce l'indirizzo.
 * @returns {string | null}
 */
export function readAuthRedirectError(hash = '', search = '') {
    for (const part of [hash, search]) {
        const params = new URLSearchParams(String(part).replace(/^[#?]/, ''));
        const code = params.get('error_code') || params.get('error');
        if (!code) continue;
        if (code === 'otp_expired') {
            return 'Il link è scaduto o è già stato usato. Richiedi un nuovo link con “Password dimenticata?” o un nuovo invito all’amministratore.';
        }
        return 'Accesso dal link non riuscito. Richiedi un nuovo link con “Password dimenticata?” o un nuovo invito all’amministratore.';
    }
    return null;
}
