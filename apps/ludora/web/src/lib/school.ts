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
