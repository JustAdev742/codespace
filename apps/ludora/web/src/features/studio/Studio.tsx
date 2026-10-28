import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dices, Pencil, Store, Trash2 } from 'lucide-react';
import {
  ACCESSORY_SHAPES,
  ACCESSORY_SLOTS,
  BANNER_PATTERNS,
  FRAME_STYLES,
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
  LANTERN_PATTERNS,
  RARITY_INFO,
  STUDIO_PRICES,
  STUDIO_RARITIES,
  studioDraftSchema,
  type GlimArt,
  type ItemArt,
  type LanternArt,
  type Rarity,
  type StudioKind,
} from '@ludora/shared';
import { STANDARD_WEIGHTS } from '@ludora/content/packs';
import { api, ApiError } from '../../lib/api.ts';
import { useCan, useMe } from '../../lib/session.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, RarityBadge, Select, Skeleton, Spinner, Switch, Tabs, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog } from '../admin/ui.tsx';
import { DateTimeField, isoToLocalInput, localInputToIso } from '../admin/Economy.tsx';
import NotFound from '../errors/NotFound.tsx';
import { GlimTurntable } from './GlimTurntable.tsx';

/*
 * The Creator Studio, for accounts with the designer role. Everyone else gets
 * the ordinary "page not found" (and the server refuses every studio request
 * anyway). Designers build Glims from the genome and items from the cosmetic
 * vocabulary, so whatever they make looks like Ludora; the server checks
 * names, looks and prices before anything is saved or put on sale.
 */

interface Draft {
  id: string;
  kind: StudioKind;
  name: string;
  description: string;
  rarity: Rarity;
  art: ItemArt;
  status: 'draft' | 'published';
  itemId: string | null;
  owner: { id: string; name: string | null } | null;
  mine: boolean;
  updatedAt: string;
}

interface StudioData {
  drafts: Draft[];
  canPublish: boolean;
}

const studioKey = ['studio'] as const;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not work. Try again.');
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

function randomGlim(): GlimArt {
  const hue = Math.floor(Math.random() * 360);
  return {
    kind: 'glim',
    body: pick(GLIM_BODIES),
    hue,
    accentHue: (hue + 60 + Math.floor(Math.random() * 240)) % 360,
    saturation: 35 + Math.floor(Math.random() * 60),
    eyes: pick(GLIM_EYES),
    mouth: pick(GLIM_MOUTHS),
    pattern: pick(GLIM_PATTERNS),
    topper: pick(GLIM_TOPPERS),
    cheeks: Math.random() < 0.7,
    brows: pick(GLIM_BROWS),
    ears: Math.random() < 0.5 ? pick(GLIM_EARS) : 'none',
    tail: Math.random() < 0.4 ? pick(GLIM_TAILS) : 'none',
    back: Math.random() < 0.3 ? pick(GLIM_BACKS) : 'none',
    face: Math.random() < 0.2 ? pick(GLIM_FACES) : 'none',
  };
}

/** The first problem the shared schema finds with each field, so the form can say what is wrong before sending. */
function problems(draft: unknown): Record<string, string> {
  const r = studioDraftSchema.safeParse(draft);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = String(i.path[0] ?? 'form');
    out[k] ??= i.message;
  }
  return out;
}

