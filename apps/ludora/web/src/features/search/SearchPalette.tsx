import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Dialog as RDialog } from 'radix-ui';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Bell, BookOpen, Gamepad2, Home, LayoutGrid, Presentation, School, Search, Settings, ShoppingBag, Shirt, Sparkles, Target, Trophy, User, Users, Wand2, X, Hammer } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes, type SetSummary } from '../../lib/queries.ts';
import type { ClassesResponse } from '../classes/classData.ts';
import type { FriendsData } from '../social/data.ts';

/*
 * Search everything: pages, game modes, question sets, classes and friends, in one list.
 * A combobox: type to filter, arrow keys to move, Enter to open. Sets are searched on the
 * server (after a pause in typing); the rest is filtered here from what is already loaded.
 */

interface Result {
  id: string;
  group: 'Pages' | 'Game modes' | 'Made games' | 'Question sets' | 'Classes' | 'Friends';
  title: string;
  detail?: string;
  to: string;
  icon: ReactNode;
}

const PAGES: { title: string; to: string; icon: ReactNode; words: string; account?: boolean }[] = [
  { title: 'Home', to: '/', icon: <Home className="size-4" />, words: 'start dashboard' },
  { title: 'Join a game', to: '/play', icon: <Gamepad2 className="size-4" />, words: 'code play enter' },
  { title: 'Host a game', to: '/host', icon: <Presentation className="size-4" />, words: 'start teacher' },
  { title: 'Play solo', to: '/host?solo=1', icon: <Gamepad2 className="size-4" />, words: 'alone practice single' },
  { title: 'Game modes', to: '/modes', icon: <LayoutGrid className="size-4" />, words: 'catalogue games' },
  { title: 'Game Maker', to: '/game-maker', icon: <Wand2 className="size-4" />, words: 'make game mode code design build rules 3d 2d custom mode studio' },
  { title: 'Saved games', to: '/game-maker?tab=saved', icon: <Wand2 className="size-4" />, words: 'saved game settings set host again' },
  { title: 'Question sets', to: '/library', icon: <BookOpen className="size-4" />, words: 'library quiz questions' },
  { title: 'My mistakes', to: '/mistakes', icon: <Target className="size-4" />, words: 'wrong practise fix revise', account: true },
  { title: 'My stats', to: '/me', icon: <BarChart3 className="size-4" />, words: 'calendar bests accuracy history', account: true },
  { title: 'Collection', to: '/collection', icon: <Sparkles className="size-4" />, words: 'glims cards', account: true },
  { title: 'Shop', to: '/shop', icon: <ShoppingBag className="size-4" />, words: 'buy lanterns wishlist', account: true },
  { title: 'Locker', to: '/locker', icon: <Shirt className="size-4" />, words: 'buddy outfits dress hats', account: true },
  { title: 'Quests and achievements', to: '/quests', icon: <Target className="size-4" />, words: 'quests levels titles', account: true },
  { title: 'Friends', to: '/friends', icon: <Users className="size-4" />, words: 'friend code invite', account: true },
  { title: 'Notifications', to: '/notifications', icon: <Bell className="size-4" />, words: 'inbox invites requests', account: true },
  { title: 'Classes', to: '/classes', icon: <School className="size-4" />, words: 'homework assignments', account: true },
  { title: 'Leaderboards', to: '/leaderboards', icon: <Trophy className="size-4" />, words: 'ranking top', account: true },
  { title: 'Settings', to: '/settings', icon: <Settings className="size-4" />, words: 'theme sound privacy account' },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const matches = (q: string, ...fields: (string | undefined)[]) => {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hay = norm(fields.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
};

export default function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const me = useMe();
  const user = me.data?.user;
  const account = Boolean(user && !user.isGuest);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(q.trim());
  const [setQuery, setSetQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSetQuery(deferred), 250);
    return () => clearTimeout(id);
  }, [deferred]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const modes = useModes();
  const sets = useQuery({ queryKey: ['search', 'sets', setQuery], queryFn: ({ signal }) => api.get<{ sets: SetSummary[] }>(`/api/sets?${new URLSearchParams({ q: setQuery })}`, signal), enabled: open && setQuery.length >= 2, placeholderData: (p) => p });
  const made = useQuery({ queryKey: ['search', 'made', setQuery], queryFn: ({ signal }) => api.get<{ games: { id: string; name: string; kindLabel: string | null; owner: { name: string } }[] }>(`/api/blueprints?${new URLSearchParams({ scope: 'public', q: setQuery })}`, signal), enabled: open && setQuery.length >= 2, placeholderData: (p) => p });
  const classes = useQuery({ queryKey: ['classes', 'list'], queryFn: () => api.get<ClassesResponse>('/api/classes'), enabled: open && account, staleTime: 60_000 });
  const friendsOn = me.data?.flags?.['social.friends'] !== false;
  const friends = useQuery({ queryKey: ['friends'], queryFn: () => api.get<FriendsData>('/api/friends'), enabled: open && account && friendsOn, staleTime: 60_000 });

  const results = useMemo<Result[]>(() => {
    const out: Result[] = [];
    const query = deferred;
    const pages = PAGES.filter((p) => (!p.account || account) && (!query || matches(query, p.title, p.words)));
    out.push(...pages.slice(0, query ? 6 : 8).map((p) => ({ id: `page:${p.to}`, group: 'Pages' as const, title: p.title, to: p.to, icon: p.icon })));
    if (!query) return out;
    for (const m of modes.data?.modes ?? []) {
      if (m.hidden || m.meta.status === 'planned') continue;
      if (matches(query, m.meta.title, m.meta.tagline, m.meta.category, ...m.variants.map((v) => v.meta.title))) out.push({ id: `mode:${m.meta.id}`, group: 'Game modes', title: m.meta.title, detail: m.meta.tagline, to: `/modes/${m.meta.id}`, icon: <LayoutGrid className="size-4" /> });
    }
    if (query.length >= 2 && setQuery === query) {
      for (const g of (made.data?.games ?? []).slice(0, 4)) out.push({ id: `made:${g.id}`, group: 'Made games', title: g.name, detail: `${g.kindLabel ?? 'Made game'}, by ${g.owner.name}`, to: `/game-maker/${g.id}`, icon: <Hammer className="size-4" /> });
      for (const s of (sets.data?.sets ?? []).slice(0, 6)) out.push({ id: `set:${s.id}`, group: 'Question sets', title: s.title, detail: `${s.questionCount} questions${s.ownerName ? `, by ${s.ownerName}` : ''}`, to: `/sets/${s.id}`, icon: <BookOpen className="size-4" /> });
    }
    const c = classes.data;
    for (const cl of [...(c?.teaching ?? []), ...(c?.member ?? [])]) {
      if (matches(query, cl.name)) out.push({ id: `class:${cl.id}`, group: 'Classes', title: cl.name, to: `/classes/${cl.id}`, icon: <School className="size-4" /> });
    }
    for (const f of friends.data?.friends ?? []) {
      if (matches(query, f.displayName)) out.push({ id: `friend:${f.id}`, group: 'Friends', title: f.displayName, detail: `Level ${f.level}`, to: `/profile/${f.id}`, icon: <User className="size-4" /> });
    }
    return out;
  }, [deferred, setQuery, modes.data, made.data, sets.data, classes.data, friends.data, account]);

  useEffect(() => setActive(0), [deferred]);
  const go = (r: Result | undefined) => {
    if (!r) return;
    onOpenChange(false);
    navigate(r.to);
  };
  const searchingSets = deferred.length >= 2 && (setQuery !== deferred || sets.isFetching);
  let lastGroup = '';
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <RDialog.Content className="fixed top-[8dvh] left-1/2 z-50 flex max-h-[80dvh] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised shadow-[0_24px_60px_-12px_rgb(2_5_20/0.6)] focus:outline-none">
          <RDialog.Title className="sr-only">Search Ludora</RDialog.Title>
          <RDialog.Description className="sr-only">Pages, game modes, question sets, classes and friends. Use the arrow keys to move through the results and Enter to open one.</RDialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-5 shrink-0 text-text-3" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(results.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              role="combobox"
              aria-expanded="true"
              aria-controls="search-results"
              aria-activedescendant={results[active] ? `sr-${results[active]!.id}` : undefined}
              aria-autocomplete="list"
              aria-label="Search pages, modes, sets, classes and friends"
              placeholder="Search pages, modes, sets, classes, friends"
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-3"
            />
            <RDialog.Close className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] text-text-3 hover:bg-surface-2 hover:text-text" aria-label="Close search">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <ul id="search-results" role="listbox" aria-label="Results" className="overflow-y-auto p-2">
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <li key={r.id} role="presentation">
                  {header ? (
                    <div className="px-2 pt-2 pb-1 text-xs font-semibold text-text-3" aria-hidden>
                      {header}
                    </div>
                  ) : null}
                  <div
                    id={`sr-${r.id}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-m)] px-2.5 py-1.5 ${i === active ? 'bg-surface-3 text-text' : 'text-text-2'}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-s)] bg-surface-2 text-text-2" aria-hidden>
                      {r.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text">{r.title}</span>
                      {r.detail ? <span className="block truncate text-sm text-text-2">{r.detail}</span> : null}
                    </span>
                    <span className="sr-only">, {r.group}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-text-3" role="status">
            {searchingSets ? 'Searching question sets…' : deferred && results.length === 0 ? `Nothing matches “${deferred}”. Try fewer words.` : deferred ? `${results.length} results` : 'Type to search everything.'}
          </p>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
