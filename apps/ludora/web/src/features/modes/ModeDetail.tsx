import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Clock, Gauge, Users } from 'lucide-react';
import { MODE_CATEGORY_INFO, PACING_INFO, QUESTION_TYPE_LABELS } from '@ludora/shared';
import { useModes, thumbFor } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { EmptyState, Panel, Spinner } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';

const DIFFICULTY = ['', 'Easy to learn', 'Some strategy', 'Deep strategy'] as const;

function Fact({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border-2 border-line bg-raised px-3.5 py-3">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink text-on-accent ${tone}`} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-text-2">{label}</div>
        <div className="font-display text-lg leading-tight font-bold">{value}</div>
      </div>
    </div>
  );
}

export default function ModeDetail() {
  const { id } = useParams();
  const modes = useModes();
  if (modes.isLoading) return <Spinner />;
  const m = modes.data?.modes.find((x) => x.meta.id === id);
  if (!m) {
    return (
      <div className="py-10">
        <h1 className="sr-only">Mode not found</h1>
        <EmptyState title="That mode does not exist" action={<ButtonLink to="/modes" variant="primary">See every game mode</ButtonLink>}>
          It may have been renamed. Every mode we have is on the game modes page.
        </EmptyState>
      </div>
    );
  }
  const meta = m.meta;
  const players = meta.players.recommended ?? `${meta.players.min} to ${meta.players.max}`;
  return (
    <div className="flex flex-col gap-8">
      <Link to="/modes" className="self-start text-sm font-bold">
        All game modes
      </Link>
      <section className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-3 px-3 py-0.5 text-sm font-semibold text-text-2">{MODE_CATEGORY_INFO[meta.category].label}</span>
            {meta.status === 'beta' ? (
              <span className="rounded-full border-2 border-ink bg-lantern px-3 text-sm font-bold text-on-accent">Beta</span>
            ) : meta.status === 'planned' ? (
              <span className="rounded-full bg-surface-3 px-3 py-0.5 text-sm font-semibold text-text-2">In the works, not playable yet</span>
            ) : null}
          </div>
          <h1 className="font-display text-5xl leading-[1.02] font-extrabold sm:text-6xl">{meta.title}</h1>
          <p className="font-display text-xl font-bold text-text-2 sm:text-2xl">{meta.tagline}</p>
          <p className="max-w-[60ch] text-lg text-text-2">{meta.description}</p>
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-3">
            <Fact icon={<Users className="size-5" />} label="Players" value={players} tone="bg-sky" />
            <Fact icon={<Clock className="size-5" />} label="Minutes" value={`${meta.duration.min} to ${meta.duration.max}`} tone="bg-glim" />
            <Fact icon={<Gauge className="size-5" />} label="How hard" value={DIFFICULTY[meta.difficulty]} tone="bg-rose" />
          </div>
          {meta.status !== 'planned' ? (
            <div className="mt-1 flex flex-wrap gap-3">
              {meta.pacing !== 'solo' ? (
                <ButtonLink to="/host" variant="primary" size="xl">
                  Host this mode
                </ButtonLink>
              ) : null}
              {meta.pacing !== 'host' ? (
                <ButtonLink to="/host?solo=1" variant={meta.pacing === 'solo' ? 'primary' : 'secondary'} size="xl">
                  Play solo
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm text-text-2">{PACING_INFO[meta.pacing]}</p>
        </div>
        <div className="mx-auto w-full max-w-[560px] rotate-[1.5deg] overflow-hidden rounded-[28px] border-[3px] border-ink shadow-[0_7px_0_var(--ink)]">
          <ModeArt thumb={thumbFor(meta)} className="block aspect-[16/10] w-full" label={`${meta.title} artwork`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel className="p-5 sm:p-6" aria-labelledby="rules-title">
          <h2 id="rules-title" className="mb-4 font-display text-2xl font-extrabold">
            How to play
          </h2>
          <ol className="flex flex-col gap-3">
            {meta.rules.map((r, i) => (
              <li key={r} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-lantern font-display font-extrabold text-on-accent" aria-hidden>
                  {i + 1}
                </span>
                <span className="pt-0.5 text-text-2">{r}</span>
              </li>
            ))}
          </ol>
          <h3 className="mt-6 mb-2 font-display text-lg font-bold">Works with</h3>
          <ul className="flex flex-wrap gap-1.5">
            {meta.questionTypes.map((t) => (
              <li key={t} className="rounded-full bg-surface-3 px-3 py-0.5 text-sm font-semibold text-text-2">
                {QUESTION_TYPE_LABELS[t]}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-text-2">Other question types are converted where possible, for example flashcards into choice questions.</p>
          {meta.accessibility?.length ? (
            <>
              <h3 className="mt-6 mb-2 font-display text-lg font-bold">Accessibility</h3>
              <ul className="list-disc pl-5 text-text-2">
                {meta.accessibility.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
        <Panel className="p-5 sm:p-6" aria-labelledby="variants-title">
          <h2 id="variants-title" className="mb-4 font-display text-2xl font-extrabold">
            Variants
          </h2>
          {m.variants.length === 0 ? (
            <p className="text-text-2">No variants yet. Hosts can still change the settings for each game.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {m.variants.map((v) => (
                <li key={v.meta.id} className="flex gap-3.5 rounded-[18px] bg-surface-2 p-3">
                  <ModeArt thumb={thumbFor(meta, v.meta)} className="h-[68px] w-[104px] shrink-0 overflow-hidden rounded-[12px] border-2 border-ink" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-display text-lg leading-tight font-bold">
                      {v.meta.title}
                      {v.meta.status !== 'playable' ? <span className="rounded-full border-2 border-ink bg-lantern px-2 font-sans text-xs font-bold text-on-accent">{v.meta.status === 'beta' ? 'Beta' : 'In the works'}</span> : null}
                    </div>
                    <p className="text-sm text-text-2">{v.meta.changes}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