function Choice<T extends string>({ label: l, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <Field label={l}>
      {(p) => (
        <Select value={value} onChange={(e) => onChange(e.target.value as T)} {...p}>
          {options.map((o) => (
            <option key={o} value={o}>
              {label(o)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function HueSlider({ label: l, value, onChange, max = 359 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <Field label={`${l}: ${value}`}>
      {(p) => (
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 w-full accent-[var(--lantern)]"
          style={max === 359 ? { background: 'linear-gradient(90deg,hsl(0 80% 60%),hsl(60 80% 60%),hsl(120 80% 60%),hsl(180 80% 60%),hsl(240 80% 60%),hsl(300 80% 60%),hsl(359 80% 60%))', borderRadius: 999, height: 12 } : undefined}
          {...p}
        />
      )}
    </Field>
  );
}

function DetailsFields({ kind, name, setName, description, setDescription, rarity, setRarity, errors, clash }: { kind: StudioKind; name: string; setName: (v: string) => void; description: string; setDescription: (v: string) => void; rarity: Rarity; setRarity: (v: Rarity) => void; errors: Record<string, string>; clash: string | null }) {
  return (
    <div className="grid gap-3">
      <Field label="Name" hint={kind === 'glim' ? 'One or two words, at most 16 characters, like every Glim.' : 'At most 24 characters.'} error={name ? (errors.name ?? clash ?? undefined) : undefined}>
        {(p) => <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={kind === 'glim' ? 16 : 24} {...p} />}
      </Field>
      <Field label="Description" hint={`One friendly line, at most ${kind === 'glim' ? 120 : 100} characters.`} error={description ? errors.description : undefined}>
        {(p) => <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={kind === 'glim' ? 120 : 100} {...p} />}
      </Field>
      <Choice label="Rarity" value={rarity} options={STUDIO_RARITIES} onChange={setRarity} />
    </div>
  );
}

function useClash(draft: unknown, draftId: string | null) {
  const [clash, setClash] = useState<string | null>(null);
  const key = JSON.stringify(draft);
  useEffect(() => {
    if (!studioDraftSchema.safeParse(draft).success) {
      setClash(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .post<{ ok: boolean; problem: string | null }>('/api/studio/check', { draft, draftId })
        .then((r) => setClash(r.problem))
        .catch(() => setClash(null));
    }, 450);
    return () => clearTimeout(t);
    // The key stands for the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, draftId]);
  return clash;
}

function useSaveDraft(editing: Draft | null, onSaved: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: unknown) => (editing ? api.patch(`/api/studio/drafts/${editing.id}`, draft) : api.post('/api/studio/drafts', draft)),
    onSuccess: async () => {
      toast.success(editing ? 'Draft updated' : 'Draft saved. Find it under Drafts.');
      await qc.invalidateQueries({ queryKey: studioKey });
      onSaved();
    },
    onError: (e) => toast.error(errText(e)),
  });
}

/* --------------------------------- Glim Maker -------------------------------- */

function GlimMaker({ editing, onDone }: { editing: Draft | null; onDone: () => void }) {
  const start = editing?.kind === 'glim' ? (editing.art as GlimArt) : null;
  const [art, setArt] = useState<GlimArt>(() => start ?? randomGlim());
  const [name, setName] = useState(editing?.kind === 'glim' ? editing.name : '');
  const [description, setDescription] = useState(editing?.kind === 'glim' ? editing.description : '');
  const [rarity, setRarity] = useState<Rarity>(editing?.kind === 'glim' ? editing.rarity : 'common');
  const set = <K extends keyof GlimArt>(k: K, v: GlimArt[K]) => setArt((a) => ({ ...a, [k]: v }));
  const draft = { kind: 'glim' as const, name: name.trim(), description: description.trim(), rarity, art };
  const errors = problems(draft);
  const clash = useClash(draft, editing?.id ?? null);
  const save = useSaveDraft(editing, onDone);
  const ready = Object.keys(errors).length === 0 && !clash;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <div className="stage grid grid-cols-2 items-center gap-2 overflow-hidden rounded-[var(--radius-l)] p-3">
          <div className="grid place-items-center">
            <Glim art={art} size={200} rarity={rarity} title={name || 'Your Glim'} />
          </div>
          <GlimTurntable art={art} className="h-56 rounded-[var(--radius-m)]" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setArt(randomGlim())} icon={<Dices className="size-4" aria-hidden />}>
            Surprise me
          </Button>
          {editing ? (
            <Button variant="ghost" onClick={onDone}>
              Stop editing
            </Button>
          ) : null}
        </div>
        {clash ? (
          <p className="text-sm font-bold text-ember" role="status">
            {clash}
          </p>
        ) : null}
      </div>
      <Panel className="flex flex-col gap-4 p-4">
        <DetailsFields kind="glim" name={name} setName={setName} description={description} setDescription={setDescription} rarity={rarity} setRarity={setRarity} errors={errors} clash={clash} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Choice label="Body" value={art.body} options={GLIM_BODIES} onChange={(v) => set('body', v)} />
          <Choice label="Eyes" value={art.eyes} options={GLIM_EYES} onChange={(v) => set('eyes', v)} />
          <Choice label="Mouth" value={art.mouth} options={GLIM_MOUTHS} onChange={(v) => set('mouth', v)} />
          <Choice label="Pattern" value={art.pattern} options={GLIM_PATTERNS} onChange={(v) => set('pattern', v)} />
          <Choice label="On top" value={art.topper} options={GLIM_TOPPERS} onChange={(v) => set('topper', v)} />
          <Choice label="Eyebrows" value={art.brows ?? 'none'} options={GLIM_BROWS} onChange={(v) => set('brows', v)} />
          <Choice label="Ears" value={art.ears ?? 'none'} options={GLIM_EARS} onChange={(v) => set('ears', v)} />
          <Choice label="Tail" value={art.tail ?? 'none'} options={GLIM_TAILS} onChange={(v) => set('tail', v)} />
          <Choice label="Back" value={art.back ?? 'none'} options={GLIM_BACKS} onChange={(v) => set('back', v)} />
          <Choice label="Face" value={art.face ?? 'none'} options={GLIM_FACES} onChange={(v) => set('face', v)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <HueSlider label="Colour" value={art.hue} onChange={(v) => set('hue', v)} />
          <HueSlider label="Second colour" value={art.accentHue} onChange={(v) => set('accentHue', v)} />
          <HueSlider label="Brightness of colour" value={art.saturation} max={100} onChange={(v) => set('saturation', v)} />
        </div>
        <Switch checked={art.cheeks} onCheckedChange={(v) => set('cheeks', v)} label="Rosy cheeks" />
        <Button variant="primary" size="lg" disabled={!ready || save.isPending} onClick={() => save.mutate(draft)}>
          {editing ? 'Save changes' : 'Save draft'}
        </Button>
      </Panel>
    </div>
  );
}

/* --------------------------------- item maker -------------------------------- */

type CosmeticKind = Exclude<StudioKind, 'glim'>;

function startArt(kind: CosmeticKind): ItemArt {
  switch (kind) {
    case 'accessory':
      return { kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 200, accentHue: 40 };
    case 'frame':
      return { kind: 'frame', style: 'ring', hue: 200, accentHue: 40 };
    case 'banner':
      return { kind: 'banner', pattern: 'waves', hue: 200, accentHue: 40 };
    case 'title':
      return { kind: 'title', text: 'Star Player' };
  }
}

function ItemMaker({ editing, onDone }: { editing: Draft | null; onDone: () => void }) {
  const editingItem = editing && editing.kind !== 'glim' ? editing : null;
  const [art, setArt] = useState<ItemArt>(() => editingItem?.art ?? startArt('accessory'));
  const [name, setName] = useState(editingItem?.name ?? '');
  const [description, setDescription] = useState(editingItem?.description ?? '');
  const [rarity, setRarity] = useState<Rarity>(editingItem?.rarity ?? 'uncommon');
  const kind = art.kind as CosmeticKind;
  const draft = { kind, name: name.trim(), description: description.trim(), rarity, art };
  const errors = problems(draft);
  const clash = useClash(draft, editingItem?.id ?? null);
  const save = useSaveDraft(editingItem, onDone);
  const ready = Object.keys(errors).length === 0 && !clash;
  const patch = (p: Partial<ItemArt>) => setArt((a) => ({ ...a, ...p }) as ItemArt);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-3">
        <div className="stage grid min-h-60 place-items-center rounded-[var(--radius-l)] p-4">
          <ItemArtView art={art} rarity={rarity} size={180} />
        </div>
        {errors.art ? <p className="text-sm font-bold text-ember">{errors.art}</p> : null}
        {clash ? <p className="text-sm font-bold text-ember">{clash}</p> : null}
      </div>
      <Panel className="flex flex-col gap-4 p-4">
        <Choice label="What are you making?" value={kind} options={['accessory', 'frame', 'banner', 'title'] as const} onChange={(k) => setArt(startArt(k))} />
        <DetailsFields kind={kind} name={name} setName={setName} description={description} setDescription={setDescription} rarity={rarity} setRarity={setRarity} errors={errors} clash={clash} />
        {art.kind === 'accessory' ? (
          <div className="grid grid-cols-2 gap-3">
            <Choice label="Worn on" value={art.slot} options={ACCESSORY_SLOTS} onChange={(slot) => patch({ slot, shape: ACCESSORY_SHAPES[slot][0] } as Partial<ItemArt>)} />
            <Choice label="Shape" value={art.shape as (typeof ACCESSORY_SHAPES)[typeof art.slot][number]} options={ACCESSORY_SHAPES[art.slot]} onChange={(shape) => patch({ shape } as Partial<ItemArt>)} />
          </div>
        ) : art.kind === 'frame' ? (
          <Choice label="Frame style" value={art.style} options={FRAME_STYLES} onChange={(style) => patch({ style } as Partial<ItemArt>)} />
        ) : art.kind === 'banner' ? (
          <Choice label="Banner pattern" value={art.pattern} options={BANNER_PATTERNS} onChange={(pattern) => patch({ pattern } as Partial<ItemArt>)} />
        ) : art.kind === 'title' ? (
          <Field label="Title text" hint="Shown under the player's name. At most 32 characters." error={errors.art}>
            {(p) => <Input value={art.text} maxLength={32} onChange={(e) => patch({ text: e.target.value } as Partial<ItemArt>)} {...p} />}
          </Field>
        ) : null}
        {'hue' in art ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <HueSlider label="Colour" value={art.hue} onChange={(hue) => patch({ hue } as Partial<ItemArt>)} />
            <HueSlider label="Second colour" value={'accentHue' in art && art.accentHue !== undefined ? art.accentHue : 40} onChange={(accentHue) => patch({ accentHue } as Partial<ItemArt>)} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" disabled={!ready || save.isPending} onClick={() => save.mutate(draft)}>
            {editingItem ? 'Save changes' : 'Save draft'}
          </Button>
          {editingItem ? (
            <Button variant="ghost" size="lg" onClick={onDone}>
              Stop editing
            </Button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

/* -------------------------------- Lantern maker ------------------------------ */

function oddsFor(rarities: Rarity[]): { rarity: Rarity; percent: number }[] {
  const present = [...new Set(rarities)].filter((r) => (STANDARD_WEIGHTS[r] ?? 0) > 0);
  const total = present.reduce((n, r) => n + (STANDARD_WEIGHTS[r] ?? 0), 0);
  return present
    .sort((a, b) => RARITY_INFO[a].rank - RARITY_INFO[b].rank)
    .map((r) => ({ rarity: r, percent: total ? ((STANDARD_WEIGHTS[r] ?? 0) / total) * 100 : 0 }));
}

function LanternMaker({ drafts, canPublish, onDone }: { drafts: Draft[]; canPublish: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const glims = drafts.filter((d) => d.kind === 'glim' && d.status === 'draft' && d.mine);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [art, setArt] = useState<LanternArt>({ hue: 260, accentHue: 45, pattern: 'stars' });
  const [chosen, setChosen] = useState<string[]>([]);
  const [price, setPrice] = useState(150);
  const [startsAt, setStartsAt] = useState(() => isoToLocalInput(new Date(Date.now() + 3_600_000).toISOString()));
  const [endsAt, setEndsAt] = useState(() => isoToLocalInput(new Date(Date.now() + 30 * 86_400_000).toISOString()));
  const [confirm, setConfirm] = useState(false);
  const picked = glims.filter((g) => chosen.includes(g.id));
  const odds = oddsFor(picked.map((g) => g.rarity));
  const startIso = localInputToIso(startsAt);
  const endIso = localInputToIso(endsAt);
  const problem =
    name.trim().length < 2 ? 'Give the Lantern a name.' : description.trim().length < 10 ? 'Write a line about it.' : picked.length < 3 ? 'Pick at least 3 of your Glim drafts.' : !startIso || !endIso ? 'Pick both dates.' : startIso >= endIso ? 'The end has to come after the start.' : null;

  const publish = useMutation({
    mutationFn: (reason: string) => api.post('/api/studio/lanterns', { name: name.trim(), description: description.trim(), ...art, draftIds: chosen, priceAmount: price, startsAt: startIso, endsAt: endIso, reason }),
    onSuccess: async () => {
      toast.success(`${name.trim()} Lantern is scheduled. It shows in the shop between its dates.`);
      await qc.invalidateQueries({ queryKey: studioKey });
      setConfirm(false);
      onDone();
    },
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-3">
        <div className="stage grid min-h-60 place-items-center rounded-[var(--radius-l)] p-4">
          <Lantern art={art} size={170} lit title={`${name || 'Your'} Lantern`} />
        </div>
        <Panel className="p-4">
          <h3 className="mb-2 font-bold">Odds players will see</h3>
          {odds.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {odds.map((o) => (
                <li key={o.rarity} className="flex justify-between">
                  <RarityBadge rarity={o.rarity} />
                  <span className="font-display font-bold tabular">{o.percent.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-2">Pick Glims to see the odds. They come from the standard table, rescaled to the rarities inside.</p>
          )}
          {picked.some((g) => g.rarity === 'epic' || g.rarity === 'legendary') ? <p className="mt-2 text-xs text-text-3">Epic or better guaranteed within 15 opens.</p> : null}
        </Panel>
      </div>
      <Panel className="flex flex-col gap-4 p-4">
        <Field label="Theme name" hint="The collection is called “Name Glims” and the Lantern “Name Lantern”. At most 20 characters.">
          {(p) => <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} {...p} />}
        </Field>
        <Field label="Description" hint="One line for the collection book, at most 120 characters.">
          {(p) => <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={120} {...p} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <HueSlider label="Colour" value={art.hue} onChange={(hue) => setArt((a) => ({ ...a, hue }))} />
          <HueSlider label="Second colour" value={art.accentHue} onChange={(accentHue) => setArt((a) => ({ ...a, accentHue }))} />
          <Choice label="Paper pattern" value={art.pattern} options={LANTERN_PATTERNS} onChange={(pattern) => setArt((a) => ({ ...a, pattern }))} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Glims inside ({picked.length} of 3 to 14)</legend>
          {glims.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {glims.map((g) => {
                const on = chosen.includes(g.id);
                return (
                  <li key={g.id}>
                    <label className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-m)] border-2 p-2 ${on ? 'border-lantern bg-lantern/10' : 'border-line'}`}>
                      <input type="checkbox" checked={on} onChange={() => setChosen((c) => (on ? c.filter((x) => x !== g.id) : c.length < 14 ? [...c, g.id] : c))} className="size-4" />
                      <Glim art={g.art as GlimArt} size={44} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{g.name}</span>
                        <span className="text-xs text-text-2">{RARITY_INFO[g.rarity].label}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-text-2">Make some Glims first: a Lantern is filled from your unpublished Glim drafts.</p>
          )}
        </fieldset>
        <Field label={`Price: ${price} Sparks`} hint="Lanterns cost 100 to 400 Sparks.">
          {(p) => <input type="range" min={100} max={400} step={10} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="h-11 w-full accent-[var(--lantern)]" {...p} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <DateTimeField label="On sale from" value={startsAt} onChange={setStartsAt} />
          <DateTimeField label="Leaves the shop" value={endsAt} onChange={setEndsAt} hint="Two months at most." />
        </div>
        {problem ? <p className="text-sm text-text-2">{problem}</p> : null}
        <Button variant="primary" size="lg" disabled={Boolean(problem) || !canPublish} onClick={() => setConfirm(true)} icon={<Store className="size-5" aria-hidden />}>
          Schedule the Lantern
        </Button>
        {!canPublish ? <p className="text-sm text-text-2">Your role can make drafts but not publish them.</p> : null}
      </Panel>
      <ActionDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Schedule ${name.trim()} Lantern`}
        description={`${picked.length} Glims are published into their own collection, sold only in this Lantern for ${price} Sparks, from ${startIso ? new Date(startIso).toLocaleString() : '?'} until ${endIso ? new Date(endIso).toLocaleString() : '?'}. Published Glims cannot be edited here afterwards.`}
        confirmLabel="Schedule it"
        onSubmit={async ({ reason }) => {
          await publish.mutateAsync(reason);
        }}
      />
    </div>
  );
}

/* ----------------------------------- drafts ---------------------------------- */

function DraftArt({ d, size = 96 }: { d: Draft; size?: number }) {
  return d.kind === 'glim' ? <Glim art={d.art as GlimArt} size={size} rarity={d.rarity} /> : <ItemArtView art={d.art} rarity={d.rarity} size={size} />;
}

function PublishDialog({ draft, open, onOpenChange }: { draft: Draft; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const band = STUDIO_PRICES[draft.rarity as keyof typeof STUDIO_PRICES];
  const [list, setList] = useState(true);
  const [price, setPrice] = useState(band ? Math.round((band.min + band.max) / 4 / 10) * 10 : 100);
  const [until, setUntil] = useState('');
  const priceOk = !band || (price >= band.min && price <= band.max);
  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Publish ${draft.name}`}
      description={draft.kind === 'glim' ? 'It joins the Studio Glims collection in every player’s book.' : 'It becomes a real item players can own.'}
      confirmLabel={list ? 'Publish and put in the shop' : 'Publish'}
      disabled={list && !priceOk}
      onSubmit={async ({ reason }) => {
        const untilIso = localInputToIso(until);
        await api.post(`/api/studio/drafts/${draft.id}/publish`, { reason, listing: list ? { priceAmount: price, startsAt: null, endsAt: untilIso } : null });
        toast.success(list ? `${draft.name} is in the shop.` : `${draft.name} is published.`);
        await qc.invalidateQueries({ queryKey: studioKey });
        onOpenChange(false);
      }}
    >
      <div className="flex flex-col gap-3">
        <Switch checked={list} onCheckedChange={setList} label="Put it in the shop" description="Sold for Sparks, one per player." />
        {list ? (
          <>
            <Field label="Price in Sparks" hint={band ? `${RARITY_INFO[draft.rarity].label}: ${band.min} to ${band.max} Sparks.` : undefined} error={priceOk ? undefined : 'Outside the range for its rarity.'}>
              {(p) => <Input type="number" value={price} min={band?.min} max={band?.max} onChange={(e) => setPrice(Number(e.target.value))} {...p} />}
            </Field>
            <DateTimeField label="Leaves the shop (optional)" value={until} onChange={setUntil} clearable hint="Leave empty to keep it on sale." />
          </>
        ) : null}
      </div>
    </ActionDialog>
  );
}

function DraftCard({ d, canPublish, onEdit }: { d: Draft; canPublish: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/studio/drafts/${d.id}`),
    onSuccess: async () => {
      toast.success('Draft deleted');
      setDeleting(false);
      await qc.invalidateQueries({ queryKey: studioKey });
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-3">
      <div className="stage grid place-items-center rounded-[var(--radius-m)] py-2">
        <DraftArt d={d} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold">{d.name}</p>
        <p className="text-xs text-text-2">
          {label(d.kind)} · {RARITY_INFO[d.rarity].label} · {d.mine ? 'yours' : `by ${d.owner?.name ?? 'a designer'}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {d.status === 'published' ? <Badge tone="mint">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
        {d.status === 'draft' && d.mine ? (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit} icon={<Pencil className="size-4" aria-hidden />}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(true)} icon={<Trash2 className="size-4" aria-hidden />} aria-label={`Delete ${d.name}`} />
            {canPublish ? (
              <Button size="sm" variant="primary" onClick={() => setPublishing(true)}>
                Publish
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {publishing ? <PublishDialog draft={d} open={publishing} onOpenChange={setPublishing} /> : null}
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${d.name}?`}
        description="The draft goes for good. Nothing published is affected."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </div>
        }
      />
    </li>
  );
}

/* ------------------------------------ page ----------------------------------- */

const TABS = [
  { value: 'glim', label: 'Glim Maker' },
  { value: 'item', label: 'Items' },
  { value: 'lantern', label: 'Lanterns' },
  { value: 'drafts', label: 'Drafts' },
];

export default function Studio() {
  const me = useMe();
  const can = useCan('studio.use');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'glim';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  const [editing, setEditing] = useState<Draft | null>(null);
  const q = useQuery({ queryKey: studioKey, queryFn: () => api.get<StudioData>('/api/studio'), enabled: can });
  useEffect(() => {
    document.title = 'Creator Studio | Ludora';
  }, []);
  const drafts = useMemo(() => q.data?.drafts ?? [], [q.data]);

  if (me.isLoading) return <Spinner />;
  if (!can) return <NotFound />;

  const done = () => {
    setEditing(null);
    setTab('drafts');
  };
  let body: ReactNode;
  if (tab === 'glim') body = <GlimMaker key={editing?.id ?? 'new-glim'} editing={editing?.kind === 'glim' ? editing : null} onDone={done} />;
  else if (tab === 'item') body = <ItemMaker key={editing?.id ?? 'new-item'} editing={editing && editing.kind !== 'glim' ? editing : null} onDone={done} />;
  else if (tab === 'lantern') body = q.data ? <LanternMaker drafts={drafts} canPublish={q.data.canPublish} onDone={done} /> : <Skeleton className="h-96" />;
  else
    body = q.isError ? (
      <ErrorNotice message="Your drafts did not load." onRetry={() => void q.refetch()} />
    ) : !q.data ? (
      <Skeleton className="h-96" />
    ) : !drafts.length ? (
      <EmptyState title="No drafts yet">Make a Glim or an item and save it. Drafts are shared with the other designers.</EmptyState>
    ) : (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            d={d}
            canPublish={q.data!.canPublish}
            onEdit={() => {
              setEditing(d);
              setTab(d.kind === 'glim' ? 'glim' : 'item');
            }}
          />
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader title="Creator Studio" description="Make Glims, items and limited Lanterns for the shop. Everything is built from Ludora’s own shapes and colours, so it fits right in." />
      <Tabs value={tab} onValueChange={(t) => setTab(t)} items={TABS.map((t) => (t.value === 'drafts' ? { ...t, count: drafts.filter((d) => d.status === 'draft').length } : t))} label="Studio sections" />
      <div className="mt-5">{body}</div>
    </>
  );
}
