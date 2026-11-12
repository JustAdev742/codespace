import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Hammer } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { RadioCard } from './pickers.tsx';

/*
 * Playing solo: games made in Game Maker, chosen like any built-in mode (a card in step 2), so a
 * made game goes through "Your settings" too (bots and their level, only the hard questions)
 * before it starts. The server still checks the player may play it when the room is created.
 * Hosting a class keeps Game Maker's own section (modestudio/HostMadeGames.tsx).
 */

/** What this list reads of a made game, as GET /api/blueprints sends it. */
export interface SoloMadeGame {
  id: string;
  name: string;
  tagline: string;
  glyph: string;
  hue: number;
  dimension: '2d' | '3d';
  owner: { name: string };
  mine: boolean;
  playable: boolean;
}

const SHOWN = 6;

export function SoloMadeGames({ value, onChange }: { value: SoloMadeGame | null; onChange: (g: SoloMadeGame) => void }) {
  // ?blueprint= from Game Maker's Play solo.
  const preselect = useSearchParams()[0].get('blueprint');
  const chosen = useQuery({ queryKey: ['blueprint', preselect], queryFn: () => api.get<{ game: SoloMadeGame }>(`/api/blueprints/${preselect}`), enabled: Boolean(preselect) });
  const mine = useQuery({ queryKey: ['blueprints', 'mine', ''], queryFn: () => api.get<{ games: SoloMadeGame[] }>('/api/blueprints?scope=mine') });
  const others = useQuery({ queryKey: ['blueprints', 'public', ''], queryFn: () => api.get<{ games: SoloMadeGame[] }>('/api/blueprints?scope=public') });
  const applied = useRef(false);
  const top = chosen.data?.game ?? null;
  useEffect(() => {
    // Arriving from Game Maker's Play solo: that game is chosen, and only the set is left to pick.
    if (!top || applied.current || !top.playable) return;
    applied.current = true;
    onChange(top);
  }, [top, onChange]);

  const seen = new Set<string>();
  const list = [...(top ? [top] : []), ...(mine.data?.games ?? []), ...(others.data?.games ?? [])].filter((g) => {
    if (!g.playable || seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
  const shown = list.slice(0, SHOWN);
  // A made game chosen from further down a list stays in view.
  if (value && !shown.some((g) => g.id === value.id)) shown.push(value);
  return (
    <section aria-labelledby="solo-made-games" className="mt-6 border-t border-line pt-4">
      <h3 id="solo-made-games" className="mb-1 flex items-center gap-2 font-display text-xl font-bold">
        <Hammer className="size-5 text-text-3" aria-hidden /> Games made in Game Maker
      </h3>
      {preselect && chosen.isError ? <p className="mb-2 font-semibold">That made game could not be opened. It may be private or deleted.</p> : null}
      {shown.length ? (
        <div role="radiogroup" aria-labelledby="solo-made-games" className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((g) => (
            <RadioCard key={g.id} name="host-mode" checked={value?.id === g.id} onSelect={() => onChange(g)}>
              <ModeArt thumb={{ glyph: g.glyph, hue: g.hue, accentHue: (g.hue + 40) % 360 }} mark={{ glyph: g.glyph, hue: g.hue }} className="w-20 shrink-0 self-stretch sm:w-24" />
              <span className="min-w-0 flex-1 py-2.5 pr-9 pl-3">
                <span className="flex flex-wrap items-center gap-x-2 font-display text-xl leading-tight font-bold break-words">
                  {g.name}
                  {g.dimension === '3d' ? <Badge tone="violet">3D</Badge> : null}
                </span>
                {g.tagline ? <span className="mt-0.5 line-clamp-2 block text-sm text-text-2">{g.tagline}</span> : null}
                <span className="mt-1 block text-xs font-semibold text-text-2">{g.mine ? 'Made by you' : `Made by ${g.owner.name}`}</span>
              </span>
            </RadioCard>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-2">Games you or others make in Game Maker show here, to play with any set.</p>
      )}
      <ButtonLink to="/game-maker" size="sm" variant="secondary" className="mt-3">
        Open Game Maker
      </ButtonLink>
    </section>
  );
}
