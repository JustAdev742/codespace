import { currentAccess } from './prefs.ts';

/*
 * Numbers, dates and times. British English unless the player chose their device's own style
 * (Settings); dates and times in the player's chosen time zone, or the device's.
 */

/** The locale numbers and dates are written in: en-GB, or the device's own. */
export function appLocale(): string {
  if (currentAccess().locale !== 'device') return 'en-GB';
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
}

/** The chosen time zone, or undefined for the device's own. */
export function appTimeZone(): string | undefined {
  return currentAccess().timeZone ?? undefined;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const FALLBACK_ZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];

/** Every time zone this browser knows. */
export function timeZones(): string[] {
  try {
    const list = (Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (list?.length) return list;
  } catch {
    /* older browsers */
  }
  return FALLBACK_ZONES;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = appLocale();
  const k = `${locale}|${key}`;
  let f = numberFormats.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    numberFormats.set(k, f);
  }
  return f;
}

export function formatNumber(n: number): string {
  return numberFormat('int', {}).format(Math.round(n));
}

export function compactNumber(n: number): string {
  if (Math.abs(n) < 10_000) return formatNumber(n);
  return numberFormat('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** A date or time in the player's locale and time zone. */
export function formatDate(d: Date | string | number, opts: Intl.DateTimeFormatOptions): string {
  const date = d instanceof Date ? d : new Date(d);
  const tz = appTimeZone();
  return date.toLocaleString(appLocale(), { ...(tz ? { timeZone: tz } : {}), ...opts });
}

/**
 * A calendar day with no time of day (a '2026-11-11' string, or a Date standing for a day in UTC) in the
 * player's date style. A day is the same day everywhere, so no time zone moves it.
 */
export function formatDay(day: string | Date, opts: Intl.DateTimeFormatOptions): string {
  const date = typeof day === 'string' ? new Date(`${day.slice(0, 10)}T12:00:00Z`) : day;
  return date.toLocaleDateString(appLocale(), { ...opts, timeZone: 'UTC' });
}

/** A number with up to `digits` decimal places, in the player's style. */
export function formatDecimal(n: number, digits = 1): string {
  return numberFormat(`dec${digits}`, { maximumFractionDigits: digits }).format(n);
}

/** The wall-clock parts of an instant in a time zone (the device's when none is given). */
export function zonedParts(date: Date, tz: string | undefined): { y: number; mo: number; d: number; h: number; mi: number } {
  if (!tz) return { y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(), h: date.getHours(), mi: date.getMinutes() };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day), h: Number(parts.hour) % 24, mi: Number(parts.minute) };
}

/** Minutes a time zone is ahead of UTC at an instant. */
export function zoneOffsetMinutes(date: Date, tz: string | undefined): number {
  if (!tz) return -date.getTimezoneOffset();
  const p = zonedParts(date, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant a wall-clock time (as a datetime-local value) names in a time zone. Null when it is not a date. */
export function instantFromWallClock(value: string, tz: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (!tz) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Guess with the zone's offset at that moment, then correct once for a change of offset in between.
  let t = asUtc - zoneOffsetMinutes(new Date(asUtc), tz) * 60_000;
  t = asUtc - zoneOffsetMinutes(new Date(t), tz) * 60_000;
  return new Date(t);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${s} s`;
}

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(d, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function untilText(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  if (h >= 1) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}
