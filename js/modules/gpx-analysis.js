// Analisi di una traccia GPX: profilo altimetrico, dislivelli, pendenze,
// salite e discese principali, parziali al km e tratte tra punti.
// Funzioni pure: lavorano sui punti salvati ([lat, lon, quota|null]), così
// l'analisi è identica al caricamento e a ogni riapertura.
//
// Metodo (stime, non misure ufficiali):
// - la traccia è ricampionata ogni GRID_STEP_M metri lungo il percorso;
// - la quota è lisciata con una media mobile di circa 100 m, per togliere il
//   rumore del GPS;
// - D+ e D- contano solo variazioni di almeno HYSTERESIS_M metri;
// - "km sforzo" usa la formula già presente nell'app (trail-elevation.js).
// Il D+ dichiarato da un organizzatore può differire anche del 5-10%.

import { calculateEquivalentDistance } from './trail-elevation.js';

export const GRID_STEP_M = 20;
export const MAX_STORED_POINTS = 20000;
export const MIN_TRACK_LENGTH_M = 100;
const MIN_SPACING_M = 10;
const SMOOTHING_SAMPLES = 5;
const HYSTERESIS_M = 2;
const GRADE_HALF_WINDOW = 2;
const CLIMB_REVERSAL_M = 20;
const MIN_CLIMB_M = 50;
const FLAT_GRADE = 2;
const LOOP_TOLERANCE_M = 200;
const EARTH_RADIUS_M = 6371008.8;

export const GRADE_BUCKETS = Object.freeze([
    { key: 'down-steep', label: 'Oltre −20%', min: -Infinity, max: -20 },
    { key: 'down-hard', label: 'Da −20% a −10%', min: -20, max: -10 },
    { key: 'down-mid', label: 'Da −10% a −5%', min: -10, max: -5 },
    { key: 'down-soft', label: 'Da −5% a −2%', min: -5, max: -FLAT_GRADE },
    { key: 'flat', label: 'Pianura (±2%)', min: -FLAT_GRADE, max: FLAT_GRADE },
    { key: 'up-soft', label: 'Da 2% a 5%', min: FLAT_GRADE, max: 5 },
    { key: 'up-mid', label: 'Da 5% a 10%', min: 5, max: 10 },
    { key: 'up-hard', label: 'Da 10% a 20%', min: 10, max: 20 },
    { key: 'up-steep', label: 'Oltre 20%', min: 20, max: Infinity }
]);

export function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Riduce i punti letti dal GPX a quelli da salvare: al massimo uno ogni 10 m
 * (o meno, per restare sotto MAX_STORED_POINTS), quote mancanti interpolate.
 * @param {{lat:number, lon:number, ele:number|null}[]} points
 * @returns {[number, number, number|null][]}
 */
export function simplifyTrack(points) {
    const valid = (points || []).filter(point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
    if (valid.length < 2) throw new Error('La traccia deve avere almeno 2 punti validi.');

    const cumulative = cumulativeDistances(valid.map(point => [point.lat, point.lon]));
    const total = cumulative[cumulative.length - 1];
    if (total < MIN_TRACK_LENGTH_M) throw new Error('La traccia è troppo corta (meno di 100 m).');

    const elevations = fillElevations(
        valid.map(point => (Number.isFinite(point.ele) ? point.ele : null)),
        cumulative
    );
    const spacing = Math.max(MIN_SPACING_M, total / (MAX_STORED_POINTS - 2));
    const kept = [0];
    for (let index = 1; index < valid.length - 1; index += 1) {
        if (cumulative[index] - cumulative[kept[kept.length - 1]] >= spacing - 1e-3) kept.push(index);
    }
    kept.push(valid.length - 1);

    return kept.map(index => [
        round(valid[index].lat, 6),
        round(valid[index].lon, 6),
        elevations[index] === null ? null : round(elevations[index], 1)
    ]);
}

/**
 * Analisi completa dei punti salvati.
 * @param {[number, number, number|null][]} points
 */
export function analyzeTrack(points) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('La traccia deve avere almeno 2 punti.');
    const cumulative = cumulativeDistances(points);
    const totalM = cumulative[cumulative.length - 1];
    if (!(totalM > 0)) throw new Error('La traccia non ha una lunghezza misurabile.');
    const hasElevation = points.some(point => Number.isFinite(point[2]));
    const elevations = hasElevation
        ? fillElevations(
              points.map(point => point[2]),
              cumulative
          )
        : null;

    const profile = buildProfile(points, cumulative, elevations, totalM);
    const intervals = gradeIntervals(profile);
    const summary = buildSummary(profile, intervals, points, totalM, hasElevation);

    return {
        hasElevation,
        profile,
        summary,
        gradeDistribution: hasElevation ? gradeDistribution(intervals, totalM) : [],
        ...(hasElevation ? findClimbsAndDescents(profile) : { climbs: [], descents: [] }),
        kmSplits: kmSplits(profile)
    };
}

