import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Tabs as RTabs } from 'radix-ui';
import { RARITY_INFO, type Rarity } from '@ludora/shared';
import './festival.css';

/*
 * Small pieces shared by the home and collecting pages. They are local to
 * these features for now; StickerTabs, ToggleChips, Meter and RarityTag would
 * sit well in ui/primitives.tsx once the shared primitives settle.
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
export const BLEED_ROUNDING = 'min-[1448px]:rounded-b-[36px]';

/* ----------------------------------- Tabs ----------------------------------- */

export interface StickerTab {
  value: string;
  label: ReactNode;
  count?: number;
}

/** Chunky tabs for game-side pages: the active tab is a lantern-amber sticker. */
export function StickerTabs({ value, onValueChange, items, label, children, className = '' }: { value: string; onValueChange: (v: string) => void; items: StickerTab[]; label: string; children?: ReactNode; className?: string }) {
  const list = useRef<HTMLDivElement>(null);
  // On phones the tabs scroll sideways; keep the active one in view without moving the page.
  useEffect(() => {
    const el = list.current;
    const active = el?.querySelector<HTMLElement>('[data-state="active"]');
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    const left = active.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft || left + active.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left - (el.clientWidth - active.offsetWidth) / 2;
  }, [value]);
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List ref={list} aria-label={label} className="relative -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible">
        {items.map((i) => (
          <RTabs.Trigger
            key={i.value}
            value={i.value}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full border-2 border-line-strong bg-raised px-4 font-display text-[15px] font-bold whitespace-nowrap text-text-2 shadow-[0_3px_0_var(--line-strong)] transition-[transform,box-shadow,background-color] hover:text-text active:translate-y-[2px] active:shadow-[0_1px_0_var(--line-strong)] data-[state=active]:border-ink data-[state=active]:bg-lantern data-[state=active]:text-on-accent data-[state=active]:shadow-[0_3px_0_var(--ink)]"
          >
            {i.label}
            {i.count !== undefined ? <span className="min-w-6 rounded-full bg-[rgb(29_24_70/0.12)] px-1.5 text-center font-sans text-xs font-bold tabular">{i.count}</span> : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export const StickerTabPanel = RTabs.Content;

/* ---------------------------------- Chips ----------------------------------- */

/** A row of toggle chips for filtering. Each chip is a button with aria-pressed. */
export function ToggleChips<T extends string>({ value, onChange, options, label, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-full border-2 px-4 text-sm font-bold transition-[transform,box-shadow,background-color] active:translate-y-[2px] ${on ? 'border-ink bg-text text-bg shadow-[0_3px_0_var(--ink)] active:shadow-[0_1px_0_var(--ink)]' : 'border-line-strong bg-raised text-text-2 shadow-[0_3px_0_var(--line-strong)] hover:text-text active:shadow-[0_1px_0_var(--line-strong)]'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Meter ----------------------------------- */

const METER_FILL = { amber: 'var(--lantern)', mint: 'var(--glim)', violet: 'var(--dusk)', sky: 'var(--sky)', rose: 'var(--rose)' } as const;

/** A chunky progress bar with an ink edge, for XP, collections and quests. */
export function Meter({ value, max, tone = 'amber', label, size = 'md', className = '', fill }: { value: number; max: number; tone?: keyof typeof METER_FILL; label: string; size?: 'sm' | 'md' | 'lg'; className?: string; fill?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const h = size === 'sm' ? 'h-3' : size === 'lg' ? 'h-5' : 'h-4';
  return (
    <div className={`${h} w-full overflow-hidden rounded-full border-2 border-ink bg-surface-3 ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={`h-full rounded-full border-ink transition-[width] duration-700 ease-out ${pct > 0 && pct < 100 ? 'border-r-2' : ''}`} style={{ width: `${pct}%`, background: fill ?? METER_FILL[tone] }}>
        <div className="mx-1.5 mt-[2px] h-[30%] rounded-full bg-white/40" />
      </div>
    </div>
  );
}

/* ---------------------------------- Rarity ---------------------------------- */

/** Rarity as a filled tag in its own colour. Ink text passes AA on every rarity colour. */
export function RarityTag({ rarity, size = 'sm', className = '', style }: { rarity: Rarity; size?: 'sm' | 'md' | 'lg'; className?: string; style?: CSSProperties }) {
  const sizing = size === 'lg' ? 'px-4 py-0.5 font-display text-lg shadow-[0_2px_0_var(--ink)]' : size === 'md' ? 'px-3 py-0.5 text-sm' : 'px-2 py-px text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full border-2 border-ink font-bold whitespace-nowrap text-on-accent ${sizing} ${rarity === 'mythic' ? 'rarity-mythic-shimmer' : ''} ${className}`}
      style={{ ...(rarity === 'mythic' ? {} : { background: `var(--r-${rarity})` }), ...style }}
    >
      {RARITY_INFO[rarity].label}
    </span>
  );
}

/** Percentages as the odds tables show them: two decimals under 1%, one above. */
export function formatPercent(p: number): string {
  return `${p < 1 ? p.toFixed(2) : p.toFixed(1)}%`;
}
