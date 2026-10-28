import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ChaosRoomView, RoomView } from '@ludora/shared';
import { useSfx } from '../../lib/sound/react.tsx';
import { prefersReducedMotion } from '../../lib/prefs.ts';
import { useNow } from '../../lib/useNow.ts';
import './chaos.css';

/*
 * What chaos does to this player's screen. The server decides every effect
 * and sends it in the room view; this layer only draws it: whole-screen
 * looks, weather, things covering the screen, answer tiles that misbehave,
 * and the chips that say who did what. It is part of the public app because
 * anyone can be on the receiving end; the menu that casts cheats is not.
 *
 * Nothing here flashes. Animated looks become still versions for players who
 * asked for reduced motion.
 */

type Overlay = ChaosRoomView['overlays'][number];

/** Turns question text into what a text look wants on screen (jumbled, shouting, typed out, wavy). */
const PromptContext = createContext<(text: string) => ReactNode>((t) => t);

export function useChaosPrompt() {
  return useContext(PromptContext);
}

/** CSS string literal with quotes, backslashes and line breaks escaped. */
const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]/g, ' ')}"`;
const cssId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');

/** A seeded number in [0, 1) from a string, so particles keep their places across renders. */
function seeded(seed: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function jumble(word: string, seed: string) {
  if (word.length < 4) return word;
  const mid = word.slice(1, -1).split('');
  for (let i = mid.length - 1; i > 0; i--) {
    const j = Math.floor(seeded(seed + word, i) * (i + 1));
    [mid[i], mid[j]] = [mid[j]!, mid[i]!];
  }
  return word[0] + mid.join('') + word.at(-1);
}

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const t = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), 70);
    return () => clearInterval(t);
  }, [text]);
  return (
    <>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}

const WEATHER = new Set(['snow', 'bubbles', 'leaves', 'rain', 'confetti', 'fireflies', 'glim-parade', 'balloons', 'paper-planes', 'disco']);
const PARTICLE_COUNT: Record<string, number> = { snow: 40, bubbles: 22, leaves: 18, rain: 50, confetti: 45, fireflies: 16, 'glim-parade': 6, balloons: 12, 'paper-planes': 7, disco: 5 };

