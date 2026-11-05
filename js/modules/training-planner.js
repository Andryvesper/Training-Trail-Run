import { assessTrainingMethodology } from './training-methodology-rules.js';
import {
    assessRaceCompatibility,
    normalizeSecondaryRaceIntents
} from './training-race-compatibility.js';
import {
    canCalculateReferencePace,
    calculateReferencePace,
    formatTestDuration,
    parseTestDuration
} from './training-reference-pace.js';

const PROFILE_TABLE = 'training_planning_profiles';
const DRAFTS_TABLE = 'training_plan_drafts';
const PROFILE_FIELDS = 'user_id, questionnaire, updated_at';
const DRAFT_FIELDS = 'id, user_id, goal_mode, primary_race_id, profile_snapshot, status, created_at';
const VALID_GOALS = ['race', 'maintain', 'improve', 'other'];
const VALID_PROFILES = ['returning_or_new', 'regular_recreational', 'structured_experienced', 'prefer_not_to_say'];
const VALID_CONSISTENCY = ['consistent', 'interrupted', 'returning', 'unknown'];
const VALID_FOCI = ['continuity', 'comfort', 'distance', 'performance'];
const VALID_TERRAINS = ['road', 'trail', 'mixed', 'treadmill', 'other'];
const VALID_TRAIL_EXPERIENCE = ['none', 'some', 'regular'];
const VALID_TESTS = ['three_km', 'three_km_plus_10', 'ten_km', 'race', 'other'];
const VALID_PEAK_WEEK_MODES = ['disabled', 'suggest_with_reason'];
const VALID_CROSS_TRAINING_SPORTS = ['swimming', 'cycling', 'strength', 'other'];
const VALID_SCHEDULE_TYPES = ['fixed', 'movable'];
const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function normalizePlanningProfile(input = {}) {
    const goalMode = optionalEnum(input.goal_mode, VALID_GOALS, 'Seleziona l’obiettivo del piano.');
    const selfProfile = optionalEnum(input.self_profile, VALID_PROFILES, 'Seleziona come descrivi la tua esperienza.');
    const consistency = optionalEnum(input.consistency_status, VALID_CONSISTENCY, 'Indica la continuità recente.');
    const focus = optionalEnum(input.goal_focus, VALID_FOCI, 'Seleziona il tipo di miglioramento.');
    const trailExperience = optionalEnum(input.trail_experience, VALID_TRAIL_EXPERIENCE, 'Seleziona l’esperienza sui percorsi trail.');
    const testProtocol = optionalEnum(input.reference_test_protocol, VALID_TESTS, 'Seleziona un protocollo di test valido.');
    const horizon = optionalInteger(input.goal_horizon_weeks, 'L’orizzonte deve essere un numero intero di settimane.');
    const recentSessions = optionalNumber(input.recent_sessions_per_week, 'La frequenza recente deve essere un numero.');
    const targetRunningSessions = optionalInteger(
        input.target_running_sessions_per_week,
        'Le sedute di corsa desiderate devono essere un numero intero.'
    );
    const peakWeekProposalMode = optionalEnum(
        input.peak_week_proposal_mode,
        VALID_PEAK_WEEK_MODES,
        'Seleziona una modalità valida per le settimane di picco.'
    ) || 'disabled';
    const peakWeekMaxRunningSessions = optionalInteger(
        input.peak_week_max_running_sessions,
        'Il limite delle sedute di corsa nelle settimane di picco deve essere un numero intero.'
    );
    const testDate = optionalDate(input.reference_test_date, 'La data del test non è valida.');
    const testDuration = input.reference_test_time === '' || input.reference_test_time == null
        ? null
        : parseTestDuration(input.reference_test_time);
    const availability = normalizeAvailability(input.weekly_availability);
    const otherSports = normalizeOtherSports(input.weekly_other_sports);
    const terrains = normalizeEnumArray(input.preferred_terrains, VALID_TERRAINS, 'Seleziona un terreno valido.');
    const secondaryRaceIds = normalizeIdArray(input.secondary_race_ids, 10, 'Seleziona al massimo 10 gare secondarie valide.');
    const secondaryRaceIntents = normalizeSecondaryRaceIntents(input.secondary_race_intents, secondaryRaceIds);
    const goalDescription = optionalText(input.goal_description, 500, 'La descrizione dell’obiettivo non può superare 500 caratteri.');
    const activitySummary = optionalText(input.recent_activity_summary, 500, 'Il riepilogo delle attività non può superare 500 caratteri.');
    const testResult = optionalText(input.reference_test_result, 120, 'Il risultato del test non può superare 120 caratteri.');
    const testConditions = optionalText(input.reference_test_conditions, 300, 'Le condizioni del test non possono superare 300 caratteri.');
    const constraints = optionalText(input.practical_constraints, 500, 'I vincoli pratici non possono superare 500 caratteri.');
    const raceId = optionalText(input.primary_race_id, 64, 'La gara selezionata non è valida.');

    if (horizon !== null && ![4, 8, 12, 16, 24].includes(horizon)) {
        throw new Error('Scegli un orizzonte disponibile.');
    }
    if (recentSessions !== null && (!Number.isFinite(recentSessions) || recentSessions < 0 || recentSessions > 14)) {
        throw new Error('La frequenza recente deve essere compresa tra 0 e 14 sedute settimanali.');
    }
    if (targetRunningSessions !== null && (targetRunningSessions < 1 || targetRunningSessions > 7)) {
        throw new Error('Le sedute di corsa desiderate devono essere comprese tra 1 e 7 a settimana.');
    }
    if (peakWeekMaxRunningSessions !== null
        && (peakWeekMaxRunningSessions < 1 || peakWeekMaxRunningSessions > 7)) {
        throw new Error('Il limite delle sedute di corsa nelle settimane di picco deve essere tra 1 e 7.');
    }
    if (peakWeekProposalMode === 'disabled' && peakWeekMaxRunningSessions !== null) {
        throw new Error('Rimuovi il limite di corsa nelle settimane di picco se le proposte sono disattivate.');
    }
    if (targetRunningSessions !== null && peakWeekMaxRunningSessions !== null
        && peakWeekMaxRunningSessions <= targetRunningSessions) {
        throw new Error('Il limite della settimana di picco deve superare la frequenza settimanale di base.');
    }
    return {
        goal_mode: goalMode,
        primary_race_id: raceId,
        secondary_race_ids: secondaryRaceIds,
        secondary_race_intents: secondaryRaceIntents,
        goal_horizon_weeks: horizon,
        goal_focus: focus,
        goal_description: goalDescription,
        self_profile: selfProfile,
        consistency_status: consistency,
        recent_sessions_per_week: recentSessions,
        target_running_sessions_per_week: targetRunningSessions,
        peak_week_proposal_mode: peakWeekProposalMode,
        peak_week_max_running_sessions: peakWeekMaxRunningSessions,
        weekly_availability_mode: 'typical_week_with_exceptions',
        schedule_overflow_policy: 'ask_before_reduce',
        recent_activity_summary: activitySummary,
        weekly_availability: availability,
        weekly_other_sports: otherSports,
        preferred_terrains: terrains,
        trail_experience: trailExperience,
        reference_test_protocol: testProtocol,
        reference_test_date: testDate,
        reference_test_time: testDuration === null ? null : formatTestDuration(testDuration),
        reference_test_time_seconds: testDuration,
        reference_vr_seconds_per_km: canCalculateReferencePace(testProtocol) && testDuration !== null
            ? calculateReferencePace(testProtocol, testDuration)
            : null,
        reference_test_result: testResult,
        reference_test_conditions: testConditions,
        practical_constraints: constraints
    };
}

