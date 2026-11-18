import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Box, Flame, LayoutGrid, Presentation, ShoppingBag, Sparkles, Swords, Target } from 'lucide-react';
import { RARITIES, type GlimArt, type Rarity } from '@ludora/shared';
import { useMe } from '../../lib/session.ts';
import { useModes, useOverview } from '../../lib/queries.ts';
import { currentAccess, dataSaverOn, prefersReducedMotion, subscribeAccess } from '../../lib/prefs.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { softwareRenderer, storedChoice, webglSupported } from '../../three/quality.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { FrameRing } from '../../art/cosmetics.tsx';
import { CodeEntry } from '../play/CodeEntry.tsx';
import { SeasonDecor, SeasonLine } from '../season/SeasonBanner.tsx';
import { BLEED_ROUNDING, Bleed, Meter } from './kit.tsx';
import { decideMenuView, storeMenuChoice, storedMenuChoice, type FlatReason } from './place/capability.ts';
import type { Anchors, StationId } from './place/scene.ts';
import './place/place.css';

/*
 * The home menu as a place: the yard. Your buddy stands in the middle and the places you can go
 * are things standing round it, each with its link.
 *
 * The links, the join box and the greeting are ordinary HTML, on the page from the first paint and
 * in one sensible Tab order. That is the menu. The 3D yard (place/YardStage.tsx, and three.js with
 * it) is fetched after that, only on devices that will run it well, and is drawn behind the same
 * links, which then sit over the things they lead to. Without it the menu is flat and complete:
 * the same links round the buddy's drawing on a wide screen, and a grid of them on a phone.
 */

/** Nothing from three.js is loaded until this is asked for. */
const YardStage = lazy(() => import('./place/YardStage.tsx'));

/** Shown until the overview loads, or if a player somehow has no buddy. */
const PLACEHOLDER_BUDDY: GlimArt = { kind: 'glim', body: 'blob', hue: 30, accentHue: 45, saturation: 25, eyes: 'dot', mouth: 'smile', pattern: 'freckles', topper: 'none', cheeks: true };

interface Spot {
  id: StationId;
  to: string;
  title: string;
  icon: ReactNode;
  /** Where its link sits on the flat wide layout, in percent of the box: the same spot the 3D picture gives it at rest. */
  at: [number, number];
}

/** In Tab order: round the yard from the front left to the front right. */
const SPOTS: Spot[] = [
  { id: 'host', to: '/host', title: 'Host a game', icon: <Presentation className="size-5" />, at: [13, 56] },
  { id: 'solo', to: '/host?solo=1', title: 'Play solo', icon: <Swords className="size-5" />, at: [23, 42] },
  { id: 'modes', to: '/modes', title: 'Game modes', icon: <LayoutGrid className="size-5" />, at: [38, 31] },
  { id: 'quests', to: '/quests', title: 'Quests', icon: <Target className="size-5" />, at: [62, 31] },
  { id: 'lanterns', to: '/shop?tab=lanterns', title: 'Lantern shop', icon: <ShoppingBag className="size-5" />, at: [77, 42] },
  { id: 'glims', to: '/collection', title: 'My Glims', icon: <Sparkles className="size-5" />, at: [87, 56] },
];

/** The box is laid out as a place (links over the picture) from this width; narrower, as a stack. */
const PLACE_FROM = 1000;

const FLAT_NOTE: Partial<Record<FlatReason, string>> = {
  slow: 'The 3D menu ran slowly on this device, so this is the flat one.',
  software: 'This device has no graphics chip for 3D, so this is the flat menu.',
  'data-saver': 'Data saver is on, so the 3D menu is not downloaded.',
};

const subscribeMotion = (l: () => void) => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', l);
  const un = subscribeAccess(l);
  return () => {
    mq.removeEventListener('change', l);
    un();
  };
};
/** Reduced motion (the device's or Settings'), or Calm: the yard is a still picture. */
const holdStill = () => prefersReducedMotion() || currentAccess().calm;

