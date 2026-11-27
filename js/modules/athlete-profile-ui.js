import { ageOn, AthleteProfileService } from './athlete-profile.js';

const FIELDS = ['full_name', 'birth_date', 'sex', 'city', 'phone', 'height_cm', 'weight_kg'];

export async function initAthleteProfileModule(supabaseClient, userId) {
    const form = document.getElementById('athlete-profile-form');
    if (!form) return;
    const status = document.getElementById('athlete-profile-status');
    const summary = document.getElementById('athlete-profile-summary');
    const service = new AthleteProfileService(supabaseClient);

    const fill = profile => {
        FIELDS.forEach(name => {
            const control = form.elements.namedItem(name);
            if (control) control.value = profile?.[name] ?? '';
        });
        form.elements.namedItem('email').value = profile?.email ?? '';
        renderSummary(summary, profile);
    };

    try {
        fill(await service.load(userId));
    } catch (error) {
        console.error('Errore nel caricamento del profilo:', error);
        showStatus(status, `Impossibile caricare il profilo: ${error.message}`, 'error');
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const values = Object.fromEntries(FIELDS.map(name => [name, form.elements.namedItem(name)?.value]));
            const saved = await service.save(userId, values);
            fill(saved);
            if (saved.full_name) {
                const header = document.getElementById('logged-user-email');
                if (header) header.textContent = saved.full_name;
            }
            showStatus(status, 'Profilo salvato.', 'success');
        } catch (error) {
            console.error('Errore nel salvataggio del profilo:', error);
            showStatus(status, error.message, 'error');
        } finally {
            button.disabled = false;
        }
    });
}

function renderSummary(container, profile) {
    if (!container) return;
    const age = ageOn(profile?.birth_date);
    const bmi = profile?.height_cm && profile?.weight_kg ? profile.weight_kg / (profile.height_cm / 100) ** 2 : null;
    const parts = [
        profile?.full_name || 'Nome non indicato',
        age === null ? null : `${age} anni`,
        profile?.city || null,
        bmi === null ? null : `BMI ${bmi.toFixed(1).replace('.', ',')}`
    ].filter(Boolean);
    container.textContent = parts.join(' · ');
}

function showStatus(element, message, kind) {
    if (!element) return;
    element.textContent = message;
    element.className = `rounded-xl border p-3 text-sm ${
        kind === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    }`;
}