export function getPlanningReadiness(input, races = []) {
    const profile = normalizePlanningProfile(input);
    const missing = [];
    const warnings = [];

    if (!profile.goal_mode) missing.push('Scegli un obiettivo.');
    if (!profile.self_profile) missing.push('Indica come descrivi la tua esperienza.');
    if (!profile.consistency_status) missing.push('Indica la continuità recente o seleziona “Non so”.');

    const availableDays = Object.entries(profile.weekly_availability)
        .filter(([, day]) => day.available);
    if (!availableDays.length) {
        missing.push('Seleziona almeno un giorno disponibile.');
    } else if (availableDays.some(([, day]) => day.max_minutes === null)) {
        missing.push('Indica il tempo massimo per ogni giorno selezionato.');
    }
    if (profile.target_running_sessions_per_week === null) {
        missing.push('Indica quante sedute di corsa vuoi nella settimana tipo.');
    } else if (availableDays.length && profile.target_running_sessions_per_week > availableDays.length) {
        missing.push('La frequenza di corsa scelta supera i giorni attualmente disponibili nella settimana tipo.');
    }
    const fixedOtherSportDays = new Set(
        profile.weekly_other_sports
            .filter(session => session.schedule_type === 'fixed')
            .map(session => session.day)
    );
    const availableRunningDays = availableDays.filter(([day]) => !fixedOtherSportDays.has(day));
    if (profile.target_running_sessions_per_week !== null
        && profile.target_running_sessions_per_week > availableRunningDays.length) {
        missing.push('Gli impegni fissi degli altri sport lasciano meno giorni liberi delle corse desiderate. Rivedi giorni o frequenza; il piano non sovrappone automaticamente due sedute.');
    }
    if (profile.weekly_other_sports.some(session =>
        session.schedule_type === 'movable' && availableDays.some(([day]) => day === session.day)
    )) {
        warnings.push('Una seduta di altro sport è spostabile ma coincide con un giorno disponibile per la corsa: la bozza dovrà chiarire lo spostamento, senza presumerlo.');
    }
    if (profile.peak_week_proposal_mode === 'suggest_with_reason') {
        if (profile.peak_week_max_running_sessions === null) {
            missing.push('Indica il limite di corse che il motore può proporre nelle settimane di picco.');
        } else if (profile.target_running_sessions_per_week !== null
            && profile.peak_week_max_running_sessions <= profile.target_running_sessions_per_week) {
            missing.push('Il limite della settimana di picco deve superare la frequenza della settimana tipo.');
        }
        if (profile.peak_week_max_running_sessions !== null
            && profile.peak_week_max_running_sessions > availableDays.length) {
            warnings.push('Il limite di picco supera i giorni disponibili nella settimana tipo: serviranno eccezioni di calendario esplicite.');
        }
    }

    if (profile.goal_mode === 'race') {
        const race = races.find(item => item.id === profile.primary_race_id && item.status === 'planned');
        if (!race) missing.push('Seleziona una gara pianificata come obiettivo principale.');
        else if (!race.event_date && !race.target_period) missing.push('Completa la data o il periodo della gara obiettivo.');
        else if (!race.distance_km || Number(race.distance_km) <= 0) missing.push('Completa la distanza della gara obiettivo.');
        if (race && isTrailRace(race) && !profile.trail_experience) {
            missing.push('Indica la tua esperienza sui percorsi trail.');
        }
        if (profile.secondary_race_ids.includes(profile.primary_race_id)) {
            missing.push('La gara principale non può essere ripetuta tra le altre gare.');
        }
        const secondaryRaces = profile.secondary_race_ids.map(id =>
            races.find(item => item.id === id && item.status === 'planned')
        );
        if (secondaryRaces.some(item => !item)) {
            missing.push('Rimuovi o aggiorna le gare secondarie non più pianificate.');
        }
        secondaryRaces.filter(Boolean).forEach(secondaryRace => {
            if (!secondaryRace.event_date && !secondaryRace.target_period) {
                missing.push(`Completa la data o il periodo della gara "${secondaryRace.name}".`);
            }
            if (!secondaryRace.distance_km || Number(secondaryRace.distance_km) <= 0) {
                missing.push(`Completa la distanza della gara "${secondaryRace.name}".`);
            }
            if (isTrailRace(secondaryRace) && !profile.trail_experience) {
                missing.push('Indica la tua esperienza sui percorsi trail delle gare selezionate.');
            }
        });
        const datedRaces = [race, ...secondaryRaces].filter(item => item?.event_date);
        const dates = new Map();
        datedRaces.forEach(item => {
            const sameDate = dates.get(item.event_date) || [];
            sameDate.push(item.name);
            dates.set(item.event_date, sameDate);
        });
        dates.forEach((names, date) => {
            if (names.length > 1) {
                warnings.push(`Più gare selezionate hanno la stessa data (${date}): ${names.join(', ')}.`);
            }
        });
        if (race && secondaryRaces.every(Boolean)) {
            const compatibility = assessRaceCompatibility(
                race,
                secondaryRaces,
                profile.secondary_race_intents
            );
            compatibility.forEach(advisory => {
                warnings.push(...advisory.messages.map(message =>
                    `[${formatCompatibilityStatus(advisory.status)} · ${advisory.race_name}] ${message}`
                ));
            });
        }
    } else {
        if (!profile.goal_horizon_weeks) missing.push('Scegli l’orizzonte della bozza.');
        if (profile.secondary_race_ids.length) {
            missing.push('Le gare secondarie sono disponibili solo quando selezioni una gara obiettivo principale.');
        }
    }

    if (profile.goal_mode === 'improve' && !profile.goal_focus) {
        missing.push('Indica cosa vuoi migliorare.');
    }
    if (profile.goal_mode === 'other' && !profile.goal_description) {
        missing.push('Descrivi brevemente l’obiettivo.');
    }
    const hasTestResult = profile.reference_test_time_seconds !== null
        || profile.reference_test_result !== null;
    const hasAnyTestInput = hasTestResult || profile.reference_test_conditions !== null;
    if ((profile.reference_test_protocol && (!profile.reference_test_date || !hasTestResult))
        || (!profile.reference_test_protocol && (profile.reference_test_date || hasAnyTestInput))) {
        missing.push('Completa tipo, data e risultato del test dichiarato oppure rimuovi i dati del test.');
    }

    return {
        ready: missing.length === 0,
        missing,
        warnings,
        profile
    };
}

