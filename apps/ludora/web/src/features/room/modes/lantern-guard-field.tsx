import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  GLOOMLINGS,
  MAPS,
  MAP_H,
  MAP_W,
  pointAt,
  towerStats,
  type GloomKind,
  type GuardMap,
  type MapId,
  type Point,
  type TowerKind,
} from '@ludora/engine/lantern-guard-maps';
import { motionOK } from '../game/stage.tsx';

/*
 * Lantern Guard's battlefield: the road, the Great Lantern, the tower spots,
 * the towers and the marching gloomlings, drawn in the map's own 160 x 90
 * units from the same geometry the engine aims with. Gloomlings glide between
 * views (progress + speed x time since the view), placed every animation
 * frame; with reduced motion they only move when a view arrives and towers do
 * not flash. Every piece has its own shape and outline, so nothing depends on
 * colour.
 */

export interface TowerView {
  spot: number;
  kind: TowerKind;
  level: number;
  by: string;
  ups?: string[];
  defeats: number;
  shot: { at: number; road: number; p: number } | null;
}

export interface GloomView {
  id: number;
  kind: GloomKind;
  road: number;
  p: number;
  /** Road lengths per second right now, slows included. */
  v: number;
  hp: number;
  max: number;
}

export type Selection = { kind: 'spot'; spot: number } | { kind: 'lantern' } | null;

/** How far ahead of the last view a gloomling may glide, so a stalled connection never sends them running off. */
const GLIDE_MAX_MS = 600;
/** A view's shots are drawn for this long. */
const SHOT_MS = 320;

const SIZE: Record<GloomKind, number> = { wisp: 2.3, shade: 2.9, brute: 3.8, lord: 6 };

/** Shapes for each gloomling, centred on 0,0, facing right. Distinct outlines: a flame, a ghost, a horned block and a crowned giant. */
export function GloomShape({ kind, slowed = false }: { kind: GloomKind; slowed?: boolean }) {
  const ink = 'var(--ink)';
  switch (kind) {
    case 'wisp':
      return (
        <g>
          <path d="M2.4 0C2.4 1.6 1.2 2.4 0 2.4C-1.4 2.4 -2.2 1.4 -3.8 1.6C-2.8 0.8 -3.4 0 -4.4 -0.6C-2.8 -0.8 -2.4 -2.4 0 -2.4C1.2 -2.4 2.4 -1.6 2.4 0Z" fill="#c9b6ff" stroke={ink} strokeWidth={0.5} strokeLinejoin="round" />
          <circle cx={0.9} cy={-0.5} r={0.45} fill={ink} />
          <circle cx={-0.3} cy={-0.5} r={0.45} fill={ink} />
          {slowed ? <SlowMark r={3} /> : null}
        </g>
      );
    case 'shade':
      return (
        <g>
          <path d="M-2.6 2.8V-0.2C-2.6 -2 -1.4 -3 0 -3C1.4 -3 2.6 -2 2.6 -0.2V2.8L1.7 2L0.9 2.8L0 2L-0.9 2.8L-1.7 2Z" fill="#7a4fd6" stroke={ink} strokeWidth={0.55} strokeLinejoin="round" />
          <ellipse cx={0.9} cy={-0.6} rx={0.55} ry={0.75} fill="#fff" stroke={ink} strokeWidth={0.25} />
          <ellipse cx={-0.5} cy={-0.6} rx={0.55} ry={0.75} fill="#fff" stroke={ink} strokeWidth={0.25} />
          <circle cx={1.05} cy={-0.5} r={0.28} fill={ink} />
          <circle cx={-0.35} cy={-0.5} r={0.28} fill={ink} />
          {slowed ? <SlowMark r={3.6} /> : null}
        </g>
      );
    case 'brute':
      return (
        <g>
          <path d="M-2.6 -2.6L-3.6 -4.6L-1.6 -3.2M2.6 -2.6L3.6 -4.6L1.6 -3.2" fill="#e7dcc4" stroke={ink} strokeWidth={0.5} strokeLinejoin="round" />
          <rect x={-3.4} y={-3.2} width={6.8} height={6.2} rx={1.8} fill="#4a4370" stroke={ink} strokeWidth={0.6} />
          <path d="M-1.9 -1.5L-0.4 -0.9M1.9 -1.5L0.4 -0.9" stroke="#ffd36b" strokeWidth={0.55} strokeLinecap="round" />
          <circle cx={-1.1} cy={-0.3} r={0.42} fill="#ffd36b" />
          <circle cx={1.1} cy={-0.3} r={0.42} fill="#ffd36b" />
          <path d="M-1.4 1.5H1.4" stroke={ink} strokeWidth={0.5} strokeLinecap="round" />
          {slowed ? <SlowMark r={4.8} /> : null}
        </g>
      );
    case 'lord':
      return (
        <g>
          <path d="M-5.2 5.4V-0.8C-5.2 -4 -3 -5.6 0 -5.6C3 -5.6 5.2 -4 5.2 -0.8V5.4L3.6 4L2 5.4L0 4L-2 5.4L-3.6 4Z" fill="#3b1d57" stroke="#ff5a6e" strokeWidth={0.7} strokeLinejoin="round" />
          <path d="M-3.4 -4.6L-3 -7.8L-1.4 -5.6L0 -8.4L1.4 -5.6L3 -7.8L3.4 -4.6" fill="#ffb020" stroke={ink} strokeWidth={0.5} strokeLinejoin="round" />
          <ellipse cx={0.6} cy={-1.2} rx={2} ry={1.6} fill="#fff1c7" stroke={ink} strokeWidth={0.4} />
          <circle cx={1} cy={-1.2} r={0.9} fill="#ff5a6e" stroke={ink} strokeWidth={0.3} />
          <path d="M-2.2 2.2Q0.6 3.6 3 2.2" fill="none" stroke="#ff5a6e" strokeWidth={0.5} strokeLinecap="round" />
          {slowed ? <SlowMark r={7.2} /> : null}
        </g>
      );
  }
}

