import type { ReactNode } from 'react';
import './festival.css';

/*
 * Layout helpers for the home and collecting pages. The game-side controls
 * (StickerTabs, ToggleChips, Meter, RarityTag) now live in ui/game.tsx and are
 * re-exported here for the pages that already import them.
 */

/**
 * Lets a stage reach the edges of the content column by stepping out of the
 * Shell's padded <main>. Once the column is wider than <main> (1200px, so a
 * 1448px window with the 248px sidebar) the stage hangs like a banner instead.
 */
export function Bleed({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`-mx-4 -mt-6 sm:-mx-6 ${className}`}>{children}</div>;
}
/** Rounds a full-bleed stage once it stops touching the column edges. */
export const BLEED_ROUNDING = 'min-[1448px]:rounded-b-[var(--radius-l)]';

export { Meter, RarityTag, StickerTabPanel, StickerTabs, ToggleChips, formatPercent, type StickerTab } from '../../ui/game.tsx';
