// js/modules/calendar-ui.js - Render Multi-Settimanale Avanzato
import { TrainingCalendarService } from './calendar.js';

export function initCalendarModule(supabaseClient, userId) {
    const calendarService = new TrainingCalendarService();
    const container = document.getElementById('calendar-multi-container');

    if (!container) return;

    const multiWeeks = calendarService.generateMultiWeekPlan(new Date(), 1, 4);
    renderMultiWeekView(container, multiWeeks);
}

function renderMultiWeekView(container, weeks) {
    container.innerHTML = '';

    weeks.forEach(week => {
        const weekSection = document.createElement('div');
        weekSection.className = `border ${week.isCurrent ? 'border-emerald-500/50 bg-slate-900/80 shadow-xl' : 'border-slate-800/80 bg-slate-900/30'} rounded-2xl p-5 space-y-4`;

        let headerHtml = `
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-800/80">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold px-3 py-1 rounded-lg ${week.isCurrent ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
                        ${week.weekNumber}
                    </span>
                    <span class="text-xs text-slate-400">
                        ${formatDateIt(week.startDate)} - ${formatDateIt(week.endDate)}
                    </span>
                    ${week.isCurrent ? '<span class="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">In corso</span>' : ''}
                </div>
                <div class="flex items-center gap-4 text-[11px] text-slate-400">
                    <div>Carico: <span class="text-white font-semibold">${week.stats.load}</span></div>
                    <div>Fitness (CTL): <span class="text-cyan-400 font-semibold">${week.stats.fitness}</span></div>
                    <div>Forma (TSB): <span class="text-emerald-400 font-semibold">+${week.stats.form}</span></div>
                </div>
            </div>
        `;

        let daysHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3">`;

        week.days.forEach(day => {
            const isFixed = day.rule.fixed;
            const isToday = day.date === new Date().toISOString().split('T')[0];

            daysHtml += `
                <div data-date="${day.date}" class="border ${isFixed ? 'border-cyan-500/30 bg-cyan-950/10' : (isToday ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-slate-800/80 bg-slate-950/50')} rounded-xl p-3 flex flex-col justify-between transition-all hover:border-slate-700 group">
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-[11px] font-bold text-slate-300 uppercase">
                                ${new Date(day.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                            ${isFixed ? '<span class="text-[8px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-bold">Capisaldo</span>' : ''}
                        </div>
                        <p class="text-xs font-semibold text-white mb-2">${day.rule.label}</p>
                    </div>

                    <div class="space-y-2 pt-2 border-t border-slate-900">
                        <div class="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>${isFixed ? '🏊 19:00 Nuoto' : '🏃 Massini'}</span>
                            <button onclick="alert('Modifica allenamento per il ${day.date}')" class="text-emerald-400 hover:underline font-medium">Modifica</button>
                        </div>
                    </div>
                </div>
            `;
        });

        daysHtml += `</div>`;
        weekSection.innerHTML = headerHtml + daysHtml;
        container.appendChild(weekSection);
    });
}

function formatDateIt(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}