function SlowMark({ r }: { r: number }) {
  return <circle r={r} fill="none" stroke="#bfe9ff" strokeWidth={0.45} strokeDasharray="0.9 0.7" />;
}

/** Tower drawings on a round stone pad: a bolt, a crystal, a snowflake and a rocket. */
export function TowerShape({ kind, level }: { kind: TowerKind; level: number }) {
  const ink = 'var(--ink)';
  return (
    <g>
      <circle r={4.5} fill="#2c2466" stroke={ink} strokeWidth={0.6} />
      <circle r={3.7} fill="none" stroke="#5a51b0" strokeWidth={0.35} />
      {kind === 'spark' ? (
        <g>
          <circle r={3} fill="#ffd36b" stroke={ink} strokeWidth={0.55} />
          <path d="M0.5 -2.3L-1.4 0.3H0.1L-0.5 2.3L1.4 -0.4H-0.1Z" fill={ink} />
        </g>
      ) : null}
      {kind === 'beam' ? (
        <g>
          <path d="M0 -4.4L2.6 -0.3L0 3.4L-2.6 -0.3Z" fill="#7fd4ff" stroke={ink} strokeWidth={0.55} strokeLinejoin="round" />
          <path d="M0 -4.4L0.7 -0.3L0 3.4M-2.6 -0.3H2.6" fill="none" stroke="#fff" strokeWidth={0.35} opacity={0.85} />
        </g>
      ) : null}
      {kind === 'frost' ? (
        <g>
          <path d="M0 -3.3L2.86 -1.65V1.65L0 3.3L-2.86 1.65V-1.65Z" fill="#dff4ff" stroke={ink} strokeWidth={0.55} strokeLinejoin="round" />
          <path d="M0 -2.3V2.3M-2 -1.15L2 1.15M-2 1.15L2 -1.15" stroke="#2a7fc0" strokeWidth={0.45} strokeLinecap="round" />
        </g>
      ) : null}
      {kind === 'firework' ? (
        <g transform="rotate(-35)">
          <path d="M-1.2 2.2V-1.6L0 -3.6L1.2 -1.6V2.2Z" fill="#ff7a5c" stroke={ink} strokeWidth={0.5} strokeLinejoin="round" />
          <path d="M-1.2 0.8L-2.4 2.6H-1.2M1.2 0.8L2.4 2.6H1.2" fill="#ffd36b" stroke={ink} strokeWidth={0.45} strokeLinejoin="round" />
          <path d="M-1.2 -0.6H1.2" stroke="#fff" strokeWidth={0.45} />
        </g>
      ) : null}
      <LevelPips level={level} />
    </g>
  );
}

