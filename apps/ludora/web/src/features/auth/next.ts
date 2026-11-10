/** Where to go after signing in or up: a path on this site, never another site ("//evil.example" or "/\\evil.example" are refused). */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}
