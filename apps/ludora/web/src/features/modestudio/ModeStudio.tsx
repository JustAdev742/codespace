import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Copy, EyeOff, Flag, Link2, Play, Presentation, Save, TriangleAlert, Undo2, Users } from 'lucide-react';
import { actsOnOthers, blankBlueprint, describeBlueprint, fromCode, GAME_VISIBILITIES, mergeCode, parseBlueprint, STARTER_BLUEPRINTS, toCode, type Blueprint, type GameVisibility } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { Dialog, ErrorNotice, Field, Input, PageHeader, Select, Skeleton, Textarea } from '../../ui/primitives.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor.tsx';
import { CodeHelp } from './CodeHelp.tsx';
import { ReportDialog } from '../moderation/ReportDialog.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Builder } from './Builder.tsx';
import { LiveTest } from './LiveTest.tsx';
import { hostLink, studioLink, VISIBILITY_WORDS, type MadeGameFull } from './data.ts';
import { StudioAiHelper } from './StudioAi.tsx';

/*
 * The Game Maker builder. The game's code comes first, with the live test against bots under it
 * (the real interpreter, restarted with every change that works); the forms sit beside it on a
 * laptop and behind a tab on a phone. Code and forms are two views of one blueprint: typing code
 * updates the forms, the rules in words and the test; changing a form rewrites the code, keeping
 * the person's notes and line order. Undo covers both. Then Play solo, Host, Share by link, or
 * Copy to change someone else's game.
 */

const MAX_UNDO = 60;

/** Moves focus to the control a problem belongs to. */
function focusProblem(path: string) {
  const parts = path.split('.');
  for (let n = parts.length; n > 0; n--) {
    const id = `f-${parts.slice(0, n).join('.')}`;
    const el = document.getElementById(id) ?? (parts[0] === 'kind' && n === 2 ? document.getElementById('f-kind.size') : null);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'center' });
      return;
    }
  }
}

export default function ModeStudio() {
  const { id = 'new' } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'new';
  const saved = useQuery({ queryKey: ['blueprint', id], queryFn: () => api.get<{ game: MadeGameFull }>(`/api/blueprints/${id}`), enabled: !isNew });
  const start = useMemo<Blueprint | null>(() => {
    if (!isNew) return saved.data ? saved.data.game.blueprint : null;
    const from = STARTER_BLUEPRINTS.find((s) => s.id === params.get('from'));
    return structuredClone(from?.blueprint ?? blankBlueprint());
  }, [isNew, params, saved.data]);
  if (!isNew && saved.isError) {
    return (
      <>
        <PageHeader title="Game Maker" />
        <ErrorNotice title="That game could not be opened" message={saved.error instanceof ApiError ? saved.error.message : 'It may be private, or it was deleted.'} onRetry={() => void saved.refetch()} />
      </>
    );
  }
  if (!start) return <Skeleton className="h-[40rem]" />;
  return <Studio key={id} id={isNew ? null : id} initial={start} game={saved.data?.game ?? null} />;
}

