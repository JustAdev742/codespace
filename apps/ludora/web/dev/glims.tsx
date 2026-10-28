// Development-only gallery of every Glim, for art work. Served by Vite at /dev/glims.html; not part of the app build.
//
// Views (?view=...):
//   collection  every Glim, grouped by collection (default). ?collection=meadow&size=120
//   sizes       a size matrix: 28, 48, 96, 160 and 240 px. ?ids=glim-pebblet,glim-sprig
//   parts       every body, eye, brow, mouth, pattern, ear, tail, back, face and topper on its own
//   accessories every hat, eyewear and neckwear on every body
//   poses       idle, wave and cheer
//   rarity      one Glim in every rarity finish
//   silhouette  uncollected silhouettes, as the collection page draws them
// Add &theme=light or &theme=dark, or use the toggle.
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ALL_COLLECTIONS as COLLECTIONS, COSMETICS, GLIMS as PERMANENT_GLIMS, MONTHLY_GLIMS } from '@ludora/content';
import {
  ACCESSORY_SHAPES,
  GLIM_BACKS,
  GLIM_BODIES,
  GLIM_BROWS,
  GLIM_EARS,
  GLIM_EYES,
  GLIM_FACES,
  GLIM_MOUTHS,
  GLIM_PATTERNS,
  GLIM_TAILS,
  GLIM_TOPPERS,
  RARITIES,
  type AccessoryArt,
  type GlimArt,
  type Rarity,
} from '@ludora/shared';
import '../src/styles/app.css';
import { Glim, type GlimPose } from '../src/art/glim/Glim.tsx';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'collection';
const size = Number(params.get('size') ?? 112);
const only = params.get('collection');
const ids = params.get('ids')?.split(',');
const section = params.get('section');
const initialTheme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = initialTheme;

const GLIMS = [...PERMANENT_GLIMS, ...MONTHLY_GLIMS];
const glims = GLIMS.map((g) => ({ ...g, art: g.art as GlimArt }));
const byId = new Map(glims.map((g) => [g.id, g]));

const BASE: GlimArt = { kind: 'glim', body: 'blob', hue: 200, accentHue: 40, saturation: 70, eyes: 'big', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true };

