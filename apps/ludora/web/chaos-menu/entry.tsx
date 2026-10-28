import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChaosRoomView, RoomView } from '@ludora/shared';
import css from './menu.css?inline';

/*
 * The secret chaos menu. Built on its own (vite.chaos.config.ts) into a
 * private folder the server never serves as a static file: it is only sent,
 * from /api/lantern/book.js, to accounts that have lit the lantern. It holds
 * no cheats either: the catalogue comes from /api/lantern/book at runtime.
 * Every cast is decided by the game server; this is only the controls.
 */

type Category = { id: string; label: string };
interface Param {
  key: string;
  label: string;
  kind: 'int' | 'choice' | 'player';
  min?: number;
  max?: number;
  default?: number | string;
  unit?: string;
  options?: { value: string; label: string }[];
  filter?: 'other' | 'any';
}
interface Cheat {
  id: string;
  name: string;
  category: string;
  description: string;
  target: string;
  params: Param[];
  cost: number;
  cooldownMs: number;
  durationMs: number | null;
  tags: string[];
  hostile: boolean;
  undoable: boolean;
  modes: string[] | null;
  needs: string[];
}
interface Combo {
  id: string;
  name: string;
  cheats: string[];
  description: string;
}
interface Book {
  categories: Category[];
  cheats: Cheat[];
  combos: Combo[];
}
type Ack = { ok: true; text?: string; combo?: string | null; castId?: string } | { ok: false; error: { code: string; message: string } };
interface Host {
  view(): RoomView;
  subscribe(fn: (v: RoomView) => void): () => void;
  send(req: Record<string, unknown>): Promise<Ack>;
  gameNow(): number;
  play(sfx: 'powerUp' | 'steal' | 'shield' | 'bust' | 'select' | 'tap'): void;
  reducedMotion(): boolean;
  close(): void;
}

const NEED_TEXT: Record<string, string> = {
  'meter:score': 'no score to change in this game',
  'meter:currency': 'no coins or match currency here',
  'meter:teamScore': 'no team score here',
  sync: 'no shared rounds here',
  stream: 'players do not have their own questions here',
  question: 'no question on screen to work with',
  teams: 'teams are off',
  revive: 'nobody can be knocked out here',
  knockouts: 'nobody can be knocked out with these settings',
  losses: 'nothing here takes score away',
};

function availability(c: Cheat, modeId: string, caps: readonly string[]): string | null {
  if (c.modes && !c.modes.includes(modeId)) return 'made for another game mode';
  for (const n of c.needs) if (!caps.includes(n)) return NEED_TEXT[n] ?? `needs ${n.replace(/^meter:/, '')}`;
  return null;
}

const TARGET_TEXT: Record<string, string> = {
  self: 'You',
  opponent: 'One opponent',
  player: 'Any player',
  teammate: 'A teammate',
  'everyone-else': 'Everyone else',
  everyone: 'Everyone',
  'enemy-team': 'Another team',
  'my-team': 'Your team',
  room: 'The game',
};

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`ludora.lantern.${key}`);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, v: unknown) {
    try {
      localStorage.setItem(`ludora.lantern.${key}`, JSON.stringify(v));
    } catch {
      /* private window: favourites just do not stick */
    }
  },
};

const secs = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

function useRoomView(host: Host) {
  const ref = useRef(host.view());
  const subscribe = useCallback(
    (cb: () => void) =>
      host.subscribe((v) => {
        ref.current = v;
        cb();
      }),
    [host],
  );
  return useSyncExternalStore(subscribe, () => ref.current);
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

interface Pick {
  cheat: Cheat;
  target: string | null;
  params: Record<string, number | string>;
}

function defaultsFor(c: Cheat): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of c.params) if (p.default !== undefined) out[p.key] = p.default;
  return out;
}

