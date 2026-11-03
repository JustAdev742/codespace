import { isSchoolDress, uniformForDress, type SchoolDress, type SchoolUniform } from '@ludora/shared';

/** School looks a copy of Ludora can wear (server: SCHOOL_THEME; styles: schools.css). */
export type SchoolId = 'hills-grammar';

/**
 * The school look this copy wears, or null for Ludora's own. The server marks it on <html> before
 * the page loads and it never changes while the page is open, so reading the attribute is enough:
 * it works anywhere, including the off-screen roots that draw 3D Glim textures.
 */
export function schoolLook(): SchoolId | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.dataset.school === 'hills-grammar' ? 'hills-grammar' : null;
}


/*
 * The uniform of whoever is using this device, from their year group in Settings. Glims that are
 * not someone's avatar (the collection, the shop, a Lantern opening) wear it, so a player's Glims
 * are all dressed like them. A plain store rather than React context, because 3D Glim textures are
 * drawn in off-screen roots that sit outside the app's providers.
 */
let viewer: SchoolUniform | null = null;
const listeners = new Set<() => void>();

export function viewerUniform(): SchoolUniform | null {
  return viewer;
}

export function setViewerUniform(next: SchoolUniform | null): void {
  if (next === viewer) return;
  viewer = next;
  for (const l of listeners) l();
}

export function subscribeViewerUniform(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/*
 * A guest's year group, kept on this device so they choose it once. Accounts keep theirs in
 * Settings instead (preferences.school), which wins when both are set.
 */
const DRESS_KEY = 'ludora.school-dress';

export function deviceDress(): SchoolDress | null {
  try {
    const raw = localStorage.getItem(DRESS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return isSchoolDress(v) ? v : null;
  } catch {
    return null;
  }
}

export function setDeviceDress(dress: SchoolDress): void {
  try {
    localStorage.setItem(DRESS_KEY, JSON.stringify(dress));
  } catch {
    /* storage can be unavailable (private mode); the choice still applies for this visit */
  }
  setViewerUniform(uniformForDress(dress));
}
