// js/modules/calendar.js - Generazione del calendario settimanale
import { localDateKey } from '../core/date-utils.js';

export class TrainingCalendarService {
    generateMultiWeekPlan(centerDate = new Date(), pastWeeks = 1, futureWeeks = 4) {
        const weeks = [];
        const currentCenter = new Date(centerDate);

        const dayOfWeek = currentCenter.getDay();
        const distanceToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        const startOfCenterWeek = new Date(currentCenter);
        startOfCenterWeek.setDate(currentCenter.getDate() + distanceToMonday);

        const totalWeeks = pastWeeks + futureWeeks + 1;
        const startGlobalDate = new Date(startOfCenterWeek);
        startGlobalDate.setDate(startOfCenterWeek.getDate() - pastWeeks * 7);

        for (let w = 0; w < totalWeeks; w++) {
            const weekDays = [];

            for (let d = 0; d < 7; d++) {
                const currentDate = new Date(startGlobalDate);
                currentDate.setDate(startGlobalDate.getDate() + w * 7 + d);
                const dayOfWeekNum = currentDate.getDay();

                weekDays.push({
                    date: localDateKey(currentDate),
                    dayOfWeek: dayOfWeekNum,
                    intervalsActivities: [],
                    plannedSessions: []
                });
            }

            weeks.push({
                weekNumber: `Sett. ${w + 1}`,
                startDate: weekDays[0].date,
                endDate: weekDays[6].date,
                isCurrent: w === pastWeeks,
                days: weekDays
            });
        }

        return weeks;
    }
}
