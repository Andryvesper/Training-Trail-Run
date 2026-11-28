import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGpx, gpxFileName, parseGpx } from '../js/modules/gpx-file.js';
import {
    analyzeTrack,
    bucketFor,
    GRID_STEP_M,
    haversineMeters,
    MAX_STORED_POINTS,
    nearestKm,
    pointAtKm,
    rangeStats,
    segmentsBetween,
    simplifyTrack
} from '../js/modules/gpx-analysis.js';
import { GpxTracksService, guessWaypointKind, validateTrack, validateWaypoint } from '../js/modules/gpx-tracks.js';
import { validateRaceCourse } from '../js/modules/training-races.js';

// Un grado di latitudine ≈ 111,2 km: punti verso nord a passo costante.
const METERS_PER_DEGREE = haversineMeters(45, 9, 46, 9);
function northTrack(lengthM, stepM, elevation) {
    const points = [];
    for (let distance = 0; distance <= lengthM + 1e-6; distance += stepM) {
        points.push({ lat: 45 + distance / METERS_PER_DEGREE, lon: 9, ele: elevation(distance) });
    }
    return points;
}

test('parseGpx legge traccia, quote, nome e waypoint (anche con namespace e CDATA)', () => {
    const gpx = `<?xml version="1.0"?>
<gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1" version="1.1">
  <gpx:metadata><gpx:name><![CDATA[Trail & Lago]]></gpx:name></gpx:metadata>
  <gpx:wpt lon="9.001" lat="45.001"><gpx:name>Ristoro Rifugio</gpx:name><gpx:sym>Food</gpx:sym></gpx:wpt>
  <gpx:trk><gpx:name>Traccia</gpx:name><gpx:trkseg>
    <gpx:trkpt lat="45.0" lon="9.0"><gpx:ele>100</gpx:ele></gpx:trkpt>
    <gpx:trkpt lat='45.001' lon='9.0'/>
    <gpx:trkpt lat="45.002" lon="9.0"><gpx:ele>120.5</gpx:ele><gpx:time>2026-01-01T00:00:00Z</gpx:time></gpx:trkpt>
    <gpx:trkpt lat="999" lon="9.0"><gpx:ele>1</gpx:ele></gpx:trkpt>
  </gpx:trkseg></gpx:trk>
</gpx:gpx>`;
    const parsed = parseGpx(gpx);
    assert.equal(parsed.name, 'Trail & Lago');
    assert.equal(parsed.points.length, 3);
    assert.deepEqual(parsed.points[1], { lat: 45.001, lon: 9, ele: null });
    assert.equal(parsed.points[2].ele, 120.5);
    assert.equal(parsed.waypoints.length, 1);
    assert.equal(parsed.waypoints[0].name, 'Ristoro Rifugio');
    assert.equal(parsed.waypoints[0].symbol, 'Food');
});

test('parseGpx usa il percorso (rte) se manca la traccia e rifiuta file non GPX', () => {
    const gpx = '<gpx><rte><name>Percorso</name><rtept lat="45" lon="9"/><rtept lat="45.01" lon="9"/></rte></gpx>';
    const parsed = parseGpx(gpx);
    assert.equal(parsed.points.length, 2);
    assert.equal(parsed.name, 'Percorso');
    assert.throws(() => parseGpx('<kml></kml>'), /non è un GPX/);
    assert.throws(() => parseGpx('<gpx><trk><trkseg><trkpt lat="45" lon="9"/></trkseg></trk></gpx>'), /almeno 2 punti/);
});

test('buildGpx produce un file rileggibile con traccia e punti', () => {
    const content = buildGpx({
        name: 'Giro <test>',
        points: [
            [45, 9, 100],
            [45.01, 9, null]
        ],
        waypoints: [{ lat: 45.005, lon: 9, ele: 150, name: 'Acqua "fonte"', symbol: 'Drinking Water' }]
    });
    const parsed = parseGpx(content);
    assert.equal(parsed.name, 'Giro <test>');
    assert.equal(parsed.points.length, 2);
    assert.equal(parsed.points[1].ele, null);
    assert.equal(parsed.waypoints[0].name, 'Acqua "fonte"');
    assert.equal(gpxFileName('Lavaredo Ultra Trail® 120'), 'lavaredo-ultra-trail-120.gpx');
    assert.equal(gpxFileName('   '), 'traccia.gpx');
});

