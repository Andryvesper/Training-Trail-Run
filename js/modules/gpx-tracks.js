// Tracce GPX salvate e punti personalizzati (ristori, acqua, aid station...).
// Validazione pura + accesso a Supabase (tabelle gpx_tracks e gpx_track_waypoints).

import { MAX_STORED_POINTS } from './gpx-analysis.js';

const TRACKS_TABLE = 'gpx_tracks';
const WAYPOINTS_TABLE = 'gpx_track_waypoints';
const TRACK_FIELDS =
    'id, user_id, race_id, name, notes, file_name, distance_km, elevation_gain_m, elevation_loss_m, min_elevation_m, max_elevation_m, point_count, created_at, updated_at';
const WAYPOINT_FIELDS = 'id, track_id, user_id, kind, name, km, notes, created_at';

// Colori: palette categoriale validata per il tema scuro, in ordine fisso.
// Il colore non è mai l'unico segnale: ogni punto ha numero, nome e tipo scritti.
export const WAYPOINT_KINDS = Object.freeze([
    { value: 'water', label: 'Acqua', refuel: true, color: '#338ced', symbol: 'Drinking Water' },
    { value: 'refreshment', label: 'Ristoro', refuel: true, color: '#e76624', symbol: 'Food' },
    { value: 'aid_station', label: 'Aid station / base vita', refuel: true, color: '#00a888', symbol: 'Medical Facility' },
    { value: 'danger', label: 'Tratto tecnico / attenzione', refuel: false, color: '#d28e05', symbol: 'Danger Area' },
    { value: 'cutoff', label: 'Cancello orario', refuel: false, color: '#e24d8b', symbol: 'Flag, Red' },
    { value: 'checkpoint', label: 'Punto di controllo', refuel: false, color: '#0aac23', symbol: 'Flag, Blue' },
    { value: 'other', label: 'Altro', refuel: false, color: '#9887ef', symbol: 'Waypoint' }
]);

export function waypointKind(value) {
    return WAYPOINT_KINDS.find(kind => kind.value === value) || WAYPOINT_KINDS[WAYPOINT_KINDS.length - 1];
}

// Tipo proposto per un waypoint del file GPX, dal nome, simbolo o tipo.
// L'atleta può sempre correggerlo dopo l'importazione.
const KIND_PATTERNS = [
    ['cutoff', /cancello|cut[\s-]?off|barriera oraria|tempo massimo/i],
    ['aid_station', /base\s*vita|life\s*base|aid\s*station|\baid\b|assistenza|crew|drop\s*bag|medical/i],
    ['refreshment', /ristoro|refresh|ravitaill|rifornimento|\bfood\b|\bfeed|cibo|restaurant/i],
    ['water', /acqua|water|fontana|fountain|\bfonte\b|sorgente|drink/i],
    ['checkpoint', /check\s*point|checkpoint|controllo|\bcp\s?\d|\bpc\s?\d|control/i],
    ['danger', /pericolo|danger|attenzione|caution|tecnico|esposto|catene|ferrata/i]
];

export function guessWaypointKind({ name, symbol, type, description } = {}) {
    const text = [name, symbol, type, description].filter(Boolean).join(' ');
    const match = KIND_PATTERNS.find(([, pattern]) => pattern.test(text));
    return match ? match[0] : 'other';
}

export function validateTrack(track) {
    const name = String(track?.name ?? '').trim();
    const notes = String(track?.notes ?? '').trim() || null;
    const raceId = String(track?.race_id ?? '').trim() || null;
    if (!name) throw new Error('Inserisci il nome della traccia.');
    if (name.length > 120) throw new Error('Il nome della traccia non può superare 120 caratteri.');
    if (notes && notes.length > 2000) throw new Error('Le note non possono superare 2000 caratteri.');
    if (raceId && !/^[0-9a-z-]{1,64}$/i.test(raceId)) throw new Error('La gara collegata non è valida.');
    return { name, notes, race_id: raceId };
}

export function validateWaypoint(waypoint, { maxKm = Infinity } = {}) {
    const kind = String(waypoint?.kind ?? '');
    const name = String(waypoint?.name ?? '').trim();
    const notes = String(waypoint?.notes ?? '').trim() || null;
    const kmText = String(waypoint?.km ?? '')
        .trim()
        .replace(',', '.');
    const km = kmText === '' ? NaN : Number(kmText);

    if (!WAYPOINT_KINDS.some(item => item.value === kind)) throw new Error('Scegli il tipo di punto.');
    if (!name) throw new Error('Inserisci il nome del punto.');
    if (name.length > 80) throw new Error('Il nome del punto non può superare 80 caratteri.');
    if (notes && notes.length > 500) throw new Error('Le note del punto non possono superare 500 caratteri.');
    if (!Number.isFinite(km) || km < 0) throw new Error('Il km del punto deve essere un numero non negativo.');
    // La lunghezza mostrata è arrotondata a 10 m: un punto sull'arrivo può superarla di poco.
    if (km > maxKm + 0.01) throw new Error(`Il km del punto non può superare la lunghezza della traccia (${maxKm} km).`);
    return { kind, name, km: Math.round(Math.min(km, maxKm) * 1000) / 1000, notes };
}

