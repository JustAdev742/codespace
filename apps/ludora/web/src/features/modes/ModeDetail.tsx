import { Link, useParams } from 'react-router';
import { Clock, Gauge, Users } from 'lucide-react';
import { MODE_CATEGORY_INFO, PACING_INFO, QUESTION_TYPE_LABELS } from '@ludora/shared';
import { useModes, thumbFor } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, EmptyState, Panel, Spinner } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';

export default function ModeDetail() {
  const { id } = useParams();
  const modes = useModes();
  if (modes.isLoading) return <Spinner />;
  const m = modes.data?.modes.find((x) => x.meta.id === id);
  if (!m) return <EmptyState title="That mode does not exist" action={<ButtonLink to="/modes">All modes</ButtonLink>} />;
  const meta = m.meta;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/modes" className="text-sm font-semibold">
        All game modes
      </Link>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{MODE_CATEGORY_INFO[meta.category].label}</Badge>
            {meta.status === 'beta' ? <Badge tone="amber">Beta</Badge> : meta.status === 'planned' ? <Badge>Planned, not playable yet</Badge> : <Badge tone="mint">Playable</Badge>}
          </div>
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{meta.title}</h1>
          <p className="text-lg text-text-2">{meta.description}</p>
          <div className="flex flex-wrap gap-4 text-sm text-text-2">
            <span className="flex items-center gap-1.5"><Users className="size-4" /> {meta.players.recommended ?? `${meta.players.min} to ${meta.players.max}`} players</span>
            <span className="flex items-center gap-1.5"><Clock className="size-4" /> {meta.duration.min} to {meta.duration.max} minutes</span>
            <span className="flex items-center gap-1.5"><Gauge className="size-4" /> {['', 'Easy to learn', 'Some strategy', 'Deep strategy'][meta.difficulty]}</span>
          </div>
          <p className="text-sm text-text-3">{PACING_INFO[meta.pacing]}</p>
          {meta.status !== 'planned' ? (
            <div className="flex flex-wrap gap-2">
              {meta.pacing !== 'solo' ? (
                <ButtonLink to="/host" variant="primary" size="lg">
                  Host this mode
                </ButtonLink>
              ) : null}
              {meta.pacing !== 'host' ? (
                <ButtonLink to="/host?solo=1" variant="secondary" size="lg">
                  Play it solo
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
        </div>
        <ModeArt thumb={thumbFor(meta)} className="aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-l)] border border-line" label={`${meta.title} artwork`} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-xl font-bold">How to play</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-text-2 marker:font-semibold marker:text-lantern">
            {meta.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          <h3 className="mt-5 mb-2 font-semibold">Works with</h3>
          <div className="flex flex-wrap gap-1.5">
            {meta.questionTypes.map((t) => (
              <Badge key={t}>{QUESTION_TYPE_LABELS[t]}</Badge>
            ))}
          </div>
          <p className="mt-2 text-sm text-text-3">Other question types are converted where possible, for example flashcards into choice questions.</p>
          {meta.accessibility?.length ? (
            <>
              <h3 className="mt-5 mb-2 font-semibold">Accessibility</h3>
              <ul className="list-disc pl-5 text-sm text-text-2">
                {meta.accessibility.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-xl font-bold">Variants</h2>
          {m.variants.length === 0 ? (
            <p className="text-text-2">No variants yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {m.variants.map((v) => (
                <li key={v.meta.id} className="flex gap-3">
                  <ModeArt thumb={thumbFor(meta, v.meta)} className="h-16 w-24 shrink-0 overflow-hidden rounded-[10px]" />
                  <div>
                    <div className="flex items-center gap-2 font-display font-bold">
                      {v.meta.title}
                      {v.meta.status !== 'playable' ? <Badge tone="amber">{v.meta.status}</Badge> : null}
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