function TargetPicker({ cheat, view, value, onChange }: { cheat: Cheat; view: RoomView; value: string | null; onChange: (v: string) => void }) {
  const me = view.players.find((p) => p.id === view.me.playerId);
  let options: { id: string; label: string }[] = [];
  if (cheat.target === 'opponent') options = view.players.filter((p) => p.id !== me?.id && (!me?.teamId || p.teamId !== me.teamId)).map((p) => ({ id: p.id, label: p.name }));
  else if (cheat.target === 'player') options = view.players.map((p) => ({ id: p.id, label: p.id === me?.id ? `${p.name} (you)` : p.name }));
  else if (cheat.target === 'teammate') options = view.players.filter((p) => p.id !== me?.id && me?.teamId && p.teamId === me.teamId).map((p) => ({ id: p.id, label: p.name }));
  else if (cheat.target === 'enemy-team') options = view.room.teams.filter((t) => t.id !== me?.teamId).map((t) => ({ id: t.id, label: t.name }));
  else return <p className="lm-muted">Target: {TARGET_TEXT[cheat.target] ?? cheat.target}</p>;
  if (!options.length) return <p className="lm-muted">Nobody to aim this at right now.</p>;
  return (
    <label className="lm-field">
      <span>Target</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ParamInputs({ cheat, view, values, onChange }: { cheat: Cheat; view: RoomView; values: Record<string, number | string>; onChange: (k: string, v: number | string) => void }) {
  return (
    <>
      {cheat.params.map((p) =>
        p.kind === 'int' ? (
          <label key={p.key} className="lm-field">
            <span>
              {p.label}: <b>{values[p.key] ?? p.default}</b>
              {p.unit ? ` ${p.unit}` : ''}
            </span>
            <input type="range" min={p.min} max={p.max} value={Number(values[p.key] ?? p.default)} onChange={(e) => onChange(p.key, Number(e.target.value))} />
          </label>
        ) : p.kind === 'choice' ? (
          <label key={p.key} className="lm-field">
            <span>{p.label}</span>
            <select value={String(values[p.key] ?? p.default)} onChange={(e) => onChange(p.key, e.target.value)}>
              {(p.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={p.key} className="lm-field">
            <span>{p.label}</span>
            <select value={String(values[p.key] ?? '')} onChange={(e) => onChange(p.key, e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {view.players
                .filter((x) => p.filter !== 'other' || x.id !== view.me.playerId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
        ),
      )}
    </>
  );
}

const needsTarget = (c: Cheat) => ['opponent', 'player', 'teammate', 'enemy-team'].includes(c.target);
const ready = (p: Pick) => (!needsTarget(p.cheat) || Boolean(p.target)) && p.cheat.params.every((q) => q.kind !== 'player' || p.params[q.key]);

function Menu({ host }: { host: Host }) {
  const view = useRoomView(host);
  useTick(500);
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'cheats' | 'active' | 'combos'>('cheats');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [usableOnly, setUsableOnly] = useState<boolean>(() => store.get('usableOnly', true));
  const [favs, setFavs] = useState<string[]>(() => store.get('favs', []));
  const [recent, setRecent] = useState<string[]>(() => store.get('recent', []));
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [news, setNews] = useState<{ ok: boolean; text: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/lantern/book', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('locked'))))
      .then(setBook)
      .catch(() => setError('The lantern has gone dark.'));
  }, []);
  useEffect(() => {
    panel.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && host.close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [host]);
  useEffect(() => store.set('favs', favs), [favs]);
  useEffect(() => store.set('recent', recent), [recent]);
  useEffect(() => store.set('usableOnly', usableOnly), [usableOnly]);

  const chaos: ChaosRoomView | null = view.chaos ?? null;
  const me = chaos?.me ?? null;
  const now = host.gameNow();
  const caps = me?.capabilities ?? [];
  const modeId = view.room.modeId;
  const byId = useMemo(() => new Map((book?.cheats ?? []).map((c) => [c.id, c])), [book]);

  const list = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    return book.cheats
      .filter((c) => (cat === 'all' ? true : cat === 'favs' ? favs.includes(c.id) : cat === 'recent' ? recent.includes(c.id) : c.category === cat))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .filter((c) => !usableOnly || !availability(c, modeId, caps))
      .sort((a, b) => (cat === 'recent' ? recent.indexOf(a.id) - recent.indexOf(b.id) : Number(Boolean(a.modes)) === Number(Boolean(b.modes)) ? a.name.localeCompare(b.name) : a.modes ? -1 : 1));
  }, [book, query, cat, favs, recent, usableOnly, modeId, caps]);

  const combo = book && picks.length > 1 ? book.combos.find((c) => c.cheats.every((id) => picks.some((p) => p.cheat.id === id))) : null;
  const totalCost = picks.reduce((n, p) => n + p.cheat.cost, 0);

  const toggle = (c: Cheat) => {
    host.play('tap');
    setPicks((ps) => (ps.some((p) => p.cheat.id === c.id) ? ps.filter((p) => p.cheat.id !== c.id) : ps.length >= 5 ? ps : [...ps, { cheat: c, target: null, params: defaultsFor(c) }]));
  };

  const cast = async () => {
    if (!picks.length || busy) return;
    setBusy(true);
    const ack = await host.send({ op: 'cast', casts: picks.map((p) => ({ cheatId: p.cheat.id, target: p.target, params: p.params })) });
    setBusy(false);
    if (ack.ok) {
      host.play(picks.some((p) => p.cheat.hostile) ? 'steal' : 'powerUp');
      setNews({ ok: true, text: ack.text ?? 'Done.' });
      setRecent((r) => [...picks.map((p) => p.cheat.id), ...r.filter((id) => !picks.some((p) => p.cheat.id === id))].slice(0, 20));
      setPicks([]);
    } else {
      host.play('bust');
      setNews({ ok: false, text: ack.error.message });
    }
  };

  const command = async (req: Record<string, unknown>, ok: string) => {
    const ack = await host.send(req);
    setNews(ack.ok ? { ok: true, text: ok } : { ok: false, text: ack.error.message });
  };

  const forget = async () => {
    if (!window.confirm('Put the lantern out? You will have to find it again to light it.')) return;
    await fetch('/api/lantern/forget', { method: 'POST', credentials: 'same-origin', headers: { 'x-ludora-csrf': '1', 'content-type': 'application/json' }, body: '{}' });
    host.close();
  };

  const mine = (chaos?.effects ?? []).filter((e) => e.caster === view.me.playerId);
  const onMe = (chaos?.effects ?? []).filter((e) => view.me.playerId && e.targets.includes(view.me.playerId) && e.caster !== view.me.playerId);

  return (
    <div className={`lm-scrim ${host.reducedMotion() ? 'lm-still' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && host.close()}>
      <div ref={panel} className="lm-panel" role="dialog" aria-modal="true" aria-label="The lantern" tabIndex={-1}>
        <header className="lm-head">
          <div className="lm-title">
            <span className="lm-flame" aria-hidden />
            <h2>The lantern</h2>
          </div>
          <div className="lm-energy" role="meter" aria-label="Chaos energy" aria-valuemin={0} aria-valuemax={me?.maxEnergy ?? 100} aria-valuenow={me?.energy ?? 0}>
            <span style={{ width: `${((me?.energy ?? 0) / (me?.maxEnergy ?? 100)) * 100}%` }} />
            <b>{me?.energy ?? 0}</b>
          </div>
          <button type="button" className="lm-x" aria-label="Close the lantern" onClick={host.close}>
            ×
          </button>
        </header>
        {chaos?.calmed ? <p className="lm-banner">The host calmed the room. No more chaos this game.</p> : null}
        <nav className="lm-tabs" role="tablist">
          {(['cheats', 'active', 'combos'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'cheats' ? 'Cheats' : t === 'active' ? `Active (${mine.length + onMe.length})` : 'Combos'}
            </button>
          ))}
        </nav>
        {news ? (
          <p className={`lm-news ${news.ok ? 'good' : 'bad'}`} role="status" aria-live="polite">
            {news.text}
          </p>
        ) : null}
        {error ? <p className="lm-banner">{error}</p> : null}
        {!book && !error ? <p className="lm-muted lm-pad">Opening the book…</p> : null}

        {book && tab === 'cheats' ? (
          <>
            <div className="lm-filters">
              <input type="search" placeholder={`Search ${book.cheats.length} cheats`} aria-label="Search cheats" value={query} onChange={(e) => setQuery(e.target.value)} />
              <label className="lm-check">
                <input type="checkbox" checked={usableOnly} onChange={(e) => setUsableOnly(e.target.checked)} /> Only ones that work here
              </label>
              <div className="lm-chips" role="group" aria-label="Category">
                {[{ id: 'all', label: 'All' }, { id: 'favs', label: '★ Favourites' }, { id: 'recent', label: 'Recent' }, ...book.categories].map((c) => (
                  <button key={c.id} type="button" aria-pressed={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="lm-list" aria-label="Cheats">
              {list.length === 0 ? <li className="lm-muted lm-pad">Nothing matches. Try another search or category.</li> : null}
              {list.map((c) => {
                const why = availability(c, modeId, caps);
                const until = me?.cooldowns[c.id] ?? 0;
                const cooling = until > now;
                const selected = picks.some((p) => p.cheat.id === c.id);
                const afford = (me?.energy ?? 0) >= c.cost;
                return (
                  <li key={c.id} className={`lm-card ${selected ? 'sel' : ''} ${why ? 'off' : ''} cat-${c.category}`}>
                    <button type="button" className="lm-card-main" disabled={Boolean(why)} aria-pressed={selected} onClick={() => toggle(c)}>
                      <span className="lm-name">
                        {c.name}
                        {c.modes ? <em> {view.room.title}</em> : null}
                      </span>
                      <span className="lm-desc">{c.description}</span>
                      <span className="lm-meta">
                        <span className={afford ? '' : 'short'}>⚡ {c.cost}</span>
                        <span>{TARGET_TEXT[c.target]}</span>
                        {c.durationMs ? <span>⏱ {secs(c.durationMs)}</span> : <span>Instant{c.undoable ? ' · undo 20s' : ''}</span>}
                        {cooling ? <span className="short">Ready in {secs(until - now)}</span> : null}
                        {why ? <span className="short">Not here: {why}</span> : null}
                      </span>
                    </button>
                    <button type="button" className={`lm-star ${favs.includes(c.id) ? 'on' : ''}`} aria-label={favs.includes(c.id) ? `Remove ${c.name} from favourites` : `Add ${c.name} to favourites`} aria-pressed={favs.includes(c.id)} onClick={() => setFavs((f) => (f.includes(c.id) ? f.filter((x) => x !== c.id) : [...f, c.id]))}>
                      ★
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {book && tab === 'combos' ? (
          <ul className="lm-list">
            {book.combos.map((c) => (
              <li key={c.id} className="lm-card">
                <div className="lm-card-main">
                  <span className="lm-name">{c.name}</span>
                  <span className="lm-desc">{c.description}</span>
                  <span className="lm-meta">{c.cheats.map((id) => byId.get(id)?.name ?? id).join(' + ')}</span>
                </div>
                <button
                  type="button"
                  className="lm-small"
                  onClick={() => {
                    setPicks(c.cheats.map((id) => byId.get(id)).filter((x): x is Cheat => Boolean(x)).map((ch) => ({ cheat: ch, target: null, params: defaultsFor(ch) })));
                    setTab('cheats');
                  }}
                >
                  Set up
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'active' ? (
          <div className="lm-pad lm-active">
            <h3>Yours</h3>
            {mine.length === 0 ? <p className="lm-muted">Nothing of yours is running.</p> : null}
            {mine.map((e) => (
              <div key={e.eid} className="lm-row">
                <span>
                  {e.name} <span className="lm-muted">on {e.targets.map((t) => view.players.find((p) => p.id === t)?.name ?? 'the game').join(', ') || 'the game'}</span>
                </span>
                <b>{secs(e.endsAt - now)}</b>
                <button type="button" className="lm-small" onClick={() => void command({ op: 'stop', eid: e.eid }, `${e.name} stopped.`)}>
                  Stop
                </button>
              </div>
            ))}
            {(me?.undo ?? []).length ? <h3>Undo</h3> : null}
            {(me?.undo ?? []).map((u) => (
              <div key={u.castId} className="lm-row">
                <span>{u.names.join(' + ')}</span>
                <b>{secs(u.until - now)}</b>
                <button type="button" className="lm-small" onClick={() => void command({ op: 'undo', castId: u.castId }, 'Undone.')}>
                  Undo
                </button>
              </div>
            ))}
            <h3>On you</h3>
            {onMe.length === 0 ? <p className="lm-muted">Nobody has cast anything on you.</p> : null}
            {onMe.map((e) => (
              <div key={e.eid} className="lm-row">
                <span>
                  {e.name} <span className="lm-muted">from {e.casterName}</span>
                </span>
                <b>{secs(e.endsAt - now)}</b>
              </div>
            ))}
            <button type="button" className="lm-link" onClick={() => void forget()}>
              Put the lantern out
            </button>
          </div>
        ) : null}

        {picks.length ? (
          <footer className="lm-tray" aria-label="Ready to cast">
            {picks.map((p, i) => (
              <div key={p.cheat.id} className="lm-pick">
                <div className="lm-pick-head">
                  <b>{p.cheat.name}</b>
                  <button type="button" aria-label={`Remove ${p.cheat.name}`} onClick={() => toggle(p.cheat)}>
                    ×
                  </button>
                </div>
                <TargetPicker cheat={p.cheat} view={view} value={p.target} onChange={(v) => setPicks((ps) => ps.map((x, k) => (k === i ? { ...x, target: v } : x)))} />
                <ParamInputs cheat={p.cheat} view={view} values={p.params} onChange={(key, v) => setPicks((ps) => ps.map((x, k) => (k === i ? { ...x, params: { ...x.params, [key]: v } } : x)))} />
              </div>
            ))}
            <div className="lm-cast-row">
              {combo ? <span className="lm-combo">Combo: {combo.name}</span> : picks.length > 1 ? <span className="lm-muted">Cast together</span> : null}
              <button type="button" className="lm-cast" disabled={busy || !picks.every(ready) || (me?.energy ?? 0) < totalCost || Boolean(chaos?.calmed)} onClick={() => void cast()}>
                {busy ? 'Casting…' : `Cast${picks.length > 1 ? ` ${picks.length}` : ''} · ⚡${totalCost}`}
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function mount(el: HTMLElement, host: Host): () => void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const root = createRoot(el);
  root.render(
    <StrictMode>
      <Menu host={host} />
    </StrictMode>,
  );
  return () => {
    root.unmount();
    style.remove();
  };
}
