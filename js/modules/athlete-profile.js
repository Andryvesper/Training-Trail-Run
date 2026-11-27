// Dati anagrafici dell'atleta salvati nella riga "profiles" dell'utente.
// Tutti i campi sono facoltativi; il ruolo non viene mai letto né scritto qui.
import { localDateKey } from '../core/date-utils.js';

export const PROFILE_FIELDS = 'id, email, full_name, birth_date, sex, city, phone, height_cm, weight_kg, updated_at';
const SEX_VALUES = ['female', 'male', 'other', 'prefer_not_to_say'];

export function normalizePersonalData(input = {}, today = localDateKey()) {
    const fullName = text(input.full_name, 120, 'Il nome non può superare 120 caratteri.');
    const city = text(input.city, 80, 'La città non può superare 80 caratteri.');
    const phone = text(input.phone, 30, 'Il telefono non può superare 30 caratteri.');
    if (phone && !/^[+\d][\d\s./-]{4,}$/.test(phone)) {
        throw new Error('Inserisci un numero di telefono valido (cifre, spazi, +).');
    }
    const sex = text(input.sex, 20);
    if (sex && !SEX_VALUES.includes(sex)) throw new Error('Seleziona un valore valido per il sesso.');

    const birthDate = text(input.birth_date, 10);
    if (birthDate) {
        const date = new Date(`${birthDate}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate) {
            throw new Error('La data di nascita non è valida.');
        }
        if (birthDate < '1900-01-01' || birthDate > today) {
            throw new Error('La data di nascita deve essere compresa tra il 1900 e oggi.');
        }
    }

    const height = number(input.height_cm, 'L’altezza deve essere un numero intero di centimetri.', true);
    if (height !== null && (height < 100 || height > 250)) throw new Error('L’altezza deve essere tra 100 e 250 cm.');
    const weight = number(input.weight_kg, 'Il peso deve essere un numero.');
    if (weight !== null && (weight < 25 || weight > 250)) throw new Error('Il peso deve essere tra 25 e 250 kg.');

    return {
        full_name: fullName,
        birth_date: birthDate,
        sex,
        city,
        phone,
        height_cm: height,
        weight_kg: weight === null ? null : Math.round(weight * 10) / 10
    };
}

export function ageOn(birthDate, today = localDateKey()) {
    if (!birthDate) return null;
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export class AthleteProfileService {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async load(userId) {
        const { data, error } = await this.supabaseClient.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle();
        if (error) throw error;
        return data;
    }

    async save(userId, input) {
        const values = normalizePersonalData(input);
        const { data, error } = await this.supabaseClient
            .from('profiles')
            .update({ ...values, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select(PROFILE_FIELDS)
            .single();
        if (error) throw error;
        if (!data) throw new Error('Il profilo non è stato salvato.');
        return data;
    }
}

function text(value, maxLength, message) {
    const normalized = String(value ?? '').trim();
    if (maxLength && normalized.length > maxLength) throw new Error(message);
    return normalized || null;
}

function number(value, message, integer = false) {
    const raw = String(value ?? '')
        .trim()
        .replace(',', '.');
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) throw new Error(message);
    return parsed;
}