export function Place() {
  const me = useMe();
  const overview = useOverview();
  const modes = useModes();
  const user = me.data!.user!;
  const o = overview.data;
  const lv = user.level;
  const streak = o?.stats.dailyStreak ?? 0;
  const avatar = o?.avatar;
  const buddy = o?.equipped.buddy;
  const frameArt = o?.equipped.frame?.art;
  const rarity: Rarity | undefined = avatar?.rarity ?? RARITIES.find((r) => r === buddy?.rarity);

  const box = useRef<HTMLElement>(null);
  const signs = useRef<Partial<Record<StationId, HTMLElement | null>>>({});
  const tag = useRef<HTMLAnchorElement>(null);
  const [wide, setWide] = useState(true);
  const [active, setActive] = useState<StationId | null>(null);
  const still = useSyncExternalStore(subscribeMotion, holdStill, () => false);

  // 3D or flat: decided before anything 3D is fetched, and again if the player presses the switch.
  const [choice, setChoice] = useState(storedMenuChoice);
  const [lost, setLost] = useState<FlatReason | null>(null);
  const decision = useMemo(() => decideMenuView({ choice, graphics: storedChoice(), webgl: webglSupported(), software: softwareRenderer(), dataSaver: dataSaverOn() }), [choice]);
  const want3d = decision.view === '3d' && !lost;
  /** The 3D code is asked for once the flat menu has painted and the browser has a quiet moment. */
  const [fetch3d, setFetch3d] = useState(false);
  /** The yard is built and its first picture is up: it takes over from the flat drawing. */
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!want3d) {
      setLive(false);
      return;
    }
    const idle = window.requestIdleCallback ? window.requestIdleCallback(() => setFetch3d(true), { timeout: 1200 }) : window.setTimeout(() => setFetch3d(true), 300);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : window.clearTimeout(idle));
  }, [want3d]);

  // Place or stack, from the box's own width (the sidebar takes 248px of a laptop's).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWide(el.clientWidth >= PLACE_FROM);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The links follow the picture: each sits just above the thing it leads to. Written straight to
  // the elements, since it changes with every lean of the view.
  const anchored = live && wide;
  const anchoredRef = useRef(anchored);
  anchoredRef.current = anchored;
  const place = useCallback((a: Anchors) => {
    if (!anchoredRef.current) return;
    const w = box.current?.clientWidth ?? 0;
    for (const s of SPOTS) {
      const el = signs.current[s.id];
      if (!el) continue;
      const half = el.offsetWidth / 2 + 8;
      const x = Math.max(half, Math.min(w - half, a[s.id].x));
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${a[s.id].y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    if (tag.current) tag.current.style.transform = `translate3d(${a.buddy.x.toFixed(1)}px, ${a.buddy.y.toFixed(1)}px, 0) translate(-50%, 0)`;
  }, []);
  const lastAnchors = useRef<Anchors | null>(null);
  const onAnchors = useCallback(
    (a: Anchors) => {
      lastAnchors.current = a;
      place(a);
    },
    [place],
  );
  useLayoutEffect(() => {
    if (anchored && lastAnchors.current) place(lastAnchors.current);
    if (!anchored) {
      for (const s of SPOTS) signs.current[s.id]?.style.removeProperty('transform');
      tag.current?.style.removeProperty('transform');
    }
  }, [anchored, place]);

  const onUnavailable = useCallback((reason: 'off' | 'unsupported' | 'lost' | 'slow') => {
    setLive(false);
    if (reason === 'slow') {
      storeMenuChoice('slow');
      setLost('slow');
    } else setLost(reason === 'off' ? 'graphics-off' : 'no-webgl');
  }, []);

  const toggle = () => {
    const next = want3d ? 'off' : 'on';
    storeMenuChoice(next);
    setLost(null);
    setLive(false);
    setChoice(next);
  };

  const ready = (o?.quests.list ?? []).filter((q) => q.completed && !q.claimed).length;
  const daily = (o?.quests.list ?? []).filter((q) => q.kind === 'daily');
  const playable = (modes.data?.modes ?? []).filter((m) => m.meta.status === 'playable').length;
  const notes: Record<StationId, string> = {
    host: 'Put a code on the board',
    solo: 'Practise on your own',
    modes: playable ? `${playable} ways to play` : 'Every way to play',
    quests: ready ? `${plural(ready, 'reward')} to claim` : daily.length ? `${daily.filter((q) => q.completed).length} of ${daily.length} done today` : 'Something new every day',
    lanterns: o ? `${formatNumber(o.balances.sparks ?? 0)} Sparks to spend` : 'Find new Glims',
    glims: 'See your collection',
  };

  const look = useMemo(() => ({ art: avatar?.art ?? PLACEHOLDER_BUDDY, accessories: avatar?.accessories, rarity, dress: avatar?.uniform ?? null }), [avatar, rarity]);
  const glim = <Glim art={avatar?.art ?? PLACEHOLDER_BUDDY} accessories={avatar?.accessories} dress={avatar?.uniform ?? null} size={190} rarity={rarity} silhouette={!avatar} className="h-auto w-full" />;
  const note = lost === 'slow' || (!want3d && decision.reason) ? FLAT_NOTE[lost ?? decision.reason!] : null;
  const canSwitch = decision.canSwitch && lost !== 'no-webgl' && lost !== 'graphics-off';

  return (
    <Bleed>
      <section ref={box} className={`place stage on-stage ${BLEED_ROUNDING}`} data-layout={wide ? 'place' : 'stack'} data-live={live ? 'true' : 'false'} data-flat={want3d ? undefined : 'true'} data-still={still ? 'true' : 'false'} aria-labelledby="place-title">
        {/* The picture. Decoration: everything it shows is also a link or words below. */}
        <div className="place-scene">
          <div className="place-flat" aria-hidden>
            <span className="place-flat-ground" />
            <span className="place-flat-buddy">
              {frameArt?.kind === 'frame' ? (
                <FrameRing style={frameArt.style} hue={frameArt.hue} accentHue={frameArt.accentHue} size={168}>
                  <span className="grid size-full place-items-center bg-white/10">{glim}</span>
                </FrameRing>
              ) : (
                glim
              )}
            </span>
          </div>
          {want3d && fetch3d && (o || overview.isError) ? (
            <Suspense fallback={null}>
              <YardStage
                key={JSON.stringify(look.art)}
                look={look}
                still={still}
                active={active}
                compact={!wide}
                frame={box}
                label={`The yard. ${buddy?.name ?? 'Your buddy'} stands in the middle. Round it are a board for hosting, a practice target, an arcade cabinet, a quest board, a lantern stall and a podium of Glims.`}
                onAnchors={onAnchors}
                onReady={() => setLive(true)}
                onUnavailable={onUnavailable}
                giveUpWhenSlow={!decision.asked}
              />
            </Suspense>
          ) : null}
        </div>
        <SeasonDecor />

        <header className="place-head">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {/* Long names step down a size, so a name breaks between words rather than in the middle of one. */}
            <h1 id="place-title" className={`font-display leading-none font-extrabold break-words ${user.displayName.length > 18 ? 'text-[1.35rem] sm:text-[1.9rem]' : user.displayName.length > 12 ? 'text-[1.7rem] sm:text-[2.2rem]' : 'text-[2.2rem] sm:text-[2.75rem]'}`}>Hi, {user.displayName}</h1>
            <span className="plate plate-gold text-lg sm:text-xl">
              <span className="tabular">Level {lv.level}</span>
            </span>
            <div className="flex min-w-[11rem] flex-1 flex-col gap-1 sm:max-w-[15rem]">
              <Meter value={lv.needed ? lv.into : 1} max={lv.needed || 1} tone="amber" size="md" label={`Level ${lv.level} progress`} />
              <p className="text-sm leading-tight text-text-2 tabular">{lv.needed ? `${formatNumber(lv.needed - lv.into)} XP to level ${lv.level + 1}` : 'Top level reached'}</p>
            </div>
          </div>
          {streak > 0 ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-lantern">
              <Flame className="size-4 shrink-0" aria-hidden />
              {o?.stats.playedToday ? `${streak}-day streak. Come back tomorrow to keep it.` : `Play today to keep your ${streak}-day streak.`}
            </p>
          ) : (
            <p className="mt-2.5 text-sm text-text-2">Play a game today to start a streak.</p>
          )}
        </header>

        <div className="place-join hud stage-card">
          <h2 className="font-display text-2xl leading-none font-bold">Join a game</h2>
          <CodeEntry />
        </div>

        <nav aria-label="Places to go" className="place-nav">
          <ul>
            {SPOTS.map((s) => (
              <li key={s.id}>
                <Link
                  to={s.to}
                  ref={(el) => {
                    signs.current[s.id] = el;
                  }}
                  className="place-sign"
                  data-on={active === s.id ? 'true' : undefined}
                  style={{ '--fx': `${s.at[0]}%`, '--fy': `${s.at[1]}%` } as CSSProperties}
                  onPointerEnter={(e) => (e.pointerType === 'touch' ? undefined : setActive(s.id))}
                  onPointerLeave={() => setActive((a) => (a === s.id ? null : a))}
                  onFocus={() => setActive(s.id)}
                  onBlur={() => setActive((a) => (a === s.id ? null : a))}
                >
                  <span className="place-sign-icon" aria-hidden>
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="place-sign-title">{s.title}</span>
                    <span className="place-sign-note">{notes[s.id]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {buddy?.name ? (
          <Link ref={tag} to="/locker" className="place-tag" aria-label={`${buddy.name} is your buddy. Change your buddy in the locker`}>
            {buddy.name}
          </Link>
        ) : null}

        <SeasonLine className="place-season" />

        <div className="place-tools">
          {note ? (
            <p role="status" className="place-note">
              {note}
            </p>
          ) : live && wide && !still ? (
            <p className="place-note" aria-hidden>
              Drag to look around
            </p>
          ) : null}
          {canSwitch ? (
            <button type="button" className="place-switch" aria-pressed={want3d} onClick={toggle}>
              <Box className="size-4" aria-hidden />
              3D menu
              <span className="place-switch-state" aria-hidden>
                {want3d ? 'On' : 'Off'}
              </span>
            </button>
          ) : null}
        </div>
      </section>
    </Bleed>
  );
}
