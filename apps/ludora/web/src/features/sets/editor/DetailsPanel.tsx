import { memo } from 'react';
import { Check, Globe2, Link2, Lock, type LucideIcon } from 'lucide-react';
import { SET_COVER_GLYPHS, SUBJECT_LABELS, SUBJECTS, type Subject, type Visibility } from '@ludora/shared';
import { Button } from '../../../ui/Button.tsx';
import { Input, Panel, Select, Textarea } from '../../../ui/primitives.tsx';
import { SetCover } from '../SetCover.tsx';
import { coverFor, GLYPH_LABELS, LANGUAGES, LIMITS, type SetDetails } from './model.ts';
import { domIds, EditorField, ErrorText, errorIdFor } from './parts.tsx';
import type { FieldErrors } from './validation.ts';

const VISIBILITY_INFO: Record<Visibility, { label: string; help: string; icon: LucideIcon }> = {
  private: { label: 'Private', help: 'Only you can see it and host it.', icon: Lock },
  unlisted: { label: 'Unlisted', help: 'Anyone with the link can see and play it. It is not listed in the library.', icon: Link2 },
  public: { label: 'Public', help: 'Anyone can find it in the library and play it.', icon: Globe2 },
};

const GRADE_SUGGESTIONS = ['Ages 5-7', 'Ages 7-9', 'Ages 9-11', 'Ages 11-14', 'Ages 14-16', 'Ages 16+', 'All ages'];

/** A colour name for screen readers, so the slider says "Blue" rather than "215". */
function hueName(hue: number): string {
  if (hue < 15 || hue >= 340) return 'Red';
  if (hue < 45) return 'Orange';
  if (hue < 70) return 'Yellow';
  if (hue < 160) return 'Green';
  if (hue < 190) return 'Teal';
  if (hue < 250) return 'Blue';
  if (hue < 290) return 'Purple';
  return 'Pink';
}

const HUE_TRACK = `linear-gradient(to right, ${[0, 40, 80, 120, 160, 200, 240, 280, 320, 359].map((h) => `hsl(${h} 65% 52%)`).join(', ')})`;
/* A white thumb with a soft dark edge, so it stands out against every colour on the track. */
const THUMB =
  '[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgb(6_10_28/0.6),0_2px_6px_rgb(2_5_20/0.35)] [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_0_2px_rgb(6_10_28/0.6),0_2px_6px_rgb(2_5_20/0.35)]';

export interface DetailsPanelProps {
  details: SetDetails;
  errors: FieldErrors;
  canPublish: boolean;
  /** The visibility saved on the server. A set that is already public can stay public. */
  savedVisibility: Visibility | null;
  autoFocusTitle: boolean;
  onChange: (patch: Partial<SetDetails>) => void;
}

