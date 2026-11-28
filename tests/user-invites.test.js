import test from 'node:test';
import assert from 'node:assert/strict';
import {
    inviteRedirectUrl,
    needsPasswordSetup,
    normalizeInviteEmail,
    passwordUpdateErrorMessage,
    readAuthRedirectError,
    sendUserInvite,
    validateNewPassword
} from '../js/modules/user-invites.js';

test('normalizeInviteEmail pulisce e valida', () => {
    assert.equal(normalizeInviteEmail('  Nome.Cognome@Esempio.IT '), 'nome.cognome@esempio.it');
    assert.equal(normalizeInviteEmail('senza-chiocciola'), null);
    assert.equal(normalizeInviteEmail('a b@c.it'), null);
    assert.equal(normalizeInviteEmail(''), null);
    assert.equal(normalizeInviteEmail(`${'a'.repeat(250)}@c.it`), null);
});

test('inviteRedirectUrl usa la pagina senza query né hash', () => {
    const location = { origin: 'https://utente.github.io', pathname: '/Training-Trail-Run/', search: '?x=1', hash: '#y' };
    assert.equal(inviteRedirectUrl(location), 'https://utente.github.io/Training-Trail-Run/');
});

test('sendUserInvite chiama la Edge Function con sessione ed email', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const result = await sendUserInvite(
        { url: 'https://x.supabase.co/', apikey: 'pub', accessToken: 'jwt', email: 'a@b.it', redirectTo: 'https://app/' },
        fetchImpl
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(calls[0].url, 'https://x.supabase.co/functions/v1/admin-invite');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt');
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'a@b.it', redirectTo: 'https://app/' });
});

test('sendUserInvite riporta gli errori della funzione', async () => {
    const respond = (status, body) => async () => ({ ok: false, status, json: async () => body });
    const base = { url: 'https://x.supabase.co', apikey: 'pub', accessToken: 'jwt', email: 'a@b.it', redirectTo: 'https://app/' };
    await assert.rejects(
        sendUserInvite(base, respond(403, { error: 'Solo un amministratore può invitare nuovi utenti.' })),
        /Solo un amministratore/
    );
    await assert.rejects(sendUserInvite(base, respond(404, null)), /admin-invite/);
    await assert.rejects(sendUserInvite(base, respond(500, null)), /errore 500/);
    await assert.rejects(
        sendUserInvite(base, async () => {
            throw new TypeError('rete');
        }),
        /Connessione non riuscita/
    );
    await assert.rejects(sendUserInvite({ ...base, accessToken: null }, respond(200, {})), /Sessione scaduta/);
});

test('needsPasswordSetup solo con il metadato dell’invito', () => {
    assert.equal(needsPasswordSetup({ user_metadata: { must_set_password: true } }), true);
    assert.equal(needsPasswordSetup({ user_metadata: { must_set_password: false } }), false);
    assert.equal(needsPasswordSetup({ user_metadata: {} }), false);
    assert.equal(needsPasswordSetup(null), false);
});

test('validateNewPassword: lunghezza minima e conferma', () => {
    assert.match(validateNewPassword('corta', 'corta'), /almeno 8/);
    assert.match(validateNewPassword('lunga-abbastanza', 'altra-password'), /non coincidono/);
    assert.equal(validateNewPassword('lunga-abbastanza', 'lunga-abbastanza'), null);
});

test('passwordUpdateErrorMessage traduce i codici di Supabase', () => {
    assert.match(passwordUpdateErrorMessage({ code: 'weak_password', status: 422 }), /debole/);
    assert.match(passwordUpdateErrorMessage({ code: 'reauthentication_needed' }), /nuovo invito/);
    assert.match(passwordUpdateErrorMessage({ status: 429 }), /Troppi tentativi/);
    assert.match(passwordUpdateErrorMessage({}), /non riuscito/);
});

test('readAuthRedirectError legge l’errore del link da hash o query', () => {
    assert.match(readAuthRedirectError('#error=access_denied&error_code=otp_expired&error_description=x'), /scaduto/);
    assert.match(readAuthRedirectError('', '?error=server_error'), /non riuscito/);
    assert.equal(readAuthRedirectError('#access_token=abc&type=invite', ''), null);
    assert.equal(readAuthRedirectError(), null);
});