/** A small pennant on a tower's pad: this one is yours. */
function Pennant() {
  return (
    <g transform="translate(3.2 -3.6)">
      <path d="M0 0V-4.2" stroke="var(--ink)" strokeWidth={0.5} strokeLinecap="round" />
      <path d="M0.2 -4.2L3 -3.3L0.2 -2.4Z" fill="#fff" stroke="var(--ink)" strokeWidth={0.35} strokeLinejoin="round" />
    </g>
  );
}

function LevelPips({ level }: { level: number }) {
  return (
    <g transform="translate(0 5.2)">
      {Array.from({ length: level }, (_, i) => (
        <circle key={i} cx={(i - (level - 1) / 2) * 1.9} r={0.75} fill="#fff" stroke="var(--ink)" strokeWidth={0.35} />
      ))}
    </g>
  );
}

/** The Great Lantern: a big festival lantern on a post, glowing as brightly as the lights it has left. */
function GreatLantern({ at, glow, hurt }: { at: Point; glow: number; hurt: number }) {
  const [x, y] = at;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cy={-9} r={8 + glow * 10} fill="url(#lg-halo)" opacity={0.35 + glow * 0.65} />
      <path d="M0 0V-3" stroke="var(--ink)" strokeWidth={1.2} />
      <ellipse cy={0.4} rx={4.2} ry={1.3} fill="#2c2466" stroke="var(--ink)" strokeWidth={0.5} />
      <g key={hurt} style={hurt ? { animation: 'lg-flicker 700ms ease-out' } : undefined}>
        <path d="M-3.6 -17H3.6L4.6 -15H-4.6Z" fill="#5b2a1c" stroke="var(--ink)" strokeWidth={0.5} strokeLinejoin="round" />
        <path d="M-5 -14.8C-5 -16 -2.8 -16.4 0 -16.4C2.8 -16.4 5 -16 5 -14.8V-5.4C5 -4.2 2.8 -3.8 0 -3.8C-2.8 -3.8 -5 -4.2 -5 -5.4Z" fill={glow > 0 ? '#ffcf5c' : '#7b6a8f'} stroke="var(--ink)" strokeWidth={0.6} />
        <ellipse cy={-10} rx={3.2} ry={4.2} fill="#fff6d0" opacity={0.25 + glow * 0.65} />
        <path d="M-2.6 -16V-4.2M2.6 -16V-4.2M0 -16.4V-3.8" stroke="#b5651d" strokeWidth={0.35} opacity={0.6} />
        <path d="M-3.4 -3.8H3.4L2.6 -2.6H-2.6Z" fill="#5b2a1c" stroke="var(--ink)" strokeWidth={0.45} strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** Small scenery in the open ground (trees, stones and flowers), the same every time for a map. */
function useScenery(map: GuardMap) {
  return useMemo(() => {
    let h = 2166136261;
    for (const c of map.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const rand = () => {
      h = (h + 0x6d2b79f5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const roadPts = map.paths.flatMap((p) => p.points);
    const clear = (x: number, y: number, road: number, spot: number) =>
      roadPts.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > road * road) &&
      map.spots.every(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 > spot * spot) &&
      (map.lantern[0] - x) ** 2 + (map.lantern[1] - 10 - y) ** 2 > 196;
    const items: { kind: 'tree' | 'stone' | 'flower'; x: number; y: number; s: number }[] = [];
    for (let i = 0; i < 260 && items.length < 46; i++) {
      const x = 3 + rand() * (MAP_W - 6);
      const y = 3 + rand() * (MAP_H - 6);
      const r = rand();
      const kind = r < 0.45 ? 'tree' : r < 0.7 ? 'stone' : 'flower';
      if (!clear(x, y, kind === 'tree' ? 9 : 7, kind === 'tree' ? 7.5 : 5.5)) continue;
      if (items.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < 25)) continue;
      items.push({ kind, x, y, s: 0.8 + rand() * 0.5 });
    }
    const flies = Array.from({ length: 18 }, () => ({ x: rand() * MAP_W, y: rand() * MAP_H, d: rand() * 4 }));
    return { items, flies };
  }, [map]);
}

/** The ground, scenery, road, entrances, spots and the lantern's post: everything that never moves. */
const Ground = memo(function Ground({ map, compact }: { map: GuardMap; compact: boolean }) {
  const { items, flies } = useScenery(map);
  const roads = map.paths.map((p) => p.points.map((q) => q.join(',')).join(' '));
  return (
    <g>
      <rect width={MAP_W} height={MAP_H} fill="url(#lg-ground)" />
      {map.id === 'river' ? <path d="M-2 62C12 58 22 70 34 76C44 81 50 92 52 96H-2Z" fill="#1d4a7a" opacity={0.75} stroke="#3d7fbf" strokeWidth={0.6} /> : null}
      {map.id === 'spiral' ? <ellipse cx={64} cy={57} rx={22} ry={7} fill="none" stroke="#3a3178" strokeWidth={0.6} strokeDasharray="2 1.5" /> : null}
      {items.map((o, i) =>
        o.kind === 'tree' ? (
          <g key={i} transform={`translate(${o.x} ${o.y}) scale(${o.s})`}>
            <circle cy={0.6} r={2.6} fill="#13304a" />
            <circle r={2.4} fill="#1f5a52" stroke="#0e2a2a" strokeWidth={0.35} />
            <circle cx={-0.7} cy={-0.7} r={0.9} fill="#2f7a68" />
          </g>
        ) : o.kind === 'stone' ? (
          <ellipse key={i} cx={o.x} cy={o.y} rx={1.3 * o.s} ry={0.9 * o.s} fill="#4b4486" stroke="#2a245c" strokeWidth={0.3} />
        ) : (
          <g key={i} transform={`translate(${o.x} ${o.y})`}>
            <circle r={0.55} fill="#ff85d8" />
            <circle cx={1.3} cy={0.5} r={0.45} fill="#ffd36b" />
          </g>
        ),
      )}
      {!compact
        ? flies.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={0.35} fill="#fff4b0" className="lg-firefly" style={{ animationDelay: `${f.d}s` }} />)
        : null}
      {/* The glowing road: a soft halo, an ink edge, the stones and a dashed centre line. */}
      {roads.map((pts, i) => (
        <polyline key={`h${i}`} points={pts} fill="none" stroke="#ffb020" strokeOpacity={0.22} strokeWidth={compact ? 12 : 15} strokeLinecap="round" strokeLinejoin="round" filter={compact ? undefined : 'url(#lg-soft)'} />
      ))}
      {roads.map((pts, i) => (
        <polyline key={`e${i}`} points={pts} fill="none" stroke="var(--ink)" strokeWidth={9.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {roads.map((pts, i) => (
        <polyline key={`r${i}`} points={pts} fill="none" stroke="#c9945a" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {roads.map((pts, i) => (
        <polyline key={`c${i}`} points={pts} fill="none" stroke="#f7d9a0" strokeWidth={0.7} strokeDasharray="2.4 2.2" strokeLinecap="round" opacity={0.85} />
      ))}
      {/* Where the gloom comes from: a dark cloud at each entrance. */}
      {map.paths.map((p, i) => {
        const [x, y] = p.points[0]!;
        return (
          <g key={`g${i}`} transform={`translate(${Math.max(4, x + 10)} ${y})`}>
            <circle r={7} fill="url(#lg-gloom)" />
            <circle cx={-1} cy={-1} r={3.4} fill="#1a0c2e" stroke="#7a4fd6" strokeWidth={0.5} strokeDasharray="1.4 1" />
          </g>
        );
      })}
      {map.spots.map(([x, y], i) => (
        <circle key={`s${i}`} cx={x} cy={y} r={3.8} fill="#211a52" fillOpacity={0.85} stroke="#a99cf0" strokeWidth={0.45} strokeDasharray="1.2 0.9" />
      ))}
    </g>
  );
});

function Defs() {
  return (
    <defs>
      <radialGradient id="lg-ground" cx="70%" cy="45%" r="85%">
        <stop offset="0%" stopColor="#2a2470" />
        <stop offset="60%" stopColor="#1a1550" />
        <stop offset="100%" stopColor="#100c34" />
      </radialGradient>
      <radialGradient id="lg-halo">
        <stop offset="0%" stopColor="#ffe08a" stopOpacity="0.9" />
        <stop offset="55%" stopColor="#ffb020" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lg-gloom">
        <stop offset="0%" stopColor="#4b1f7a" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#4b1f7a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lg-flare">
        <stop offset="0%" stopColor="#fff6d0" stopOpacity="0.95" />
        <stop offset="40%" stopColor="#ffd36b" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
      </radialGradient>
      <filter id="lg-soft" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
    </defs>
  );
}

/** A tower's shot as it is drawn for a moment: a zigzag spark, a straight beam, an icy line, or a firework's arc and burst. */
function ShotMark({ kind, from, to, splash }: { kind: TowerKind; from: Point; to: Point; splash: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const style = { animation: `lg-shot ${SHOT_MS}ms ease-out forwards` };
  if (kind === 'spark') {
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
    const my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
    return <polyline points={`${x1},${y1} ${mx},${my} ${x2},${y2}`} fill="none" stroke="#ffe27a" strokeWidth={0.8} strokeLinejoin="round" style={style} />;
  }
  if (kind === 'beam')
    return (
      <g style={style}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7fd4ff" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={0.7} strokeLinecap="round" />
      </g>
    );
  if (kind === 'frost')
    return (
      <g style={style}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#bfe9ff" strokeWidth={0.7} strokeDasharray="1 0.8" />
        <circle cx={x2} cy={y2} r={2.4} fill="#dff4ff" opacity={0.6} />
      </g>
    );
  const cx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - 8;
  return (
    <g style={{ animation: `lg-shot ${SHOT_MS + 180}ms ease-out forwards` }}>
      <path d={`M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`} fill="none" stroke="#ffb18a" strokeWidth={0.6} strokeDasharray="1.2 1" />
      <circle cx={x2} cy={y2} r={splash} fill="#ff7a5c" fillOpacity={0.18} stroke="#ffd36b" strokeWidth={0.6} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line key={a} x1={x2} y1={y2} x2={x2 + Math.cos((a * Math.PI) / 180) * splash * 0.8} y2={y2 + Math.sin((a * Math.PI) / 180) * splash * 0.8} stroke="#ffd36b" strokeWidth={0.5} strokeLinecap="round" />
      ))}
    </g>
  );
}

const BAR_W: Record<GloomKind, number> = { wisp: 5, shade: 6, brute: 8, lord: 12 };

/** Where a gloomling is at game time `now`, gliding on from where the last view put it. */
function placeAt(map: GuardMap, g: GloomView, tick: number, now: number | null): Point {
  const ahead = now === null ? 0 : Math.max(0, Math.min(GLIDE_MAX_MS, now - tick));
  const path = map.paths[g.road] ?? map.paths[0]!;
  return pointAt(path, Math.min(1, g.p + (g.v * ahead) / 1000));
}

interface FieldProps {
  mapId: MapId;
  tick: number;
  towers: TowerView[];
  gloom: GloomView[];
  lights: number;
  maxLights: number;
  flareAt: number | null;
  gameNow: () => number;
  /** The projector draws the scenery's glow and every health bar; a phone keeps it lighter. */
  compact?: boolean;
  selection?: Selection;
  /** The reach to draw around the selection (a tower's, or the tower about to be built). */
  reach?: number | null;
  /** A free spot worth pointing out (the one that sees the most road). */
  hint?: number | null;
  /** The viewer's own towers get a little pennant. */
  mine?: string | null;
  onPick?: (sel: Selection) => void;
  label: string;
  children?: ReactNode;
}

/** The whole battle in one SVG. */
export function Battlefield({ mapId, tick, towers, gloom, lights, maxLights, flareAt, gameNow, compact = false, selection = null, reach = null, hint = null, mine = null, onPick, label, children }: FieldProps) {
  const map = MAPS[mapId] ?? MAPS.river;
  const svg = useRef<SVGSVGElement>(null);
  const nodes = useRef(new Map<number, SVGGElement>());
  const live = useRef({ tick, gloom, map });
  live.current = { tick, gloom, map };
  const moving = motionOK();

  // Place every gloomling now (after each view), then glide them on every frame.
  useLayoutEffect(() => {
    const now = moving ? gameNow() : null;
    for (const g of gloom) {
      const el = nodes.current.get(g.id);
      if (el) setPlace(el, placeAt(map, g, tick, now));
    }
  });
  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    const loop = () => {
      const { tick: t, gloom: list, map: m } = live.current;
      const now = gameNow();
      for (const g of list) {
        const el = nodes.current.get(g.id);
        if (el) setPlace(el, placeAt(m, g, t, now));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [moving, gameNow]);

  const effects = useBattleEffects(map, tick, gloom, lights, flareAt, moving);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!onPick || !svg.current) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const [lx, ly] = map.lantern;
    if ((pt.x - lx) ** 2 + (pt.y - (ly - 9)) ** 2 < 100) return onPick({ kind: 'lantern' });
    let best = -1;
    let bestD = 11 ** 2;
    map.spots.forEach(([x, y], i) => {
      const d = (x - pt.x) ** 2 + (y - pt.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    onPick(best >= 0 ? { kind: 'spot', spot: best } : null);
  };

  const selSpot = selection?.kind === 'spot' ? map.spots[selection.spot] : null;
  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className={`block h-auto w-full select-none ${onPick ? 'cursor-pointer touch-manipulation' : ''}`}
      role="img"
      aria-label={label}
      onPointerUp={onPick ? pick : undefined}
    >
      <Defs />
      <Ground map={map} compact={compact} />
      <GreatLantern at={map.lantern} glow={maxLights > 0 ? lights / maxLights : 0} hurt={effects.hurt} />
      {hint !== null && map.spots[hint] ? (
        <g transform={`translate(${map.spots[hint]![0]} ${map.spots[hint]![1]})`} aria-hidden>
          <path d="M0 -2.6L0.8 -0.8L2.6 -0.6L1.2 0.6L1.6 2.4L0 1.4L-1.6 2.4L-1.2 0.6L-2.6 -0.6L-0.8 -0.8Z" fill="#ffd36b" stroke="var(--ink)" strokeWidth={0.35} />
        </g>
      ) : null}
      {towers.map((t) => {
        const at = map.spots[t.spot];
        if (!at) return null;
        return (
          <g key={t.spot} transform={`translate(${at[0]} ${at[1]})`}>
            <TowerShape kind={t.kind} level={t.level} />
            {mine && t.by === mine ? <Pennant /> : null}
          </g>
        );
      })}
      {selSpot ? (
        <g transform={`translate(${selSpot[0]} ${selSpot[1]})`} pointerEvents="none">
          {reach ? <circle r={reach} fill="#ffd36b" fillOpacity={0.1} stroke="#ffd36b" strokeWidth={0.5} strokeDasharray="2 1.4" /> : null}
          <circle r={6.2} fill="none" stroke="var(--ink)" strokeWidth={1.6} />
          <circle r={6.2} fill="none" stroke="#ffd36b" strokeWidth={0.9} className={moving ? 'lg-pulse' : undefined} />
        </g>
      ) : null}
      {selection?.kind === 'lantern' ? <circle cx={map.lantern[0]} cy={map.lantern[1] - 9} r={10} fill="none" stroke="#ffd36b" strokeWidth={0.9} pointerEvents="none" /> : null}
      {moving
        ? towers.map((t) => {
            if (!t.shot || tick - t.shot.at > SHOT_MS) return null;
            const from = map.spots[t.spot];
            const path = map.paths[t.shot.road];
            if (!from || !path) return null;
            return <ShotMark key={`${t.spot}:${t.shot.at}`} kind={t.kind} from={from} to={pointAt(path, t.shot.p)} splash={towerStats(t.kind, t.level).splash} />;
          })
        : null}
      {gloom.map((g) => {
        const slowed = g.v < GLOOMLINGS[g.kind].speed * 0.99;
        const w = BAR_W[g.kind];
        const showBar = !compact || g.kind === 'brute' || g.kind === 'lord';
        return (
          <g
            key={g.id}
            ref={(el) => {
              if (el) nodes.current.set(g.id, el);
              else nodes.current.delete(g.id);
            }}
          >
            <g data-face="">
              <GloomShape kind={g.kind} slowed={slowed} />
            </g>
            {showBar ? (
              <g transform={`translate(${-w / 2} ${-SIZE[g.kind] - 2.6})`}>
                <rect width={w} height={1.1} rx={0.5} fill="#120c30" stroke="var(--ink)" strokeWidth={0.25} />
                <rect width={Math.max(0, (w * g.hp) / Math.max(1, g.max))} height={1.1} rx={0.5} fill={g.kind === 'lord' ? '#ff5a6e' : '#7cf2c6'} />
              </g>
            ) : null}
          </g>
        );
      })}
      {effects.marks}
      {children}
    </svg>
  );
}

/** Moves a gloomling's group, and turns it to face the way it walks. */
function setPlace(el: SVGGElement, [x, y]: Point) {
  el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  const face = el.firstElementChild as SVGGElement | null;
  if (!face) return;
  const prev = Number(el.dataset.x ?? x);
  if (Math.abs(x - prev) > 0.05) face.setAttribute('transform', x < prev ? 'scale(-1 1)' : '');
  el.dataset.x = String(x);
}

/**
 * Short-lived marks for what changed between views: a puff where a
 * gloomling was defeated, a flash at the lantern when one got through, and
 * the ring of light when the Great Lantern flares. With reduced motion only
 * the lantern's state changes; nothing flashes.
 */
function useBattleEffects(map: GuardMap, tick: number, gloom: GloomView[], lights: number, flareAt: number | null, moving: boolean) {
  const prev = useRef<{ gloom: GloomView[]; lights: number; flareAt: number | null; tick: number }>({ gloom, lights, flareAt, tick });
  const [marks, setMarks] = useState<{ key: string; node: ReactNode; until: number }[]>([]);
  const [hurt, setHurt] = useState(0);
  useEffect(() => {
    const before = prev.current;
    prev.current = { gloom, lights, flareAt, tick };
    if (tick === before.tick) return;
    const added: { key: string; node: ReactNode; until: number }[] = [];
    const now = Date.now();
    if (lights < before.lights) setHurt((h) => h + 1);
    if (!moving) return;
    const ids = new Set(gloom.map((g) => g.id));
    for (const g of before.gloom) {
      if (ids.has(g.id)) continue;
      const path = map.paths[g.road] ?? map.paths[0]!;
      const p = Math.min(1, g.p + (g.v * Math.max(0, tick - before.tick)) / 1000);
      if (p >= 0.97) continue;
      const [x, y] = pointAt(path, p);
      const r = SIZE[g.kind];
      added.push({
        key: `p${g.id}`,
        until: now + 600,
        node: (
          <g key={`p${g.id}`} transform={`translate(${x} ${y})`} pointerEvents="none">
            <circle r={r * 1.6} fill="none" stroke="#fff4b0" strokeWidth={0.6} style={{ animation: 'lg-puff 520ms ease-out forwards', transformBox: 'fill-box', transformOrigin: 'center' }} />
          </g>
        ),
      });
    }
    if (flareAt !== null && flareAt !== before.flareAt) {
      const [lx, ly] = map.lantern;
      added.push({
        key: `f${flareAt}`,
        until: now + 1400,
        node: <circle key={`f${flareAt}`} cx={lx} cy={ly - 9} r={170} fill="url(#lg-flare)" pointerEvents="none" style={{ animation: 'lg-flare 1300ms ease-out forwards', transformBox: 'fill-box', transformOrigin: 'center' }} />,
      });
    }
    if (added.length) setMarks((m) => [...m.filter((x) => x.until > now), ...added].slice(-40));
  }, [tick, gloom, lights, flareAt, map, moving]);
  useEffect(() => {
    if (!marks.length) return;
    const t = setTimeout(() => setMarks((m) => m.filter((x) => x.until > Date.now())), 700);
    return () => clearTimeout(t);
  }, [marks]);
  return { marks: marks.map((m) => m.node), hurt };
}

/** A row of little lanterns, one per light: lit ones filled, lost ones a dashed outline. */
export function LightsRow({ lights, max, size = 18 }: { lights: number; max: number; size?: number }) {
  return (
    <span className="flex flex-wrap items-center gap-[0.15em]" role="img" aria-label={`${lights} of ${max} lights still burning`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 12 16" width={size * 0.75} height={size} aria-hidden focusable={false}>
          <path d="M3.5 1.5H8.5L9.2 3H2.8Z" fill={i < lights ? '#5b2a1c' : 'none'} stroke={i < lights ? 'var(--ink)' : 'rgb(255 255 255 / 0.45)'} strokeWidth={0.9} />
          <rect
            x={1.6}
            y={3}
            width={8.8}
            height={10}
            rx={3.4}
            fill={i < lights ? '#ffcf5c' : 'none'}
            stroke={i < lights ? 'var(--ink)' : 'rgb(255 255 255 / 0.45)'}
            strokeWidth={1}
            strokeDasharray={i < lights ? undefined : '1.6 1.3'}
          />
          {i < lights ? <ellipse cx={6} cy={8} rx={2.2} ry={3} fill="#fff6d0" opacity={0.8} /> : null}
        </svg>
      ))}
    </span>
  );
}

/** The CSS this battlefield animates with, written once for both screens. */
export const FIELD_CSS = `
@keyframes lg-shot { from { opacity: 1 } to { opacity: 0 } }
@keyframes lg-puff { from { opacity: 1; transform: scale(0.4) } to { opacity: 0; transform: scale(1.4) } }
@keyframes lg-flare { 0% { opacity: 0; transform: scale(0.05) } 25% { opacity: 1 } 100% { opacity: 0; transform: scale(1) } }
@keyframes lg-flicker { 0%, 100% { opacity: 1 } 20% { opacity: 0.35 } 45% { opacity: 0.9 } 65% { opacity: 0.5 } }
@keyframes lg-twinkle { 0%, 100% { opacity: 0.15 } 50% { opacity: 0.9 } }
@keyframes lg-pulse { 0%, 100% { stroke-opacity: 1 } 50% { stroke-opacity: 0.35 } }
.lg-firefly { animation: lg-twinkle 3.6s ease-in-out infinite; }
.lg-pulse { animation: lg-pulse 1.2s ease-in-out infinite; }
`;