export function getTenKmPrototypeReadiness(input, races = []) {
    const readiness = getPlanningReadiness(input, races);
    const missing = [...readiness.missing];
    const profile = readiness.profile;
    const race = races.find(item => item.id === profile.primary_race_id && item.status === 'planned');

    if (profile.goal_mode !== 'race') {
        missing.push('Il primo prototipo è limitato a una gara obiettivo di 10 km.');
    } else if (race && Number(race.distance_km) !== 10) {
        missing.push('Il primo prototipo supporta solo una gara di 10 km esatti.');
    }
    if (!race?.event_date) {
        missing.push('Per il prototipo serve la data esatta della gara.');
    }
    if (profile.preferred_terrains.length !== 1 || profile.preferred_terrains[0] !== 'road') {
        missing.push('Il primo prototipo è limitato alla strada; seleziona solo “Strada”.');
    }
    const availableDays = Object.values(profile.weekly_availability).filter(day => day.available);
    if (availableDays.length !== 4) {
        missing.push('Lo schema di riferimento prevede quattro sedute settimanali: seleziona esattamente quattro giorni disponibili.');
    }
    if (profile.target_running_sessions_per_week !== 4) {
        missing.push('Lo schema fonte prevede quattro corse settimanali; la frequenza selezionata richiede un motore di adattamento non ancora implementato.');
    }
    if (!['three_km_plus_10', 'ten_km'].includes(profile.reference_test_protocol)
        || profile.reference_test_time_seconds === null
        || profile.reference_vr_seconds_per_km === null) {
        missing.push('Per usare la VR come riferimento, dichiara un test 3 km + 10% oppure 10 km con tempo misurato.');
    }
    if (!profile.reference_test_conditions) {
        missing.push('Descrivi le condizioni del test VR (percorso, superficie e condizioni rilevanti).');
    }

    const blockers = [
        ...missing,
        'Il programma della fonte è riferito all’“amatore vero”; l’app non può dedurre che il profilo dichiarato sia equivalente.',
        'Le sedute del ciclo di nove settimane non sono ancora trascritte e approvate come regole applicabili.',
        'La settimana 3 indica un test VR ma non ne specifica il protocollo: la verifica non può essere assegnata automaticamente.',
        'Non esiste ancora una regola approvata sulla validità temporale del test VR; il generatore non può assumere una scadenza.'
    ];
    return {
        ready: blockers.length === 0,
        missing,
        blockers,
        profile,
        reference_vr_seconds_per_km: profile.reference_vr_seconds_per_km
    };
}

