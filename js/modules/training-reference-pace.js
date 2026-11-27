import { addDays, daysBetween, isIsoDate } from '../core/date-utils.js';
const VR_PROTOCOLS = Object.freeze(['three_km_plus_10', 'ten_km']);

export function parseTestDuration(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const hoursMinutesSeconds = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(text);
    if (hoursMinutesSeconds) {
        const [, hours, minutes, seconds] = hoursMinutesSeconds;
        const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
        if (total > 0) return total;
    }

    const minutesSeconds = /^(\d{1,3}):([0-5]\d)$/.exec(text);
    if (minutesSeconds) {
        const [, minutes, seconds] = minutesSeconds;
        const total = Number(minutes) * 60 + Number(seconds);
        if (total > 0) return total;
    }

    throw new Error('Inserisci il tempo come mm:ss o hh:mm:ss, maggiore di zero.');
}

export function calculateReferencePace(protocol, testDurationSeconds) {
    if (!VR_PROTOCOLS.includes(protocol)) {
        throw new Error('Il protocollo non consente di calcolare automaticamente la VR.');
    }
    if (!Number.isInteger(testDurationSeconds) || testDurationSeconds <= 0) {
        throw new Error('Il tempo del test deve essere un numero intero di secondi maggiore di zero.');
    }

    const secondsPerKm = protocol === 'three_km_plus_10' ? (testDurationSeconds * 1.1) / 3 : testDurationSeconds / 10;

    return Math.round(secondsPerKm);
}

export function formatPace(secondsPerKm) {
    if (!Number.isInteger(secondsPerKm) || secondsPerKm <= 0) return '';
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = String(secondsPerKm % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

export function formatTestDuration(totalSeconds) {
    if (!Number.isInteger(totalSeconds) || totalSeconds <= 0) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function canCalculateReferencePace(protocol) {
    return VR_PROTOCOLS.includes(protocol);
}

// Regola di prodotto approvata dall'atleta il 13 novembre 2026: un test VR
// (3 km + 10% o 10 km) resta valido per 6 settimane dalla data del test.
// Oltre questa soglia il generatore si blocca e chiede un nuovo test; non
// stima mai una VR aggiornata.
export const REFERENCE_TEST_VALIDITY_RULE = Object.freeze({
    id: 'reference_test_validity',
    version: '1.0.0',
    ruleStatus: 'approved_for_drafts',
    maxAgeDays: 42,
    approval: Object.freeze({ approvedBy: 'Andrea Baron', approvedAt: '2026-11-13' }),
    explanation: 'Il test VR deve essere stato svolto al massimo 6 settimane prima della bozza.'
});

export function assessReferenceTestValidity(testDate, asOfDate, rule = REFERENCE_TEST_VALIDITY_RULE) {
    if (!isIsoDate(asOfDate)) {
        throw new Error('La data di riferimento per la validità del test non è valida.');
    }
    if (!testDate) {
        return { status: 'missing', age_days: null, valid_until: null, message: 'Manca la data del test VR.' };
    }
    if (!isIsoDate(testDate)) {
        return { status: 'invalid', age_days: null, valid_until: null, message: 'La data del test VR non è valida.' };
    }
    const ageDays = daysBetween(testDate, asOfDate);
    const validUntil = addDays(testDate, rule.maxAgeDays);
    if (ageDays < 0) {
        return { status: 'future', age_days: ageDays, valid_until: validUntil, message: 'La data del test VR è nel futuro.' };
    }
    if (ageDays > rule.maxAgeDays) {
        return {
            status: 'expired',
            age_days: ageDays,
            valid_until: validUntil,
            message: `Il test VR del ${testDate} è scaduto il ${validUntil}: la validità massima è di ${rule.maxAgeDays / 7} settimane. Ripeti il test prima di generare la bozza.`
        };
    }
    return {
        status: 'valid',
        age_days: ageDays,
        valid_until: validUntil,
        message: `Test VR valido fino al ${validUntil}.`
    };
}