function Card({ children, label, sub, width }: { children: ReactNode; label: string; sub?: string | undefined; width: number }) {
  return (
    <figure style={{ margin: 0, width, textAlign: 'center', fontSize: 12, lineHeight: 1.3 }}>
      {children}
      <figcaption>
        {label}
        {sub ? (
          <>
            <br />
            <span style={{ color: 'var(--text-3)' }}>{sub}</span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 8px' }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>{children}</div>
    </section>
  );
}

function CollectionView() {
  return (
    <>
      {COLLECTIONS.filter((c) => !only || c.id === only).map((c) => (
        <Row key={c.id} title={c.name}>
          {glims
            .filter((g) => g.collectionId === c.id)
            .map((g) => (
              <Card key={g.id} label={g.name} sub={g.rarity} width={size + 16}>
                <Glim art={g.art} size={size} rarity={g.rarity as Rarity} title={g.name} />
              </Card>
            ))}
        </Row>
      ))}
    </>
  );
}

const SIZES = [28, 48, 96, 160, 240];

function SizesView() {
  const picks = ids ?? COLLECTIONS.map((c) => glims.filter((g) => g.collectionId === c.id).at(-1)!.id);
  return (
    <>
      {picks.map((id) => {
        const g = byId.get(id);
        if (!g) return null;
        return (
          <Row key={id} title={`${g.name} (${g.rarity})`}>
            {SIZES.map((s) => (
              <Card key={s} label={`${s}px`} width={s + 8}>
                <Glim art={g.art} size={s} rarity={g.rarity as Rarity} />
              </Card>
            ))}
          </Row>
        );
      })}
      <Row title="Avatars at 28px, every Glim">
        {glims.map((g) => (
          <span key={g.id} title={g.name} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <Glim art={g.art} size={34} />
          </span>
        ))}
      </Row>
    </>
  );
}

function PartsView() {
  const s = size === 112 ? 96 : size;
  const strip = <K extends keyof GlimArt>(title: string, key: K, values: readonly GlimArt[K][], base: Partial<GlimArt> = {}) =>
    section && section !== title.toLowerCase() ? null : (
    <Row title={title}>
      {values.map((v) => (
        <Card key={String(v)} label={String(v)} width={s + 8}>
          <Glim art={{ ...BASE, ...base, [key]: v }} size={s} />
        </Card>
      ))}
    </Row>
  );
  return (
    <>
      {strip('Bodies', 'body', GLIM_BODIES)}
      {strip('Eyes', 'eyes', GLIM_EYES, { mouth: 'smile' })}
      {strip('Brows', 'brows', GLIM_BROWS, { eyes: 'dot' })}
      {strip('Mouths', 'mouth', GLIM_MOUTHS, { eyes: 'dot' })}
      {strip('Patterns', 'pattern', GLIM_PATTERNS, { hue: 30, accentHue: 330 })}
      {strip('Ears', 'ears', GLIM_EARS, { hue: 280, accentHue: 50 })}
      {strip('Tails', 'tail', GLIM_TAILS, { hue: 20, accentHue: 190 })}
      {strip('Backs', 'back', GLIM_BACKS, { hue: 160, accentHue: 290 })}
      {strip('Faces', 'face', GLIM_FACES, { hue: 330, accentHue: 180 })}
      {strip('Toppers', 'topper', GLIM_TOPPERS, { hue: 120, accentHue: 20 })}
    </>
  );
}

const HUE = { hat: 280, eyes: 200, neck: 10 } as const;

function AccessoriesView() {
  const s = size === 112 ? 72 : size;
  const bodies = params.get('bodies')?.split(',') ?? [...GLIM_BODIES];
  const slots = params.get('slots')?.split(',') ?? ['hat', 'eyes', 'neck'];
  const reference = (body: GlimArt['body']): GlimArt => ({ ...BASE, body, hue: (GLIM_BODIES.indexOf(body) * 47) % 360, accentHue: 45 });
  const sets: { slot: AccessoryArt['slot']; shape: string }[] = (['hat', 'eyes', 'neck'] as const).filter((slot) => slots.includes(slot)).flatMap((slot) => ACCESSORY_SHAPES[slot].map((shape) => ({ slot, shape })));
  return (
    <>
      {sets.map(({ slot, shape }) => (
        <Row key={`${slot}-${shape}`} title={`${slot}: ${shape}`}>
          {GLIM_BODIES.filter((b) => bodies.includes(b)).map((body) => (
            <Card key={body} label={body} width={s + 4}>
              <Glim art={reference(body)} accessories={[{ kind: 'accessory', slot, shape, hue: HUE[slot] }]} size={s} />
            </Card>
          ))}
        </Row>
      ))}
      <Row title="All three at once, from the catalogue">
        {GLIM_BODIES.filter((b) => bodies.includes(b)).map((body, i) => {
          const pick = (slot: AccessoryArt['slot']) => {
            const list = COSMETICS.filter((it) => it.art.kind === 'accessory' && it.art.slot === slot).map((it) => it.art as AccessoryArt);
            return list[i % list.length]!;
          };
          return (
            <Card key={body} label={body} width={s + 4}>
              <Glim art={reference(body)} accessories={[pick('hat'), pick('eyes'), pick('neck')]} size={s} />
            </Card>
          );
        })}
      </Row>
    </>
  );
}

const POSES: GlimPose[] = ['idle', 'wave', 'cheer'];

function PosesView() {
  const picks = ids ?? ['glim-pebblet', 'glim-dewdrop', 'glim-sprig', 'glim-mossbun', 'glim-snailor', 'glim-hootsworth', 'glim-electrolyn', 'glim-lamplighter', 'glim-novabelle', 'glim-hushfall', 'glim-anemonie', 'glim-twinkleton'];
  return (
    <>
      {POSES.map((pose) => (
        <Row key={pose} title={`pose: ${pose}`}>
          {picks.map((id) => {
            const g = byId.get(id);
            return g ? (
              <Card key={id} label={g.name} width={size + 8}>
                <Glim art={g.art} size={size} pose={pose} rarity={g.rarity as Rarity} bob={pose !== 'idle'} />
              </Card>
            ) : null;
          })}
        </Row>
      ))}
    </>
  );
}

function RarityView() {
  const picks = ids ?? ['glim-pebblet', 'glim-capling', 'glim-kettlekin', 'glim-orbitty', 'glim-bleepbloop', 'glim-trinkette'];
  return (
    <>
      {picks.map((id) => {
        const g = byId.get(id);
        return g ? (
          <Row key={id} title={`${g.name}, every finish`}>
            {RARITIES.map((r) => (
              <Card key={r} label={r} width={size + 8}>
                <Glim art={g.art} size={size} rarity={r} />
              </Card>
            ))}
            <Card label="aura only (legendary)" width={size + 8}>
              <Glim art={g.art} size={size} aura="legendary" />
            </Card>
          </Row>
        ) : null;
      })}
    </>
  );
}

function SilhouetteView() {
  return (
    <>
      {COLLECTIONS.filter((c) => !only || c.id === only).map((c) => (
        <Row key={c.id} title={`${c.name}: full-art silhouettes, then body-only (as the collection page gets them)`}>
          {glims
            .filter((g) => g.collectionId === c.id)
            .map((g) => (
              <div key={g.id} style={{ display: 'grid', gap: 4, padding: 6, borderRadius: 14, background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
                <Glim art={g.art} size={size * 0.8} silhouette />
                <Glim art={{ ...BASE, body: g.art.body, eyes: 'dot', mouth: 'none', cheeks: false }} size={size * 0.8} silhouette />
              </div>
            ))}
        </Row>
      ))}
    </>
  );
}

/** Try genome variants: ?view=lab&g=[{...partial art...}, ...] (each merged over the first Glim in ?ids, or a plain base). */
function LabView() {
  const base = ids?.[0] ? byId.get(ids[0])?.art ?? BASE : BASE;
  let variants: Partial<GlimArt>[] = [];
  try {
    variants = JSON.parse(params.get('g') ?? '[]') as Partial<GlimArt>[];
  } catch {
    variants = [];
  }
  // &acc=hat:beanie:280,eyes:round:200 puts accessories on every variant.
  const acc: AccessoryArt[] = (params.get('acc') ?? '')
    .split(',')
    .filter(Boolean)
    .map((a) => {
      const [slot, shape, hue] = a.split(':');
      return { kind: 'accessory', slot: slot as AccessoryArt['slot'], shape: shape ?? 'beanie', hue: Number(hue ?? 200) };
    });
  const list = ids && ids.length > 1 ? ids.map((id) => byId.get(id)?.art).filter((a): a is GlimArt => Boolean(a)) : null;
  if (list) {
    return (
      <Row title="Lab">
        {list.map((art, i) => (
          <Card key={i} label={ids![i]!.replace('glim-', '')} width={size + 8}>
            <Glim art={art} accessories={acc} size={size} pose={(params.get('pose') as GlimPose | null) ?? undefined} rarity={(params.get('rarity') as Rarity | null) ?? undefined} />
          </Card>
        ))}
      </Row>
    );
  }
  return (
    <Row title="Lab">
      {[{}, ...variants].map((v, i) => (
        <Card key={i} label={i === 0 ? 'base' : JSON.stringify(v)} width={size + 8}>
          <Glim art={{ ...base, ...v }} accessories={acc} size={size} rarity={(params.get('rarity') as Rarity | null) ?? undefined} />
        </Card>
      ))}
    </Row>
  );
}

function Gallery() {
  const [theme, setTheme] = useState(initialTheme);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };
  const views: Record<string, () => ReactNode> = { collection: CollectionView, sizes: SizesView, parts: PartsView, accessories: AccessoriesView, poses: PosesView, rarity: RarityView, silhouette: SilhouetteView, lab: LabView };
  const View = views[view] ?? CollectionView;
  return (
    <div style={{ padding: 24, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, fontSize: 14, flexWrap: 'wrap' }}>
        {Object.keys(views).map((v) => (
          <a key={v} href={`?view=${v}&theme=${theme}`} style={{ color: v === view ? 'var(--text)' : 'var(--link)', fontWeight: v === view ? 700 : 400 }}>
            {v}
          </a>
        ))}
        <button type="button" onClick={flip} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface-2)', color: 'var(--text)' }}>
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </nav>
      <View />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
