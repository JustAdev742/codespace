import { Link } from 'react-router';
import { MODE_CATEGORY_INFO, type ModeMeta } from '@ludora/shared';
import { thumbFor, type CatalogEntry } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge } from '../../ui/primitives.tsx';

const PACING_LABEL = { host: 'Host-paced', self: 'Self-paced', solo: 'Solo' } as const;

/** Facts about a mode as short chips: category, pacing, length and variants. */
export function modeFacts(m: CatalogEntry): string[] {
  const meta: ModeMeta = m.meta;
  const variants = m.variants.length;
  return [MODE_CATEGORY_INFO[meta.category].label, PACING_LABEL[meta.pacing], `${meta.duration.min} to ${meta.duration.max} min`, ...(variants ? [`${variants} ${variants === 1 ? 'variant' : 'variants'}`] : [])];
}

/**
 * A mode as a tile in a game catalogue: its cover art with the glyph, the name
 * big in condensed type, the tagline, and (with `facts`) its facts as chips.
 * On phones it is a row, the art beside the words, so a list of modes stays
 * quick to scan. The whole card is the link. It lifts a little under the pointer.
 */
export function ModeCard({ mode, heading: H = 'h3', facts = false, className = '' }: { mode: CatalogEntry; heading?: 'h2' | 'h3'; facts?: boolean; className?: string }) {
  const meta = mode.meta;
  return (
    <Link
      to={`/modes/${meta.id}`}
      className={`group flex overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised text-text no-underline transition-[translate,box-shadow,border-color] duration-150 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_14px_36px_-12px_rgb(2_5_20/0.55)] active:translate-y-0 motion-reduce:hover:translate-y-0 sm:flex-col ${className}`}
    >
      <div className="relative w-28 shrink-0 self-stretch sm:w-auto">
        <ModeArt thumb={thumbFor(meta)} className="block h-full min-h-28 w-full sm:aspect-[16/9] sm:h-auto sm:min-h-0" />
        {meta.status !== 'playable' ? (
          <Badge tone="amber" className="absolute top-2 left-2 sm:top-2.5 sm:right-2.5 sm:left-auto">
            {meta.status === 'beta' ? 'Beta' : 'In the works'}
          </Badge>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:p-4">
        <H className="font-display text-[1.6rem] leading-none font-bold sm:text-[1.75rem]">{meta.title}</H>
        <p className="text-[15px] text-text-2">{meta.tagline}</p>
        {facts ? (
          <ul className="mt-auto flex flex-wrap gap-1.5 pt-3" aria-label="About this mode">
            {modeFacts(mode).map((f) => (
              <li key={f} className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-semibold text-text-2">
                {f}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Link>
  );
}