test('simplifyTrack tiene un punto ogni 10 m e interpola le quote mancanti', () => {
    const raw = northTrack(1000, 2, distance => (distance === 500 ? NaN : distance / 10));
    raw[250].ele = null;
    const simplified = simplifyTrack(raw);
    assert.ok(simplified.length >= 99 && simplified.length <= 102, `punti: ${simplified.length}`);
    assert.ok(simplified.every(point => Number.isFinite(point[2])));
    assert.deepEqual(simplified[0], [45, 9, 0]);
    assert.ok(Math.abs(simplified.at(-1)[2] - 100) < 0.01);
    assert.throws(() => simplifyTrack(northTrack(50, 5, () => 0)), /troppo corta/);
});

test('simplifyTrack resta sotto il limite di punti salvabili', () => {
    const simplified = simplifyTrack(northTrack(300000, 5, () => 500));
    assert.ok(simplified.length <= MAX_STORED_POINTS);
});

test('analyzeTrack: salita e discesa regolari danno distanza, D+, D- e pendenze attese', () => {
    // 5 km al 10% di salita, poi 5 km al 10% di discesa: 500 m su e giù.
    const elevation = distance => (distance <= 5000 ? 1000 + distance * 0.1 : 1500 - (distance - 5000) * 0.1);
    const analysis = analyzeTrack(simplifyTrack(northTrack(10000, 10, elevation)));
    const { summary } = analysis;
    assert.ok(Math.abs(summary.distanceKm - 10) < 0.02);
    assert.ok(Math.abs(summary.gain - 500) <= 8, `D+ ${summary.gain}`);
    assert.ok(Math.abs(summary.loss - 500) <= 8, `D- ${summary.loss}`);
    assert.ok(Math.abs(summary.maxEle - 1500) <= 5);
    assert.ok(Math.abs(summary.maxEleKm - 5) < 0.1);
    assert.ok(Math.abs(summary.avgUphillGrade - 10) < 0.5);
    assert.ok(Math.abs(summary.avgDownhillGrade + 10) < 0.5);
    assert.equal(summary.isLoop, false);
    // km sforzo = 10 + 500/100 + 500/200
    assert.ok(Math.abs(summary.kmEffort - 17.5) < 0.2);

    assert.equal(analysis.climbs.length, 1);
    assert.equal(analysis.descents.length, 1);
    assert.ok(Math.abs(analysis.climbs[0].elevation - 500) <= 8);
    assert.ok(Math.abs(analysis.climbs[0].avgGrade - 10) < 0.5);

    const shares = Object.fromEntries(analysis.gradeDistribution.map(bucket => [bucket.key, bucket.share]));
    assert.ok(shares['up-mid'] > 45, `salita ${shares['up-mid']}%`);
    assert.ok(shares['down-mid'] > 45, `discesa ${shares['down-mid']}%`);
    const totalShare = analysis.gradeDistribution.reduce((sum, bucket) => sum + bucket.share, 0);
    assert.ok(Math.abs(totalShare - 100) < 0.5);
});

test('analyzeTrack: i parziali al km sommano al totale del D+', () => {
    const elevation = distance => 500 + 40 * Math.sin(distance / 300) + distance * 0.03;
    const analysis = analyzeTrack(simplifyTrack(northTrack(7300, 5, elevation)));
    assert.equal(analysis.kmSplits.length, 8);
    assert.ok(Math.abs(analysis.kmSplits.at(-1).lengthKm - 0.3) < 0.02);
    const sumGain = analysis.kmSplits.reduce((sum, split) => sum + split.gain, 0);
    assert.ok(Math.abs(sumGain - analysis.summary.gain) <= analysis.kmSplits.length);
    assert.equal(analysis.kmSplits.at(-1).cumGain, analysis.summary.gain);
});

