import { Link } from 'react-router';
import { MODE_CATEGORY_INFO, type ModeMeta } from '@ludora/shared';
import { thumbFor, type CatalogEntry } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import '../home/festival.css';

const PACING_LABEL = { host: 'Host-paced', self: 'Self-paced', solo: 'Solo' } as const;

/** Facts about a mode as short chips: category, pacing, length and variants. */
export function modeFacts(m: CatalogEntry): string[] {
  const meta: ModeMeta = m.meta;
  const variants = m.variants.length;
  return [MODE_CATEGORY_INFO[meta.category].label, PACING_LABEL[meta.pacing], `${meta.duration.min} to ${meta.duration.max} min`, ...(variants ? [`${variants} ${variants === 1 ? 'variant' : 'variants'}`] : [])];
}

/** A mode as a festival stall card: its thumbnail, name and tagline. The whole card is the link. */
export function ModeCard({ mode, heading: H = 'h3', facts = false, className = '' }: { mode: CatalogEntry; heading?: 'h2' | 'h3'; facts?: boolean; className?: string }) {
  const meta = mode.meta;
  return (
    <Link
      to={`/modes/${meta.id}`}
      className={`fx-lift group flex flex-col overflow-hidden rounded-[22px] border-[2.5px] border-ink bg-raised text-text no-underline shadow-[0_5px_0_var(--ink)] hover:shadow-[0_8px_0_var(--ink)] active:shadow-[0_2px_0_var(--ink)] ${className}`}
    >
      <ModeArt thumb={thumbFor(meta)} className="aspect-[16/10] w-full border-b-[2.5px] border-ink" />
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <H className="font-display text-xl leading-tight font-extrabold">{meta.title}</H>
          {meta.status !== 'playable' ? <span className="shrink-0 rounded-full border-2 border-ink bg-lantern px-2 text-xs font-bold text-on-accent">{meta.status === 'beta' ? 'Beta' : 'In the works'}</span> : null}
        </div>
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
