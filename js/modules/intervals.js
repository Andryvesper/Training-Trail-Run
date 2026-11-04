// js/modules/intervals.js - Servizio API Intervals.icu

export class IntervalsService {
    constructor(athleteId, apiKey) {
        this.athleteId = athleteId || 'me';
        this.apiKey = apiKey;
        this.baseUrl = 'https://intervals.icu/api/v1';
    }

    getAuthHeaders() {
        const token = btoa(`API_KEY:${this.apiKey}`);
        return {
            'Authorization': `Basic ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async getWellness(oldest, newest) {
        try {
            const url = `${this.baseUrl}/athlete/${this.athleteId}/wellness?oldest=${oldest}&newest=${newest}`;
            const response = await fetch(url, { headers: this.getAuthHeaders() });
            if (!response.ok) throw new Error(`Errore API Wellness: ${response.statusText}`);
            return await response.json();
        } catch (err) {
            console.error("Errore fetch wellness Intervals:", err);
            return null;
        }
    }

    async getActivities(oldest, newest) {
        try {
            const url = `${this.baseUrl}/athlete/${this.athleteId}/activities?oldest=${oldest}&newest=${newest}`;
            const response = await fetch(url, { headers: this.getAuthHeaders() });
            if (!response.ok) throw new Error(`Errore API Activities: ${response.statusText}`);
            return await response.json();
        } catch (err) {
            console.error("Errore fetch activities Intervals:", err);
            return null;
        }
    }
}
