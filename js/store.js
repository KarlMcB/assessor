// Library storage: an IndexedDB working copy plus explicit library files.
//
// Safari can't write to a chosen folder, so the downloaded .assessor.json file
// is the real copy. IndexedDB keeps work between sessions; the status tracks
// whether there are changes that haven't been saved to a file yet.

import { newLibrary, normalizeLibrary, pruneImages, now } from './model.js';

const DB_NAME = 'assessor';
const DB_STORE = 'kv';
const LIB_KEY = 'library';
const STATUS_KEY = 'status';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

class Store extends EventTarget {
  lib = null;
  status = { lastFileSave: null, lastFileName: null, unsavedSince: null, persisted: false };
  #db = null;
  #writeTimer = null;

  async load() {
    this.#db = await openDb();
    const [lib, status] = await Promise.all([
      idb(this.#db, 'readonly', (s) => s.get(LIB_KEY)),
      idb(this.#db, 'readonly', (s) => s.get(STATUS_KEY)),
    ]);
    this.lib = lib ? normalizeLibrary(lib) : newLibrary();
    if (status) this.status = { ...this.status, ...status };
    this.status.persisted = await this.#requestPersistence();
    return this.lib;
  }

  async #requestPersistence() {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  // Apply a change to the library. `fn` mutates the library in place.
  update(fn) {
    fn(this.lib);
    this.lib.modified = now();
    if (!this.status.unsavedSince) this.status.unsavedSince = this.lib.modified;
    this.#scheduleWrite();
    this.dispatchEvent(new Event('change'));
  }

  #scheduleWrite() {
    clearTimeout(this.#writeTimer);
    this.#writeTimer = setTimeout(() => this.flush(), 250);
  }

  async flush() {
    clearTimeout(this.#writeTimer);
    const lib = this.lib;
    const status = { ...this.status };
    await idb(this.#db, 'readwrite', (s) => {
      s.put(lib, LIB_KEY);
      return s.put(status, STATUS_KEY);
    });
  }

  hasUnsavedChanges() {
    return Boolean(this.status.unsavedSince);
  }

  isEmpty() {
    return this.lib.banks.length === 0 && this.lib.tests.length === 0;
  }

  // Whether to nudge the user to save a library file.
  needsBackupReminder() {
    if (!this.hasUnsavedChanges() || this.isEmpty()) return false;
    const days = this.lib.settings.backupReminderDays ?? 3;
    const since = Date.parse(this.status.unsavedSince);
    return Date.now() - since > days * 86400e3 || !this.status.lastFileSave;
  }

  libraryFileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `library-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.assessor.json`;
  }

  // Download the whole library as a file.
  async saveToFile() {
    this.update(pruneImages);
    const name = this.libraryFileName();
    downloadJson(this.lib, name);
    this.status.lastFileSave = now();
    this.status.lastFileName = name;
    this.status.unsavedSince = null;
    await this.flush();
    this.dispatchEvent(new Event('change'));
  }

  // Replace the library with one read from a file.
  async openFromFile(file) {
    const data = JSON.parse(await file.text());
    const lib = normalizeLibrary(data);
    this.lib = lib;
    this.status.lastFileSave = now();
    this.status.lastFileName = file.name;
    this.status.unsavedSince = null;
    await this.flush();
    this.dispatchEvent(new Event('change'));
  }
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
    input.click();
  });
}

export const store = new Store();
