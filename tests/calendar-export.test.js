import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addDays,
    buildIcsCalendar,
    describeSession,
    escapeIcsText,
    exportFileName,
    foldIcsLine,
    formatIcsTimestamp,
    selectSessionsForExport
} from '../js/modules/calendar-export.js';

const octets = text => new TextEncoder().encode(text).length;
const unfold = text => text.replace(/\r\n /g, '');

test('escapeIcsText escapa backslash, punto e virgola, virgole e a capo', () => {
    assert.equal(escapeIcsText('a\\b;c,d\ne\r\nf'), 'a\\\\b\\;c\\,d\\ne\\nf');
    assert.equal(escapeIcsText(null), '');
});

test('foldIcsLine piega a 75 ottetti e lascia intatte le righe corte', () => {
    assert.equal(foldIcsLine('SUMMARY:breve'), 'SUMMARY:breve');
    const line = `DESCRIPTION:${'x'.repeat(200)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    assert.ok(parts.length > 1);
    parts.forEach((part, index) => {
        assert.ok(octets(part) <= 75);
        if (index > 0) assert.ok(part.startsWith(' '));
    });
    assert.equal(unfold(folded), line);
});

test('foldIcsLine non spezza caratteri UTF-8 multibyte', () => {
    const line = `SUMMARY:${'è'.repeat(60)}🏃${'à'.repeat(30)}`;
    const folded = foldIcsLine(line);
    folded.split('\r\n').forEach(part => {
        assert.ok(octets(part) <= 75);
        assert.ok(!part.includes('�'));
    });
    assert.equal(unfold(folded), line);
});

test('addDays e timestamp UTC', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(formatIcsTimestamp(new Date('2026-11-14T08:05:09.123Z')), '20261114T080509Z');
});

test('describeSession include distanza, passo, D+ e note', () => {
    const text = describeSession({
        distance_km: 12.5,
        duration_minutes: 75,
        target_pace_seconds_per_km: 330,
        notes: 'Collinare, circa 400 m D+'
    });
    assert.match(text, /Distanza: 12,5 km/);
    assert.match(text, /Durata: 75 min/);
    assert.match(text, /Passo obiettivo: 5:30 min\/km/);
    assert.match(text, /D\+: 400 m/);
    assert.match(text, /Collinare, circa 400 m D\+$/);
});

test('buildIcsCalendar produce un VCALENDAR valido con CRLF', () => {
    const ics = buildIcsCalendar(
        [
            { id: 'abc-1', scheduled_date: '2026-11-20', title: 'Lungo; collinare, facile', distance_km: 18, notes: 'Riga 1\nRiga 2' },
            { id: 'abc-2', scheduled_date: '2026-11-22', title: 'Ripetute' }
        ],
        { now: new Date('2026-11-14T10:00:00Z') }
    );

    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(ics), 'solo CRLF');
    ics.split('\r\n').forEach(line => assert.ok(octets(line) <= 75));

    const lines = unfold(ics).split('\r\n');
    ['PRODID:-//Training Trail Run//Calendario allenamenti//IT', 'VERSION:2.0', 'CALSCALE:GREGORIAN'].forEach(expected => {
        assert.ok(lines.includes(expected), expected);
    });
    assert.equal(lines.filter(line => line === 'BEGIN:VEVENT').length, 2);
    assert.equal(lines.filter(line => line === 'END:VEVENT').length, 2);
    assert.ok(lines.includes('UID:abc-1@training-trail-run'));
    assert.ok(lines.includes('DTSTART;VALUE=DATE:20261120'));
    assert.ok(lines.includes('DTEND;VALUE=DATE:20261121'));
    assert.ok(lines.includes('DTSTAMP:20261114T100000Z'));
    assert.ok(lines.includes('SUMMARY:Lungo\\; collinare\\, facile'));
    assert.ok(lines.includes('DESCRIPTION:Distanza: 18 km\\n\\nRiga 1\\nRiga 2'));
    // Senza metriche né note: nessuna DESCRIPTION per la seconda seduta.
    assert.equal(lines.filter(line => line.startsWith('DESCRIPTION:')).length, 1);
});

test('UID stabile tra due esportazioni', () => {
    const session = { id: 's-9', scheduled_date: '2026-12-01', title: 'Fartlek' };
    const uid = ics =>
        unfold(ics)
            .split('\r\n')
            .find(line => line.startsWith('UID:'));
    assert.equal(
        uid(buildIcsCalendar([session], { now: new Date('2026-11-14T00:00:00Z') })),
        uid(buildIcsCalendar([session], { now: new Date('2026-12-01T00:00:00Z') }))
    );
});

test('selectSessionsForExport filtra futuro e range', () => {
    const sessions = [
        { id: 1, scheduled_date: '2026-11-13', title: 'Ieri' },
        { id: 2, scheduled_date: '2026-11-14', title: 'Oggi' },
        { id: 3, scheduled_date: '2026-12-04', title: 'Giorno 21' },
        { id: 4, scheduled_date: '2026-12-05', title: 'Giorno 22' },
        { id: 5, scheduled_date: null, title: 'Senza data' }
    ];
    const short = selectSessionsForExport(sessions, { today: '2026-11-14', range: 'next3weeks' });
    assert.deepEqual(
        short.map(s => s.id),
        [2, 3]
    );
    const all = selectSessionsForExport(sessions, { today: '2026-11-14', range: 'all' });
    assert.deepEqual(
        all.map(s => s.id),
        [2, 3, 4]
    );
    assert.equal(exportFileName('2026-11-14', 'all'), 'allenamenti-piano-2026-11-14.ics');
});
