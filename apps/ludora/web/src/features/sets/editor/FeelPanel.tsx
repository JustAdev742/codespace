import { Volume2 } from 'lucide-react';
import { SET_BACKDROPS, SOUND_BANK_IDS, type ReadingTime, type SetBackdrop, type SetFeel, type SoundBankId } from '@ludora/shared';
import { CATALOG } from '@ludora/engine/catalog';
import { sound } from '../../../lib/sound/engine.ts';
import { BANK_GROUPS, SOUND_BANK } from '../../../lib/sound/bank.ts';
import { IconButton } from '../../../ui/Button.tsx';
import { Select, Switch } from '../../../ui/primitives.tsx';
import { BACKDROP_NAMES } from '../../room/game/Backdrop.tsx';
import type { SetDetails } from './model.ts';
import { domIds, EditorField } from './parts.tsx';

/*
 * How the set feels and plays: its own sounds for right, wrong and winning, a backdrop for the
 * big screen, an accent colour, how long players get to read, and the modes it was made for.
 * Hosting starts from these and the host can change any of them; a player's comfort settings and
 * a school's look still win over the set's.
 */

const READING: { value: ReadingTime | ''; label: string }[] = [
  { value: '', label: 'Leave it to the host' },
  { value: 'short', label: 'Short (15 seconds)' },
  { value: 'normal', label: 'Normal (20 seconds)' },
  { value: 'long', label: 'Long (30 seconds)' },
  { value: 'auto', label: 'Work it out from my questions' },
];

const MOMENTS: { key: 'right' | 'wrong' | 'win'; label: string }[] = [
  { key: 'right', label: 'Right answer sound' },
  { key: 'wrong', label: 'Wrong answer sound' },
  { key: 'win', label: 'Winning sound' },
];

const MODES = CATALOG.filter((m) => m.meta.status !== 'planned' && m.meta.pacing !== 'solo')
  .map((m) => ({ id: m.meta.id, title: m.meta.title }))
  .sort((a, b) => a.title.localeCompare(b.title));

function BankOptions() {
  return (
    <>
      {BANK_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {SOUND_BANK_IDS.filter((id) => SOUND_BANK[id].group === g).map((id) => (
            <option key={id} value={id}>
              {SOUND_BANK[id].label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

const HUE_TRACK = `linear-gradient(to right, ${[0, 40, 80, 120, 160, 200, 240, 280, 320, 359].map((h) => `hsl(${h} 65% 52%)`).join(', ')})`;

export function FeelPanel({ details, onChange }: { details: SetDetails; onChange: (patch: Partial<SetDetails>) => void }) {
  const feel = details.feel ?? {};
  const setFeel = (patch: Partial<SetFeel>) => {
    const next: SetFeel = { ...feel, ...patch };
    for (const k of Object.keys(next) as (keyof SetFeel)[]) if (next[k] === undefined) delete next[k];
    onChange({ feel: next });
  };
  const madeFor = details.madeFor ?? [];
  const setMode = (slot: 0 | 1, id: string) => {
    const list = [...madeFor];
    list[slot] = id;
    onChange({ madeFor: [...new Set(list.filter(Boolean))].slice(0, 2) });
  };
  return (
    <fieldset className="mt-5 min-w-0">
      <legend className="mb-2 text-sm font-semibold text-text">How it feels and plays</legend>
      <div className="grid min-w-0 gap-4 rounded-[var(--radius-m)] border border-line p-3 md:grid-cols-2">
        <EditorField id={domIds.detail('readingTime')} label="Reading time" hint="Hosting fills in the time per question from this. Hosts can still change it.">
          {(p) => (
            <Select {...p} value={details.readingTime ?? ''} onChange={(e) => onChange({ readingTime: e.target.value as ReadingTime | '' })}>
              {READING.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </EditorField>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {([0, 1] as const).map((slot) => (
            <EditorField key={slot} id={domIds.detail(`mode-${slot}`)} label={slot === 0 ? 'Made for' : 'Also made for'} optional hint={slot === 0 ? 'Hosting lists it first.' : undefined}>
              {(p) => (
                <Select {...p} value={madeFor[slot] ?? ''} onChange={(e) => setMode(slot, e.target.value)} disabled={slot === 1 && !madeFor[0]}>
                  <option value="">Any mode</option>
                  {MODES.map((m) => (
                    <option key={m.id} value={m.id} disabled={madeFor[slot === 0 ? 1 : 0] === m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              )}
            </EditorField>
          ))}
        </div>
        {MOMENTS.map(({ key, label }) => (
          <EditorField key={key} id={domIds.detail(`feel-${key}`)} label={label} optional>
            {(p) => (
              <div className="flex min-w-0 items-center gap-2">
                <Select {...p} value={feel[key] ?? ''} onChange={(e) => setFeel({ [key]: (e.target.value || undefined) as SoundBankId | undefined })} className="min-w-0 flex-1">
                  <option value="">The game's own</option>
                  <BankOptions />
                </Select>
                <IconButton label={`Hear the ${label.toLowerCase()}`} disabled={!feel[key]} onClick={() => feel[key] && sound.playBank(feel[key]!, { explicit: true })}>
                  <Volume2 className="size-5" />
                </IconButton>
              </div>
            )}
          </EditorField>
        ))}
        <EditorField id={domIds.detail('feel-backdrop')} label="Big screen backdrop" optional hint="Shown behind the lobby and between questions.">
          {(p) => (
            <Select {...p} value={feel.backdrop ?? ''} onChange={(e) => setFeel({ backdrop: (e.target.value || undefined) as SetBackdrop | undefined })}>
              <option value="">The host's own</option>
              {SET_BACKDROPS.map((b) => (
                <option key={b} value={b}>
                  {BACKDROP_NAMES[b]}
                </option>
              ))}
            </Select>
          )}
        </EditorField>
        <div className="flex min-w-0 flex-col gap-2 md:col-span-2">
          <Switch checked={feel.accent !== undefined} onCheckedChange={(v) => setFeel({ accent: v ? 200 : undefined })} label="Accent colour" description="A band of colour on question cards in games from this set. A school's own look keeps its colours." />
          {feel.accent !== undefined ? (
            <div className="flex min-w-0 items-center gap-3">
              <span className="size-8 shrink-0 rounded-full border border-line-strong" style={{ background: `hsl(${feel.accent} 65% 52%)` }} aria-hidden />
              <EditorField id={domIds.detail('feel-accent')} label="Accent hue" className="min-w-0 flex-1">
                {(p) => (
                  <input
                    {...p}
                    type="range"
                    min={0}
                    max={359}
                    value={feel.accent}
                    onChange={(e) => setFeel({ accent: Number(e.target.value) })}
                    className="h-3 w-full cursor-pointer appearance-none rounded-full border border-line-strong"
                    style={{ background: HUE_TRACK }}
                  />
                )}
              </EditorField>
            </div>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
