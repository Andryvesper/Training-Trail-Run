// js/modules/calendar.js - Gestione Multi-Settimanale e Allenamenti Fissi

export const MASSINI_PILLARS = {
    0: { type: 'REST_OR_LONG', label: 'Domenica - Long Run / Trail Lungo' },
    1: { type: 'FIXED_SESSION', label: 'Lunedì - Corsa / Attività + Nuoto Fisso (19:00)', fixed: true, primary: 'Nuoto Fisso' },
    2: { type: 'QUALITY_RUN', label: 'Martedì - Corsa (Qualità / Varianza)' },
    3: { type: 'RECOVERY', label: 'Mercoledì - Riposo o Recupero Attivo' },
    4: { type: 'FIXED_SESSION', label: 'Giovedì - Corsa / Attività + Nuoto Fisso (19:00)', fixed: true, primary: 'Nuoto Fisso' },
    5: { type: 'QUALITY_RUN', label: 'Venerdì - Corsa (Qualità / Medio CM)' },
    6: { type: 'TRAIL_LONG', label: 'Sabato - Trail / Dislivello D+' }
};

export class TrainingCalendarService {
    constructor() {}

    getDayRule(dayOfWeek) {
        return MASSINI_PILLARS[dayOfWeek] || { type: 'FREE', label: 'Giornata Libera' };
    }

    generateMultiWeekPlan(centerDate = new Date(), pastWeeks = 1, futureWeeks = 4) {
        const weeks = [];
        const currentCenter = new Date(centerDate);
        
        const dayOfWeek = currentCenter.getDay();
        const distanceToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        const startOfCenterWeek = new Date(currentCenter);
        startOfCenterWeek.setDate(currentCenter.getDate() + distanceToMonday);

        const totalWeeks = pastWeeks + futureWeeks + 1;
        const startGlobalDate = new Date(startOfCenterWeek);
        startGlobalDate.setDate(startOfCenterWeek.getDate() - (pastWeeks * 7));

        for (let w = 0; w < totalWeeks; w++) {
            const weekDays = [];

            for (let d = 0; d < 7; d++) {
                const currentDate = new Date(startGlobalDate);
                currentDate.setDate(startGlobalDate.getDate() + (w * 7) + d);
                const dayOfWeekNum = currentDate.getDay();

                weekDays.push({
                    date: formatDateKey(currentDate),
                    dayOfWeek: dayOfWeekNum,
                    rule: this.getDayRule(dayOfWeekNum),
                    completed: false,
                    intervalsActivity: null,
                    plannedSessions: []
                });
            }

            weeks.push({
                weekNumber: `Sett. ${w + 1}`,
                startDate: weekDays[0].date,
                endDate: weekDays[6].date,
                isCurrent: w === pastWeeks,
                days: weekDays,
                stats: { load: 150, fitness: 52, form: 12 }
            });
        }

        return weeks;
    }
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
