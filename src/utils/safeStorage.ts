/**
 * Safe local and session storage helper with robust in-memory fallback.
 * Prevents DOMException / SecurityError crashes in restrictive iframe sandboxes
 * or environments where third-party storage/cookies are restricted or partitioned.
 */

/**
 * Safe local and session storage helper with robust in-memory fallback.
 * Prevents DOMException / SecurityError crashes in restrictive iframe sandboxes
 * or environments where third-party storage/cookies are restricted or partitioned.
 */

const memoryStore: Record<string, string> = {};
const memorySessionStore: Record<string, string> = {};

let isLocalStorageAvailable: boolean | null = null;
function checkLocalStorage(): boolean {
  if (isLocalStorageAvailable !== null) return isLocalStorageAvailable;
  if (typeof window === 'undefined') return (isLocalStorageAvailable = false);
  try {
    const testKey = '__test_ls__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return (isLocalStorageAvailable = true);
  } catch {
    return (isLocalStorageAvailable = false);
  }
}

let isSessionStorageAvailable: boolean | null = null;
function checkSessionStorage(): boolean {
  if (isSessionStorageAvailable !== null) return isSessionStorageAvailable;
  if (typeof window === 'undefined') return (isSessionStorageAvailable = false);
  try {
    const testKey = '__test_ss__';
    window.sessionStorage.setItem(testKey, '1');
    window.sessionStorage.removeItem(testKey);
    return (isSessionStorageAvailable = true);
  } catch {
    return (isSessionStorageAvailable = false);
  }
}

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (checkLocalStorage()) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {}
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (checkLocalStorage()) {
        window.localStorage.setItem(key, String(value));
      }
    } catch {}
    memoryStore[key] = String(value);
  },
  removeItem: (key: string): void => {
    try {
      if (checkLocalStorage()) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    delete memoryStore[key];
  },
  clear: (): void => {
    try {
      if (checkLocalStorage()) {
        window.localStorage.clear();
      }
    } catch {}
    for (const key in memoryStore) {
      delete memoryStore[key];
    }
  },
};

export const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      if (checkSessionStorage()) {
        const val = window.sessionStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {}
    return Object.prototype.hasOwnProperty.call(memorySessionStore, key) ? memorySessionStore[key] : null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (checkSessionStorage()) {
        window.sessionStorage.setItem(key, String(value));
      }
    } catch {}
    memorySessionStore[key] = String(value);
  },
  removeItem: (key: string): void => {
    try {
      if (checkSessionStorage()) {
        window.sessionStorage.removeItem(key);
      }
    } catch {}
    delete memorySessionStore[key];
  },
  clear: (): void => {
    try {
      if (checkSessionStorage()) {
        window.sessionStorage.clear();
      }
    } catch {}
    for (const key in memorySessionStore) {
      delete memorySessionStore[key];
    }
  },
};

