const TABLE_NAME = 'training_races';
const RACE_FIELDS = 'id, user_id, name, event_date, target_period, distance_km, elevation_gain_m, priority, goal, status, official_time_seconds, chip_time_seconds, overall_position, gender_position, category_position, category, bib_number, result_source_url';

export class TrainingRacesService {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async listRaces(userId) {
        const { data, error } = await this.supabaseClient
            .from(TABLE_NAME)
            .select(RACE_FIELDS)
            .eq('user_id', userId)
            .order('event_date', { ascending: true, nullsFirst: false })
            .order('created_at');

        if (error) throw error;
        return data;
    }

    async saveRace(userId, race) {
        const raceData = validateRace(race);
        const record = { ...raceData, user_id: userId };
        const query = race.id
            ? this.supabaseClient
                .from(TABLE_NAME)
                .update(record)
                .eq('id', race.id)
                .eq('user_id', userId)
            : this.supabaseClient
                .from(TABLE_NAME)
                .insert(record);
        const { data, error } = await query.select(RACE_FIELDS).single();

        if (error) throw error;
        if (!data) throw new Error('La gara non è stata salvata.');
        return data;
    }

    async deleteRace(userId, raceId) {
        const { data, error } = await this.supabaseClient
            .from(TABLE_NAME)
            .delete()
            .eq('id', raceId)
            .eq('user_id', userId)
            .select('id')
            .single();

        if (error) throw error;
        if (!data) throw new Error('La gara non è stata eliminata.');
    }
}

function validateRace(race) {
    const name = String(race.name ?? '').trim();
    const period = String(race.target_period ?? '').trim() || null;
    const goal = String(race.goal ?? '').trim() || null;
    const category = String(race.category ?? '').trim() || null;
    const bibNumber = String(race.bib_number ?? '').trim() || null;
    const sourceUrl = String(race.result_source_url ?? '').trim() || null;
    const distance = race.distance_km === '' || race.distance_km == null
        ? null
        : Number(race.distance_km);
    const elevation = race.elevation_gain_m === '' || race.elevation_gain_m == null
        ? null
        : Number(race.elevation_gain_m);
    const priority = race.priority === '' || race.priority == null ? 2 : Number(race.priority);
    const eventDate = String(race.event_date ?? '').trim() || null;
    const status = race.status;
    const officialTime = parseDuration(race.official_time);
    const chipTime = parseDuration(race.chip_time);
    const overallPosition = parsePosition(race.overall_position, 'La posizione assoluta');
    const genderPosition = parsePosition(race.gender_position, 'La posizione di genere');
    const categoryPosition = parsePosition(race.category_position, 'La posizione di categoria');

    if (!name) throw new Error('Inserisci il nome della gara.');
    if (name.length > 120) throw new Error('Il nome della gara non può superare 120 caratteri.');
    if (period && period.length > 80) throw new Error('Il periodo non può superare 80 caratteri.');
    if (goal && goal.length > 2000) throw new Error('Le note non possono superare 2000 caratteri.');
    if (category && category.length > 40) throw new Error('La categoria non può superare 40 caratteri.');
    if (bibNumber && bibNumber.length > 30) throw new Error('Il pettorale non può superare 30 caratteri.');
    if (!eventDate && !period) throw new Error('Inserisci la data o il periodo previsto.');
    if (eventDate && !isValidDate(eventDate)) throw new Error('La data della gara non è valida.');
    if (eventDate && period) throw new Error('Inserisci la data esatta oppure il periodo, non entrambi.');
    if (!Number.isFinite(distance) || distance <= 0) {
        throw new Error('La distanza deve essere un numero maggiore di zero.');
    }
    if (elevation !== null && (!Number.isInteger(elevation) || elevation < 0)) {
        throw new Error('Il dislivello deve essere un numero intero non negativo.');
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
        throw new Error('La priorità deve essere 1, 2 o 3.');
    }
    if (!['planned', 'completed'].includes(status)) throw new Error('Lo stato della gara non è valido.');
    if (status === 'completed' && !eventDate) {
        throw new Error('Per una gara completata serve la data esatta.');
    }
    if (status === 'planned' && (officialTime !== null || chipTime !== null
        || overallPosition !== null || genderPosition !== null || categoryPosition !== null
        || category !== null || bibNumber !== null || sourceUrl !== null)) {
        throw new Error('I risultati si possono inserire solo per una gara completata.');
    }
    if (sourceUrl && !isHttpsUrl(sourceUrl)) {
        throw new Error('Il link del risultato deve essere un URL HTTPS valido.');
    }

    return {
        name,
        event_date: eventDate,
        target_period: period,
        distance_km: distance,
        elevation_gain_m: elevation,
        priority,
        goal,
        status,
        official_time_seconds: officialTime,
        chip_time_seconds: chipTime,
        overall_position: overallPosition,
        gender_position: genderPosition,
        category_position: categoryPosition,
        category,
        bib_number: bibNumber,
        result_source_url: sourceUrl
    };
}

function parseDuration(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(text);
    if (!match) throw new Error('I tempi devono essere nel formato HH:MM:SS.');

    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parsePosition(value, label) {
    if (value === '' || value == null) return null;
    const position = Number(value);
    if (!Number.isInteger(position) || position < 1) {
        throw new Error(`${label} deve essere un intero positivo.`);
    }
    return position;
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isHttpsUrl(value) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}
