import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Tabs as RTabs } from 'radix-ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RARITY_INFO, type Rarity } from '@ludora/shared';

/*
 * Game-side primitives: the pressable pieces used on player pages (shop,
 * collection, quests, dashboard). Solid fills with a darker bottom edge, no
 * outlines (docs/DESIGN.md). Staff and settings pages use the calmer controls
 * in primitives.tsx.
 */

/**
 * The quiet pressable look (`.press-soft`) as utilities, so a state variant can
 * swap it for the solid one (`.sticker`: a darker band inside the bottom edge).
 */
const SOFT = 'border border-line-strong bg-raised text-text-2 shadow-[inset_0_-3px_0_color-mix(in_oklab,var(--line-strong)_55%,transparent)] hover:text-text';

/* ----------------------------------- Tabs ----------------------------------- */

export interface StickerTab {
  value: string;
  label: ReactNode;
  count?: number;
}

/** Tabs for game-side pages: pills that press; the active one is solid gold with ink text. */
export function StickerTabs({ value, onValueChange, items, label, children, className = '' }: { value: string; onValueChange: (v: string) => void; items: StickerTab[]; label: string; children?: ReactNode; className?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState({ before: false, after: false });
  // On phones the tabs scroll sideways; keep the active one in view without moving the page.
  useEffect(() => {
    const el = list.current;
    const active = el?.querySelector<HTMLElement>('[data-state="active"]');
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    const left = active.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft || left + active.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left - (el.clientWidth - active.offsetWidth) / 2;
  }, [value]);
  // Which ends have tabs scrolled out of sight, so those edges can fade and show an arrow.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => {
      const end = el.scrollWidth - el.clientWidth;
      const before = el.scrollLeft > 4;
      const after = el.scrollLeft < end - 4;
      setHidden((h) => (h.before === before && h.after === after ? h : { before, after }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [items.length]);
  const fade = hidden.before || hidden.after ? `linear-gradient(to right, ${hidden.before ? 'transparent, #000 3.5rem' : '#000'}, ${hidden.after ? '#000 calc(100% - 3.5rem), transparent' : '#000'})` : undefined;
  const scroll = (dir: -1 | 1) => list.current?.scrollBy({ left: dir * list.current.clientWidth * 0.7, behavior: 'smooth' });
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <div className="relative">
        <RTabs.List ref={list} aria-label={label} className="relative -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible" style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}>
          {items.map((i) => (
            <RTabs.Trigger
              key={i.value}
              value={i.value}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition-[translate,box-shadow,background-color,color] duration-[120ms] ease-[var(--ease-out)] active:translate-y-px ${SOFT} data-[state=active]:border-transparent data-[state=active]:bg-lantern data-[state=active]:text-on-accent data-[state=active]:shadow-[inset_0_-4px_0_rgb(0_0_0/0.24),0_2px_0_rgb(0_0_0/0.18)] data-[state=active]:hover:text-on-accent`}
            >
              {i.label}
              {/* Tinted from the label's own colour, so it reads on the plain pill and on the gold one. */}
              {i.count !== undefined ? <span className="min-w-6 rounded-full bg-[color-mix(in_oklab,currentColor_14%,transparent)] px-1.5 text-center text-xs font-bold tabular">{i.count}</span> : null}
            </RTabs.Trigger>
          ))}
        </RTabs.List>
        {/* Arrows for pointers; touch scrolls and the keyboard moves through the tabs, so they stay out of the tab order. */}
        {hidden.before ? <ScrollArrow side="before" onClick={() => scroll(-1)} /> : null}
        {hidden.after ? <ScrollArrow side="after" onClick={() => scroll(1)} /> : null}
      </div>
      {children}
    </RTabs.Root>
  );
}

function ScrollArrow({ side, onClick }: { side: 'before' | 'after'; onClick: () => void }) {
  const Icon = side === 'before' ? ChevronLeft : ChevronRight;
  return (
    <button type="button" tabIndex={-1} aria-hidden onClick={onClick} className={`absolute top-0.5 grid h-11 w-10 place-items-center ${side === 'before' ? '-left-1' : '-right-1'}`}>
      <span className="lift grid size-8 place-items-center rounded-full border border-line-strong bg-raised text-text">
        <Icon className="size-4" />
      </span>
    </button>
  );
}

export const StickerTabPanel = RTabs.Content;

/* ---------------------------------- Chips ----------------------------------- */

/**
 * A row of toggle chips for filtering. Each chip is a button with aria-pressed.
 * The chosen one inverts (`.chip-on` in app.css: the theme's text colour as its
 * fill), so it stands out by lightness, not by hue alone; 44px tall for thumbs.
 */
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
            className={`h-11 rounded-full px-4 text-sm font-semibold transition-[translate,box-shadow,background-color,color] duration-[120ms] ease-[var(--ease-out)] active:translate-y-px ${on ? 'chip-on border border-transparent shadow-[inset_0_-3px_0_rgb(0_0_0/0.22)]' : SOFT}`}
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

/** A progress bar for XP, collections and quests: a sunken groove with a fine edge and a solid fill, like a HUD meter. */
export function Meter({ value, max, tone = 'amber', label, size = 'md', className = '', fill }: { value: number; max: number; tone?: keyof typeof METER_FILL; label: string; size?: 'sm' | 'md' | 'lg'; className?: string; fill?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const h = size === 'sm' ? 'h-2.5' : size === 'lg' ? 'h-4' : 'h-3';
  return (
    <div className={`${h} w-full overflow-hidden rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)] ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="h-full rounded-[var(--radius-s)] transition-[width] duration-200 ease-[var(--ease-out)]" style={{ width: `${pct}%`, background: fill ?? METER_FILL[tone] }} />
    </div>
  );
}

/* ---------------------------------- Rarity ---------------------------------- */

/**
 * Rarity as a filled tag in its own colour, like the rarity strip on a trading
 * card: condensed capitals (DESIGN.md allows capitals for a rarity on a card).
 * Ink text passes AA on every rarity colour.
 */
export function RarityTag({ rarity, size = 'sm', className = '', style }: { rarity: Rarity; size?: 'sm' | 'md' | 'lg'; className?: string; style?: CSSProperties }) {
  const sizing = size === 'lg' ? 'px-3 py-0.5 text-xl' : size === 'md' ? 'px-2.5 py-0.5 text-base' : 'px-2 text-[13px]';
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-s)] font-display leading-tight font-bold tracking-[0.06em] whitespace-nowrap text-on-accent uppercase ${sizing} ${rarity === 'mythic' ? 'rarity-mythic-shimmer' : ''} ${className}`}
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