function Studio({ id, initial, game }: { id: string | null; initial: Blueprint; game: MadeGameFull | null }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [bp, setBp] = useState<Blueprint>(initial);
  const [code, setCode] = useState<string>(() => toCode(initial));
  const [history, setHistory] = useState<{ bp: Blueprint; code: string }[]>([]);
  const [view, setView] = useState<'code' | 'forms'>('code');
  const [helpOpen, setHelpOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const editor = useRef<CodeEditorHandle>(null);
  const lastPush = useRef(0);
  const codeRead = useMemo(() => fromCode(code), [code]);
  const [visibility, setVisibility] = useState<GameVisibility>(game?.visibility ?? 'private');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bots, setBots] = useState(3);
  const checkRef = useRef<HTMLDivElement>(null);
  const mine = !game || game.mine;
  const canPublish = Boolean(me.data?.user && me.data.permissions?.includes('sets.publish_public'));
  const canModerate = Boolean(me.data?.permissions?.includes('content.moderate'));
  const [reporting, setReporting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState('');
  const [hidden, setHidden] = useState(Boolean(game?.hidden));
  const moderate = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/blueprints/${id}/hide`, { hidden: !hidden, reason });
      setHidden(!hidden);
      setHiding(false);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['blueprints'] });
      toast.success(hidden ? 'The game is shown again.' : 'The game is hidden from everyone but its maker.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change the game.');
    } finally {
      setBusy(false);
    }
  };

  // The latest code and game, for callbacks that must not go stale.
  const now = useRef({ bp, code });
  now.current = { bp, code };
  const remember = useCallback((force: boolean) => {
    const t = Date.now();
    // A run of typing is one step to undo; a form change or a pasted game is always its own step.
    if (!force && t - lastPush.current < 1500) return;
    lastPush.current = t;
    setHistory((h) => [...h.slice(-(MAX_UNDO - 1)), { ...now.current }]);
  }, []);
  /** A form changed the game: the code is rewritten to match, keeping notes and order. */
  const change = useCallback(
    (fn: (b: Blueprint) => Blueprint) => {
      const prev = now.current.bp;
      const next = fn(prev);
      if (next === prev) return;
      remember(true);
      lastPush.current = 0;
      setBp(next);
      setCode(mergeCode(now.current.code, next));
      setDirty(true);
    },
    [remember],
  );
  /** The code changed: the game follows whenever the code reads as a working game. */
  const changeCode = useCallback(
    (next: string, step = false) => {
      if (next === now.current.code) return;
      remember(step);
      setCode(next);
      const r = fromCode(next);
      if (r.ok && JSON.stringify(r.blueprint) !== JSON.stringify(now.current.bp)) setBp(r.blueprint);
      setDirty(true);
    },
    [remember],
  );
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1]!;
      setBp(last.bp);
      setCode(last.code);
      lastPush.current = 0;
      return h.slice(0, -1);
    });
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied. Paste it into Game Maker to make this game again.');
    } catch {
      toast.message('Select the code and copy it with Ctrl+C.');
    }
  };
  const pastedRead = useMemo(() => (pasted.trim() ? fromCode(pasted) : null), [pasted]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.title = `${bp.name || 'Game Maker'} | Game Maker | Ludora`;
  }, [bp.name]);

  const parsed = useMemo(() => parseBlueprint(bp), [bp]);
  const codeProblems = codeRead.ok ? [] : codeRead.problems;
  const problems = parsed.ok ? [] : parsed.problems;
  const ready = parsed.ok && codeRead.ok;
  // The live test follows the last game that passed the check, a moment after the last change.
  const [tested, setTested] = useState<Blueprint | null>(parsed.ok ? parsed.blueprint : null);
  useEffect(() => {
    if (!parsed.ok) return;
    const t = setTimeout(() => setTested(parsed.blueprint), 600);
    return () => clearTimeout(t);
  }, [parsed]);
  const rules = useMemo(() => (parsed.ok ? describeBlueprint(parsed.blueprint) : tested ? describeBlueprint(tested) : []), [parsed, tested]);
  const others = parsed.ok ? actsOnOthers(parsed.blueprint) : [];

  const save = async (): Promise<string | null> => {
    if (!parsed.ok || !codeRead.ok) {
      toast.error('Fix the problems listed before saving.');
      checkRef.current?.focus();
      return null;
    }
    setBusy(true);
    try {
      const body = { blueprint: parsed.blueprint, visibility };
      const res = id && mine ? await api.put<{ game: MadeGameFull }>(`/api/blueprints/${id}`, body) : await api.post<{ game: MadeGameFull }>('/api/blueprints', body);
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['blueprints'] });
      qc.setQueryData(['blueprint', res.game.id], { game: res.game });
      toast.success(`${res.game.name} saved`);
      if (res.game.id !== id) navigate(studioLink(res.game.id), { replace: true });
      return res.game.id;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the game.');
      return null;
    } finally {
      setBusy(false);
    }
  };
  /** Play and Host use the saved game: save first when there are changes. */
  const go = async (solo: boolean) => {
    const saved = dirty || !id ? await save() : id;
    if (saved) navigate(hostLink(saved, solo));
  };
  const share = async () => {
    const saved = dirty || !id ? await save() : id;
    if (!saved) return;
    if (visibility === 'private') {
      toast.message('Only you can open this game. Choose “Anyone with the link” and save to share it.');
      return;
    }
    const url = `${location.origin}${studioLink(saved)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied. Anyone with it can play your game or copy it.');
    } catch {
      toast.message(url);
    }
  };
  const copy = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const res = await api.post<{ game: MadeGameFull }>(`/api/blueprints/${id}/copy`, {});
      void qc.invalidateQueries({ queryKey: ['blueprints'] });
      toast.success('Copied. This copy is yours to change.');
      navigate(studioLink(res.game.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not copy the game.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Game Maker"
        title={bp.name || 'Untitled game'}
        description={mine ? 'Write your game as code, or use the forms. The test game restarts with every change, and the rules in words follow what you write.' : `A game made by ${game?.owner.name ?? 'someone else'}. Read its code and try changes here, then copy it to keep them.`}
        actions={
          <>
            <Button variant="ghost" icon={<Undo2 className="size-4" aria-hidden />} disabled={!history.length} onClick={undo}>
              Undo
            </Button>
            {mine ? (
              <Button variant="primary" icon={<Save className="size-4" aria-hidden />} loading={busy} onClick={() => void save()}>
                {id ? 'Save' : 'Save game'}
              </Button>
            ) : (
              <Button variant="primary" icon={<Copy className="size-4" aria-hidden />} loading={busy} onClick={() => void copy()}>
                Copy to change it
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 lg:hidden">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'code', label: 'Code' },
            { value: 'forms', label: 'Forms' },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <section aria-labelledby="code-title" className={`flex flex-col gap-2 ${view === 'code' ? '' : 'max-lg:hidden'}`}>
            <h2 id="code-title" className="font-display text-2xl font-bold">
              Game code
            </h2>
            <CodeEditor ref={editor} code={code} onChange={(c) => changeCode(c)} problems={codeProblems} onHelp={() => setHelpOpen(true)} onCopy={() => void copyCode()} onPaste={() => (setPasted(''), setPasting(true))} />
          </section>
          <section aria-labelledby="test-title" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="test-title" className="font-display text-2xl font-bold">
                Live test
              </h2>
              <label className="flex items-center gap-2 text-sm font-semibold">
                Practice bots
                <Select value={String(bots)} onChange={(e) => setBots(Number(e.target.value))} className="w-44">
                  {[1, 3, 7, 11, 20].map((n) => (
                    <option key={n} value={n}>
                      {n === 20 ? '20 (the most)' : n}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {tested ? <LiveTest blueprint={tested} bots={bots} /> : <p className="text-text-2">Fix the problems above to start a test game.</p>}
            {!ready && tested ? <p className="text-sm text-text-2">The test is still playing the last version that passed the check.</p> : null}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className={`flex flex-col gap-4 ${view === 'forms' ? '' : 'max-lg:hidden'}`}>
          <div ref={checkRef} tabIndex={-1} aria-labelledby="check-title" role="region" className={`rounded-[var(--radius-l)] border p-4 ${ready ? 'border-glim/60 bg-glim/10' : 'border-ember/60 bg-ember/10'}`}>
            <h2 id="check-title" className="flex items-center gap-2 font-display text-xl font-bold">
              {ready ? <CheckCircle2 className="size-5" aria-hidden /> : <TriangleAlert className="size-5" aria-hidden />}
              {ready ? 'Ready to play' : (codeProblems.length || problems.length) === 1 ? '1 thing to fix' : `${codeProblems.length || problems.length} things to fix`}
            </h2>
            {ready ? (
              <p className="text-sm">This game passes every check.{dirty && mine ? ' Save it to keep your changes.' : ''}</p>
            ) : !codeRead.ok ? (
              <>
                <p className="text-sm">The forms show your last working game until the code is fixed.</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {codeProblems.slice(0, 6).map((p, i) => (
                    <li key={`${p.line}-${i}`}>
                      <button
                        type="button"
                        className="min-h-11 text-left text-sm font-semibold underline underline-offset-2"
                        onClick={() => {
                          setView('code');
                          if (p.line) editor.current?.goToLine(p.line);
                        }}
                      >
                        {p.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {problems.map((p) => (
                  <li key={`${p.path}${p.message}`}>
                    <button type="button" className="min-h-11 text-left text-sm font-semibold underline underline-offset-2" onClick={() => focusProblem(p.path)}>
                      {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
            {mine ? <StudioAiHelper current={bp} onAccept={(next) => change(() => next)} /> : null}
            <Builder bp={bp} change={change} problems={problems} />
          </div>
          <section aria-labelledby="rules-title" className="rounded-[var(--radius-l)] border border-line bg-raised p-4">
            <h2 id="rules-title" className="font-display text-2xl font-bold">
              The rules
            </h2>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {others.length ? (
              <div className="mt-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Users className="size-4" aria-hidden /> Acts on other players (shown on the game’s card)
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {others.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
          <section aria-labelledby="share-title" className="flex flex-col gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4">
            <h2 id="share-title" className="font-display text-2xl font-bold">
              Play and share
            </h2>
            {mine ? (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Who can see it
                <Select value={visibility} onChange={(e) => (setVisibility(e.target.value as GameVisibility), setDirty(true))} className="max-w-[16rem]">
                  {GAME_VISIBILITIES.filter((v) => v !== 'public' || canPublish || visibility === 'public').map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY_WORDS[v]}
                    </option>
                  ))}
                </Select>
                {!canPublish ? <span className="font-normal text-text-2">Listing for everyone needs a trusted account. You can still share by link.</span> : null}
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {mine ? (
                <>
                  <Button variant="success" icon={<Play className="size-4" aria-hidden />} loading={busy} onClick={() => void go(true)}>
                    Play solo
                  </Button>
                  <Button variant="secondary" icon={<Presentation className="size-4" aria-hidden />} loading={busy} onClick={() => void go(false)}>
                    Host
                  </Button>
                  <Button variant="secondary" icon={<Link2 className="size-4" aria-hidden />} loading={busy} onClick={() => void share()}>
                    Share by link
                  </Button>
                </>
              ) : id ? (
                <>
                  <ButtonLink to={hostLink(id, true)} variant="success" icon={<Play className="size-4" aria-hidden />}>
                    Play solo
                  </ButtonLink>
                  <ButtonLink to={hostLink(id)} variant="secondary" icon={<Presentation className="size-4" aria-hidden />}>
                    Host
                  </ButtonLink>
                </>
              ) : null}
            </div>
            <p className="text-sm text-text-2">Made games pay Sparks and XP by the same rules as Ludora’s own games.</p>
            {hidden ? <p className="text-sm font-semibold">Hidden by a moderator: only its maker can see it, and nobody can play it.</p> : null}
            {id && (!mine || canModerate) ? (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {!mine && me.data?.user ? (
                  <Button size="sm" variant="ghost" icon={<Flag className="size-4" aria-hidden />} onClick={() => setReporting(true)}>
                    Report this game
                  </Button>
                ) : null}
                {canModerate ? (
                  <Button size="sm" variant="ghost" icon={<EyeOff className="size-4" aria-hidden />} onClick={() => setHiding(true)}>
                    {hidden ? 'Show it again' : 'Hide from everyone'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
          {id ? <ReportDialog open={reporting} onOpenChange={setReporting} target={{ type: 'blueprint', id, label: bp.name }} /> : null}
          <Dialog
            open={hiding}
            onOpenChange={setHiding}
            size="sm"
            title={hidden ? `Show ${bp.name} again?` : `Hide ${bp.name}?`}
            description={hidden ? 'Everyone it is shared with can see and play it again.' : 'Only its maker will see it, and nobody can play it. The reason goes in the audit log.'}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setHiding(false)}>
                  Cancel
                </Button>
                <Button variant={hidden ? 'primary' : 'danger'} loading={busy} disabled={reason.trim().length < 3} onClick={() => void moderate()}>
                  {hidden ? 'Show it' : 'Hide it'}
                </Button>
              </div>
            }
          >
            <Field label="Reason (for staff only)">{(p) => <Input {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}</Field>
          </Dialog>
          <CodeHelp
            open={helpOpen}
            onOpenChange={setHelpOpen}
            onInsert={(line) => {
              setHelpOpen(false);
              setView('code');
              remember(true);
              editor.current?.insertLine(line);
            }}
            onUseStarter={(c) => {
              setHelpOpen(false);
              setView('code');
              changeCode(c, true);
            }}
          />
          <Dialog
            open={pasting}
            onOpenChange={setPasting}
            title="Paste code to make a game"
            description="Paste game code someone shared with you. It replaces the code here; Undo brings yours back."
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPasting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!pastedRead?.ok}
                  onClick={() => {
                    changeCode(pasted.endsWith('\n') ? pasted : `${pasted}\n`, true);
                    setPasting(false);
                    toast.success('The pasted game is in the code. The test restarts with it.');
                  }}
                >
                  Use this code
                </Button>
              </div>
            }
          >
            <Field label="Game code" error={pastedRead && !pastedRead.ok ? pastedRead.problems[0]!.message : undefined}>
              {(p) => <Textarea {...p} rows={8} value={pasted} maxLength={12000} onChange={(e) => setPasted(e.target.value)} className="font-sans" />}
            </Field>
            {pastedRead?.ok ? <p className="mt-2 text-sm font-semibold">{pastedRead.blueprint.name}: {describeBlueprint(pastedRead.blueprint)[0]}</p> : null}
          </Dialog>
        </div>
      </div>
    </>
  );
}