test('analyzeTrack ignora il rumore GPS sotto la soglia su un percorso piatto', () => {
    const noisy = distance => 200 + (Math.floor(distance / 10) % 2 ? 0.8 : -0.8);
    const analysis = analyzeTrack(simplifyTrack(northTrack(5000, 10, noisy)));
    assert.ok(analysis.summary.gain <= 5, `D+ ${analysis.summary.gain}`);
    assert.equal(analysis.climbs.length, 0);
    assert.ok(analysis.summary.flatKm > 4.5);
});

test('analyzeTrack senza quote: solo distanza, nessun dislivello', () => {
    const analysis = analyzeTrack(simplifyTrack(northTrack(3000, 10, () => null)));
    assert.equal(analysis.hasElevation, false);
    assert.equal(analysis.summary.gain, undefined);
    assert.deepEqual(analysis.gradeDistribution, []);
    assert.equal(analysis.kmSplits.length, 3);
    assert.equal(rangeStats(analysis, 0, 1500).gain, null);
});

test('segmentsBetween divide il percorso tra i punti, in ordine di km', () => {
    const elevation = distance => (distance <= 4000 ? 300 + distance * 0.05 : 500);
    const analysis = analyzeTrack(simplifyTrack(northTrack(8000, 10, elevation)));
    const segments = segmentsBetween(analysis, [
        { name: 'Acqua', km: 6 },
        { name: 'Ristoro', km: 2 },
        { name: 'Fuori traccia', km: 50 }
    ]);
    assert.deepEqual(
        segments.map(segment => [segment.from.name, segment.to.name]),
        [
            ['Partenza', 'Ristoro'],
            ['Ristoro', 'Acqua'],
            ['Acqua', 'Arrivo']
        ]
    );
    assert.ok(Math.abs(segments[0].distanceKm - 2) < 0.03);
    assert.ok(Math.abs(segments[0].gain - 100) <= 5);
    assert.ok(segments[2].gain <= 2);
    // Un punto sulla partenza sostituisce l'etichetta "Partenza".
    const fromStart = segmentsBetween(analysis, [{ name: 'Base vita', km: 0 }]);
    assert.equal(fromStart.length, 1);
    assert.equal(fromStart[0].from.name, 'Base vita');
});

test('pointAtKm e nearestKm sono coerenti', () => {
    const analysis = analyzeTrack(simplifyTrack(northTrack(5000, 10, distance => 100 + distance * 0.02)));
    const point = pointAtKm(analysis, 3.2);
    assert.ok(Math.abs(point.ele - 164) < 1.5);
    const nearest = nearestKm(analysis, point.lat, point.lon + 0.001);
    assert.ok(Math.abs(nearest.km - 3.2) <= GRID_STEP_M / 1000);
    assert.ok(nearest.distanceM > 70 && nearest.distanceM < 90);
});

test('bucketFor classifica le pendenze agli estremi', () => {
    assert.equal(bucketFor(0).key, 'flat');
    assert.equal(bucketFor(-25).key, 'down-steep');
    assert.equal(bucketFor(35).key, 'up-steep');
    assert.equal(bucketFor(7).key, 'up-mid');
    assert.equal(bucketFor(10).key, 'up-mid');
    assert.equal(bucketFor(-10).key, 'down-mid');
    assert.equal(bucketFor(-2).key, 'flat');
});

test('validazione di traccia e punti', () => {
    assert.deepEqual(validateTrack({ name: '  UTMB  ', notes: '' }), { name: 'UTMB', notes: null, race_id: null });
    assert.equal(
        validateTrack({ name: 'X', race_id: '5f0c6a8e-1b2c-4d3e-9f00-112233445566' }).race_id,
        '5f0c6a8e-1b2c-4d3e-9f00-112233445566'
    );
    assert.throws(() => validateTrack({ name: 'X', race_id: "x'; drop" }), /gara collegata/);
    assert.throws(() => validateTrack({ name: ' ' }), /nome della traccia/);
    assert.deepEqual(validateWaypoint({ kind: 'water', name: 'Fontana', km: '12,5' }, { maxKm: 20 }), {
        kind: 'water',
        name: 'Fontana',
        km: 12.5,
        notes: null
    });
    assert.throws(() => validateWaypoint({ kind: 'water', name: 'X', km: '25' }, { maxKm: 20 }), /lunghezza della traccia/);
    assert.throws(() => validateWaypoint({ kind: 'bar', name: 'X', km: '1' }), /tipo di punto/);
    assert.throws(() => validateWaypoint({ kind: 'water', name: 'X', km: '' }), /non negativo/);
});