/** Statistiche tra due distanze (metri) lungo la traccia. */
export function rangeStats(analysis, fromM, toM) {
    const { profile } = analysis;
    const start = indexAt(profile, Math.max(0, Math.min(fromM, toM)));
    const end = indexAt(profile, Math.min(profile.totalM, Math.max(fromM, toM)));
    const distanceM = profile.distances[end] - profile.distances[start];
    if (!analysis.hasElevation) {
        return { distanceKm: round(distanceM / 1000, 2), gain: null, loss: null, kmEffort: round(distanceM / 1000, 2) };
    }
    const gain = Math.round(profile.cumGain[end] - profile.cumGain[start]);
    const loss = Math.round(profile.cumLoss[end] - profile.cumLoss[start]);
    let minEle = Infinity;
    let maxEle = -Infinity;
    for (let index = start; index <= end; index += 1) {
        minEle = Math.min(minEle, profile.elevations[index]);
        maxEle = Math.max(maxEle, profile.elevations[index]);
    }
    return {
        distanceKm: round(distanceM / 1000, 2),
        gain,
        loss,
        net: Math.round(profile.elevations[end] - profile.elevations[start]),
        minEle: Math.round(minEle),
        maxEle: Math.round(maxEle),
        endEle: Math.round(profile.elevations[end]),
        avgGrade: distanceM > 0 ? round(((profile.elevations[end] - profile.elevations[start]) / distanceM) * 100, 1) : 0,
        kmEffort: calculateEquivalentDistance(distanceM / 1000, gain, loss)
    };
}

/**
 * Tratte tra punti consecutivi (ordinati per km), dalla partenza all'arrivo.
 * @param {ReturnType<typeof analyzeTrack>} analysis
 * @param {{ name: string, km: number }[]} stops
 */
export function segmentsBetween(analysis, stops) {
    const totalKm = analysis.profile.totalM / 1000;
    const sorted = (stops || [])
        .filter(stop => Number.isFinite(stop.km) && stop.km >= 0 && stop.km <= totalKm + 0.05)
        .map(stop => ({ ...stop, km: Math.min(stop.km, totalKm) }))
        .sort((left, right) => left.km - right.km);
    const boundaries = [{ name: 'Partenza', km: 0 }];
    sorted.forEach(stop => {
        const last = boundaries[boundaries.length - 1];
        // Un punto alla partenza (o due nello stesso posto) diventa l'estremo della tratta.
        if (stop.km - last.km < 0.05) boundaries[boundaries.length - 1] = stop;
        else boundaries.push(stop);
    });
    const last = boundaries[boundaries.length - 1];
    if (totalKm - last.km >= 0.05) boundaries.push({ name: 'Arrivo', km: totalKm });

    const segments = [];
    for (let index = 1; index < boundaries.length; index += 1) {
        const from = boundaries[index - 1];
        const to = boundaries[index];
        segments.push({ from, to, ...rangeStats(analysis, from.km * 1000, to.km * 1000) });
    }
    return segments;
}

/** Posizione e quota (lisciata) a una certa distanza dalla partenza. */
export function pointAtKm(analysis, km) {
    const { profile } = analysis;
    const meters = Math.max(0, Math.min(profile.totalM, km * 1000));
    const index = indexAt(profile, meters);
    return {
        lat: profile.lats[index],
        lon: profile.lons[index],
        ele: analysis.hasElevation ? round(profile.elevations[index], 1) : null,
        grade: analysis.hasElevation ? profile.grades[index] : null
    };
}

/** Km del punto della traccia più vicino a una coordinata e sua distanza (m). */
export function nearestKm(analysis, lat, lon) {
    const { profile } = analysis;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    let best = 0;
    let bestScore = Infinity;
    for (let index = 0; index < profile.distances.length; index += 1) {
        const dLat = profile.lats[index] - lat;
        const dLon = (profile.lons[index] - lon) * cosLat;
        const score = dLat * dLat + dLon * dLon;
        if (score < bestScore) {
            bestScore = score;
            best = index;
        }
    }
    return {
        km: round(profile.distances[best] / 1000, 3),
        distanceM: Math.round(haversineMeters(lat, lon, profile.lats[best], profile.lons[best]))
    };
}

