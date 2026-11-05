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

    const secondsPerKm = protocol === 'three_km_plus_10'
        ? testDurationSeconds * 1.1 / 3
        : testDurationSeconds / 10;

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
