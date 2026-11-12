import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Box, Plus, Search } from 'lucide-react';
import { KIND_INFO, STARTER_BLUEPRINTS, codeStatements } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, EmptyState, ErrorNotice, Input, PageHeader, SectionTitle, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { SavedGames } from '../games/Games.tsx';
import { CodeLine } from './CodeHelp.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { MadeGameActions, MadeGameCard } from './MadeGameCard.tsx';
import type { MadeGameCardData } from './data.ts';

/*
 * Game Maker's front page: start from one of the complete starting points (each shown by its first
 * lines of code) or from nothing, open your own made games, or find one someone else made public.
 * The "Saved games" tab holds what the old Game Maker page did: a mode with its settings and a
 * set, saved from the host page.
 */

/** The lines of a starting point's code that say most about it. */
function previewLines(bp: (typeof STARTER_BLUEPRINTS)[number]['blueprint']): string[] {
  const want = ['kind', 'right', 'surprise:0', 'var:0', 'rule:0', 'rule:1', 'wrong', 'powers', 'wins'];
  return codeStatements(bp)
    .filter((s) => want.includes(s.key))
    .sort((a, b) => want.indexOf(a.key) - want.indexOf(b.key))
    .slice(0, 4)
    .map((s) => s.text);
}

export function MadeGameList({ scope, q = '' }: { scope: 'mine' | 'public'; q?: string }) {
  const list = useQuery({ queryKey: ['blueprints', scope, q], queryFn: () => api.get<{ games: MadeGameCardData[] }>(`/api/blueprints?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  if (list.isError) return <ErrorNotice message="The games did not load." onRetry={() => void list.refetch()} />;
  if (list.isPending) return <Skeleton className="h-56" />;
  const games = list.data.games;
  if (!games.length) {
    return scope === 'mine' ? (
      <EmptyState title="You have not made a game yet">Pick a starting point above, change it, and save it.</EmptyState>
    ) : (
      <EmptyState title={q ? 'No games match that search' : 'No games listed yet'}>Trusted players and teachers can list the games they make here.</EmptyState>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {games.map((g) => (
        <MadeGameCard key={g.id} g={g} actions={<MadeGameActions g={g} />} />
      ))}
    </ul>
  );
}

export default function ModeStudioHome() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'saved' ? 'saved' : 'make';
  useEffect(() => {
    document.title = tab === 'saved' ? 'Saved games | Game Maker | Ludora' : 'Game Maker | Ludora';
  }, [tab]);
  return (
    <>
      <PageHeader
        title="Game Maker"
        description="Make a game of your own by writing simple code, one rule a line: what it is about, what an answer does, your own rules and numbers, how it ends and how it looks. A test game against bots follows every line."
        actions={
          <ButtonLink to="/game-maker/new" variant="secondary" icon={<Plus className="size-4" aria-hidden />}>
            Start from nothing
          </ButtonLink>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === 'saved') next.set('tab', 'saved');
          else {
            next.delete('tab');
            next.delete('saved');
          }
          setParams(next, { replace: true });
        }}
        label="Game Maker"
        items={[
          { value: 'make', label: 'Make a game' },
          { value: 'saved', label: 'Saved games' },
        ]}
      >
        <TabPanel value="make">
          <MakeTab />
        </TabPanel>
        <TabPanel value="saved">
          <SavedGames />
        </TabPanel>
      </Tabs>
    </>
  );
}

function MakeTab() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user && !me.data.user.isGuest);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <div className="flex flex-col gap-8">
        <section aria-labelledby="starters">
          <SectionTitle>
            <span id="starters">Start from a game: read its code, change a number, watch it change</span>
          </SectionTitle>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STARTER_BLUEPRINTS.map(({ id, blueprint: bp }) => (
              <li key={id} className="flex flex-col overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised">
                <Link to={`/game-maker/new?from=${id}`} className="flex flex-1 flex-col hover:bg-surface-2">
                  <div className="relative">
                    <ModeArt thumb={{ glyph: bp.cover.glyph, hue: bp.cover.hue, accentHue: bp.look.accent }} mark={{ glyph: bp.cover.glyph, hue: bp.cover.hue }} className="block aspect-[16/9] w-full" label={bp.name} />
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      {bp.look.dimension === '3d' ? (
                        <Badge tone="violet">
                          <Box className="size-3.5" aria-hidden /> 3D
                        </Badge>
                      ) : (
                        <Badge>2D</Badge>
                      )}
                      <Badge>{KIND_INFO[bp.kind.type].label}</Badge>
                    </div>
                  </div>
                  <span className="flex flex-col gap-1 p-3">
                    <span className="font-display text-xl leading-tight font-bold">{bp.name}</span>
                    <span className="flex flex-col rounded-[var(--radius-s)] bg-sunken px-2 py-1.5 font-sans text-sm leading-6 [overflow-wrap:anywhere]" aria-hidden>
                      {previewLines(bp).map((l) => (
                        <span key={l}>
                          <CodeLine line={l} />
                        </span>
                      ))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {signedIn ? (
          <section aria-labelledby="mine">
            <SectionTitle>
              <span id="mine">Made by you</span>
            </SectionTitle>
            <MadeGameList scope="mine" />
          </section>
        ) : null}
        <section aria-labelledby="others" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="others">Made by others</span>
          </SectionTitle>
          <label className="relative block max-w-sm">
            <span className="sr-only">Search made games</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="pl-9" />
          </label>
          <MadeGameList scope="public" q={search} />
        </section>
      </div>
    </>
  );
}
