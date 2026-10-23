import type { IncomingHttpHeaders } from 'node:http';

/**
 * Whether a browser page at `origin` may make state-changing requests or open
 * game connections. It may when its origin is one the server is configured for
 * (PUBLIC_ORIGIN and, outside production, EXTRA_ORIGINS), or when it is the
 * address the request was sent to: its Host header, or the forwarded host when
 * the server trusts its proxy.
 *
 * The second rule keeps Ludora working wherever it is reached: a Codespace's
 * forwarded address, the localhost port VS Code forwards it to, or a school
 * network address. It does not weaken the protection. A page on another site
 * always sends its own Origin, and its requests carry our Host, so the two
 * never match. A cross-site page also cannot set X-Forwarded-Host: custom
 * headers need a CORS preflight, which this server never answers, and browsers
 * add none to WebSocket handshakes.
 */
export function originAllowed(origin: string, headers: IncomingHttpHeaders, allowed: readonly string[], trustProxy: boolean): boolean {
  if (allowed.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [headers.host];
  if (trustProxy) hosts.push(first(headers['x-forwarded-host']));
  return hosts.some((h) => typeof h === 'string' && h.trim().toLowerCase() === originHost);
}

/** The first value of a header that proxies may repeat or join with commas. */
function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.split(',')[0];
}
