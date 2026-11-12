import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Columns2, Copy, Dices, EyeOff, Pencil, Plus, Redo2, Shirt, Ticket, Trash2, Undo2, X } from 'lucide-react';
import {
  DESIGN_STYLES,
  designInputSchema,
  encodeDesign,
  randomAccessoryArt,
  randomDesignArt,
  type AccessoryArt,
  type DesignKind,
  type DesignStyle,
  type GlimArt,
} from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useCan, useMe } from '../../lib/session.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Spinner, TabPanel, Tabs, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog } from '../admin/ui.tsx';
import { fallbackArt } from '../room/game/stage.tsx';
import { useHistory } from './history.ts';
import { GlimControls, ItemControls, label } from './GlimControls.tsx';
import { TryOn } from './TryOn.tsx';
import { AiHelper } from '../ai/AiHelper.tsx';

const GlimTurntable = lazy(() => import('../studio/GlimTurntable.tsx').then((m) => ({ default: m.GlimTurntable })));

/*
 * My designs: every account designs Glims and items for itself to wear. Personal and free (not
 * sold, not traded, no rarity, not in the collection book); a few slots to start and more with
 * level. The server checks everything; this page explains problems before you save.
 */

export interface Design {
  id: string;
  kind: DesignKind;
  name: string;
  art: GlimArt | AccessoryArt;
  worn: boolean;
  hidden: { reason: string } | null;
  updatedAt: string;
}

interface DesignsData {
  designs: Design[];
  slots: { used: number; max: number; nextAt: number | null; level: number };
  owned: { id: string; name: string; art: GlimArt }[];
}

export const designsKey = ['designs'] as const;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not work. Try again.');

type Draft = { kind: 'glim'; art: GlimArt } | { kind: 'accessory'; art: AccessoryArt };

function useDesigns(enabled = true) {
  return useQuery({ queryKey: designsKey, queryFn: () => api.get<DesignsData>('/api/designs'), enabled });
}

/** The Glim my items are shown on: the Glim design I wear, else a Glim I own, else a stand-in. */
function modelGlim(data: DesignsData | undefined): GlimArt {
  const worn = data?.designs.find((d) => d.worn && d.kind === 'glim');
  return (worn?.art as GlimArt | undefined) ?? data?.owned[0]?.art ?? fallbackArt('model');
}

function wornItems(data: DesignsData | undefined, except?: string): AccessoryArt[] {
  return (data?.designs ?? []).filter((d) => d.worn && d.kind === 'accessory' && d.id !== except).map((d) => d.art as AccessoryArt);
}

/** The first problem the shared schema finds, so the form can say what is wrong before sending. */
function problemOf(input: unknown): Record<string, string> {
  const r = designInputSchema.safeParse(input);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0] ?? 'form')] ??= i.message;
  return out;
}

/** Asks the server (after a pause) whether the design would be accepted: today, whether it copies a catalogue item. */
function useServerCheck(input: unknown, valid: boolean) {
  const [problem, setProblem] = useState<string | null>(null);
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!valid) {
      setProblem(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .post<{ ok: boolean; problem: string | null }>('/api/designs/check', input)
        .then((r) => setProblem(r.problem))
        .catch(() => setProblem(null));
    }, 500);
    return () => clearTimeout(t);
    // The key stands for the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid]);
  return problem;
}

/* --------------------------------- the editor -------------------------------- */