export const DetailsPanel = memo(function DetailsPanel({ details, errors, canPublish, savedVisibility, autoFocusTitle, onChange }: DetailsPanelProps) {
  const cover = coverFor(details);
  const visibilities: Visibility[] = ['private', 'unlisted', ...(canPublish || savedVisibility === 'public' || details.visibility === 'public' ? (['public'] as const) : [])];
  const languages = LANGUAGES.some((l) => l.code === details.language) ? LANGUAGES : [...LANGUAGES, { code: details.language, label: details.language }];
  const visibilityErrId = errors.visibility ? errorIdFor(domIds.detail('visibility')) : undefined;
  const coverErrId = errors.cover ? errorIdFor(domIds.detail('cover')) : undefined;

  return (
    <Panel className="p-4 sm:p-5" aria-labelledby="set-details-heading">
      <h2 id="set-details-heading" className="mb-4 font-display text-2xl font-bold text-text">
        Set details
      </h2>
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <EditorField id={domIds.detail('title')} label="Title" error={errors.title} className="md:col-span-3">
          {(p) => <Input {...p} value={details.title} maxLength={LIMITS.title} autoFocus={autoFocusTitle} onChange={(e) => onChange({ title: e.target.value })} />}
        </EditorField>
        <EditorField id={domIds.detail('description')} label="Description" optional hint="What the set covers, in a sentence or two." error={errors.description} className="md:col-span-3">
          {(p) => <Textarea {...p} rows={2} maxLength={LIMITS.description} value={details.description} onChange={(e) => onChange({ description: e.target.value })} className="h-auto min-h-[64px]" />}
        </EditorField>
        <EditorField id={domIds.detail('subject')} label="Subject" error={errors.subject}>
          {(p) => (
            <Select {...p} value={details.subject} onChange={(e) => onChange({ subject: e.target.value as Subject | '' })}>
              <option value="">Choose a subject</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </EditorField>
        <EditorField id={domIds.detail('gradeBand')} label="Age or year group" optional hint="For example Ages 9-11 or Year 5." error={errors.gradeBand}>
          {(p) => (
            <>
              <Input {...p} list="set-grade-suggestions" autoComplete="off" value={details.gradeBand} maxLength={LIMITS.gradeBand} onChange={(e) => onChange({ gradeBand: e.target.value })} />
              <datalist id="set-grade-suggestions">
                {GRADE_SUGGESTIONS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
        </EditorField>
        <EditorField id={domIds.detail('language')} label="Language" hint="The language the questions are written in." error={errors.language}>
          {(p) => (
            <Select {...p} value={details.language} onChange={(e) => onChange({ language: e.target.value })}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          )}
        </EditorField>
        <EditorField id={domIds.detail('tags')} label="Tags" optional hint={`Help people find the set. Separate tags with commas, up to ${LIMITS.tags}.`} error={errors.tags} className="md:col-span-3">
          {(p) => <Input {...p} autoComplete="off" value={details.tags} onChange={(e) => onChange({ tags: e.target.value })} />}
        </EditorField>
      </div>

      <fieldset className="mt-5 min-w-0" aria-describedby={visibilityErrId}>
        <legend className="mb-2 text-sm font-semibold text-text">Who can see it</legend>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          {visibilities.map((v) => {
            const info = VISIBILITY_INFO[v];
            const Icon = info.icon;
            const checked = details.visibility === v;
            return (
              // Chosen: a gold edge (border and ring, so nothing shifts), a gold tint and a tick, as in the host pickers.
              <label
                key={v}
                className={`relative flex min-w-0 cursor-pointer gap-3 rounded-[var(--radius-m)] border p-3 pr-10 transition-[border-color,background-color,box-shadow] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)] ${checked ? 'border-lantern bg-lantern/[0.08] ring-1 ring-lantern' : 'border-line hover:border-line-strong hover:bg-surface-2'}`}
              >
                <input id={domIds.detail(`visibility-${v}`)} type="radio" name="set-visibility" value={v} checked={checked} onChange={() => onChange({ visibility: v })} className="sr-only" />
                <Icon className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold text-text">{info.label}</span>
                  <span className="block text-sm text-text-2">{info.help}</span>
                </span>
                {checked ? (
                  <span className="absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full bg-lantern text-on-accent" aria-hidden>
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
        {!visibilities.includes('public') ? <p className="mt-2 text-xs text-text-3">Publishing to the public library needs a trusted account. Unlisted sets can still be shared with a link.</p> : null}
        {visibilityErrId ? <ErrorText id={visibilityErrId}>{errors.visibility}</ErrorText> : null}
      </fieldset>

      <fieldset className="mt-5 min-w-0" aria-describedby={coverErrId}>
        <legend className="mb-2 text-sm font-semibold text-text">Cover</legend>
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <SetCover cover={cover} subject={details.subject || 'general'} size={80} />
            <span className="text-xs text-text-3">Preview</span>
          </div>
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-3">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-sm text-text-2">Picture</legend>
              <div className="flex flex-wrap gap-1.5">
                {SET_COVER_GLYPHS.map((g) => (
                  <label key={g} className={`relative cursor-pointer rounded-[var(--radius-l)] border-2 p-0.5 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)] ${cover.glyph === g ? 'border-lantern' : 'border-transparent hover:border-line-strong'}`}>
                    <input id={domIds.detail(`cover-${g}`)} type="radio" name="set-cover-glyph" value={g} checked={cover.glyph === g} onChange={() => onChange({ cover: { glyph: g, hue: cover.hue } })} className="sr-only" />
                    <SetCover cover={{ glyph: g, hue: cover.hue }} subject="general" size={40} />
                    <span className="sr-only">{GLYPH_LABELS[g]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <EditorField id={domIds.detail('cover')} label="Colour" error={errors.cover}>
              {(p) => (
                <input
                  {...p}
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={cover.hue}
                  aria-valuetext={hueName(cover.hue)}
                  onChange={(e) => onChange({ cover: { glyph: cover.glyph, hue: Number(e.target.value) } })}
                  className={`h-3 w-full cursor-pointer appearance-none rounded-full border border-line-strong ${THUMB}`}
                  style={{ background: HUE_TRACK }}
                />
              )}
            </EditorField>
            {details.cover ? (
              <div>
                <Button size="sm" variant="ghost" onClick={() => onChange({ cover: null })}>
                  Use the subject's cover
                </Button>
              </div>
            ) : (
              <p className="text-xs text-text-3">The cover follows the subject until you choose a picture or colour.</p>
            )}
          </div>
        </div>
      </fieldset>
    </Panel>
  );
});
