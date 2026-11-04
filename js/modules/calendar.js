// js/modules/calendar.js - Modulo Gestione Calendario e Regole Capisaldi (Massini)

export const MASSINI_PILLARS = {
    0: { type: 'REST_OR_LONG', label: 'Domenica - Long Run / Trail Lungo' },
    1: { type: 'SWIM', label: 'Lunedì - Nuoto Fisso (19:00 - 19:45)', fixed: true },
    2: { type: 'QUALITY_RUN', label: 'Martedì - Corsa (Qualità / Varianza)' },
    3: { type: 'RECOVERY', label: 'Mercoledì - Riposo o Recupero Attivo' },
    4: { type: 'SWIM', label: 'Giovedì - Nuoto Fisso (19:00 - 19:45)', fixed: true },
    5: { type: 'QUALITY_RUN', label: 'Venerdì - Corsa (Qualità / Medio CM)' },
    6: { type: 'TRAIL_LONG', label: 'Sabato - Trail / Dislivello D+' }
};

export class TrainingCalendarService {
    constructor() {}

    /**
     * Ritorna la regola capisaldo per un determinato giorno della settimana (0 = Dom, 1 = Lun, ecc.)
     */
    getDayRule(dayOfWeek) {
        return MASSINI_PILLARS[dayOfWeek] || { type: 'FREE', label: 'Giornata Libera' };
    }

    /**
     * Valida un allenamento programmato rispetto ai capisaldi
     */
    validateWorkoutPlacement(dateString, workoutType) {
        const date = new Date(dateString);
        const dayOfWeek = date.getDay();
        const rule = this.getDayRule(dayOfWeek);

        // Controllo vincolo stringente sui giorni di nuoto
        if ((dayOfWeek === 1 || dayOfWeek === 4) && workoutType !== 'SWIM') {
            return {
                valid: false,
                warning: `Attenzione: Il ${rule.label.split(' - ')[0]} è riservato esclusivamente al Nuoto.`
            };
        }

        return { valid: true, rule };
    }

    /**
     * Genera la griglia settimanale base strutturata sui capisaldi
     */
    generateWeeklyTemplate(startDateStr) {
        const startDate = new Date(startDateStr);
        const week = [];

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dayOfWeek = currentDate.getDay();

            week.push({
                date: currentDate.toISOString().split('T')[0],
                dayOfWeek,
                rule: this.getDayRule(dayOfWeek)
            });
        }

        return week;
    }
}
