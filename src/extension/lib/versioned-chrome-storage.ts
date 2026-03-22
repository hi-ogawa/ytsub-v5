// Versioned chrome.storage helpers for echo suppression.
// Only the originating context bumps the version; forwarding contexts
// write back the same version so other contexts skip it via onChanged.

type Versioned<T> = { v: number; d: T };

const versions = new Map<string, number>();

/** Bump version — call at origination points only (before setLocal). */
export function bumpVersion(key: string): void {
  versions.set(key, (versions.get(key) ?? 0) + 1);
}

/** Write with current lastVersion (called from subscribe — never increments). */
export function writeVersioned(key: string, value: unknown): void {
  const v = versions.get(key) ?? 0;
  chrome.storage.local.set({ [key]: { v, d: value } });
}

/** Read boot value from chrome.storage, adopting its version. */
export function readVersionedBoot<T>(key: string, raw: unknown): T | undefined {
  const versioned = raw as Versioned<T> | undefined;
  if (versioned && typeof versioned.v === "number") {
    versions.set(key, versioned.v);
    return versioned.d;
  }
  // Migration: bare (unversioned) data — apply with lastVersion = 0
  if (raw !== undefined && raw !== null) return raw as T;
  return undefined;
}

/** Read onChanged value. Returns data if v > lastVersion, undefined to skip. */
export function readVersionedChange(
  key: string,
  newValue: unknown,
): unknown | undefined {
  const versioned = newValue as Versioned<unknown> | undefined;
  if (!versioned || typeof versioned.v !== "number") return undefined;
  if (versioned.v <= (versions.get(key) ?? 0)) return undefined;
  versions.set(key, versioned.v);
  return versioned.d;
}
