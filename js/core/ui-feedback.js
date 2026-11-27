// Stati di caricamento e stati vuoti con lo stesso aspetto in tutta l'app.

/**
 * Scheletro animato al posto dei contenuti in arrivo. Per i lettori di schermo
 * resta solo il testo, senza le barre decorative.
 * @param {{ lines?: number, label?: string, className?: string }} [options]
 */
export function createSkeleton({ lines = 3, label = 'Caricamento…', className = '' } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = `space-y-3 ${className}`.trim();
    wrapper.setAttribute('role', 'status');
    wrapper.dataset.skeleton = '';
    const text = document.createElement('span');
    text.className = 'sr-only';
    text.textContent = label;
    wrapper.append(text);
    for (let index = 0; index < lines; index += 1) {
        const bar = document.createElement('div');
        bar.className = `skeleton h-4 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`;
        bar.setAttribute('aria-hidden', 'true');
        wrapper.append(bar);
    }
    return wrapper;
}

/**
 * Riquadro per "non c'è ancora nulla qui", con un suggerimento facoltativo.
 * @param {string} title
 * @param {{ hint?: string, className?: string }} [options]
 */
export function createEmptyState(title, { hint = '', className = '' } = {}) {
    const box = document.createElement('div');
    box.className = `rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-5 text-center ${className}`.trim();
    box.dataset.emptyState = '';
    const heading = document.createElement('p');
    heading.className = 'text-sm font-medium text-slate-300';
    heading.textContent = title;
    box.append(heading);
    if (hint) {
        const detail = document.createElement('p');
        detail.className = 'mt-1 text-xs text-slate-500';
        detail.textContent = hint;
        box.append(detail);
    }
    return box;
}
