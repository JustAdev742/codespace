import { useId, useState } from 'react';
import { useModes, type CatalogEntry } from '../../lib/queries.ts';
import { Input, Select } from '../../ui/primitives.tsx';
import { AiHelper } from './AiHelper.tsx';

/*
 * "Suggest a mode" on the host page: for this set, this many players and this
 * much time, a mode and its settings with one sentence of why. The server
 * checks the answer against the real catalogue; here it is matched to the
 * modes this page offers, and applied only when the host accepts.
 */

export interface ModeSuggestion {
  modeId: string;
  modeTitle: string;
  variantId: string | null;
  variantTitle: string | null;
  common: Record<string, number>;
  settings: Record<string, number | string | boolean>;
  why: string;
}

const COMMON_LABEL: Record<string, string> = {
  questionTimeSec: 'Seconds per question',
  timeLimitSec: 'Time limit in seconds',
  questionLimit: 'Questions',
};
const LENGTHS = [5, 10, 15, 20, 30, 45, 60];

export function ModeSuggestHelper({ setId, onAccept }: { setId: string; onAccept: (mode: CatalogEntry, variant: CatalogEntry['variants'][number] | null, s: ModeSuggestion) => void }) {
  const modes = useModes().data?.modes ?? [];
  const [size, setSize] = useState('30');
  const [minutes, setMinutes] = useState(15);
  const sizeId = useId();
  const minutesId = useId();
  const n = Number(size);
  const sizeOk = Number.isInteger(n) && n >= 1 && n <= 300;
  const labelOf = (mode: CatalogEntry | undefined, key: string) => COMMON_LABEL[key] ?? mode?.settings.find((f) => f.key === key)?.label ?? key;
  return (
    <AiHelper<ModeSuggestion>
      task="game.suggest_mode"
      label="Suggest a mode with AI"
      title="Suggest a mode and settings"
      className="mb-4"
      ready={sizeOk ? true : 'Say how many players, from 1 to 300.'}
      fields={
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={sizeId} className="text-sm font-semibold text-text">
              How many players
            </label>
            <Input id={sizeId} inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} aria-invalid={!sizeOk} className="w-32" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={minutesId} className="text-sm font-semibold text-text">
              Time you have
            </label>
            <Select id={minutesId} value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))} className="w-40">
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </div>
        </div>
      }
      input={() => ({ setId, classSize: n, minutes })}
      renderSuggestion={(o) => {
        const mode = modes.find((m) => m.meta.id === o.modeId);
        const extras = [...Object.entries(o.common), ...Object.entries(o.settings)];
        return (
          <>
            <p className="font-display text-lg font-bold">
              {o.modeTitle}
              {o.variantTitle ? `: ${o.variantTitle}` : ''}
            </p>
            <p>{o.why}</p>
            {extras.length ? (
              <ul className="mt-1 list-disc pl-5 text-text-2">
                {extras.map(([k, v]) => (
                  <li key={k}>
                    {labelOf(mode, k)}: {typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-2">With the mode's own settings.</p>
            )}
            {!mode ? <p className="mt-1 font-semibold">This mode is not offered on this page, so it cannot be used here.</p> : null}
          </>
        );
      }}
      acceptLabel="Use this mode"
      onAccept={(o) => {
        const mode = modes.find((m) => m.meta.id === o.modeId);
        if (!mode) return;
        onAccept(mode, o.variantId ? (mode.variants.find((v) => v.meta.id === o.variantId) ?? null) : null, o);
      }}
    />
  );
}