export class TrainingPlannerService {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async loadProfile(userId) {
        const { data, error } = await this.supabaseClient
            .from(PROFILE_TABLE)
            .select(PROFILE_FIELDS)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    async saveProfile(userId, questionnaire) {
        const normalized = normalizePlanningProfile(questionnaire);
        const { data, error } = await this.supabaseClient
            .from(PROFILE_TABLE)
            .upsert({
                user_id: userId,
                questionnaire: normalized,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            .select(PROFILE_FIELDS)
            .single();

        if (error) throw error;
        if (!data) throw new Error('Il questionario non è stato salvato.');
        return data;
    }

    async createDraftRequest(userId, questionnaire, races = []) {
        const readiness = getPlanningReadiness(questionnaire, races);
        if (!readiness.ready) {
            throw new Error(`Completa il questionario: ${readiness.missing.join(' ')}`);
        }

        const race = readiness.profile.goal_mode === 'race'
            ? races.find(item => item.id === readiness.profile.primary_race_id && item.status === 'planned')
            : null;
        const secondaryRaces = readiness.profile.secondary_race_ids
            .map(id => races.find(item => item.id === id && item.status === 'planned'))
            .filter(Boolean);
        const { data, error } = await this.supabaseClient
            .from(DRAFTS_TABLE)
            .insert({
                user_id: userId,
                goal_mode: readiness.profile.goal_mode,
                primary_race_id: race?.id ?? null,
                profile_snapshot: {
                    ...readiness.profile,
                    primary_race: race ? snapshotRace(race) : null,
                    secondary_races: secondaryRaces.map(snapshotRace),
                    race_compatibility: race
                        ? assessRaceCompatibility(race, secondaryRaces, readiness.profile.secondary_race_intents)
                        : [],
                    methodology_assessment: assessTrainingMethodology(readiness.profile, race)
                },
                status: 'awaiting_methodology'
            })
            .select(DRAFT_FIELDS)
            .single();

        if (error) throw error;
        if (!data) throw new Error('La richiesta di bozza non è stata salvata.');
        return data;
    }

    async listDraftRequests(userId) {
        const { data, error } = await this.supabaseClient
            .from(DRAFTS_TABLE)
            .select(DRAFT_FIELDS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;
        return data;
    }
}

function normalizeAvailability(value = {}) {
    const availability = {};
    for (const dayKey of VALID_DAYS) {
        const day = value?.[dayKey] ?? {};
        const available = day.available === true;
        const maxMinutes = optionalInteger(day.max_minutes, 'Il tempo massimo giornaliero deve essere un numero intero.');
        if (maxMinutes !== null && (maxMinutes < 10 || maxMinutes > 360)) {
            throw new Error('Il tempo massimo giornaliero deve essere tra 10 e 360 minuti.');
        }
        if (!available && maxMinutes !== null) {
            throw new Error('Rimuovi il tempo disponibile dai giorni non selezionati.');
        }
        availability[dayKey] = {
            available,
            max_minutes: available ? maxMinutes : null
        };
    }
    return availability;
}

function normalizeOtherSports(value = []) {
    if (!Array.isArray(value)) {
        throw new Error('Le sedute degli altri sport devono essere indicate come elenco.');
    }
    const sessions = value.filter(session => {
        if (!session || typeof session !== 'object' || Array.isArray(session)) {
            throw new Error('Una seduta degli altri sport non è valida.');
        }
        return Object.values(session)
            .some(field => field !== null && field !== undefined && String(field).trim());
    });
    if (sessions.length > 14) {
        throw new Error('Puoi indicare al massimo 14 sedute settimanali di altri sport.');
    }

    return sessions.map((session, index) => {
        const row = index + 1;
        const sport = optionalEnum(
            session?.sport,
            VALID_CROSS_TRAINING_SPORTS,
            `Seleziona uno sport valido per la seduta ${row}.`
        );
        const day = optionalEnum(
            session?.day,
            VALID_DAYS,
            `Seleziona un giorno valido per la seduta ${row}.`
        );
        const scheduleType = optionalEnum(
            session?.schedule_type,
            VALID_SCHEDULE_TYPES,
            `Indica se la seduta ${row} è fissa o spostabile.`
        );
        const duration = optionalInteger(
            session?.duration_minutes,
            `Indica la durata della seduta ${row} in minuti interi.`
        );
        const customSport = optionalText(
            session?.custom_sport,
            60,
            `Il nome dello sport della seduta ${row} non può superare 60 caratteri.`
        );
        if (!sport || !day || !scheduleType || duration === null) {
            throw new Error(`Completa sport, giorno, durata e flessibilità per la seduta ${row} degli altri sport.`);
        }
        if (duration < 10 || duration > 360) {
            throw new Error(`La durata della seduta ${row} deve essere tra 10 e 360 minuti.`);
        }
        if (sport === 'other' && !customSport) {
            throw new Error(`Specifica lo sport per la seduta ${row} selezionando “Altro”.`);
        }
        if (sport !== 'other' && customSport) {
            throw new Error(`Rimuovi il nome personalizzato dalla seduta ${row} oppure seleziona “Altro”.`);
        }
        return {
            sport,
            custom_sport: sport === 'other' ? customSport : null,
            day,
            duration_minutes: duration,
            schedule_type: scheduleType
        };
    });
}

function normalizeEnumArray(values, allowed, message) {
    if (values === null || values === undefined || values === '') return [];
    if (!Array.isArray(values)) values = [values];
    const normalized = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
    if (normalized.some(value => !allowed.includes(value))) throw new Error(message);
    return normalized;
}

function normalizeIdArray(values, maxLength, message) {
    if (values === null || values === undefined || values === '') return [];
    if (!Array.isArray(values)) values = [values];
    if (values.some(value => typeof value !== 'string' && typeof value !== 'number')) {
        throw new Error(message);
    }
    const normalized = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
    if (normalized.length > maxLength || normalized.some(value => value.length > 64)) {
        throw new Error(message);
    }
    return normalized;
}

function formatCompatibilityStatus(status) {
    const labels = {
        same_day_conflict: 'CONFLITTO',
        high: 'ATTENZIONE',
        review: 'DA VALUTARE',
        intent_needed: 'OBIETTIVO DA DEFINIRE',
        insufficient_data: 'DATI INSUFFICIENTI',
        after_primary_goal: 'DOPO LA GARA OBIETTIVO',
        no_obvious_conflict: 'NESSUN CONFLITTO EVIDENTE'
    };
    return labels[status] || 'VERIFICA';
}

function optionalEnum(value, allowed, message) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    if (!allowed.includes(normalized)) throw new Error(message);
    return normalized;
}

function optionalText(value, maxLength, message) {
    const normalized = String(value ?? '').trim();
    if (normalized.length > maxLength) throw new Error(message);
    return normalized || null;
}

function optionalInteger(value, message) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(message);
    return number;
}

function optionalNumber(value, message) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(message);
    return number;
}

function optionalDate(value, message) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(message);
    const date = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
        throw new Error(message);
    }
    return normalized;
}

function isTrailRace(race) {
    const nameAndGoal = `${race.name ?? ''} ${race.goal ?? ''}`.toLowerCase();
    return nameAndGoal.includes('trail');
}

function snapshotRace(race) {
    return {
        id: race.id,
        name: race.name,
        event_date: race.event_date,
        target_period: race.target_period,
        distance_km: race.distance_km,
        elevation_gain_m: race.elevation_gain_m,
        priority: race.priority,
        goal: race.goal
    };
}
