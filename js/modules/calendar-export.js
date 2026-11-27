// Esportazione del piano in iCalendar (RFC 5545). Funzioni pure + download nel browser.
// Nota: non esiste un export GPX perché le sedute non hanno geometria del percorso.
import { parsePlannedElevation } from './training-load.js';
import { addDays } from '../core/date-utils.js';
export { addDays };

export const ICS_PRODID = '-//Training Trail Run//Calendario allenamenti//IT';
export const UID_DOMAIN = 'training-trail-run';
export const EXPORT_RANGES = Object.freeze({
    next3weeks: { label: 'Prossime 3 settimane', days: 21 },
    all: { label: 'Tutto il piano futuro', days: null }
});

const MAX_OCTETS = 75;
const encoder = new TextEncoder();

// Escape TEXT: \ ; , e a capo (RFC 5545 3.3.11).
export function escapeIcsText(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

// Piega a 75 ottetti UTF-8 senza spezzare i caratteri; le righe seguenti iniziano con uno spazio.
export function foldIcsLine(line) {
    const parts = [];
    let current = '';
    let size = 0;
    for (const char of String(line)) {
        const bytes = encoder.encode(char).length;
        if (size + bytes > MAX_OCTETS) {
            parts.push(current);
            current = ' ';
            size = 1;
        }
        current += char;
        size += bytes;
    }
    parts.push(current);
    return parts.join('\r\n');
}

export function formatIcsDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))) throw new Error(`Data non valida: ${isoDate}`);
    return isoDate.replace(/-/g, '');
}

export function formatIcsTimestamp(date) {
    return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function positive(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function formatPaceText(seconds) {
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function describeSession(session) {
    const lines = [];
    const km = positive(session.distance_km);
    const minutes = positive(session.duration_minutes);
    const pace = positive(session.target_pace_seconds_per_km);
    const elevation = parsePlannedElevation(session.notes);
    if (km) lines.push(`Distanza: ${String(km).replace('.', ',')} km`);
    if (minutes) lines.push(`Durata: ${minutes} min`);
    if (pace) lines.push(`Passo obiettivo: ${formatPaceText(pace)} min/km`);
    if (elevation != null) lines.push(`D+: ${elevation} m`);
    if (session.notes && String(session.notes).trim()) {
        if (lines.length) lines.push('');
        lines.push(String(session.notes).trim());
    }
    return lines.join('\n');
}

export function buildSessionEvent(session, now) {
    const start = session.scheduled_date;
    const lines = [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(`${session.id}@${UID_DOMAIN}`)}`,
        `DTSTAMP:${formatIcsTimestamp(now)}`,
        `DTSTART;VALUE=DATE:${formatIcsDate(start)}`,
        `DTEND;VALUE=DATE:${formatIcsDate(addDays(start, 1))}`,
        `SUMMARY:${escapeIcsText(session.title || 'Allenamento')}`
    ];
    const description = describeSession(session);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
    return lines;
}

export function buildIcsCalendar(sessions, { now = new Date(), name = 'Allenamenti' } = {}) {
    const lines = [
        'BEGIN:VCALENDAR',
        `PRODID:${ICS_PRODID}`,
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeIcsText(name)}`
    ];
    sessions.forEach(session => lines.push(...buildSessionEvent(session, now)));
    lines.push('END:VCALENDAR');
    return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// Sedute da oggi in avanti, nel range scelto, ordinate per data.
export function selectSessionsForExport(sessions, { today, range = 'all' } = {}) {
    const days = EXPORT_RANGES[range]?.days ?? null;
    const end = days ? addDays(today, days - 1) : null;
    return (sessions || [])
        .filter(session => session?.id != null && /^\d{4}-\d{2}-\d{2}$/.test(String(session.scheduled_date || '')))
        .filter(session => session.scheduled_date >= today && (!end || session.scheduled_date <= end))
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || String(a.title || '').localeCompare(String(b.title || '')));
}

export function exportFileName(today, range) {
    return `allenamenti-${range === 'next3weeks' ? '3-settimane' : 'piano'}-${today}.ics`;
}

// Solo browser: Blob + ancora temporanea.
export function downloadIcs(content, fileName) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
