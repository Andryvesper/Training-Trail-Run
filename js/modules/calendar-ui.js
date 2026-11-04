// js/modules/calendar-ui.js - Render Calendario Ottimizzato e Interattivo
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
        const isToday = day.date === new Date().toISOString().split('T')[0];

        // Stili dinamici in base al capisaldo o tipo di giornata
        const borderColor = isFixed ? 'border-cyan-500/40 bg-cyan-950/10' : (isToday ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-slate-800/80 bg-slate-900/40');
        
        const cardHtml = `
            <div class="border ${borderColor} rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-slate-700 shadow-lg group relative">
                <div>
                    <!-- Intestazione Giorno -->
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-xs font-bold uppercase tracking-wider ${isFixed ? 'text-cyan-400' : 'text-slate-300'}">
                            ${new Date(day.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        ${isFixed ? '<span class="text-[9px] bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-500/20 font-semibold">Capisaldo</span>' : ''}
                        ${isToday ? '<span class="text-[9px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/20 font-semibold">Oggi</span>' : ''}
                    </div>

                    <!-- Dettaglio Allenamento -->
                    <div class="space-y-2">
                        <p class="text-xs font-semibold text-white leading-relaxed">${day.rule.label}</p>
                        <div class="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                            ${isFixed ? '🏊 <span>19:00 - 19:45 (Nuoto)</span>' : '🏃 <span>Metodologia Massini</span>'}
                        </div>
                    </div>
                </div>

                <!-- Stato / Sincronizzazione Intervals & Azioni -->
                <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span class="text-[10px] text-slate-500 flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-600"></span> Da sincronizzare
                    </span>
                    <button class="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-all">
                        Modifica
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}
