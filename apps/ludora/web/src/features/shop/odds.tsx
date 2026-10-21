import { useQuery } from '@tanstack/react-query';
import { RARITY_INFO, type LanternArt, type Rarity } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { formatPercent } from '../home/kit.tsx';

/** A Lantern's contents and odds, from the same table the server rolls against. */
export interface PackDetail {
  pack: { id: string; name: string; description: string; art: LanternArt; price: { currency: string; amount: number } };
  odds: { rarity: Rarity; percent: number; items: number; perItemPercent: number }[];
  pity: { every: number; untilGuaranteed: number } | null;
  items: { id: string; name: string; rarity: Rarity; art: unknown; owned: number }[];
}

export function usePackDetail(packId: string | null | undefined) {
  return useQuery({ queryKey: ['pack', packId], queryFn: () => api.get<PackDetail>(`/api/packs/${packId}`), enabled: Boolean(packId), staleTime: 60_000 });
}

/**
 * The odds as one bar split by rarity, with every percentage written out
 * underneath. `highlight` picks out the rarity just found.
 */
export function OddsBar({ odds, highlight, className = '', compact = false }: { odds: PackDetail['odds']; highlight?: Rarity | null; className?: string; compact?: boolean }) {
  return (
    <div className={className}>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full border-2 border-ink bg-surface-3" aria-hidden>
        {odds.map((o, i) => (
          <span
            key={o.rarity}
            className={`h-full ${i ? 'border-l-2 border-ink' : ''}`}
            style={{ width: `${o.percent}%`, minWidth: 5, background: `var(--r-${o.rarity})`, opacity: highlight && highlight !== o.rarity ? 0.35 : 1 }}
          />
        ))}
      </div>
      <ul className={`mt-2 flex flex-wrap ${compact ? 'gap-x-3 gap-y-1' : 'gap-x-4 gap-y-1.5'}`} aria-label="Chance of each rarity">
        {odds.map((o) => (
          <li key={o.rarity} className={`inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap ${highlight === o.rarity ? 'font-bold text-text' : 'text-text-2'} ${highlight && highlight !== o.rarity ? 'opacity-80' : ''}`}>
            <span className="size-2.5 shrink-0 rounded-full border border-ink" style={{ background: `var(--r-${o.rarity})` }} aria-hidden />
            {RARITY_INFO[o.rarity].label} <span className="font-bold tabular">{formatPercent(o.percent)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
