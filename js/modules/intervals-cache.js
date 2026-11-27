// Cache locale (IndexedDB) dello storico attività Intervals.icu.
// Al primo accesso si scarica tutto lo storico; poi solo le ultime settimane,
// che vengono sostituite per intero (attività caricate in ritardo, modificate
// o cancellate). Se IndexedDB non è disponibile l'app funziona come prima.
import { addDays } from '../core/date-utils.js';

const DB_NAME = 'ttr-cache';
const STORE = 'intervals-activities';
const FORMAT_VERSION = 1;
// Finestra riscaricata a ogni sincronizzazione, prima dell'ultimo aggiornamento.
export const REFRESH_WINDOW_DAYS = 45;

// Data da cui riscaricare: tutto lo storico senza cache, altrimenti le
// ultime settimane prima dell'ultima sincronizzazione.
export function refetchStart(entry, historyStart) {
    if (!isValidEntry(entry)) return historyStart;
    const from = addDays(entry.syncedAt, -REFRESH_WINDOW_DAYS);
    return from > historyStart ? from : historyStart;
}

// Attività in cache prima di `from` + quelle appena scaricate (che vincono).
export function mergeActivities(cached, fresh, from) {
    const byId = new Map();
    (cached || []).forEach(activity => {
        if (activityDate(activity) < from) byId.set(String(activity.id), activity);
    });
    (fresh || []).forEach(activity => byId.set(String(activity.id), activity));
    return [...byId.values()].sort((left, right) => activityDate(left).localeCompare(activityDate(right)));
}

export function isValidEntry(entry) {
    return entry?.v === FORMAT_VERSION
        && Array.isArray(entry.activities)
        && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.syncedAt || ''));
}

export async function readActivityCache(key) {
    try {
        const db = await openDb();
        if (!db) return null;
        const entry = await requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
        db.close();
        return isValidEntry(entry) ? entry : null;
    } catch (error) {
        console.warn('Cache attività non leggibile:', error);
        return null;
    }
}

export async function writeActivityCache(key, { activities, syncedAt }) {
    try {
        const db = await openDb();
        if (!db) return;
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put({ v: FORMAT_VERSION, activities, syncedAt }, key);
        await transactionDone(transaction);
        db.close();
    } catch (error) {
        console.warn('Cache attività non salvata:', error);
    }
}

// All'uscita i dati sportivi non restano sul dispositivo.
export async function clearActivityCache() {
    if (typeof indexedDB === 'undefined') return;
    await new Promise(resolve => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
}

function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
}

function activityDate(activity) {
    return String(activity?.start_date_local || '').slice(0, 10);
}

