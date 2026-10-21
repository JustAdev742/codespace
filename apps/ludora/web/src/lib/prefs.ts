import type { Preferences } from './session.ts';

const THEME_KEY = 'ludora.theme';

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

export function applyPreferences(p: Pick<Preferences, 'theme' | 'reducedMotion' | 'textSize' | 'highContrast'>) {
  const root = document.documentElement;
  applyTheme(p.theme);
  if (p.reducedMotion === 'system') delete root.dataset.motion;
  else root.dataset.motion = p.reducedMotion === 'on' ? 'off' : 'on';
  if (p.textSize === 'normal') delete root.dataset.text;
  else root.dataset.text = p.textSize;
  if (p.highContrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
}

/** True when the player (or their OS) has asked for less motion. */
export function prefersReducedMotion(): boolean {
  const m = document.documentElement.dataset.motion;
  if (m === 'off') return true;
  if (m === 'on') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
