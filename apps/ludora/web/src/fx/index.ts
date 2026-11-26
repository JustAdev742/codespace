/*
 * The stage's effects: the way in. This file is small and loads with the page; what draws
 * (runtime.ts) is fetched on its own once a page that celebrates is up, and only on a device that
 * will get more than the plain game (decide.ts). Until it has arrived, and wherever it never will,
 * callers fall back to the plain effect they already have: nothing waits for this.
 *
 * Less motion (the device's setting, the player's, or a calm room) means no effects at all, as it
 * always has. That is accessibility, not performance, and no graphics level overrides it.
 */

import { dataSaverOn, prefersReducedMotion } from '../lib/prefs.ts';
import { softwareRenderer, storedChoice, webglSupported } from '../three/quality.ts';
import { decideFx, FX_BUDGET, FX_DPR, type FxLevel } from './decide.ts';
import type { BurstRequest } from './runtime.ts';

/** This visit's frame-time check found the effects too slow here. */
const SLOW_KEY = 'ludora.fx.slow';

let level: FxLevel | null = null;
let runtime: typeof import('./runtime.ts') | null = null;
let loading = false;
let listening = false;

function slowHere(): boolean {
  try {
    return sessionStorage.getItem(SLOW_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * True when this device has no graphics chip to draw with (WebGL drawn by the processor, or none at
 * all): it keeps the plain game. `localStorage['ludora.fx'] = 'on'` says to draw the effects anyway:
 * that is for the browser tests, which run without a graphics chip and would otherwise never draw
 * them, and for trying the effects on such a machine. It is not a setting anyone is shown.
 */
export function fxSoftware(): boolean {
  let asked = false;
  try {
    asked = localStorage.getItem('ludora.fx') === 'on';
  } catch {
    /* private mode */
  }
  return !asked && (softwareRenderer() || !webglSupported());
}

/** What this device gets: worked out once, and again when the player changes the graphics setting. */
export function fxLevel(): FxLevel {
  if (level) return level;
  if (!listening) {
    listening = true;
    window.addEventListener('ludora:graphics', () => {
      level = null;
      // A new choice is a new start: the last one's verdict does not carry over.
      try {
        sessionStorage.removeItem(SLOW_KEY);
      } catch {
        /* private mode */
      }
      apply();
      fxWarm();
    });
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  level = decideFx({ choice: storedChoice(), cores: nav.hardwareConcurrency ?? 4, memory: nav.deviceMemory ?? null, software: fxSoftware(), dataSaver: dataSaverOn(), slow: slowHere() });
  return level;
}

function apply() {
  const lv = fxLevel();
  if (lv === 'plain') runtime?.stop();
  runtime?.configure({
    budget: FX_BUDGET[lv],
    dpr: FX_DPR[lv],
    onStep: (step) => {
      // Trimmed once and still slow. On the automatic setting the device goes back to the plain game for
      // the rest of the visit; a level chosen by hand is kept, at half its pieces.
      if (step !== 'stop' || storedChoice() !== 'auto') return false;
      try {
        sessionStorage.setItem(SLOW_KEY, '1');
      } catch {
        /* private mode: it is found out again next time */
      }
      level = 'plain';
      return true;
    },
  });
}

/** Celebrations asked for while what draws was still on its way: thrown as it arrives, if it is soon enough. */
let waiting: (() => void)[] = [];

/** Fetches what draws, if this device will use it. Safe to call often; it never blocks. */
export function fxWarm() {
  // Nothing is fetched for a screen that will not draw it: the plain game, or anyone who asked for less motion.
  if (runtime || loading || prefersReducedMotion() || fxLevel() === 'plain') return;
  loading = true;
  import('./runtime.ts').then(
    (m) => {
      runtime = m;
      loading = false;
      apply();
      const due = waiting;
      waiting = [];
      due.forEach((go) => go());
    },
    () => {
      // Offline, or the file is gone after an update: the plain effects carry on.
      loading = false;
    },
  );
}

/** True when a celebration asked for now would be drawn on the canvas. False: use the plain effect. */
export function fxReady(): boolean {
  return runtime !== null && fxLevel() !== 'plain' && !prefersReducedMotion() && document.documentElement.dataset.calm !== 'on';
}

export function fxBurst(r: BurstRequest) {
  if (fxReady()) runtime!.burstAt(r);
}

/**
 * Runs `go` now if a celebration would be drawn, or as soon as what draws has arrived, as long as
 * that is within `patience` ms (a moment thrown late is worse than one not thrown). Returns a way
 * to call it off. For the first moment on a page, which comes before anything has been fetched.
 */
export function fxWhenReady(go: () => void, patience = 2500): () => void {
  if (fxReady()) {
    go();
    return () => {};
  }
  let live = true;
  const run = () => {
    if (live && fxReady()) go();
    live = false;
  };
  waiting.push(run);
  const t = setTimeout(() => (live = false), patience);
  fxWarm();
  return () => {
    live = false;
    clearTimeout(t);
  };
}

/** The winner's shower: cannons and falling paper on a big screen, a lighter fall on a phone. */
export function fxShower(opts: { big: boolean; colors: readonly string[] }) {
  if (fxReady()) runtime!.shower(opts);
}

const FESTIVAL = ['--lantern', '--glim', '--sky', '--ember'];

/**
 * A celebration's colours as a canvas can use them: the game's festival colours as they are where
 * `el` stands (a school's copy has its own), or two shades of a player's own hue, and white.
 */
export function fxColors(el: Element, style = 'festival', hue = 42): string[] {
  if (style !== 'festival') return [`hsl(${hue}, 95%, 64%)`, `hsl(${(hue + 40) % 360}, 95%, 68%)`, '#ffffff'];
  const css = getComputedStyle(el);
  return [...FESTIVAL.map((name) => css.getPropertyValue(name).trim()).filter(Boolean), '#ffffff'];
}