function Editor({ editing, startKind, data, onDone }: { editing: Design | null; startKind: DesignKind; data: DesignsData; onDone: () => void }) {
  const qc = useQueryClient();
  const initial: Draft = editing ? ({ kind: editing.kind, art: editing.art } as Draft) : startKind === 'glim' ? { kind: 'glim', art: randomDesignArt(Date.now()) } : { kind: 'accessory', art: { ...randomAccessoryArt(Date.now(), 'hat'), shape: 'beanie' } };
  const h = useHistory<Draft>(initial);
  const draft = h.value;
  const [name, setName] = useState(editing?.name ?? '');
  const [style, setStyle] = useState<DesignStyle>('any');
  const [pinned, setPinned] = useState<Draft | null>(null);
  const [tryOn, setTryOn] = useState(false);
  const [wish, setWish] = useState('');
  const input = { kind: draft.kind, name, art: draft.art };
  const problems = problemOf(input);
  const artOk = !problems.art;
  const serverProblem = useServerCheck({ ...input, name: name.trim().length >= 2 ? name : 'Check' }, artOk && designInputSchema.safeParse({ ...input, name: 'Check' }).success);
  const ready = Object.keys(problems).length === 0 && !serverProblem;

  // Ctrl or Cmd with Z undoes; with Shift (or Y) redoes. Not while typing in a text box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text' || t.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) h.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') h.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h]);

  const save = useMutation({
    mutationFn: () => (editing ? api.patch(`/api/designs/${editing.id}`, input) : api.post('/api/designs', input)),
    onSuccess: async () => {
      toast.success(editing ? `${name.trim()} is saved.` : `${name.trim()} is saved to My designs.`);
      await qc.invalidateQueries({ queryKey: designsKey });
      onDone();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const glimArt = draft.kind === 'glim' ? draft.art : modelGlim(data);
  const items = draft.kind === 'accessory' ? [...wornItems(data, editing?.id).filter((a) => a.slot !== (draft.art as AccessoryArt).slot), draft.art] : wornItems(data);
  const pinnedGlim = pinned ? (pinned.kind === 'glim' ? pinned.art : glimArt) : null;
  const pinnedItems = pinned && pinned.kind === 'accessory' ? [...items.filter((a) => a.slot !== pinned.art.slot), pinned.art] : items;
  const title = name.trim() || (draft.kind === 'glim' ? 'Your Glim' : 'Your item');

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <div className={`stage grid items-center gap-2 overflow-hidden rounded-[var(--radius-l)] p-3 ${pinned ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {pinned ? (
            <>
              <figure className="grid place-items-center gap-1">
                <Glim art={pinnedGlim!} accessories={pinnedItems} size={170} uniform={false} title={`${title}, version A`} />
                <figcaption className="text-sm font-bold">Version A</figcaption>
              </figure>
              <figure className="grid place-items-center gap-1">
                <Glim art={glimArt} accessories={items} size={170} uniform={false} title={`${title}, now`} />
                <figcaption className="text-sm font-bold">Now</figcaption>
              </figure>
            </>
          ) : (
            <>
              <div className="grid place-items-center">
                <Glim art={glimArt} accessories={items} size={200} uniform={false} title={title} />
              </div>
              <Suspense fallback={<Skeleton className="h-56" />}>
                <GlimTurntable art={glimArt} accessories={items} className="h-56 rounded-[var(--radius-m)]" />
              </Suspense>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Design tools">
          <Button size="sm" variant="secondary" disabled={!h.canUndo} onClick={h.undo} icon={<Undo2 className="size-4" aria-hidden />} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button size="sm" variant="secondary" disabled={!h.canRedo} onClick={h.redo} icon={<Redo2 className="size-4" aria-hidden />} title="Redo (Ctrl+Shift+Z)">
            Redo
          </Button>
          {pinned ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => (h.set(pinned), setPinned(null))}>
                Go back to version A
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPinned(null)} icon={<X className="size-4" aria-hidden />}>
                Stop comparing
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setPinned(draft)} icon={<Columns2 className="size-4" aria-hidden />}>
              Compare with this version
            </Button>
          )}
          <Button size="sm" variant={tryOn ? 'primary' : 'secondary'} aria-pressed={tryOn} onClick={() => setTryOn((v) => !v)} icon={<Shirt className="size-4" aria-hidden />}>
            Try it on
          </Button>
        </div>
        {draft.kind === 'glim' ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <Field label="Style">
                {(p) => (
                  <Select value={style} onChange={(e) => setStyle(e.target.value as DesignStyle)} {...p}>
                    {(Object.keys(DESIGN_STYLES) as DesignStyle[]).map((s) => (
                      <option key={s} value={s}>
                        {DESIGN_STYLES[s].label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Button variant="secondary" onClick={() => h.set({ kind: 'glim', art: randomDesignArt(`${Date.now()}${Math.random()}`, style) })} icon={<Dices className="size-4" aria-hidden />}>
              Randomise
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="self-start" onClick={() => h.set({ kind: 'accessory', art: randomAccessoryArt(`${Date.now()}${Math.random()}`, (draft.art as AccessoryArt).slot) })} icon={<Dices className="size-4" aria-hidden />}>
            Randomise
          </Button>
        )}
        {draft.kind === 'glim' ? (
          <AiHelper<{ art: GlimArt; name: string | null }>
            task="glim.describe"
            label="Describe a Glim"
            title="Describe the Glim you want"
            input={() => ({ description: wish.trim() })}
            ready={wish.trim().length >= 3 ? true : 'Say what your Glim should look like.'}
            fields={
              <Field label="What should it look like?" hint="For example: a sleepy mushroom with a leaf on top and boots.">
                {(p) => <Textarea value={wish} onChange={(e) => setWish(e.target.value)} rows={2} maxLength={300} {...p} />}
              </Field>
            }
            current={<Glim art={draft.art} size={96} uniform={false} title="Your Glim now" />}
            renderSuggestion={(o) => (
              <span className="flex items-center gap-3">
                <Glim art={o.art} size={96} uniform={false} title={o.name ?? 'Suggested Glim'} />
                {o.name ? <span className="font-bold">{o.name}</span> : null}
              </span>
            )}
            acceptLabel="Use this design"
            onAccept={(o) => {
              h.set({ kind: 'glim', art: o.art });
              if (o.name && !name.trim()) setName(o.name);
            }}
          />
        ) : null}
        {draft.kind === 'glim' && data.owned.length ? (
          <Field label="Start from a Glim you own" hint="Then change it to make it your own: a straight copy of a shop Glim cannot be saved.">
            {(p) => (
              <Select
                value=""
                onChange={(e) => {
                  const g = data.owned.find((o) => o.id === e.target.value);
                  if (g) h.set({ kind: 'glim', art: g.art });
                }}
                {...p}
              >
                <option value="">Pick a Glim</option>
                {data.owned.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {tryOn ? <TryOn art={glimArt} accessories={items} name={name.trim()} /> : null}
      </div>
      <Panel className="flex min-w-0 flex-col gap-4 p-4">
        {/* On a phone the big preview scrolls away: a small one stays in view while you change things. */}
        <div className="stage sticky top-16 z-10 -mx-2 flex items-center gap-3 rounded-[var(--radius-m)] p-1.5 lg:hidden" aria-hidden>
          <Glim art={glimArt} accessories={items} size={72} uniform={false} />
          <span className="truncate text-sm font-bold">{title}</span>
        </div>
        <Field label="Name" hint="Others can see it on your profile. Up to 24 characters." error={name ? problems.name : undefined}>
          {(p) => <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="off" {...p} />}
        </Field>
        {draft.kind === 'glim' ? (
          <GlimControls art={draft.art} onChange={(art, group) => h.set({ kind: 'glim', art }, group)} onCommit={h.endGroup} />
        ) : (
          <ItemControls art={draft.art} onChange={(art, group) => h.set({ kind: 'accessory', art }, group)} onCommit={h.endGroup} />
        )}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 border-t border-line bg-raised p-4">
          <p role="status" aria-live="polite" className="text-sm font-bold text-ember empty:hidden">
            {problems.art ?? serverProblem ?? ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>
              {editing ? 'Save changes' : 'Save design'}
            </Button>
            <Button variant="ghost" size="lg" onClick={onDone}>
              {editing ? 'Stop editing' : 'Cancel'}
            </Button>
          </div>
          {!name.trim() ? <p className="text-sm text-text-2">Give it a name to save it.</p> : null}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------- my designs list ------------------------------ */

function DesignArt({ d, data, size = 96 }: { d: Design; data: DesignsData; size?: number }) {
  return d.kind === 'glim' ? <Glim art={d.art as GlimArt} size={size} uniform={false} title={d.name} /> : <Glim art={modelGlim(data)} accessories={[d.art as AccessoryArt]} size={size} uniform={false} title={d.name} />;
}

function CodeDialog({ d, open, onOpenChange }: { d: Design; open: boolean; onOpenChange: (v: boolean) => void }) {
  const code = useMemo(() => encodeDesign(d.kind, d.art), [d]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Design code copied.');
    } catch {
      toast.error('Could not copy. Select the code and copy it yourself.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Design code for ${d.name}`} description="Give this code to a friend, or use it on another account. It carries the look only, not the name." size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void copy()} icon={<Copy className="size-4" aria-hidden />}>
            Copy code
          </Button>
        </div>
      }
    >
      <Field label="Design code">{(p) => <Textarea readOnly value={code} rows={3} className="font-mono text-sm break-all" onFocus={(e) => e.currentTarget.select()} {...p} />}</Field>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const go = useMutation({
    mutationFn: () => api.post('/api/designs/import', { code: code.trim(), name }),
    onSuccess: async () => {
      toast.success(`${name.trim()} is saved to My designs.`);
      await qc.invalidateQueries({ queryKey: designsKey });
      setCode('');
      setName('');
      onOpenChange(false);
    },
  });
  const fields = go.error instanceof ApiError ? go.error.fields : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Use a design code" description="Paste a code from a friend or another account. It becomes a design of your own and takes a slot." size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!code.trim() || name.trim().length < 2} loading={go.isPending} onClick={() => go.mutate()}>
            Add to my designs
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Design code" error={fields?.code}>{(p) => <Textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} className="font-mono text-sm" spellCheck={false} {...p} />}</Field>
        <Field label="Name for it" hint="Up to 24 characters." error={fields?.name}>{(p) => <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} {...p} />}</Field>
        {go.error && !fields?.code && !fields?.name ? (
          <p role="alert" className="text-sm font-bold text-ember">
            {errText(go.error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function DesignCard({ d, data, onEdit }: { d: Design; data: DesignsData; onEdit: () => void }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: designsKey });
  const act = useMutation({
    mutationFn: (what: 'wear' | 'unwear' | 'duplicate' | 'delete') =>
      what === 'wear' ? api.post(`/api/designs/${d.id}/wear`, {}) : what === 'unwear' ? api.post('/api/designs/unwear', { slot: d.kind === 'glim' ? 'buddy' : (d.art as AccessoryArt).slot }) : what === 'duplicate' ? api.post(`/api/designs/${d.id}/duplicate`, {}) : api.delete(`/api/designs/${d.id}`),
    onSuccess: async (_r, what) => {
      toast.success(what === 'wear' ? `You are wearing ${d.name}. Others see it in lobbies and on your profile.` : what === 'unwear' ? `${d.name} is off.` : what === 'duplicate' ? `A copy of ${d.name} is in My designs.` : `${d.name} is deleted.`);
      setDeleting(false);
      await refresh();
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-3">
      <div className="stage grid place-items-center rounded-[var(--radius-m)] py-2">
        <DesignArt d={d} data={data} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold">{d.name}</p>
        <p className="text-xs text-text-2">{d.kind === 'glim' ? 'Glim' : label((d.art as AccessoryArt).shape)}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {d.worn ? <Badge tone="mint">Wearing</Badge> : null}
        {d.hidden ? (
          <Badge tone="coral">
            <EyeOff className="mr-1 inline size-3.5" aria-hidden />
            Hidden by staff
          </Badge>
        ) : null}
      </div>
      {d.hidden ? <p className="text-xs text-text-2">Reason: {d.hidden.reason}. You can delete it.</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {!d.hidden ? (
          d.worn ? (
            <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate('unwear')}>
              Take off
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={act.isPending} onClick={() => act.mutate('wear')} aria-label={`Wear ${d.name}`}>
              Wear
            </Button>
          )
        ) : null}
        {!d.hidden ? (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit} icon={<Pencil className="size-4" aria-hidden />} aria-label={`Edit ${d.name}`} />
            <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate('duplicate')} icon={<Copy className="size-4" aria-hidden />} aria-label={`Duplicate ${d.name}`} />
            <Button size="sm" variant="ghost" onClick={() => setShowCode(true)} icon={<Ticket className="size-4" aria-hidden />} aria-label={`Design code for ${d.name}`} />
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setDeleting(true)} icon={<Trash2 className="size-4" aria-hidden />} aria-label={`Delete ${d.name}`} />
      </div>
      {showCode ? <CodeDialog d={d} open={showCode} onOpenChange={setShowCode} /> : null}
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${d.name}?`}
        description="It goes for good and frees a slot."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={act.isPending} onClick={() => act.mutate('delete')}>
              Delete
            </Button>
          </div>
        }
      />
    </li>
  );
}

/* --------------------------------- staff review ------------------------------- */

interface StaffDesign {
  id: string;
  kind: DesignKind;
  name: string;
  art: GlimArt | AccessoryArt;
  owner: { id: string; name: string; username: string | null };
  reports: number;
  hidden: { reason: string | null; at: string } | null;
}

function StaffReview() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'reported' | 'hidden' | 'recent'>('reported');
  const [acting, setActing] = useState<StaffDesign | null>(null);
  const q = useQuery({ queryKey: ['staff-designs', filter], queryFn: () => api.get<{ designs: StaffDesign[] }>(`/api/staff/designs?filter=${filter}`) });
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-xs">
        <Field label="Show">
          {(p) => (
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} {...p}>
              <option value="reported">Reported</option>
              <option value="hidden">Hidden</option>
              <option value="recent">Newest</option>
            </Select>
          )}
        </Field>
      </div>
      {q.isError ? (
        <ErrorNotice message="Designs did not load." onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40" />
      ) : !q.data.designs.length ? (
        <EmptyState title="Nothing here">No designs match.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {q.data.designs.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-3">
              <div className="stage grid place-items-center rounded-[var(--radius-m)] py-2">
                {d.kind === 'glim' ? <Glim art={d.art as GlimArt} size={88} uniform={false} title={d.name} /> : <Glim art={fallbackArt(d.id)} accessories={[d.art as AccessoryArt]} size={88} uniform={false} title={d.name} />}
              </div>
              <p className="truncate font-bold">{d.name}</p>
              <p className="truncate text-xs text-text-2">
                by {d.owner.name} · {d.reports} open {d.reports === 1 ? 'report' : 'reports'}
              </p>
              {d.hidden ? <p className="text-xs text-text-2">Hidden: {d.hidden.reason}</p> : null}
              <Button size="sm" variant={d.hidden ? 'secondary' : 'danger'} onClick={() => setActing(d)}>
                {d.hidden ? 'Show again' : 'Hide'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {acting ? (
        <ActionDialog
          open={Boolean(acting)}
          onOpenChange={(v) => !v && setActing(null)}
          title={acting.hidden ? `Show ${acting.name} again?` : `Hide ${acting.name}?`}
          description={acting.hidden ? 'Its owner can wear it again.' : 'It comes off whoever wears it, nobody else sees it, and its open reports are closed.'}
          confirmLabel={acting.hidden ? 'Show again' : 'Hide design'}
          variant={acting.hidden ? 'primary' : 'danger'}
          onSubmit={async ({ reason }) => {
            await api.post(`/api/staff/designs/${acting.id}/visibility`, { action: acting.hidden ? 'unhide' : 'hide', reason });
            toast.success(acting.hidden ? 'Design shown again.' : 'Design hidden.');
            await qc.invalidateQueries({ queryKey: ['staff-designs'] });
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------ page ----------------------------------- */

export default function DesignStudio() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const canModerate = useCan('content.moderate');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'mine';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  const [editing, setEditing] = useState<{ design: Design | null; kind: DesignKind } | null>(null);
  const [importing, setImporting] = useState(false);
  const q = useDesigns(signedIn);
  useEffect(() => {
    document.title = 'My designs | Ludora';
  }, []);

  if (me.isLoading) return <Spinner />;
  if (!signedIn) {
    return (
      <>
        <PageHeader title="My designs" description="Design your own Glim and things for it to wear." />
        <EmptyState title="Sign in to design">Play as a guest or sign in, then come back here to make your own Glim.</EmptyState>
      </>
    );
  }

  const data = q.data;
  const full = data ? data.slots.used >= data.slots.max : true;
  let body: ReactNode;
  if (q.isError) body = <ErrorNotice message="Your designs did not load." onRetry={() => void q.refetch()} />;
  else if (!data) body = <Skeleton className="h-96" />;
  else if (editing) body = <Editor key={editing.design?.id ?? `new-${editing.kind}`} editing={editing.design} startKind={editing.kind} data={data} onDone={() => setEditing(null)} />;
  else
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={full} onClick={() => setEditing({ design: null, kind: 'glim' })} icon={<Plus className="size-4" aria-hidden />}>
            New Glim
          </Button>
          <Button variant="secondary" disabled={full} onClick={() => setEditing({ design: null, kind: 'accessory' })} icon={<Plus className="size-4" aria-hidden />}>
            New item
          </Button>
          <Button variant="ghost" disabled={full} onClick={() => setImporting(true)} icon={<Ticket className="size-4" aria-hidden />}>
            Use a design code
          </Button>
          <p className="text-sm text-text-2" aria-live="polite">
            {data.slots.used} of {data.slots.max} slots used.{' '}
            {full ? (data.slots.nextAt ? `Delete one, or reach level ${data.slots.nextAt} for another.` : 'Delete one to make another.') : data.slots.nextAt ? `Another slot opens at level ${data.slots.nextAt}.` : ''}
          </p>
        </div>
        {data.designs.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.designs.map((d) => (
              <DesignCard key={d.id} d={d} data={data} onEdit={() => setEditing({ design: d, kind: d.kind })} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No designs yet">Make a Glim of your own, or a hat with your own emblem, and wear it in every game.</EmptyState>
        )}
        <ImportDialog open={importing} onOpenChange={setImporting} />
      </div>
    );

  return (
    <>
      <PageHeader title="My designs" description="Design your own Glim and things for it to wear. They are yours alone: free, not sold or traded, and they show wherever your Glim does." />
      {canModerate ? (
        <Tabs value={tab} onValueChange={setTab} items={[{ value: 'mine', label: 'My designs' }, { value: 'review', label: 'Review designs' }]} label="Design sections">
          <TabPanel value={tab}>{tab === 'review' ? <StaffReview /> : body}</TabPanel>
        </Tabs>
      ) : (
        body
      )}
    </>
  );
}
