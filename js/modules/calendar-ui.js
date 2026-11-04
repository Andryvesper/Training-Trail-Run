// js/modules/calendar-ui.js - Interfaccia e Render Calendario
import { TrainingCalendarService } from './calendar.js';

export function initCalendarModule(supabaseClient, userId) {
    const calendarService = new TrainingCalendarService();
    const calendarContainer = document.getElementById('calendar-grid');

    if (!calendarContainer) return;

    // Calcoliamo l'inizio della settimana corrente (Lunedì)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const distanceToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday);

    const currentWeekTemplate = calendarService.generateWeeklyTemplate(monday.toISOString().split('T')[0]);
    renderCalendarGrid(calendarContainer, currentWeekTemplate);
}

function renderCalendarGrid(container, weekDays) {
    container.innerHTML = '';

    weekDays.forEach(day => {
        const isFixed = day.rule.fixed;
        const cardHtml = `
            <div class="bg-slate-900 border ${isFixed ? 'border-cyan-500/40 bg-cyan-950/10' : 'border-slate-800'} p-4 rounded-xl flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold ${isFixed ? 'text-cyan-400' : 'text-slate-400'}">
                            ${new Date(day.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        ${isFixed ? '<span class="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30">Capisaldo</span>' : ''}
                    </div>
                    <p class="text-xs font-semibold text-slate-200 mb-1">${day.rule.label}</p>
                </div>
                <div class="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-500">
                    ${isFixed ? '🏊 19:00 - 19:45 Nuoto' : '🏃 Scheda Massini'}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
