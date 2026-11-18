/*
 * Whether the home menu shows as the 3D yard or as its flat version. The flat menu is the real
 * one: every link and the join box are ordinary HTML and are on the page first. The yard is drawn
 * behind them afterwards, only where it will run well and only if nobody has turned it off.
 *
 * Nothing here imports three.js: the answer is worked out before any of it is fetched.
 */

const KEY = 'ludora.menu';

/** What this device has been told, or found out, about the 3D menu. */
export type MenuChoice = 'on' | 'off' | 'slow' | null;

export function storedMenuChoice(): MenuChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' || v === 'slow' ? v : null;
  } catch {
    return null;
  }
}

export function storeMenuChoice(choice: MenuChoice) {
  try {
    if (choice) localStorage.setItem(KEY, choice);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the choice lasts this page only */
  }
}

export interface MenuFacts {
  /** The player's own choice for this menu, or what an earlier visit found. */
  choice: MenuChoice;
  /** The graphics setting shared with the 3D game modes. */
  graphics: 'auto' | 'low' | 'medium' | 'high' | 'off';
  webgl: boolean;
  /** WebGL drawn by the processor: common on school Chromebooks with no usable graphics chip. */
  software: boolean;
  dataSaver: boolean;
}

export type FlatReason = 'chosen' | 'graphics-off' | 'no-webgl' | 'data-saver' | 'software' | 'slow';

export interface MenuView {
  view: '3d' | 'flat';
  /** Why it is flat. */
  reason?: FlatReason;
  /** Whether a "Show the 3D menu" button makes sense on this device. */
  canSwitch: boolean;
  /** The player asked for 3D themselves: lower the quality if frames are slow, but do not take it away. */
  asked: boolean;
}

/** Pure, so it can be tested. */
export function decideMenuView(f: MenuFacts): MenuView {
  if (!f.webgl) return { view: 'flat', reason: 'no-webgl', canSwitch: false, asked: false };
  // 3D off in the graphics menu means off everywhere, and that menu is where it is turned back on.
  if (f.graphics === 'off') return { view: 'flat', reason: 'graphics-off', canSwitch: false, asked: false };
  if (f.choice === 'off') return { view: 'flat', reason: 'chosen', canSwitch: true, asked: false };
  if (f.choice === 'on') return { view: '3d', canSwitch: true, asked: true };
  // A graphics tier picked by hand is also a clear wish for 3D.
  const picked = f.graphics !== 'auto';
  if (f.choice === 'slow') return { view: 'flat', reason: 'slow', canSwitch: true, asked: false };
  if (f.dataSaver) return { view: 'flat', reason: 'data-saver', canSwitch: true, asked: false };
  if (f.software && !picked) return { view: 'flat', reason: 'software', canSwitch: true, asked: false };
  return { view: '3d', canSwitch: true, asked: picked };
}
