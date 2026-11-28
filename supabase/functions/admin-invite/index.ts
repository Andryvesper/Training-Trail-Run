// Edge Function "admin-invite": un amministratore invita un nuovo utente via email.
// Supabase invia il link di accesso; chi lo apre entra senza password e l'app gli
// chiede subito di sceglierne una (metadato "must_set_password").
//
// Distribuzione (una volta, poi a ogni modifica):
//   npx supabase functions deploy admin-invite --project-ref <ref> --no-verify-jwt
// --no-verify-jwt: la sessione viene verificata qui con auth.getUser, come in intervals-proxy.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
}

// Solo indirizzi http(s): Supabase accetta poi solo quelli nella lista "Redirect URLs".
function safeRedirect(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'POST') return reply(405, { error: 'Metodo non consentito.' });

    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return reply(401, { error: 'Sessione mancante: accedi di nuovo.' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return reply(401, { error: 'Sessione scaduta: esci e accedi di nuovo.' });

    // Il ruolo si legge con la service role: il client non può falsificarlo.
    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
    if (profileError) {
        console.error('Lettura del profilo non riuscita:', profileError.message);
        return reply(500, { error: 'Verifica dei permessi non riuscita.' });
    }
    if (profile?.role !== 'admin') return reply(403, { error: 'Solo un amministratore può invitare nuovi utenti.' });

    let body: { email?: unknown; redirectTo?: unknown };
    try {
        body = await request.json();
    } catch {
        return reply(400, { error: 'Richiesta non valida.' });
    }
    const email = String(body?.email ?? '')
        .trim()
        .toLowerCase();
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
        return reply(400, { error: 'Indirizzo email non valido.' });
    }

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: safeRedirect(body?.redirectTo),
        data: { must_set_password: true }
    });
    if (error) {
        const code = String((error as { code?: string }).code ?? '');
        const status = Number((error as { status?: number }).status);
        if (code === 'email_exists' || code === 'user_already_exists' || /already been registered/i.test(error.message)) {
            return reply(409, { error: 'Esiste già un account attivo con questa email.' });
        }
        if (code === 'over_email_send_rate_limit' || status === 429) {
            return reply(429, { error: 'Limite di invio email raggiunto: riprova più tardi.' });
        }
        console.error('Invito non riuscito:', code || status, error.message);
        return reply(502, { error: 'Invio dell’invito non riuscito. Controlla la configurazione email di Supabase.' });
    }
    return reply(200, { ok: true, email });
});