function buildProfile(points, cumulative, elevations, totalM) {
    const count = Math.floor(totalM / GRID_STEP_M) + 1;
    const distances = Array.from({ length: count }, (_, index) => index * GRID_STEP_M);
    if (totalM - distances[count - 1] > 0.5) distances.push(totalM);
    else distances[count - 1] = totalM;

    const lats = [];
    const lons = [];
    const rawElevations = [];
    let segment = 0;
    distances.forEach(distance => {
        while (segment < cumulative.length - 2 && cumulative[segment + 1] < distance) segment += 1;
        const span = cumulative[segment + 1] - cumulative[segment];
        const ratio = span > 0 ? Math.min(1, Math.max(0, (distance - cumulative[segment]) / span)) : 0;
        lats.push(lerp(points[segment][0], points[segment + 1][0], ratio));
        lons.push(lerp(points[segment][1], points[segment + 1][1], ratio));
        if (elevations) rawElevations.push(lerp(elevations[segment], elevations[segment + 1], ratio));
    });

    const profile = { totalM, distances, lats, lons, elevations: null, grades: null, cumGain: null, cumLoss: null };
    if (!elevations) return profile;

    profile.elevations = movingAverage(rawElevations, SMOOTHING_SAMPLES);
    const { cumGain, cumLoss } = cumulativeGainLoss(profile.elevations);
    profile.cumGain = cumGain;
    profile.cumLoss = cumLoss;
    profile.grades = profile.elevations.map((_, index) => {
        const left = Math.max(0, index - GRADE_HALF_WINDOW);
        const right = Math.min(distances.length - 1, index + GRADE_HALF_WINDOW);
        const run = distances[right] - distances[left];
        return run > 0 ? round(((profile.elevations[right] - profile.elevations[left]) / run) * 100, 1) : 0;
    });
    return profile;
}

// Isteresi: una variazione conta solo quando supera la soglia rispetto
// all'ultima quota di riferimento. Il dislivello è attribuito al campione in
// cui la soglia è superata, così le somme parziali coincidono col totale.
function cumulativeGainLoss(elevations) {
    const cumGain = [0];
    const cumLoss = [0];
    let reference = elevations[0];
    for (let index = 1; index < elevations.length; index += 1) {
        const delta = elevations[index] - reference;
        let gain = 0;
        let loss = 0;
        if (delta >= HYSTERESIS_M) {
            gain = delta;
            reference = elevations[index];
        } else if (delta <= -HYSTERESIS_M) {
            loss = -delta;
            reference = elevations[index];
        }
        cumGain.push(cumGain[index - 1] + gain);
        cumLoss.push(cumLoss[index - 1] + loss);
    }
    return { cumGain, cumLoss };
}

function gradeIntervals(profile) {
    if (!profile.elevations) return [];
    const intervals = [];
    for (let index = 1; index < profile.distances.length; index += 1) {
        const length = profile.distances[index] - profile.distances[index - 1];
        if (length <= 0) continue;
        intervals.push({
            length,
            rise: profile.elevations[index] - profile.elevations[index - 1],
            grade: (profile.grades[index - 1] + profile.grades[index]) / 2
        });
    }
    return intervals;
}

