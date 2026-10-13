/**
 * Per-device conveniences only (remembered form details, last confirmation).
 * Storage can be unavailable (private mode, blocked site data), so every
 * access is guarded and the app works without it.
 */
type Area = 'local' | 'session';

function area(kind: Area): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, kind: Area = 'local'): T | null {
  try {
    const raw = area(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, kind: Area = 'local'): void {
  try {
    area(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: storage is optional.
  }
}

export function removeItem(key: string, kind: Area = 'local'): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Ignore: storage is optional.
  }
}

export const STORAGE_KEYS = {
  rememberedDetails: 'badya.student-details',
  lastConfirmation: 'badya.last-confirmation',
  lastEmail: 'badya.last-email',
  adminMonth: 'badya.admin-month',
} as const;
