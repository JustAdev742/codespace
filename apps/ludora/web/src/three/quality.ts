/*
 * Graphics quality. School laptops and old phones have to run these scenes,
 * so every scene reads its budget from here instead of deciding for itself.
 *
 * The tier is picked once from what the device says about itself, can be set
 * by the player (Settings is per device, kept in localStorage), and while a
 * scene runs the frame monitor lowers the resolution, then the tier, if
 * frames get slow. It never raises the tier above what was picked.
 */

export type QualityTier = 'low' | 'medium' | 'high';
export type QualityChoice = 'auto' | QualityTier | 'off';

export interface Quality {
  tier: QualityTier;
  /** Device pixel ratio cap. */
  dpr: number;
  /** Multisample anti-aliasing. Fixed when the renderer is made. */
  antialias: boolean;
  /** Real shadow maps from the sun. Off: soft blob shadows only (always drawn). */
  shadows: boolean;
  /** Ink outlines on characters (and props that ask for them). */
  outlines: boolean;
  /** Scales particle counts. */
  particles: number;
  /** Props beyond this distance are left out by scenes that care. */
  drawDistance: number;
  /** Glim texture size in pixels. */
  texture: number;
}

const TIERS: Record<QualityTier, Omit<Quality, 'tier' | 'dpr'> & { maxDpr: number }> = {
  low: { maxDpr: 1, antialias: false, shadows: false, outlines: false, particles: 0.35, drawDistance: 45, texture: 160 },
  medium: { maxDpr: 1.5, antialias: true, shadows: false, outlines: true, particles: 0.7, drawDistance: 80, texture: 224 },
  high: { maxDpr: 2, antialias: true, shadows: true, outlines: true, particles: 1, drawDistance: 140, texture: 288 },
};

const KEY = 'ludora.graphics';

export function storedChoice(): QualityChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'low' || v === 'medium' || v === 'high' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function storeChoice(choice: QualityChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: the choice lasts this page only */
  }
  window.dispatchEvent(new CustomEvent('ludora:graphics', { detail: choice }));
}

let webgl: boolean | null = null;
let gpuName = '';

/** Whether this browser can draw WebGL 2, which the 3D engine needs. Checked once. */
export function webglSupported(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webgl = Boolean(gl);
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl = false;
  }
  return webgl;
}

/** The tier this device should start at, from what it says about itself. */
export function detectTier(): QualityTier {
  if (!webglSupported()) return 'low';
  const gpu = gpuName.toLowerCase();
  // Software renderers and the oldest mobile GPUs.
  if (/swiftshader|llvmpipe|software|mali-4|adreno \(tm\) 3|powervr sgx/.test(gpu)) return 'low';
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 500;
  if (cores <= 2 || memory <= 2) return 'low';
  if (touch && small) return cores >= 8 && memory >= 6 ? 'medium' : 'low';
  if (/intel.*(hd|uhd) graphics [2-6]\d\d\b|intel\(r\) hd graphics$/.test(gpu)) return 'medium';
  if (cores >= 8 && memory >= 8) return 'high';
  return 'medium';
}

export function qualityFor(tier: QualityTier): Quality {
  const t = TIERS[tier];
  return { tier, dpr: Math.min(t.maxDpr, window.devicePixelRatio || 1), antialias: t.antialias, shadows: t.shadows, outlines: t.outlines, particles: t.particles, drawDistance: t.drawDistance, texture: t.texture };
}

/** The quality to start a scene at, or null when the player turned 3D off (or WebGL is missing). */
export function startingQuality(): Quality | null {
  const choice = storedChoice();
  if (choice === 'off' || !webglSupported()) return null;
  return qualityFor(choice === 'auto' ? detectTier() : choice);
}

/**
 * Watches frame times and asks for less when the device struggles: first a
 * lower resolution, then a lower tier. Samples are averaged over two seconds;
 * the first two seconds after a change are ignored while things settle.
 */
export class FrameMonitor {
  private times: number[] = [];
  private settleUntil = 0;
  /** Resolution scale, 1 down to 0.6. */
  scale = 1;

  constructor(private readonly onLower: (step: 'resolution' | 'tier') => void) {}

  sample(dtMs: number, now: number) {
    if (now < this.settleUntil) return;
    this.times.push(dtMs);
    if (this.times.length < 120) return;
    this.times.sort((a, b) => a - b);
    // The 75th percentile, so one hitch does not count but steady slowness does.
    const p75 = this.times[Math.floor(this.times.length * 0.75)]!;
    this.times = [];
    if (p75 > 24) {
      this.settleUntil = now + 2000;
      if (this.scale > 0.6) {
        this.scale = Math.max(0.6, this.scale - 0.2);
        this.onLower('resolution');
      } else this.onLower('tier');
    }
  }
}
