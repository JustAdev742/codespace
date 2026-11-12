import { useId, useState } from 'react';
import { describeBlueprint, parseBlueprint, type Blueprint } from '@ludora/shared';
import { AiHelper } from '../ai/AiHelper.tsx';
import { Textarea } from '../../ui/primitives.tsx';

/*
 * "Describe your game": the AI helper drafts a blueprint (task mode.draft, checked on the server
 * like any saved game). The suggestion shows as rules in words beside the current game, and
 * replaces it only when accepted (Undo brings the old one back). Renders nothing when AI helpers
 * are off or not for this account.
 */
export function StudioAiHelper({ current, onAccept }: { current: Blueprint; onAccept: (bp: Blueprint) => void }) {
  const [text, setText] = useState('');
  const id = useId();
  const ok = text.trim().length >= 10;
  return (
    <AiHelper<{ blueprint: Blueprint }>
      task="mode.draft"
      label="Describe your game to AI"
      title="Draft a game from a description"
      className="mb-4"
      ready={ok ? true : 'Describe your game in a sentence or two.'}
      fields={
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm font-semibold text-text">
            Your game in a sentence or two
          </label>
          <Textarea id={id} rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="A race up a snowy mountain where wrong answers make you slide back, with shields to save you." />
        </div>
      }
      input={() => ({ description: text })}
      current={<p className="text-sm">{describeBlueprint(current)[0]}</p>}
      renderSuggestion={(o) => {
        const r = parseBlueprint(o.blueprint);
        if (!r.ok) return <p>That suggestion did not pass the check.</p>;
        return (
          <>
            <p className="font-display text-lg font-bold">{r.blueprint.name}</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {describeBlueprint(r.blueprint).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        );
      }}
      acceptLabel="Use this game"
      onAccept={(o) => {
        const r = parseBlueprint(o.blueprint);
        if (r.ok) onAccept(r.blueprint);
      }}
    />
  );
}
