// Scheda "Tracce GPX": caricamento, elenco, analisi e punti personalizzati.

import { buildGpx, downloadGpx, gpxFileName, MAX_GPX_FILE_BYTES, parseGpx } from './gpx-file.js';
import { analyzeTrack, nearestKm, pointAtKm, segmentsBetween, simplifyTrack } from './gpx-analysis.js';
import { formatNumber, formatSigned, renderElevationProfile, renderGradeDistribution, renderTrackShape } from './gpx-charts.js';
import { GpxTracksService, guessWaypointKind, WAYPOINT_KINDS, waypointKind } from './gpx-tracks.js';
import { TrainingRacesService } from './training-races.js';
import { createEmptyState, createSkeleton } from '../core/ui-feedback.js';

// Un waypoint del file più lontano di così dalla traccia non viene importato.
const MAX_IMPORT_DISTANCE_M = 500;

const INPUT_CLASS = 'min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200';
const CARD_CLASS = 'space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5';
const PRIMARY_BUTTON = 'min-h-11 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60';
const SECONDARY_BUTTON =
    'min-h-11 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60';

export async function initGpxTracksModule(supabaseClient, userId) {
    const form = document.getElementById('gpx-upload-form');
    const preview = document.getElementById('gpx-upload-preview');
    const importRow = document.getElementById('gpx-import-waypoints-row');
    const importLabel = document.getElementById('gpx-import-waypoints-label');
    const list = document.getElementById('gpx-tracks-list');
    const detail = document.getElementById('gpx-track-detail');
    const status = document.getElementById('gpx-status');
    if (!form || !preview || !importRow || !importLabel || !list || !detail || !status) return;

    const service = new GpxTracksService(supabaseClient);
    const racesService = new TrainingRacesService(supabaseClient);
    let tracks = [];
    let races = [];
    let pending = null;
    let autoName = '';
    let current = null;
    let openRequest = 0;
    let loadingTrackId = null;
    let parseRequest = 0;

    const showStatus = (message, kind) => {
        status.textContent = message;
        status.className = `rounded-xl border p-3 text-sm ${
            kind === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
        }`;
        status.classList.remove('hidden');
    };

    // ---- Caricamento ----
    const resetUpload = () => {
        form.reset();
        pending = null;
        autoName = '';
        preview.classList.add('hidden');
        preview.replaceChildren();
        importRow.classList.add('hidden');
    };

    form.elements.namedItem('file').addEventListener('change', async event => {
        const file = event.target.files?.[0];
        // Un file scelto dopo prevale: la lettura di quello precedente viene scartata.
        const request = ++parseRequest;
        pending = null;
        preview.classList.add('hidden');
        importRow.classList.add('hidden');
        if (!file) return;
        try {
            if (file.size > MAX_GPX_FILE_BYTES) throw new Error('Il file supera 25 MB.');
            const text = await file.text();
            if (request !== parseRequest) return;
            const parsed = parseGpx(text);
            const points = simplifyTrack(parsed.points);
            const analysis = analyzeTrack(points);
            const importable = parsed.waypoints
                .map(waypoint => ({ waypoint, position: nearestKm(analysis, waypoint.lat, waypoint.lon) }))
                .filter(({ position }) => position.distanceM <= MAX_IMPORT_DISTANCE_M)
                .map(({ waypoint, position }) => ({
                    kind: guessWaypointKind(waypoint),
                    name: (waypoint.name || 'Punto').slice(0, 80),
                    km: position.km,
                    notes: waypoint.description ? waypoint.description.slice(0, 500) : null
                }));
            pending = { fileName: file.name, points, analysis, importable };

            const nameInput = form.elements.namedItem('name');
            // Il nome proposto segue il file scelto, ma non sovrascrive quello scritto dall'atleta.
            if (!nameInput.value.trim() || nameInput.value === autoName) {
                autoName = (parsed.name || file.name.replace(/\.gpx$/i, '')).slice(0, 120);
                nameInput.value = autoName;
            }

            const { summary } = analysis;
            const facts = [`${formatNumber(summary.distanceKm, 2)} km`];
            if (analysis.hasElevation) facts.push(`D+ ${summary.gain} m`, `D- ${summary.loss} m`);
            else facts.push('senza quote');
            facts.push(`${points.length} punti salvati`);
            preview.replaceChildren(
                textNode('p', 'font-semibold text-white', 'Traccia letta'),
                textNode('p', 'text-slate-300', facts.join(' · '))
            );
            preview.classList.remove('hidden');

            if (parsed.waypoints.length) {
                const skipped = parsed.waypoints.length - importable.length;
                importLabel.textContent =
                    `Importa ${importable.length} waypoint del file come punti personalizzati (tipo proposto dal nome, modificabile).` +
                    (skipped ? ` ${skipped} esclusi perché a più di ${MAX_IMPORT_DISTANCE_M} m dalla traccia.` : '');
                importRow.classList.toggle('hidden', importable.length === 0);
            }
        } catch (error) {
            if (request !== parseRequest) return;
            console.error('Errore nella lettura del GPX:', error);
            showStatus(`Impossibile leggere il file: ${error.message}`, 'error');
        }
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!pending) {
            showStatus('Scegli prima un file GPX valido.', 'error');
            return;
        }
        const submit = form.querySelector('button[type="submit"]');
        const fileInput = form.elements.namedItem('file');
        submit.disabled = true;
        fileInput.disabled = true;
        try {
            const upload = pending;
            const track = await service.createTrack(userId, {
                name: form.elements.namedItem('name').value,
                notes: form.elements.namedItem('notes').value,
                raceId: form.elements.namedItem('race_id').value,
                fileName: upload.fileName,
                points: upload.points,
                summary: upload.analysis.summary
            });
            let waypoints = [];
            let importError = null;
            if (form.elements.namedItem('import_waypoints').checked && upload.importable.length) {
                try {
                    waypoints = await service.insertWaypoints(userId, track.id, upload.importable, {
                        maxKm: upload.analysis.summary.distanceKm
                    });
                } catch (error) {
                    console.error('Errore nell’importazione dei waypoint:', error);
                    importError = error;
                }
            }
            tracks = [track, ...tracks];
            notifyTracksChanged();
            resetUpload();
            renderList();
            showTrack({ track, points: upload.points, analysis: upload.analysis, waypoints: sortWaypoints(waypoints) });
            showStatus(
                importError
                    ? `Traccia salvata, ma i waypoint del file non sono stati importati: ${importError.message}`
                    : 'Traccia salvata.',
                importError ? 'error' : 'success'
            );
        } catch (error) {
            console.error('Errore nel salvataggio della traccia:', error);
            showStatus(`Impossibile salvare la traccia: ${error.message}`, 'error');
        } finally {
            submit.disabled = false;
            fileInput.disabled = false;
        }
    });

    // ---- Elenco ----
    const renderList = () => {
        list.replaceChildren();
        if (!tracks.length) {
            list.append(
                createEmptyState('Nessuna traccia salvata.', {
                    hint: 'Carica il GPX della tua prossima gara per vedere profilo, salite e tratte tra i ristori.'
                })
            );
            return;
        }
        tracks.forEach(track => {
            const card = textNode(
                'article',
                `flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    current?.track.id === track.id ? 'border-brand-500/60 bg-brand-500/5' : 'border-slate-800 bg-slate-900/70'
                }`
            );
            const info = textNode('div', 'min-w-0 space-y-1');
            info.append(textNode('h4', 'break-words text-base font-bold text-white', track.name));
            const facts = [`${formatNumber(Number(track.distance_km), 2)} km`];
            if (track.elevation_gain_m !== null) facts.push(`D+ ${track.elevation_gain_m} m`, `D- ${track.elevation_loss_m} m`);
            const race = races.find(item => item.id === track.race_id);
            if (race) facts.push(`gara: ${race.name}`);
            facts.push(`caricata il ${formatDate(track.created_at)}`);
            info.append(textNode('p', 'text-sm text-slate-400', facts.join(' · ')));
            const actions = textNode('div', 'flex shrink-0 gap-4');
            actions.append(
                actionButton('Apri analisi', 'open-track', track.id, 'text-sm font-semibold text-brand-300'),
                actionButton('Elimina', 'delete-track', track.id, 'text-sm font-semibold text-rose-300')
            );
            card.append(info, actions);
            list.append(card);
        });
    };

    list.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        const track = tracks.find(item => item.id === button?.dataset.id);
        if (!track) return;
        if (button.dataset.action === 'open-track') {
            openTrack(track);
            return;
        }
        if (!window.confirm(`Vuoi eliminare la traccia "${track.name}" e i suoi punti?`)) return;
        button.disabled = true;
        try {
            await service.deleteTrack(userId, track.id);
            tracks = tracks.filter(item => item.id !== track.id);
            notifyTracksChanged();
            if (current?.track.id === track.id || loadingTrackId === track.id) closeTrack();
            renderList();
            showStatus('Traccia eliminata.', 'success');
        } catch (error) {
            console.error('Errore nell’eliminazione della traccia:', error);
            showStatus(`Impossibile eliminare la traccia: ${error.message}`, 'error');
            button.disabled = false;
        }
    });

    const openTrack = async track => {
        const request = ++openRequest;
        loadingTrackId = track.id;
        detail.classList.remove('hidden');
        detail.replaceChildren(createSkeleton({ lines: 6, label: 'Analisi della traccia…', className: CARD_CLASS }));
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        try {
            const [points, waypoints] = await Promise.all([
                service.getTrackPoints(userId, track.id),
                service.listWaypoints(userId, track.id)
            ]);
            if (request !== openRequest) return;
            showTrack({ track, points, analysis: analyzeTrack(points), waypoints: sortWaypoints(waypoints) });
        } catch (error) {
            if (request !== openRequest) return;
            console.error('Errore nell’apertura della traccia:', error);
            loadingTrackId = null;
            current = null;
            detail.replaceChildren();
            detail.classList.add('hidden');
            renderList();
            showStatus(`Impossibile aprire la traccia: ${error.message}`, 'error');
        }
    };

    const closeTrack = () => {
        openRequest += 1;
        loadingTrackId = null;
        current = null;
        detail.replaceChildren();
        detail.classList.add('hidden');
        renderList();
    };

    // ---- Dettaglio ----
    // Ogni traccia mostrata annulla le aperture ancora in corso.
    const showTrack = state => {
        openRequest += 1;
        loadingTrackId = null;
        current = { ...state, editingWaypointId: null, segmentMode: 'refuel' };
        renderList();
        renderDetail();
        detail.classList.remove('hidden');
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const renderDetail = () => {
        const { track, analysis } = current;
        detail.replaceChildren(
            headerCard(track),
            summaryCard(analysis),
            sectionCard('gpx-profile', 'Profilo altimetrico', profileHint(analysis)),
            twoColumns(
                sectionCard(
                    'gpx-shape',
                    'Forma del percorso',
                    'Vista dall’alto, nord in alto. P = partenza, A = arrivo; i numeri sono i tuoi punti.'
                ),
                analysis.hasElevation
                    ? sectionCard(
                          'gpx-grades',
                          'Distribuzione delle pendenze',
                          'Distanza percorsa in ciascuna fascia di pendenza (media su circa 100 m).'
                      )
                    : null
            ),
            waypointsCard(),
            sectionCard('gpx-segments', 'Tratte tra i punti', ''),
            analysis.hasElevation ? climbsCard(analysis) : '',
            splitsCard(analysis)
        );
        if (analysis.hasElevation) renderGradeDistribution(detail.querySelector('[data-body="gpx-grades"]'), analysis.gradeDistribution);
        renderWaypointViews();
    };

    // Profilo, forma, elenco e tratte dipendono dai punti: si ridisegnano insieme.
    const renderWaypointViews = () => {
        const { analysis } = current;
        const waypoints = current.waypoints.map(waypoint => ({ ...waypoint, km: Number(waypoint.km) }));
        const profileBody = detail.querySelector('[data-body="gpx-profile"]');
        const shapeBody = detail.querySelector('[data-body="gpx-shape"]');
        profileBody.replaceChildren();
        shapeBody.replaceChildren();
        const shape = renderTrackShape(shapeBody, analysis, waypoints);
        renderElevationProfile(profileBody, analysis, waypoints, {
            onHover: index => shape.setCursor(index),
            onPick: km => {
                const waypointForm = detail.querySelector('#gpx-waypoint-form');
                waypointForm.elements.namedItem('km').value = String(km);
                waypointForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                waypointForm.elements.namedItem('name').focus({ preventScroll: true });
            }
        });
        renderWaypointList();
        renderSegments();
    };

    // Ridisegna l'intestazione della traccia aperta, se c'è.
    const refreshHeader = () => {
        const header = detail.querySelector('[data-track-header]');
        if (current && header) header.replaceWith(headerCard(current.track));
    };

    const headerCard = track => {
        const card = textNode('section', CARD_CLASS);
        card.dataset.trackHeader = '';
        const top = textNode('div', 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between');
        const info = textNode('div', 'min-w-0 space-y-1');
        info.append(textNode('p', 'text-xs font-semibold uppercase tracking-wider text-brand-400', 'Analisi della traccia'));
        info.append(textNode('h3', 'break-words text-xl font-bold text-white', track.name));
        if (track.notes) info.append(textNode('p', 'whitespace-pre-wrap text-sm text-slate-400', track.notes));
        if (track.file_name) info.append(textNode('p', 'text-xs text-slate-500', `File: ${track.file_name}`));
        const linkedRace = races.find(race => race.id === track.race_id);
        if (track.race_id) {
            info.append(
                textNode(
                    'p',
                    'text-sm text-slate-300',
                    linkedRace
                        ? `Gara collegata: ${linkedRace.name} · ${formatNumber(Number(linkedRace.distance_km), 2)} km` +
                              (linkedRace.elevation_gain_m !== null ? ` · D+ ${linkedRace.elevation_gain_m} m` : '')
                        : 'Gara collegata non più disponibile.'
                )
            );
        }
        const actions = textNode('div', 'flex flex-wrap gap-2');
        const edit = button('Modifica', SECONDARY_BUTTON);
        const download = button('Scarica GPX con i punti', SECONDARY_BUTTON);
        const close = button('Chiudi', SECONDARY_BUTTON);
        actions.append(edit, download);
        if (linkedRace) {
            const copy = button('Copia distanza e dislivelli nella gara', SECONDARY_BUTTON);
            copy.addEventListener('click', () => copyCourseToRace(linkedRace, copy));
            actions.append(copy);
        }
        actions.append(close);
        top.append(info, actions);
        card.append(top);

        const editForm = textNode('form', 'hidden space-y-3 border-t border-slate-800 pt-4');
        editForm.noValidate = true;
        editForm.append(
            labeled('Nome della traccia', input('name', { maxLength: 120, value: track.name, required: true })),
            labeled('Gara collegata', raceSelect('race_id', track.race_id)),
            labeled('Note', textarea('notes', track.notes || ''))
        );
        const editActions = textNode('div', 'flex flex-col gap-2 sm:flex-row');
        const save = button('Salva', PRIMARY_BUTTON, 'submit');
        const cancel = button('Annulla', SECONDARY_BUTTON);
        editActions.append(save, cancel);
        editForm.append(editActions);
        card.append(editForm);

        edit.addEventListener('click', () => editForm.classList.toggle('hidden'));
        cancel.addEventListener('click', () => editForm.classList.add('hidden'));
        close.addEventListener('click', closeTrack);
        download.addEventListener('click', () => {
            const content = buildGpx({
                name: current.track.name,
                points: current.points,
                waypoints: current.waypoints.map(waypoint => {
                    const position = pointAtKm(current.analysis, Number(waypoint.km));
                    const kind = waypointKind(waypoint.kind);
                    return {
                        ...position,
                        name: waypoint.name,
                        description: [`${kind.label} · km ${formatNumber(Number(waypoint.km), 2)}`, waypoint.notes]
                            .filter(Boolean)
                            .join(' · '),
                        symbol: kind.symbol,
                        type: kind.label
                    };
                })
            });
            downloadGpx(content, gpxFileName(current.track.name));
        });
        editForm.addEventListener('submit', async event => {
            event.preventDefault();
            save.disabled = true;
            const state = current;
            try {
                const updated = await service.updateTrack(userId, state.track.id, {
                    name: editForm.elements.namedItem('name').value,
                    notes: editForm.elements.namedItem('notes').value,
                    race_id: editForm.elements.namedItem('race_id').value
                });
                tracks = tracks.map(item => (item.id === updated.id ? updated : item));
                notifyTracksChanged();
                state.track = updated;
                renderList();
                refreshHeader();
                showStatus('Traccia aggiornata.', 'success');
            } catch (error) {
                console.error('Errore nell’aggiornamento della traccia:', error);
                showStatus(`Impossibile aggiornare la traccia: ${error.message}`, 'error');
            } finally {
                save.disabled = false;
            }
        });
        return card;
    };

    // Select delle gare dell'atleta; una gara collegata ma non più in elenco resta selezionabile.
    const raceSelect = (name, selectedId) => {
        const select = textNode('select', INPUT_CLASS);
        select.name = name;
        const none = textNode('option', '', 'Nessuna gara');
        none.value = '';
        select.append(none);
        races.forEach(race => {
            const option = textNode(
                'option',
                '',
                `${race.name} · ${formatRaceDate(race)} · ${formatNumber(Number(race.distance_km), 2)} km`
            );
            option.value = race.id;
            select.append(option);
        });
        if (selectedId && !races.some(race => race.id === selectedId)) {
            const missing = textNode('option', '', 'Gara non più disponibile');
            missing.value = selectedId;
            select.append(missing);
        }
        select.value = selectedId || '';
        return select;
    };

    // Copia distanza e dislivelli stimati della traccia nella gara collegata,
    // dopo conferma: sovrascrive i valori inseriti a mano nella scheda Gare.
    const copyCourseToRace = async (race, trigger) => {
        const { summary, hasElevation } = current.analysis;
        const course = { distanceKm: Math.round(summary.distanceKm * 100) / 100 };
        if (hasElevation) Object.assign(course, { gain: summary.gain, loss: summary.loss });
        const describe = (distance, gain, loss) =>
            [`${formatNumber(Number(distance), 2)} km`, `D+ ${gain ?? '—'} m`, `D- ${loss ?? '—'} m`].join(', ');
        const message =
            `Aggiornare "${race.name}" con i valori stimati dalla traccia?\n\n` +
            `Attuali: ${describe(race.distance_km, race.elevation_gain_m, race.elevation_loss_m)}\n` +
            `Dalla traccia: ${describe(course.distanceKm, course.gain ?? race.elevation_gain_m, course.loss ?? race.elevation_loss_m)}`;
        if (!window.confirm(message)) return;
        trigger.disabled = true;
        try {
            const updated = await racesService.updateRaceCourse(userId, race.id, {
                distanceKm: course.distanceKm,
                gain: hasElevation ? course.gain : race.elevation_gain_m,
                loss: hasElevation ? course.loss : race.elevation_loss_m
            });
            races = races.map(item => (item.id === updated.id ? updated : item));
            document.dispatchEvent(new CustomEvent('training-races:changed', { detail: { races, source: 'gpx' } }));
            refreshHeader();
            showStatus(`Gara "${updated.name}" aggiornata con distanza e dislivelli della traccia.`, 'success');
        } catch (error) {
            console.error('Errore nell’aggiornamento della gara:', error);
            showStatus(`Impossibile aggiornare la gara: ${error.message}`, 'error');
            trigger.disabled = false;
        }
    };

    const waypointsCard = () => {
        const card = sectionCard(
            'gpx-waypoints',
            'Punti personalizzati',
            'Ristori, acqua, aid station, cancelli orari… Il km si può impostare anche toccando il profilo.'
        );
        const body = card.querySelector('[data-body="gpx-waypoints"]');
        const waypointForm = textNode('form', 'space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:p-4');
        waypointForm.id = 'gpx-waypoint-form';
        waypointForm.noValidate = true;
        const kindSelect = textNode('select', INPUT_CLASS);
        kindSelect.name = 'kind';
        WAYPOINT_KINDS.forEach(kind => {
            const option = textNode('option', '', kind.label);
            option.value = kind.value;
            kindSelect.append(option);
        });
        kindSelect.value = 'refreshment';
        const grid = textNode('div', 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4');
        grid.append(
            labeled('Tipo', kindSelect),
            labeled('Nome', input('name', { maxLength: 80, placeholder: 'Es. Rifugio Auronzo', required: true })),
            labeled(
                `Km dalla partenza (0–${formatNumber(current.analysis.summary.distanceKm, 2)})`,
                input('km', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', required: true })
            ),
            labeled('Note (facoltative)', input('notes', { maxLength: 500, placeholder: 'Cosa c’è, orario limite…' }))
        );
        const actions = textNode('div', 'flex flex-col gap-2 sm:flex-row');
        const save = button('Aggiungi punto', PRIMARY_BUTTON, 'submit');
        const cancel = button('Annulla modifica', `hidden ${SECONDARY_BUTTON}`);
        actions.append(save, cancel);
        waypointForm.append(grid, actions);
        const listBox = textNode('ol', 'space-y-2');
        listBox.dataset.waypointList = '';
        body.append(waypointForm, listBox);

        const resetForm = () => {
            waypointForm.reset();
            kindSelect.value = 'refreshment';
            current.editingWaypointId = null;
            save.textContent = 'Aggiungi punto';
            cancel.classList.add('hidden');
        };
        cancel.addEventListener('click', resetForm);

        waypointForm.addEventListener('submit', async event => {
            event.preventDefault();
            save.disabled = true;
            // La traccia può cambiare durante il salvataggio: si aggiorna quella di partenza.
            const state = current;
            try {
                const values = Object.fromEntries(new FormData(waypointForm).entries());
                const wasEditing = Boolean(state.editingWaypointId);
                const saved = await service.saveWaypoint(
                    userId,
                    state.track.id,
                    { ...values, id: state.editingWaypointId },
                    { maxKm: state.analysis.summary.distanceKm }
                );
                state.waypoints = sortWaypoints(
                    wasEditing ? state.waypoints.map(item => (item.id === saved.id ? saved : item)) : [...state.waypoints, saved]
                );
                if (current !== state) {
                    showStatus(wasEditing ? 'Punto aggiornato.' : 'Punto aggiunto.', 'success');
                    return;
                }
                resetForm();
                renderWaypointViews();
                showStatus(wasEditing ? 'Punto aggiornato.' : 'Punto aggiunto.', 'success');
            } catch (error) {
                console.error('Errore nel salvataggio del punto:', error);
                showStatus(`Impossibile salvare il punto: ${error.message}`, 'error');
            } finally {
                save.disabled = false;
            }
        });

        listBox.addEventListener('click', async event => {
            const target = event.target.closest('button[data-action]');
            const waypoint = current.waypoints.find(item => item.id === target?.dataset.id);
            if (!waypoint) return;
            if (target.dataset.action === 'edit-waypoint') {
                current.editingWaypointId = waypoint.id;
                kindSelect.value = waypoint.kind;
                waypointForm.elements.namedItem('name').value = waypoint.name;
                waypointForm.elements.namedItem('km').value = String(Number(waypoint.km));
                waypointForm.elements.namedItem('notes').value = waypoint.notes || '';
                save.textContent = 'Salva punto';
                cancel.classList.remove('hidden');
                waypointForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
            }
            if (!window.confirm(`Vuoi eliminare il punto "${waypoint.name}"?`)) return;
            target.disabled = true;
            const state = current;
            try {
                await service.deleteWaypoint(userId, waypoint.id);
                state.waypoints = state.waypoints.filter(item => item.id !== waypoint.id);
                if (current !== state) {
                    showStatus('Punto eliminato.', 'success');
                    return;
                }
                if (current.editingWaypointId === waypoint.id) resetForm();
                renderWaypointViews();
                showStatus('Punto eliminato.', 'success');
            } catch (error) {
                console.error('Errore nell’eliminazione del punto:', error);
                showStatus(`Impossibile eliminare il punto: ${error.message}`, 'error');
                target.disabled = false;
            }
        });
        return card;
    };

    const renderWaypointList = () => {
        const listBox = detail.querySelector('[data-waypoint-list]');
        listBox.replaceChildren();
        if (!current.waypoints.length) {
            listBox.append(createEmptyState('Nessun punto aggiunto.', { hint: 'Aggiungi ristori e punti acqua per calcolare le tratte.' }));
            return;
        }
        current.waypoints.forEach((waypoint, position) => {
            const kind = waypointKind(waypoint.kind);
            const km = Number(waypoint.km);
            const point = pointAtKm(current.analysis, km);
            const item = textNode(
                'li',
                'flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between'
            );
            const info = textNode('div', 'flex min-w-0 items-start gap-3');
            const badge = textNode(
                'span',
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-slate-950',
                String(position + 1)
            );
            badge.style.backgroundColor = kind.color;
            const text = textNode('div', 'min-w-0');
            text.append(textNode('p', 'break-words text-sm font-semibold text-white', waypoint.name));
            const facts = [kind.label, `km ${formatNumber(km, 2)}`];
            if (point.ele !== null) facts.push(`${Math.round(point.ele)} m`);
            text.append(textNode('p', 'text-xs text-slate-400', facts.join(' · ')));
            if (waypoint.notes) text.append(textNode('p', 'mt-1 whitespace-pre-wrap text-xs text-slate-400', waypoint.notes));
            info.append(badge, text);
            const actions = textNode('div', 'flex shrink-0 gap-4 pl-10 sm:pl-0');
            actions.append(
                actionButton('Modifica', 'edit-waypoint', waypoint.id, 'text-sm font-semibold text-brand-300'),
                actionButton('Elimina', 'delete-waypoint', waypoint.id, 'text-sm font-semibold text-rose-300')
            );
            item.append(info, actions);
            listBox.append(item);
        });
    };

    const renderSegments = () => {
        const body = detail.querySelector('[data-body="gpx-segments"]');
        body.replaceChildren();
        const { analysis, waypoints } = current;
        const refuelLabels = WAYPOINT_KINDS.filter(kind => kind.refuel).map(kind => kind.label.split(' /')[0].toLowerCase());
        const modeSelect = textNode('select', `${INPUT_CLASS} sm:w-auto`);
        [
            ['refuel', `Tra i punti di rifornimento (${refuelLabels.join(', ')})`],
            ['all', 'Tra tutti i punti']
        ].forEach(([value, label]) => {
            const option = textNode('option', '', label);
            option.value = value;
            modeSelect.append(option);
        });
        modeSelect.value = current.segmentMode;
        modeSelect.addEventListener('change', () => {
            current.segmentMode = modeSelect.value;
            renderSegments();
        });
        body.append(labeled('Tratte', modeSelect));

        const stops = waypoints
            .map((waypoint, position) => ({ ...waypoint, km: Number(waypoint.km), number: position + 1 }))
            .filter(waypoint => current.segmentMode === 'all' || waypointKind(waypoint.kind).refuel)
            .map(waypoint => ({ name: `${waypoint.number}. ${waypoint.name}`, km: waypoint.km }));
        if (!stops.length) {
            body.append(
                textNode(
                    'p',
                    'text-sm text-slate-500',
                    current.segmentMode === 'refuel'
                        ? 'Aggiungi almeno un ristoro, un punto acqua o un’aid station per dividere il percorso in tratte.'
                        : 'Aggiungi almeno un punto per dividere il percorso in tratte.'
                )
            );
            return;
        }
        const segments = segmentsBetween(analysis, stops);
        const hardest = segments.reduce((best, segment) => (segment.kmEffort > best.kmEffort ? segment : best), segments[0]);
        const longest = segments.reduce((best, segment) => (segment.distanceKm > best.distanceKm ? segment : best), segments[0]);
        body.append(
            textNode(
                'p',
                'text-sm text-slate-300',
                `Tratta più lunga: ${longest.from.name} → ${longest.to.name}, ${formatNumber(longest.distanceKm, 2)} km.` +
                    (analysis.hasElevation
                        ? ` Più impegnativa: ${hardest.from.name} → ${hardest.to.name}, ${formatNumber(hardest.kmEffort, 1)} km sforzo.`
                        : '')
            )
        );
        const headers = analysis.hasElevation ? ['Da', 'A', 'Distanza', 'D+', 'D-', 'Km sforzo', 'Quota max'] : ['Da', 'A', 'Distanza'];
        body.append(
            dataTable(
                headers,
                segments.map(segment => {
                    const row = [segment.from.name, segment.to.name, `${formatNumber(segment.distanceKm, 2)} km`];
                    if (analysis.hasElevation) {
                        row.push(`${segment.gain} m`, `${segment.loss} m`, formatNumber(segment.kmEffort, 1), `${segment.maxEle} m`);
                    }
                    return row;
                })
            )
        );
    };

    // ---- Gare (per il collegamento) ----
    const renderUploadRaceOptions = () => {
        const select = form.elements.namedItem('race_id');
        const selected = select.value;
        select.replaceWith(
            Object.assign(raceSelect('race_id', races.some(race => race.id === selected) ? selected : ''), { id: select.id })
        );
    };

    document.addEventListener('training-races:changed', event => {
        if (!Array.isArray(event.detail?.races)) return;
        races = event.detail.races;
        renderUploadRaceOptions();
        renderList();
        if (event.detail.source !== 'gpx') refreshHeader();
    });

    // ---- Avvio ----
    list.replaceChildren(createSkeleton({ lines: 3, label: 'Caricamento delle tracce…' }));
    try {
        races = await racesService.listRaces(userId);
    } catch (error) {
        // Senza gare la scheda funziona lo stesso: manca solo il collegamento.
        console.error('Errore nel caricamento delle gare per le tracce GPX:', error);
    }
    renderUploadRaceOptions();
    try {
        tracks = await service.listTracks(userId);
        renderList();
    } catch (error) {
        console.error('Errore nel caricamento delle tracce GPX:', error);
        list.replaceChildren();
        showStatus(`Impossibile caricare le tracce: ${error.message}`, 'error');
    }
}

function summaryCard(analysis) {
    const { summary } = analysis;
    const card = textNode('section', CARD_CLASS);
    card.append(textNode('h4', 'text-sm font-semibold text-white', 'Riepilogo'));
    const grid = textNode('dl', 'grid grid-cols-2 gap-3 lg:grid-cols-4');
    const tile = (label, value, hint = '') => {
        const box = textNode('div', 'space-y-1 rounded-xl border border-slate-800 bg-slate-950/40 p-3');
        box.append(textNode('dt', 'text-xs text-slate-400', label), textNode('dd', 'text-xl font-bold tabular-nums text-white', value));
        if (hint) box.append(textNode('dd', 'text-[11px] text-slate-500', hint));
        grid.append(box);
    };
    tile('Distanza', `${formatNumber(summary.distanceKm, 2)} km`, summary.isLoop ? 'Percorso ad anello' : 'Percorso da A a B');
    if (analysis.hasElevation) {
        tile('Dislivello positivo', `${summary.gain} m`, `${formatNumber(summary.gainPerKm, 0)} m ogni km`);
        tile('Dislivello negativo', `${summary.loss} m`);
        tile('Km sforzo', formatNumber(summary.kmEffort, 1), 'Distanza + D+/100 + D-/200');
        tile('Quota massima', `${summary.maxEle} m`, `al km ${formatNumber(summary.maxEleKm, 1)}`);
        tile('Quota minima', `${summary.minEle} m`, `al km ${formatNumber(summary.minEleKm, 1)}`);
        tile('In salita', `${formatNumber(summary.uphillKm, 1)} km`, `pendenza media ${formatNumber(summary.avgUphillGrade, 1)}%`);
        tile('In discesa', `${formatNumber(summary.downhillKm, 1)} km`, `pendenza media ${formatSigned(summary.avgDownhillGrade)}%`);
        tile('In pianura (±2%)', `${formatNumber(summary.flatKm, 1)} km`);
        tile('Partenza / arrivo', `${summary.startEle} / ${summary.endEle} m`);
        steepTile(tile, 'Salita più ripida (100 m)', summary.steepest100Up);
        steepTile(tile, 'Salita più ripida (1 km)', summary.steepest1kmUp);
        steepTile(tile, 'Discesa più ripida (100 m)', summary.steepest100Down);
        steepTile(tile, 'Discesa più ripida (1 km)', summary.steepest1kmDown);
    }
    card.append(grid);
    card.append(
        textNode(
            'p',
            'text-xs text-slate-500',
            analysis.hasElevation
                ? 'Valori stimati dalla traccia: quota lisciata su circa 100 m e variazioni sotto 2 m ignorate. Il dislivello ufficiale di una gara può differire del 5–10%.'
                : 'Il file non contiene quote: sono disponibili solo distanza e forma del percorso.'
        )
    );
    return card;
}

function steepTile(tile, label, steep) {
    if (!steep) return;
    tile(label, `${formatSigned(steep.grade)}%`, `km ${formatNumber(steep.fromKm, 2)}–${formatNumber(steep.toKm, 2)}`);
}

function profileHint(analysis) {
    return analysis.hasElevation
        ? 'Colore per pendenza. Passa sul profilo per quota, pendenza e dislivello progressivo; tocca o clicca per impostare il km di un nuovo punto.'
        : '';
}

function climbsCard(analysis) {
    const card = textNode('section', CARD_CLASS);
    card.append(textNode('h4', 'text-sm font-semibold text-white', 'Salite e discese principali'));
    card.append(
        textNode(
            'p',
            'text-xs text-slate-400',
            'Tratti con almeno 50 m di dislivello; un’inversione sotto 20 m non interrompe la salita o la discesa.'
        )
    );
    const headers = ['Da km', 'A km', 'Lunghezza', 'Dislivello', 'Quote', 'Pend. media', 'Pend. max (100 m)'];
    const rows = legs =>
        legs.map(leg => [
            formatNumber(leg.fromKm, 2),
            formatNumber(leg.toKm, 2),
            `${formatNumber(leg.lengthKm, 2)} km`,
            `${leg.elevation} m`,
            `${leg.startEle} → ${leg.endEle} m`,
            `${formatSigned(leg.avgGrade)}%`,
            `${formatSigned(leg.maxGrade)}%`
        ]);
    card.append(textNode('h5', 'text-xs font-semibold uppercase tracking-wider text-slate-400', `Salite (${analysis.climbs.length})`));
    card.append(
        analysis.climbs.length
            ? dataTable(headers, rows(analysis.climbs))
            : textNode('p', 'text-sm text-slate-500', 'Nessuna salita rilevante.')
    );
    card.append(textNode('h5', 'text-xs font-semibold uppercase tracking-wider text-slate-400', `Discese (${analysis.descents.length})`));
    card.append(
        analysis.descents.length
            ? dataTable(headers, rows(analysis.descents))
            : textNode('p', 'text-sm text-slate-500', 'Nessuna discesa rilevante.')
    );
    return card;
}

function splitsCard(analysis) {
    const card = textNode('section', CARD_CLASS);
    const details = textNode('details', 'group');
    details.append(textNode('summary', 'min-h-11 cursor-pointer py-2 text-sm font-semibold text-white', 'Parziali per km (tabella)'));
    const headers = analysis.hasElevation
        ? ['Km', 'Lunghezza', 'D+', 'D-', 'Pend. media', 'Quota fine', 'D+ progressivo', 'Km sforzo']
        : ['Km', 'Lunghezza'];
    details.append(
        dataTable(
            headers,
            analysis.kmSplits.map(split => {
                const row = [String(split.km), `${formatNumber(split.lengthKm, 2)} km`];
                if (analysis.hasElevation) {
                    row.push(
                        `${split.gain} m`,
                        `${split.loss} m`,
                        `${formatSigned(split.avgGrade)}%`,
                        `${split.endEle} m`,
                        `${split.cumGain} m`,
                        formatNumber(split.kmEffort, 2)
                    );
                }
                return row;
            })
        )
    );
    card.append(details);
    return card;
}

function sectionCard(key, title, description) {
    const card = textNode('section', CARD_CLASS);
    const header = textNode('div', '');
    header.append(textNode('h4', 'text-sm font-semibold text-white', title));
    if (description) header.append(textNode('p', 'mt-1 text-xs text-slate-400', description));
    const body = textNode('div', 'space-y-3');
    body.dataset.body = key;
    card.append(header, body);
    return card;
}

function twoColumns(...cards) {
    const grid = textNode('div', 'grid grid-cols-1 gap-5 lg:grid-cols-2');
    cards.filter(Boolean).forEach(card => grid.append(card));
    return grid;
}

function dataTable(headers, rows) {
    const scroller = textNode('div', 'max-h-96 overflow-auto rounded-xl border border-slate-800');
    const table = textNode('table', 'w-full min-w-max text-left text-xs text-slate-300');
    const head = textNode('thead', 'sticky top-0 bg-slate-900');
    const headRow = textNode('tr', '');
    headers.forEach(header => {
        const cell = textNode('th', 'px-3 py-2 font-semibold text-slate-200', header);
        cell.scope = 'col';
        headRow.append(cell);
    });
    head.append(headRow);
    const body = textNode('tbody', '');
    rows.forEach(row => {
        const line = textNode('tr', 'border-t border-slate-800');
        row.forEach(cell => line.append(textNode('td', 'px-3 py-2 tabular-nums', cell)));
        body.append(line);
    });
    table.append(head, body);
    scroller.append(table);
    return scroller;
}

function sortWaypoints(waypoints) {
    return waypoints.slice().sort((left, right) => Number(left.km) - Number(right.km));
}

function labeled(text, control) {
    const label = textNode('label', 'block space-y-1 text-xs font-medium text-slate-400');
    label.append(textNode('span', '', text), control);
    return label;
}

function input(name, properties = {}) {
    const element = textNode('input', INPUT_CLASS);
    element.name = name;
    Object.assign(element, properties);
    return element;
}

function textarea(name, value) {
    const element = textNode('textarea', 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200');
    element.name = name;
    element.rows = 2;
    element.maxLength = 2000;
    element.value = value;
    return element;
}

function button(label, className, type = 'button') {
    const element = textNode('button', className, label);
    element.type = type;
    return element;
}

function actionButton(label, action, id, className) {
    const element = button(label, `min-h-11 ${className}`);
    element.dataset.action = action;
    element.dataset.id = id;
    return element;
}

function formatRaceDate(race) {
    if (race.event_date) {
        return new Date(`${race.event_date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return race.target_period || 'periodo da definire';
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function textNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// Il calendario mostra le tracce collegabili alle sedute: va avvisato a ogni modifica.
function notifyTracksChanged() {
    document.dispatchEvent(new CustomEvent('gpx-tracks:changed'));
}
