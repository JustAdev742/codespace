/*
 * How much the stage's effects may draw on this device (D62). Pure, so it can be tested: the facts
 * come from fx/index.ts.
 *
 * Three levels. "plain" is the game as it has always been drawn: celebrations are a handful of CSS
 * pieces, nothing runs between them, and a Chromebook from 2017 is at home. "full" and "rich" draw
 * celebrations on a canvas with real movement (pieces that tumble, fall and settle), "rich" with
 * more of them. A device never has to cope with a level it cannot hold: the automatic choice starts
 * from what the device says about itself, and a frame-time check while the first effects play
 * takes it down for the rest of the visit if frames are slow (fx/governor.ts).
 */

/** The graphics setting, shared with the 3D game modes (three/quality.ts). */
export type GraphicsChoice = 'auto' | 'low' | 'medium' | 'high' | 'off';

export type FxLevel = 'plain' | 'full' | 'rich';

export interface FxFacts {
  choice: GraphicsChoice;
  /** navigator.hardwareConcurrency, or 4 where the browser does not say. */
  cores: number;
  /** navigator.deviceMemory in GB, or null where the browser does not say (Safari, Firefox). */
  memory: number | null;
  /** WebGL drawn by the processor: no usable graphics chip, so canvases are slow too. */
  software: boolean;
  dataSaver: boolean;
  /** The frame-time check found effects too slow on this device during this visit. */
  slow: boolean;
}

export function decideFx(f: FxFacts): FxLevel {
  // Low and "3D off" both ask for the plain game.
  if (f.choice === 'off' || f.choice === 'low') return 'plain';
  // A choice made by hand is kept even when frames are slow: the check trims how much is drawn instead.
  if (f.choice === 'high') return 'rich';
  if (f.choice === 'medium') return 'full';
  if (f.slow || f.dataSaver || f.software) return 'plain';
  if (f.cores <= 2 || (f.memory !== null && f.memory <= 2)) return 'plain';
  if (f.cores >= 8 && (f.memory === null || f.memory >= 8)) return 'rich';
  return 'full';
}

/** How many pieces a level draws, as a share of the richest. */
export const FX_BUDGET: Record<FxLevel, number> = { plain: 0, full: 0.6, rich: 1 };

/** The sharpest a level draws: device pixels per CSS pixel. */
export const FX_DPR: Record<FxLevel, number> = { plain: 1, full: 1.5, rich: 2 };
