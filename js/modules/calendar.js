// js/modules/calendar.js - Gestione Multi-Settimanale e Capisaldi Massini

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

    getDayRule(dayOfWeek) {
        return MASSINI_PILLARS[dayOfWeek] || { type: 'FREE', label: 'Giornata Libera' };
    }

    /**
     * Genera un blocco di più settimane (es. 1 passata, corrente, 4 future)
     */
    generateMultiWeekPlan(centerDate = new Date(), pastWeeks = 1, futureWeeks = 4) {
        const weeks = [];
        const currentCenter = new Date(centerDate);
        
        // Trova il lunedì della settimana di riferimento
        const dayOfWeek = currentCenter.getDay();
        const distanceToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        const startOfCenterWeek = new Date(currentCenter);
        startOfCenterWeek.setDate(currentCenter.getDate() + distanceToMonday);

        const totalWeeks = pastWeeks + futureWeeks + 1;
        const startGlobalDate = new Date(startOfCenterWeek);
        startGlobalDate.setDate(startOfCenterWeek.getDate() - (pastWeeks * 7));

        for (let w = 0; w < totalWeeks; w++) {
            const weekDays = [];
            let weekLoad = 0;
            let weekDistance = 0;

            for (let d = 0; d < 7; d++) {
                const currentDate = new Date(startGlobalDate);
                currentDate.setDate(startGlobalDate.getDate() + (w * 7) + d);
                const dayOfWeekNum = currentDate.getDay();

                weekDays.push({
                    date: currentDate.toISOString().split('T')[0],
                    dayOfWeek: dayOfWeekNum,
                    rule: this.getDayRule(dayOfWeekNum),
                    completed: false,
                    actualData: null
                });
            }

            weeks.push({
                weekNumber: `Sett. ${w + 1}`,
                startDate: weekDays[0].date,
                endDate: weekDays[6].date,
                isCurrent: w === pastWeeks,
                days: weekDays,
                stats: { load: 150, distance: '35 km', fitness: 52, form: 12 } // Predisposto per dati reali Intervals
            });
        }

        return weeks;
    }
}