function Weather({ look, seed }: { look: string; seed: string }) {
  const n = PARTICLE_COUNT[look] ?? 12;
  return (
    <div className={`chaos-weather chaos-weather-${look}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          style={
            {
              '--x': `${Math.round(seeded(seed, i) * 100)}%`,
              '--y': `${Math.round(seeded(seed, i + 99) * 100)}%`,
              '--d': `${(4 + seeded(seed, i + 7) * 6).toFixed(2)}s`,
              '--delay': `${(-seeded(seed, i + 3) * 8).toFixed(2)}s`,
              '--s': (0.6 + seeded(seed, i + 11) * 0.9).toFixed(2),
              '--h': Math.round(seeded(seed, i + 13) * 360),
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Notes or mud splats the player can tap away on their own screen. */
function Clutter({ look, seed }: { look: 'sticky-notes' | 'mud'; seed: string }) {
  const [gone, setGone] = useState<Set<number>>(new Set());
  useEffect(() => setGone(new Set()), [seed]);
  const n = look === 'mud' ? 6 : 7;
  return (
    <div className="chaos-clutter" aria-hidden={false}>
      {Array.from({ length: n }, (_, i) =>
        gone.has(i) ? null : (
          <button
            key={i}
            type="button"
            className={`chaos-${look}`}
            aria-label={look === 'mud' ? 'Wipe away the mud' : 'Peel off the sticky note'}
            style={{ left: `${5 + seeded(seed, i) * 75}%`, top: `${10 + seeded(seed, i + 50) * 70}%`, rotate: `${Math.round(seeded(seed, i + 9) * 30 - 15)}deg` } as CSSProperties}
            onClick={() => setGone((g) => new Set(g).add(i))}
          >
            {look === 'sticky-notes' ? <span>{['Look over here!', 'Psst', 'Remember the milk', 'Hi!', 'Try harder', '?', 'Boo!'][i % 7]}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}

/** The dark screen with a torch beam that follows the pointer. */
function Flashlight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      ref.current?.style.setProperty('--fx', `${e.clientX}px`);
      ref.current?.style.setProperty('--fy', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', move);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
    };
  }, []);
  return <div ref={ref} className="chaos-flashlight" aria-hidden />;
}

/** Answer tiles that slide away from the pointer (on touch: jump after each tap), or trade places. */
function useTileTricks(root: React.RefObject<HTMLDivElement | null>, dodge: boolean, musical: boolean, reverse: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !dodge) return;
    const move = (e: PointerEvent) => {
      for (const b of el.querySelectorAll<HTMLElement>('[data-choice]')) {
        const r = b.getBoundingClientRect();
        const dx = r.left + r.width / 2 - e.clientX;
        const dy = r.top + r.height / 2 - e.clientY;
        const dist = Math.hypot(dx, dy);
        const push = dist < 140 ? (140 - dist) / 2.2 : 0;
        b.style.translate = push ? `${(dx / (dist || 1)) * push}px ${(dy / (dist || 1)) * push}px` : '';
      }
    };
    el.addEventListener('pointermove', move);
    return () => {
      el.removeEventListener('pointermove', move);
      for (const b of el.querySelectorAll<HTMLElement>('[data-choice]')) b.style.translate = '';
    };
  }, [root, dodge]);
  useEffect(() => {
    const el = root.current;
    if (!el || (!musical && !reverse)) return;
    const arrange = () => {
      const tiles = [...el.querySelectorAll<HTMLElement>('[data-choice]')];
      tiles.forEach((b, i) => (b.style.order = String(musical ? Math.floor(Math.random() * tiles.length * 3) : tiles.length - i)));
    };
    arrange();
    const t = musical ? setInterval(arrange, 3000) : setInterval(arrange, 500);
    return () => {
      clearInterval(t);
      for (const b of el.querySelectorAll<HTMLElement>('[data-choice]')) b.style.order = '';
    };
  }, [root, musical, reverse]);
}

function answerText(reveal: any): string | null {
  if (!reveal || typeof reveal !== 'object') return null;
  if (reveal.type === 'short') return reveal.accepted?.[0] ?? null;
  if (reveal.type === 'numeric') return `${reveal.answer}${reveal.unit ? ` ${reveal.unit}` : ''}`;
  if (reveal.type === 'flashcard') return reveal.back;
  return null;
}

function revealTokens(reveal: any): string[] {
  if (!reveal || typeof reveal !== 'object') return [];
  if (reveal.type === 'mcq') return [reveal.correct];
  if (reveal.type === 'multi') return reveal.correct;
  if (reveal.type === 'truefalse') return [String(reveal.correct)];
  return [];
}

function Chip({ o, gameNow, names }: { o: Overlay; gameNow: () => number; names: Map<string, string> }) {
  const left = typeof o.endsAt === 'number' ? Math.max(0, Math.ceil((o.endsAt - gameNow()) / 1000)) : null;
  const tone = o.tone === 'good' ? 'chaos-chip-good' : o.tone === 'bad' ? 'chaos-chip-bad' : 'chaos-chip-info';
  if (o.kind === 'countdown') {
    const until = typeof o.until === 'number' ? Math.max(0, Math.ceil((o.until - gameNow()) / 1000)) : left;
    return (
      <span className={`chaos-chip chaos-chip-bad`}>
        {String(o.label)} <b className="tabular">{until}s</b>
      </span>
    );
  }
  const by = typeof o.by === 'string' ? names.get(o.by) : null;
  return (
    <span className={`chaos-chip ${tone}`}>
      {String(o.text)}
      {by ? ` (${by})` : ''}
      {left !== null ? <b className="tabular"> {left}s</b> : null}
    </span>
  );
}

export function ChaosLayer({ room, gameNow, children }: { room: RoomView; gameNow: () => number; children: ReactNode }) {
  const chaos = room.chaos ?? null;
  const me = room.me.playerId;
  const ref = useRef<HTMLDivElement>(null);
  useNow(500, Boolean(chaos?.overlays.length || chaos?.effects.length));
  const gameJson = useMemo(() => JSON.stringify(room.game ?? null), [room.game]);
  const onScreen = (iid: unknown) => typeof iid === 'string' && gameJson.includes(`"${iid}"`);
  const overlays = chaos?.overlays ?? [];
  const names = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players]);
  const looks = overlays.filter((o) => o.kind === 'look').map((o) => String(o.look));
  const has = (look: string) => looks.includes(look);
  const reduced = prefersReducedMotion();
  useTileTricks(ref, has('dodge'), has('musical-buttons') && !reduced, has('reverse-choices'));

  // The rules that point at one tile, one row or one name.
  const rules: string[] = [];
  const banners: string[] = [];
  for (const o of overlays) {
    if (o.kind === 'peek' && onScreen(o.iid)) {
      for (const t of revealTokens(o.reveal)) rules.push(`[data-chaos-root] [data-choice="${cssId(t)}"]{outline:5px solid var(--glim);outline-offset:3px;box-shadow:0 0 28px 4px rgb(64 220 160/.55)}`);
      const text = answerText(o.reveal);
      if (text) banners.push(`Peek: ${text}`);
    } else if (o.kind === 'hide-choices' && onScreen(o.iid)) {
      for (const t of (o.tokens as string[]) ?? []) rules.push(`[data-chaos-root] [data-choice="${cssId(t)}"]{visibility:hidden}`);
    } else if (o.kind === 'forbid-choice' && onScreen(o.iid)) {
      rules.push(`[data-chaos-root] [data-choice="${cssId(String(o.token))}"]{opacity:.4;filter:grayscale(1)}[data-chaos-root] [data-choice="${cssId(String(o.token))}"]::after{content:"Forbidden";position:absolute;inset:auto 8px 6px auto;font:800 .8rem/1 var(--font-display,inherit);background:var(--ember,#e5484d);color:#fff;padding:.25rem .5rem;border-radius:999px}`);
    } else if (o.kind === 'tally' && onScreen(o.iid)) {
      for (const [t, n] of Object.entries((o.counts as Record<string, number>) ?? {})) rules.push(`[data-chaos-root] [data-choice="${cssId(t)}"]::after{content:${cssString(`${n} picked`)};position:absolute;top:6px;left:8px;font:800 .8rem/1 inherit;background:rgb(0 0 0/.55);color:#fff;padding:.2rem .45rem;border-radius:999px}`);
    } else if (o.kind === 'spy' && onScreen(o.iid) && o.token) {
      rules.push(`[data-chaos-root] [data-choice="${cssId(String(o.token))}"]::before{content:${cssString(`${String(o.name)} picked this`)};position:absolute;top:-12px;left:8px;font:800 .8rem/1 inherit;background:var(--sky,#3aa0ff);color:#fff;padding:.25rem .5rem;border-radius:999px;z-index:2}`);
    } else if (o.kind === 'hide-player' && o.playerId !== me) {
      rules.push(`[data-chaos-root] [data-row="${cssId(String(o.playerId))}"]{display:none!important}`);
    } else if (o.kind === 'glow-player') {
      rules.push(`[data-chaos-root] [data-row="${cssId(String(o.playerId))}"]{box-shadow:0 0 0 3px #ffd34d,0 0 26px 6px rgb(255 205 70/.6)}`);
    } else if (o.kind === 'swap-names') {
      for (const [id, shown] of Object.entries((o.map as Record<string, string>) ?? {})) {
        rules.push(`[data-chaos-root] [data-player-name="${cssId(id)}"]{font-size:0}[data-chaos-root] [data-player-name="${cssId(id)}"]::after{content:${cssString(names.get(shown) ?? '???')};font-size:var(--lb-name,1.1rem)}`);
      }
    } else if (o.kind === 'hide') {
      if (o.part === 'timer') rules.push('[data-chaos-root] [role="timer"]{visibility:hidden}');
      if (o.part === 'scores') rules.push('[data-chaos-root] [aria-label="Leaderboard"],[data-chaos-root] [data-chaos-part="scores"]{visibility:hidden}');
      if (o.part === 'names') rules.push('[data-chaos-root] [data-player-name]{font-size:0}[data-chaos-root] [data-player-name]::after{content:"???";font-size:var(--lb-name,1.1rem)}');
    } else if (o.kind === 'banner') banners.push(String(o.text));
  }

  // A sound when something lands on this player, once per effect.
  const newest = overlays.map((o) => o.eid).join(',');
  const hurt = overlays.some((o) => o.tone === 'bad' || o.kind === 'look' || o.kind === 'taunt' || o.kind === 'hide');
  useSfx(hurt ? 'stolen' : 'powerUp', newest, Boolean(newest));

  const prompt = useMemo(() => {
    const seed = String(overlays.find((o) => o.kind === 'look')?.eid ?? '');
    if (has('typewriter')) return (t: string) => <Typewriter text={t} />;
    if (has('jumble')) return (t: string) => t.replace(/[A-Za-z]+/g, (w) => jumble(w, seed));
    if (has('caps')) return (t: string) => t.toUpperCase();
    if (has('wavy') && !reduced)
      return (t: string) => (
        <>
          <span aria-hidden className="chaos-wavy">
            {[...t].map((ch, i) => (
              <span key={i} style={{ animationDelay: `${(i % 12) * 0.08}s` }}>
                {ch}
              </span>
            ))}
          </span>
          <span className="sr-only">{t}</span>
        </>
      );
    return (t: string) => t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looks.join(','), reduced]);

  if (!chaos || (!overlays.length && !chaos.effects.length)) return <PromptContext.Provider value={prompt}>{children}</PromptContext.Provider>;

  const onMe = chaos.effects.filter((e) => me && e.targets.includes(me) && e.caster !== me);
  const chips = overlays.filter((o) => o.kind === 'badge' || o.kind === 'countdown');
  const taunt = overlays.find((o) => o.kind === 'taunt');
  const classes = ['chaos-root', ...looks.map((l) => `chaos-look-${cssId(l)}`), reduced ? 'chaos-still' : ''].join(' ');
  const seedOf = (look: string) => String(overlays.find((o) => o.look === look)?.eid ?? look);
  return (
    <PromptContext.Provider value={prompt}>
      <div ref={ref} data-chaos-root className={classes}>
        {rules.length ? <style>{rules.join('\n')}</style> : null}
        <div className="chaos-stage">{children}</div>
        {looks.filter((l) => WEATHER.has(l)).map((l) => (
          <Weather key={l} look={l} seed={seedOf(l)} />
        ))}
        {has('fog') ? <div className="chaos-fog" aria-hidden /> : null}
        {has('cobwebs') ? <div className="chaos-cobwebs" aria-hidden /> : null}
        {has('frost') ? <div className="chaos-frost" aria-hidden /> : null}
        {has('ink') ? <div className="chaos-ink" aria-hidden /> : null}
        {has('blinds') ? <div className="chaos-blinds" aria-hidden /> : null}
        {has('curtain') ? <div className="chaos-curtain" aria-hidden /> : null}
        {has('peephole') ? <div className="chaos-peephole" aria-hidden /> : null}
        {has('flashlight') ? <Flashlight /> : null}
        {has('sticky-notes') ? <Clutter look="sticky-notes" seed={seedOf('sticky-notes')} /> : null}
        {has('mud') ? <Clutter look="mud" seed={seedOf('mud')} /> : null}
        {chips.length || onMe.length || banners.length ? (
          <div className="chaos-hud" role="status" aria-live="polite">
            {banners.map((b) => (
              <span key={b} className="chaos-chip chaos-chip-good chaos-banner">
                {b}
              </span>
            ))}
            {onMe.map((e) => (
              <span key={e.eid} className={`chaos-chip ${e.hostile ? 'chaos-chip-bad' : 'chaos-chip-good'}`}>
                {e.casterName}: {e.name} <b className="tabular">{Math.max(0, Math.ceil((e.endsAt - gameNow()) / 1000))}s</b>
              </span>
            ))}
            {chips.map((o) => (
              <Chip key={String(o.eid)} o={o} gameNow={gameNow} names={names} />
            ))}
          </div>
        ) : null}
        {taunt ? (
          <div className="chaos-taunt" role="alert">
            <span>{String(TAUNT_TEXT[String(taunt.taunt)] ?? '')}</span>
            <small>from {names.get(String(taunt.from)) ?? 'someone'}</small>
          </div>
        ) : null}
      </div>
    </PromptContext.Provider>
  );
}

/** The fixed taunt lines (players never type into each other's screens). Kept in step with the engine's TAUNTS. */
const TAUNT_TEXT: Record<string, string> = {
  'too-easy': 'Too easy!',
  'catch-me': 'Catch me if you can!',
  'nice-try': 'Nice try!',
  'is-that-all': "Is that all you've got?",
  'see-you': 'See you at the finish!',
  gg: 'Good game... for me!',
};