function buildSummary(profile, intervals, points, totalM, hasElevation) {
    const distanceKm = round(totalM / 1000, 2);
    const first = points[0];
    const last = points[points.length - 1];
    const isLoop = haversineMeters(first[0], first[1], last[0], last[1]) <= LOOP_TOLERANCE_M;
    const summary = { distanceKm, isLoop, kmEffort: distanceKm };
    if (!hasElevation) return summary;

    const lastIndex = profile.distances.length - 1;
    const gain = Math.round(profile.cumGain[lastIndex]);
    const loss = Math.round(profile.cumLoss[lastIndex]);
    let uphillM = 0;
    let downhillM = 0;
    let uphillRise = 0;
    let downhillDrop = 0;
    intervals.forEach(interval => {
        if (interval.grade > FLAT_GRADE) {
            uphillM += interval.length;
            uphillRise += interval.rise;
        } else if (interval.grade < -FLAT_GRADE) {
            downhillM += interval.length;
            downhillDrop -= interval.rise;
        }
    });
    let minIndex = 0;
    let maxIndex = 0;
    profile.elevations.forEach((value, index) => {
        if (value < profile.elevations[minIndex]) minIndex = index;
        if (value > profile.elevations[maxIndex]) maxIndex = index;
    });

    return {
        ...summary,
        gain,
        loss,
        gainPerKm: round(gain / (totalM / 1000), 1),
        startEle: Math.round(profile.elevations[0]),
        endEle: Math.round(profile.elevations[lastIndex]),
        minEle: Math.round(profile.elevations[minIndex]),
        minEleKm: round(profile.distances[minIndex] / 1000, 2),
        maxEle: Math.round(profile.elevations[maxIndex]),
        maxEleKm: round(profile.distances[maxIndex] / 1000, 2),
        kmEffort: calculateEquivalentDistance(totalM / 1000, gain, loss),
        uphillKm: round(uphillM / 1000, 2),
        downhillKm: round(downhillM / 1000, 2),
        flatKm: round((totalM - uphillM - downhillM) / 1000, 2),
        avgUphillGrade: uphillM > 0 ? round((uphillRise / uphillM) * 100, 1) : 0,
        avgDownhillGrade: downhillM > 0 ? round((-downhillDrop / downhillM) * 100, 1) : 0,
        steepest100Up: steepestWindow(profile, 100, 1),
        steepest100Down: steepestWindow(profile, 100, -1),
        steepest1kmUp: steepestWindow(profile, 1000, 1),
        steepest1kmDown: steepestWindow(profile, 1000, -1)
    };
}

// Tratto di lunghezza fissa con la pendenza media più alta (sign = 1 salita, -1 discesa).
function steepestWindow(profile, lengthM, sign) {
    const span = Math.round(lengthM / GRID_STEP_M);
    const { distances, elevations } = profile;
    if (distances.length <= span) return null;
    let best = null;
    for (let start = 0; start + span < distances.length; start += 1) {
        const end = start + span;
        const run = distances[end] - distances[start];
        const grade = ((elevations[end] - elevations[start]) / run) * 100;
        if (!best || grade * sign > best.grade * sign) best = { grade, fromKm: distances[start] / 1000, toKm: distances[end] / 1000 };
    }
    if (!best || best.grade * sign <= 0) return null;
    return { grade: round(best.grade, 1), fromKm: round(best.fromKm, 2), toKm: round(best.toKm, 2) };
}

function gradeDistribution(intervals, totalM) {
    return GRADE_BUCKETS.map(bucket => {
        const meters = intervals
            .filter(interval => bucketFor(interval.grade).key === bucket.key)
            .reduce((sum, interval) => sum + interval.length, 0);
        return { key: bucket.key, label: bucket.label, km: round(meters / 1000, 2), share: round((meters / totalM) * 100, 1) };
    });
}

// Intervalli simmetrici: pianura entro ±2%, poi (2, 5], (5, 10], (10, 20], oltre 20.
export function bucketFor(grade) {
    const steepness = Math.abs(grade);
    if (steepness <= FLAT_GRADE) return GRADE_BUCKETS[4];
    const step = steepness <= 5 ? 1 : steepness <= 10 ? 2 : steepness <= 20 ? 3 : 4;
    return GRADE_BUCKETS[grade > 0 ? 4 + step : 4 - step];
}

// Zig-zag sulla quota lisciata: un cambio di direzione vale solo oltre
// CLIMB_REVERSAL_M; si tengono i tratti con almeno MIN_CLIMB_M di dislivello.
function findClimbsAndDescents(profile) {
    const values = profile.elevations;
    const pivots = [];
    let direction = 0;
    let extreme = 0;
    let low = 0;
    let high = 0;
    for (let index = 1; index < values.length; index += 1) {
        if (direction === 0) {
            if (values[index] < values[low]) low = index;
            if (values[index] > values[high]) high = index;
            if (values[high] - values[low] >= CLIMB_REVERSAL_M) {
                direction = high > low ? 1 : -1;
                pivots.push(high > low ? low : high);
                extreme = index;
            }
        } else if (direction === 1) {
            if (values[index] >= values[extreme]) extreme = index;
            else if (values[extreme] - values[index] >= CLIMB_REVERSAL_M) {
                pivots.push(extreme);
                direction = -1;
                extreme = index;
            }
        } else if (values[index] <= values[extreme]) extreme = index;
        else if (values[index] - values[extreme] >= CLIMB_REVERSAL_M) {
            pivots.push(extreme);
            direction = 1;
            extreme = index;
        }
    }
    if (direction !== 0) pivots.push(extreme);

    const climbs = [];
    const descents = [];
    for (let index = 1; index < pivots.length; index += 1) {
        const start = pivots[index - 1];
        const end = pivots[index];
        const net = values[end] - values[start];
        if (Math.abs(net) < MIN_CLIMB_M) continue;
        const lengthM = profile.distances[end] - profile.distances[start];
        const leg = {
            fromKm: round(profile.distances[start] / 1000, 2),
            toKm: round(profile.distances[end] / 1000, 2),
            lengthKm: round(lengthM / 1000, 2),
            startEle: Math.round(values[start]),
            endEle: Math.round(values[end]),
            elevation: Math.round(Math.abs(net)),
            avgGrade: round((net / lengthM) * 100, 1),
            maxGrade: maxGradeBetween(profile, start, end, Math.sign(net))
        };
        (net > 0 ? climbs : descents).push(leg);
    }
    return { climbs, descents };
}