test('guessWaypointKind propone il tipo dai nomi più comuni', () => {
    assert.equal(guessWaypointKind({ name: 'Ristoro Malga' }), 'refreshment');
    assert.equal(guessWaypointKind({ name: 'Fontana' }), 'water');
    assert.equal(guessWaypointKind({ name: 'Base vita Cortina' }), 'aid_station');
    assert.equal(guessWaypointKind({ name: 'Cancello orario 14:00' }), 'cutoff');
    assert.equal(guessWaypointKind({ name: 'CP3' }), 'checkpoint');
    assert.equal(guessWaypointKind({ name: 'Rifugio', symbol: 'Drinking Water' }), 'water');
    assert.equal(guessWaypointKind({ name: 'Panorama' }), 'other');
});

test('validateRaceCourse: distanza e dislivelli da copiare nella gara', () => {
    assert.deepEqual(validateRaceCourse({ distanceKm: 42.3456, gain: 2500.4, loss: 2499.6 }), {
        distance_km: 42.346,
        elevation_gain_m: 2500,
        elevation_loss_m: 2500
    });
    assert.deepEqual(validateRaceCourse({ distanceKm: 10 }), { distance_km: 10, elevation_gain_m: null, elevation_loss_m: null });
    assert.throws(() => validateRaceCourse({ distanceKm: 0 }), /maggiore di zero/);
    assert.throws(() => validateRaceCourse({ distanceKm: 1200 }), /1000 km/);
    assert.throws(() => validateRaceCourse({ distanceKm: 10, gain: -5 }), /positivo/);
});

test('parseGpx scarta caratteri non validi in XML e quote fuori scala', () => {
    const gpx = `<gpx><wpt lat="45" lon="9"><name>a&#1;b&#xD800;c</name></wpt><trk><trkseg>
<trkpt lat="45" lon="9"><ele>99999</ele></trkpt><trkpt lat="45.01" lon="9"><ele>-9999</ele></trkpt><trkpt lat="45.02" lon="9"><ele>-400</ele></trkpt>
</trkseg></trk></gpx>`;
    const parsed = parseGpx(gpx);
    assert.equal(parsed.waypoints[0].name, 'abc');
    assert.deepEqual(
        parsed.points.map(point => point.ele),
        [null, null, -400]
    );
    const exported = buildGpx({
        name: `x${String.fromCharCode(1)}y${String.fromCharCode(0xd800)}z`,
        points: [
            [45, 9, null],
            [45.01, 9, null]
        ]
    });
    assert.ok(exported.includes('<name>xyz</name>'));
});

test('validateWaypoint accetta un punto sull’arrivo appena oltre la lunghezza arrotondata', () => {
    assert.equal(validateWaypoint({ kind: 'water', name: 'Arrivo', km: '6.005' }, { maxKm: 6 }).km, 6);
    assert.throws(() => validateWaypoint({ kind: 'water', name: 'X', km: '6.02' }, { maxKm: 6 }), /lunghezza/);
});

test('GpxTracksService.getTrackPoints scarta i punti malformati', async () => {
    const points = [[45, 9, 100], 'x', [null, 9], [45.01, 9, 'a'], [45.02, 9]];
    const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: { id: 't', points }, error: null })
    };
    const service = new GpxTracksService({ from: () => query });
    assert.deepEqual(await service.getTrackPoints('u', 't'), [
        [45, 9, 100],
        [45.01, 9, null],
        [45.02, 9, null]
    ]);
});
