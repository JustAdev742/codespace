import { Trophy } from 'lucide-react';
import { houseFill } from '@ludora/shared';
import { formatNumber, ordinal, plural } from '../../lib/format.ts';
import { HouseCrest } from './emblems.tsx';
import { yearLabel, type RankedHouse, type Standings } from './schoolData.ts';

/*
 * House standings as a broadcast scoreboard: big tabular numbers, a bar in each house's colour,
 * and the rank in words and figures, so nothing depends on colour. Totals only.
 */

export function HouseBoard({ houses, big = false, caption }: { houses: RankedHouse[]; big?: boolean; caption: string }) {
  const top = Math.max(1, ...houses.map((h) => h.points));
  if (!houses.length) return <p className="text-text-2">No houses yet. School staff set them up under Run the school.</p>;
  return (
    <ol aria-label={caption} className={`flex flex-col ${big ? 'gap-4' : 'gap-2.5'}`}>
      {houses.map((h) => (
        <li key={h.id} className={`flex items-center ${big ? 'gap-5' : 'gap-3'}`}>
          <span className={`w-10 shrink-0 text-right font-display font-extrabold tabular ${big ? 'text-5xl w-20' : 'text-2xl'}`} aria-label={`${ordinal(h.rank)} place`}>
            {h.rank}
          </span>
          <HouseCrest house={h} size={big ? 72 : 40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`truncate font-bold text-text ${big ? 'text-4xl font-display' : 'text-base'}`}>{h.name}</span>
              <span className={`shrink-0 font-display font-extrabold tabular text-text ${big ? 'text-6xl' : 'text-2xl'}`}>
                {formatNumber(h.points)}
                <span className="sr-only"> points</span>
              </span>
            </div>
            <div className={`mt-1 overflow-hidden rounded-full bg-surface-3 ${big ? 'h-4' : 'h-2'}`} aria-hidden>
              <div className="h-full rounded-full transition-[width] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none" style={{ width: `${(h.points / top) * 100}%`, background: houseFill(h.hue) }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function YearTable({ years }: { years: Standings['years'] }) {
  if (!years.length) return <p className="text-text-2">No house points yet in this time.</p>;
  const top = Math.max(...years.map((y) => y.points));
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">House points by year group</caption>
      <thead>
        <tr className="text-text-3">
          <th scope="col" className="py-2 font-semibold">
            Year
          </th>
          <th scope="col" className="py-2 text-right font-semibold">
            Players
          </th>
          <th scope="col" className="py-2 text-right font-semibold">
            Points
          </th>
        </tr>
      </thead>
      <tbody>
        {years.map((y) => (
          <tr key={y.id} className="border-t border-line">
            <th scope="row" className="py-2.5 font-semibold text-text">
              <span className="inline-flex items-center gap-2">
                {yearLabel(y.year)}
                {y.points === top && top > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-[var(--radius-s)] bg-lantern px-1.5 py-0.5 text-xs font-bold text-on-accent">
                    <Trophy className="size-3" aria-hidden />
                    Top
                  </span>
                ) : null}
              </span>
            </th>
            <td className="py-2.5 text-right text-text-2 tabular">{plural(y.players, 'player')}</td>
            <td className="py-2.5 text-right font-display text-lg font-extrabold text-text tabular">{formatNumber(y.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