function maxGradeBetween(profile, start, end, sign) {
    const span = Math.round(100 / GRID_STEP_M);
    let best = 0;
    for (let index = start; index + span <= end; index += 1) {
        const run = profile.distances[index + span] - profile.distances[index];
        const grade = ((profile.elevations[index + span] - profile.elevations[index]) / run) * 100;
        if (grade * sign > best * sign) best = grade;
    }
    return round(best, 1);
}

function kmSplits(profile) {
    const splits = [];
    const totalKm = profile.totalM / 1000;
    const hasElevation = Boolean(profile.elevations);
    for (let km = 0; km < totalKm - 1e-9; km += 1) {
        const start = indexAt(profile, km * 1000);
        const end = indexAt(profile, Math.min(profile.totalM, (km + 1) * 1000));
        const lengthM = profile.distances[end] - profile.distances[start];
        if (lengthM <= 0) continue;
        const split = { km: km + 1, lengthKm: round(lengthM / 1000, 2) };
        if (hasElevation) {
            const gain = profile.cumGain[end] - profile.cumGain[start];
            const loss = profile.cumLoss[end] - profile.cumLoss[start];
            Object.assign(split, {
                gain: Math.round(gain),
                loss: Math.round(loss),
                avgGrade: round(((profile.elevations[end] - profile.elevations[start]) / lengthM) * 100, 1),
                endEle: Math.round(profile.elevations[end]),
                cumGain: Math.round(profile.cumGain[end]),
                kmEffort: calculateEquivalentDistance(lengthM / 1000, Math.round(gain), Math.round(loss))
            });
        }
        splits.push(split);
    }
    return splits;
}

function indexAt(profile, meters) {
    const last = profile.distances.length - 1;
    if (meters >= profile.totalM) return last;
    return Math.max(0, Math.min(last, Math.round(meters / GRID_STEP_M)));
}

function cumulativeDistances(coordinates) {
    const distances = [0];
    for (let index = 1; index < coordinates.length; index += 1) {
        const [lat1, lon1] = coordinates[index - 1];
        const [lat2, lon2] = coordinates[index];
        distances.push(distances[index - 1] + haversineMeters(lat1, lon1, lat2, lon2));
    }
    return distances;
}

// Quote mancanti: interpolate lungo la distanza; agli estremi si ripete il valore noto.
function fillElevations(values, cumulative) {
    if (!values.some(value => Number.isFinite(value))) return values.map(() => null);
    const nextKnown = new Array(values.length);
    let upcoming;
    for (let index = values.length - 1; index >= 0; index -= 1) {
        if (Number.isFinite(values[index])) upcoming = index;
        nextKnown[index] = upcoming;
    }
    let previous;
    return values.map((value, index) => {
        if (Number.isFinite(value)) {
            previous = index;
            return value;
        }
        const next = nextKnown[index];
        if (previous === undefined) return values[next];
        if (next === undefined) return values[previous];
        const span = cumulative[next] - cumulative[previous];
        const ratio = span > 0 ? (cumulative[index] - cumulative[previous]) / span : 0;
        return lerp(values[previous], values[next], ratio);
    });
}

// Media mobile centrata; agli estremi la finestra si restringe in modo
// simmetrico, così quota di partenza e di arrivo restano quelle reali.
function movingAverage(values, window) {
    const prefix = [0];
    values.forEach((value, index) => prefix.push(prefix[index] + value));
    return values.map((_, index) => {
        const half = Math.min(Math.floor(window / 2), index, values.length - 1 - index);
        const left = index - half;
        const right = index + half;
        return (prefix[right + 1] - prefix[left]) / (right - left + 1);
    });
}

function lerp(from, to, ratio) {
    return from + (to - from) * ratio;
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
