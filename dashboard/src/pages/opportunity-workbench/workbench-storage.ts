export const DRAFT_STORAGE_KEY = 'opportunity-workbench-draft-v1';
export const WORKBENCH_VIEW_STORAGE_KEY = 'opportunity-workbench-saved-views-v1';
export const WORKBENCH_LAST_VIEW_STORAGE_KEY = 'opportunity-workbench-last-view-v1';

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseWorkbenchStorageJson<T>(
  raw: string | null,
  fallback: T,
  normalize: (value: unknown) => T,
): T {
  if (!raw) return fallback;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function readWorkbenchStorageJson<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown) => T,
): T {
  const storage = browserLocalStorage();
  if (!storage) return fallback;
  return parseWorkbenchStorageJson(storage.getItem(key), fallback, normalize);
}

export function writeWorkbenchStorageJson(key: string, value: unknown): boolean {
  const storage = browserLocalStorage();
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
