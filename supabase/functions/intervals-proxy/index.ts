// Edge Function "intervals-proxy": inoltra a Intervals.icu le sole letture usate
// dall'app, aggiungendo lato server la chiave API salvata nel profilo.
// Così la chiave non arriva mai al browser.
//
// Distribuzione (una volta, poi a ogni modifica):
//   npx supabase functions deploy intervals-proxy --project-ref <ref> --no-verify-jwt
// --no-verify-jwt: la sessione viene verificata qui con auth.getUser, che funziona
// anche con le nuove chiavi di firma JWT.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const INTERVALS_BASE = 'https://intervals.icu/api/v1/';
const TIMEOUT_MS = 30_000;
const FUNCTION_SEGMENT = '/intervals-proxy/';

// Solo le letture che l'app fa davvero.
const ALLOWED_PATHS = [
    /^athlete\/[^/]+\/(activities|wellness)$/,
    /^activity\/[A-Za-z0-9_-]{1,64}\/(streams\.json|intervals)$/
];
const ALLOWED_QUERY = new Set(['oldest', 'newest', 'types']);

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'x-intervals-proxy'
};

// "x-intervals-proxy: error" distingue gli errori della funzione da quelli di Intervals.icu.
function errorResponse(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json', 'x-intervals-proxy': 'error' }
    });
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'GET') return errorResponse(405, 'Metodo non consentito.');

    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return errorResponse(401, 'Sessione mancante: accedi di nuovo.');

    const url = new URL(request.url);
    const start = url.pathname.indexOf(FUNCTION_SEGMENT);
    const path = start >= 0 ? url.pathname.slice(start + FUNCTION_SEGMENT.length) : '';
    if (!ALLOWED_PATHS.some(pattern => pattern.test(path))) {
        return errorResponse(400, 'Richiesta non consentita.');
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return errorResponse(401, 'Sessione scaduta: esci e accedi di nuovo.');

    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('intervals_id, intervals_key, intervals_athlete_id, intervals_api_key')
        .eq('id', userData.user.id)
        .maybeSingle();
    if (profileError) {
        console.error('Lettura del profilo non riuscita:', profileError.message);
        return errorResponse(500, 'Lettura del collegamento non riuscita.');
    }
    const athleteId = profile?.intervals_id || profile?.intervals_athlete_id;
    const apiKey = profile?.intervals_key || profile?.intervals_api_key;
    if (!athleteId || !apiKey) {
        return errorResponse(412, 'Intervals.icu non è collegato: salva Athlete ID e API Key.');
    }

    // L'atleta è sempre quello del profilo, non quello indicato dal browser.
    const target = new URL(
        path.replace(/^athlete\/[^/]+\//, `athlete/${encodeURIComponent(athleteId)}/`),
        INTERVALS_BASE
    );
    for (const [key, value] of url.searchParams) {
        if (ALLOWED_QUERY.has(key)) target.searchParams.set(key, value);
    }

    let upstream: Response;
    try {
        upstream = await fetch(target, {
            headers: { Authorization: `Basic ${btoa(`API_KEY:${apiKey}`)}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (error) {
        console.error('Intervals.icu non raggiungibile:', error instanceof Error ? error.message : error);
        return errorResponse(504, 'Intervals.icu non risponde: riprova tra poco.');
    }

    return new Response(upstream.body, {
        status: upstream.status,
        headers: {
            ...CORS_HEADERS,
            'content-type': upstream.headers.get('content-type') ?? 'application/json',
            'cache-control': 'no-store',
            'x-intervals-proxy': '1'
        }
    });
});
