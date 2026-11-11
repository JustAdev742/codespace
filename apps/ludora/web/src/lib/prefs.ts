import type { Preferences } from './session.ts';

/*
 * Applying a player's settings to the page. Settings that change how the page
 * looks are written as data attributes on <html> (styled in app.css), and the
 * same attributes are kept in localStorage so `public/theme.js` can put them
 * back before the first paint, before the account has loaded.
 *
 * Signed out (most students join a game with a code and no account), the same
 * settings are kept on this device instead of in an account.
 */

const THEME_KEY = 'ludora.theme';
/** The <html> data attributes from the last settings applied, for theme.js to restore at first paint. */
const LOOK_KEY = 'ludora.look';
/** Settings chosen while signed out: kept on this device only. */
const LOCAL_KEY = 'ludora.prefs';
/** Things that belong to this device whoever is signed in: volumes, the voice, tips already shown. */
const DEVICE_KEY = 'ludora.device';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage can be unavailable (private mode); preferences still apply for this visit */
  }
}
function readJson<T>(key: string): Partial<T> {
  try {
    const v = JSON.parse(safeGet(key) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

/* --------------------------- accessibility settings --------------------------- */

export interface AccessPrefs {
  readAloud: boolean;
  readAuto: boolean;
  readRate: number;
  font: 'standard' | 'easy';
  letterSpacing: 'normal' | 'wide' | 'wider';
  lineSpacing: 'normal' | 'wide' | 'wider';
  maxContrast: boolean;
  lessTransparency: boolean;
  underlineLinks: boolean;
  strongFocus: boolean;
  tiles: 'standard' | 'safe';
  calm: boolean;
  timer: 'both' | 'bar' | 'number' | 'hidden';
  littleHands: boolean;
  captions: boolean;
  vibrate: boolean;
  wakeLock: boolean;
  dataSaver: 'auto' | 'on' | 'off';
  batterySaver: boolean;
  timeZone: string | null;
  /** Numbers and dates in British English (as before) or the device's own language. */
  locale: 'en-GB' | 'device';
}

/** Every default is how Ludora behaved before the setting existed. The server keeps the same (users/preferences.ts). */
export const ACCESS_DEFAULTS: AccessPrefs = {
  readAloud: false,
  readAuto: false,
  readRate: 1,
  font: 'standard',
  letterSpacing: 'normal',
  lineSpacing: 'normal',
  maxContrast: false,
  lessTransparency: false,
  underlineLinks: false,
  strongFocus: false,
  tiles: 'standard',
  calm: false,
  timer: 'both',
  littleHands: false,
  captions: false,
  vibrate: false,
  wakeLock: false,
  dataSaver: 'auto',
  batterySaver: false,
  timeZone: null,
  locale: 'en-GB',
};

/** The settings that follow an account, with every default filled in. */
export type FullPrefs = Omit<Preferences, 'access'> & { access: AccessPrefs };

export const PREF_DEFAULTS: Pick<FullPrefs, 'theme' | 'reducedMotion' | 'sound' | 'music' | 'textSize' | 'highContrast' | 'access'> = {
  theme: 'system',
  reducedMotion: 'system',
  sound: true,
  music: true,
  textSize: 'normal',
  highContrast: false,
  access: ACCESS_DEFAULTS,
};

export type LocalPrefs = typeof PREF_DEFAULTS;

/** Settings chosen while signed out, defaults filled in. The theme keeps its own older key. */
export function localPrefs(): LocalPrefs {
  const stored = readJson<LocalPrefs>(LOCAL_KEY);
  return { ...PREF_DEFAULTS, ...stored, theme: localTheme(), access: { ...ACCESS_DEFAULTS, ...stored.access } };
}

export function saveLocalPrefs(patch: Partial<Omit<LocalPrefs, 'access'>> & { access?: Partial<AccessPrefs> }) {
  const current = localPrefs();
  const next = { ...current, ...patch, access: { ...current.access, ...patch.access } };
  if (patch.theme) applyTheme(patch.theme);
  const { theme: _theme, ...rest } = next;
  safeSet(LOCAL_KEY, JSON.stringify(rest));
  return next;
}

export function clearLocalPrefs() {
  safeSet(LOCAL_KEY, null);
  applyTheme('system');
}

/* -------------------------------- this device -------------------------------- */

export interface DevicePrefs {
  /** 0 to 100. */
  musicVolume: number;
  effectsVolume: number;
  /** The speech voice's name, or null for the browser's default. */
  voice: string | null;
  /** The "3D off?" tip has been offered on this device. */
  tip3d: boolean;
  /** The newest "What's new" entry this device has seen. */
  whatsNew: string | null;
}

const DEVICE_DEFAULTS: DevicePrefs = { musicVolume: 100, effectsVolume: 100, voice: null, tip3d: false, whatsNew: null };
let device: DevicePrefs = { ...DEVICE_DEFAULTS, ...readJson<DevicePrefs>(DEVICE_KEY) };
const deviceListeners = new Set<() => void>();

export const devicePrefs = () => device;
export function setDevicePrefs(patch: Partial<DevicePrefs>) {
  device = { ...device, ...patch };
  safeSet(DEVICE_KEY, JSON.stringify(device));
  deviceListeners.forEach((l) => l());
}
export function resetDevicePrefs() {
  setDevicePrefs({ musicVolume: 100, effectsVolume: 100, voice: null });
}
export function subscribeDevice(l: () => void) {
  deviceListeners.add(l);
  return () => deviceListeners.delete(l);
}

/* ------------------------------ applying settings ------------------------------ */

let access: AccessPrefs = { ...ACCESS_DEFAULTS, ...readJson<{ access: AccessPrefs }>(LOOK_KEY).access };
const accessListeners = new Set<() => void>();

/** The accessibility settings in force on this page (the account's, or this device's when signed out). */
export const currentAccess = () => access;
export function subscribeAccess(l: () => void) {
  accessListeners.add(l);
  return () => accessListeners.delete(l);
}

export function localTheme(): 'system' | 'light' | 'dark' {
  const t = safeGet(THEME_KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function applyTheme(theme: 'system' | 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  safeSet(THEME_KEY, theme === 'system' ? null : theme);
}

/** The browser or the system asked for less data (Save-Data, or Chrome's lite mode). */
export function browserWantsLessData(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(c?.saveData) || (window.matchMedia?.('(prefers-reduced-data: reduce)').matches ?? false);
}

export function dataSaverOn(a: AccessPrefs = access): boolean {
  return a.dataSaver === 'on' || (a.dataSaver === 'auto' && browserWantsLessData());
}

type Applied = Pick<FullPrefs, 'theme' | 'reducedMotion' | 'textSize' | 'highContrast'> & { access?: Partial<AccessPrefs> | undefined };

/** The <html> data attributes for a set of settings. Pure, so it can be tested. */
export function lookAttributes(p: Applied): Record<string, string> {
  const a = { ...ACCESS_DEFAULTS, ...p.access };
  const out: Record<string, string> = {};
  if (p.reducedMotion !== 'system') out.motion = p.reducedMotion === 'on' ? 'off' : 'on';
  if (p.textSize !== 'normal') out.text = p.textSize;
  if (p.highContrast || a.maxContrast) out.contrast = a.maxContrast ? 'max' : 'high';
  if (a.font === 'easy') out.font = 'easy';
  if (a.letterSpacing !== 'normal') out.letters = a.letterSpacing;
  if (a.lineSpacing !== 'normal') out.lines = a.lineSpacing;
  if (a.lessTransparency) out.transparency = 'less';
  if (a.underlineLinks) out.links = 'underline';
  if (a.strongFocus) out.focus = 'strong';
  if (a.tiles === 'safe') out.tiles = 'safe';
  if (a.calm) out.calm = 'on';
  if (a.littleHands) out.little = 'on';
  if (a.timer !== 'both') out.timer = a.timer;
  if (dataSaverOn(a)) out.saver = 'on';
  return out;
}

/** Every attribute lookAttributes can set, so ones no longer chosen are taken off. */
const LOOK_ATTRS = ['motion', 'text', 'contrast', 'font', 'letters', 'lines', 'transparency', 'links', 'focus', 'tiles', 'calm', 'little', 'timer', 'saver'];

export function applyPreferences(p: Applied) {
  const root = document.documentElement;
  applyTheme(p.theme);
  const attrs = lookAttributes(p);
  for (const k of LOOK_ATTRS) {
    if (attrs[k]) root.dataset[k] = attrs[k];
    else delete root.dataset[k];
  }
  access = { ...ACCESS_DEFAULTS, ...p.access };
  safeSet(LOOK_KEY, JSON.stringify({ attrs, access }));
  accessListeners.forEach((l) => l());
}

/** True when the player (or their OS) has asked for less motion. */
export function prefersReducedMotion(): boolean {
  const m = document.documentElement.dataset.motion;
  if (m === 'off') return true;
  if (m === 'on') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
