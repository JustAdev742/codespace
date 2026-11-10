import { Star } from 'lucide-react';
import { useMe } from '../../lib/session.ts';
import { useExtras, useFavourite, type FavouriteKind } from './extras.ts';

/**
 * A star that adds a mode, set or Glim to your favourites. A toggle button (aria-pressed),
 * 44px to press. Hidden for anyone who is not signed in, since favourites belong to an account.
 */
export function FavouriteStar({ kind, id, label, className = '', onStage = false }: { kind: FavouriteKind; id: string; label: string; className?: string; onStage?: boolean }) {
  const me = useMe();
  const extras = useExtras();
  const fav = useFavourite(kind);
  if (!me.data?.user) return null;
  const on = Boolean(extras.data?.favourites[kind].includes(id));
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`Favourite: ${label}`}
      disabled={!extras.data}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fav.mutate({ id, on: !on, label });
      }}
      className={`press-soft grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] transition-colors disabled:opacity-50 ${onStage ? 'bg-white/[0.1] hover:bg-white/[0.18]' : 'border border-line bg-raised hover:bg-surface-2'} ${className}`}
    >
      <Star className={`size-5 ${on ? 'fill-lantern text-lantern' : onStage ? 'text-white' : 'text-text-2'}`} aria-hidden />
    </button>
  );
}

/**
 * A progress ring: a sunken track and a solid arc, with the number in the middle in display type.
 * The ring is drawn; the words are for everyone (role="img" with the full sentence as its name).
 */
export function ProgressRing({ value, max, size = 112, stroke = 12, label, children, tone = 'var(--glim)' }: { value: number; max: number; size?: number; stroke?: number; label: string; children?: React.ReactNode; tone?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={1} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-200 ease-[var(--ease-out)]" style={{ display: pct === 0 ? 'none' : undefined }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>
        {children}
      </div>
    </div>
  );
}

/** A panel heading in the dashboard's style, with an optional link or action on the right. */
export function CardTitle({ id, children, action }: { id: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="font-display text-[1.75rem] leading-tight font-bold">
        {children}
      </h2>
      {action}
    </div>
  );
}
