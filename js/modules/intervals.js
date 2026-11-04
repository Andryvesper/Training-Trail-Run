// js/modules/intervals.js - Modulo Sincronizzazione e Gestione Dati Intervals.icu

export class IntervalsService {
    /**
     * @param {string} athleteId - ID Atleta su Intervals.icu (es. i12345 o "me")
     * @param {string} apiKey - API Key generata da Intervals.icu
     */
    constructor(athleteId, apiKey) {
        this.athleteId = athleteId || 'i12345';
        this.baseUrl = `https://intervals.icu/api/v1/athlete/${this.athleteId}`;
        
        // Intervals.icu usa l'autenticazione HTTP Basic (Username: "API_KEY", Password: la chiave effettiva)
        const credentials = btoa(`API_KEY:${apiKey}`);
        this.headers = {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Recupera le attività recenti (allenamenti, Km, D+, tipo di attività)
     * @param {string} oldest - Data inizio (YYYY-MM-DD)
     * @param {string} newest - Data fine (YYYY-MM-DD)
     */
    async getActivities(oldest, newest) {
        try {
            const url = `${this.baseUrl}/activities?oldest=${oldest}&newest=${newest}`;
            const response = await fetch(url, { headers: this.headers });
            
            if (!response.ok) {
                throw new Error(`Errore HTTP durante il recupero attività: ${response.status}`);
            }

            const activities = await response.json();
            return this.processActivities(activities);
        } catch (error) {
            console.error("Errore nella sincronizzazione delle attività Intervals.icu:", error);
            return [];
        }
    }

    /**
     * Recupera i dati di carico e forma fisica (CTL - Fitness, ATL - Fatigue, TSB - Form)
     * @param {string} oldest - Data inizio (YYYY-MM-DD)
     * @param {string} newest - Data fine (YYYY-MM-DD)
     */
    async getWellness(oldest, newest) {
        try {
            const url = `${this.baseUrl}/wellness?oldest=${oldest}&newest=${newest}`;
            const response = await fetch(url, { headers: this.headers });

            if (!response.ok) {
                throw new Error(`Errore HTTP durante il recupero wellness: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Errore nel recupero dei dati wellness Intervals.icu:", error);
            return [];
        }
    }

    /**
     * Elabora e filtra i dati grezzi delle attività per la dashboard
     */
    processActivities(activities) {
        return activities.map(act => ({
            id: act.id,
            date: act.start_date_local ? act.start_date_local.split('T')[0] : null,
            name: act.name,
            type: act.type, // Es. Run, Swim, Ride
            distanceKm: act.distance ? +(act.distance / 1000).toFixed(2) : 0,
            elevationGain: act.elevation_gain || 0, // D+ in metri
            movingTimeSec: act.moving_time || 0,
            load: act.icu_training_load || 0
        }));
    }
}