export class GpxTracksService {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async listTracks(userId) {
        const { data, error } = await this.supabaseClient
            .from(TRACKS_TABLE)
            .select(TRACK_FIELDS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getTrackPoints(userId, trackId) {
        const { data, error } = await this.supabaseClient
            .from(TRACKS_TABLE)
            .select('id, points')
            .eq('id', trackId)
            .eq('user_id', userId)
            .single();
        if (error) throw error;
        if (!Array.isArray(data?.points)) throw new Error('I punti della traccia non sono disponibili.');
        // Il database controlla solo che sia un array: si scartano i punti malformati.
        const points = data.points
            .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
            .map(point => [point[0], point[1], Number.isFinite(point[2]) ? point[2] : null]);
        if (points.length < 2) throw new Error('I punti della traccia non sono validi.');
        return points;
    }

    async createTrack(userId, { name, notes, raceId, fileName, points, summary }) {
        const meta = validateTrack({ name, notes, race_id: raceId });
        if (!Array.isArray(points) || points.length < 2 || points.length > MAX_STORED_POINTS) {
            throw new Error('La traccia ha un numero di punti non valido.');
        }
        const record = {
            ...meta,
            user_id: userId,
            file_name: fileName ? String(fileName).slice(0, 200) : null,
            distance_km: summary.distanceKm,
            elevation_gain_m: summary.gain ?? null,
            elevation_loss_m: summary.loss ?? null,
            min_elevation_m: summary.minEle ?? null,
            max_elevation_m: summary.maxEle ?? null,
            point_count: points.length,
            points
        };
        const { data, error } = await this.supabaseClient.from(TRACKS_TABLE).insert(record).select(TRACK_FIELDS).single();
        if (error) throw error;
        if (!data) throw new Error('La traccia non è stata salvata.');
        return data;
    }

    async updateTrack(userId, trackId, changes) {
        const meta = validateTrack(changes);
        const { data, error } = await this.supabaseClient
            .from(TRACKS_TABLE)
            .update({ ...meta, updated_at: new Date().toISOString() })
            .eq('id', trackId)
            .eq('user_id', userId)
            .select(TRACK_FIELDS)
            .single();
        if (error) throw error;
        if (!data) throw new Error('La traccia non è stata aggiornata.');
        return data;
    }

    async deleteTrack(userId, trackId) {
        const { error } = await this.supabaseClient.from(TRACKS_TABLE).delete().eq('id', trackId).eq('user_id', userId);
        if (error) throw error;
    }

    async listWaypoints(userId, trackId) {
        const { data, error } = await this.supabaseClient
            .from(WAYPOINTS_TABLE)
            .select(WAYPOINT_FIELDS)
            .eq('track_id', trackId)
            .eq('user_id', userId)
            .order('km');
        if (error) throw error;
        return data || [];
    }

    async saveWaypoint(userId, trackId, waypoint, { maxKm } = {}) {
        const values = validateWaypoint(waypoint, { maxKm });
        const query = waypoint.id
            ? this.supabaseClient.from(WAYPOINTS_TABLE).update(values).eq('id', waypoint.id).eq('user_id', userId)
            : this.supabaseClient.from(WAYPOINTS_TABLE).insert({ ...values, track_id: trackId, user_id: userId });
        const { data, error } = await query.select(WAYPOINT_FIELDS).single();
        if (error) throw error;
        if (!data) throw new Error('Il punto non è stato salvato.');
        return data;
    }

    async insertWaypoints(userId, trackId, waypoints, { maxKm } = {}) {
        if (!waypoints.length) return [];
        const records = waypoints.map(waypoint => ({ ...validateWaypoint(waypoint, { maxKm }), track_id: trackId, user_id: userId }));
        const { data, error } = await this.supabaseClient.from(WAYPOINTS_TABLE).insert(records).select(WAYPOINT_FIELDS);
        if (error) throw error;
        return data || [];
    }

    async deleteWaypoint(userId, waypointId) {
        const { error } = await this.supabaseClient.from(WAYPOINTS_TABLE).delete().eq('id', waypointId).eq('user_id', userId);
        if (error) throw error;
    }
}
