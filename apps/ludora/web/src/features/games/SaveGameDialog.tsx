import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GAME_GLYPHS, customGameInputSchema, type GameVisibility } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useCan } from '../../lib/session.ts';
import { Box } from 'lucide-react';
import { ModeArt } from '../../art/ModeArt.tsx';
import { useModes } from '../../lib/queries.ts';
import { Badge, Dialog, Field, Input, Select, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { AiHelper } from '../ai/AiHelper.tsx';

/*
 * Saving a game from the host page: a name, a line about it, a cover and who
 * can see it. Everything else (mode, settings, set) is what the host page
 * already has set up.
 */

export interface MadeGame {
  id: string;
  title: string;
  description: string;
  mode: { id: string; title: string; stage: '2d' | '3d' } | null;
  variant: { id: string; title: string } | null;
  set: { id: string; title: string } | null;
  glyph: string;
  hue: number;
  visibility: GameVisibility;
  hidden: boolean;
  plays: number;
  owner: { name: string };
  mine: boolean;
  updatedAt: string;
  settings: Record<string, unknown>;
  common: Record<string, unknown>;
  options: Record<string, boolean>;
}

export interface GameSetup {
  setId: string;
  modeId: string;
  variantId: string | null;
  settings: Record<string, unknown>;
  common: Record<string, unknown>;
  options: Record<string, boolean>;
  modeTitle: string;
  hue: number;
  /** For the card preview: the set's title. */
  setTitle?: string;
}

const VISIBILITY_TEXT: Record<GameVisibility, string> = {
  private: 'Only you',
  unlisted: 'Anyone with the link',
  public: 'Everyone, in Community games',
};

export function SaveGameDialog({ open, onOpenChange, setup, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; setup: GameSetup; editing: MadeGame | null; onSaved: (g: MadeGame) => void }) {
  const qc = useQueryClient();
  const trusted = useCan('sets.publish_public');
  const [title, setTitle] = useState(editing?.title ?? `My ${setup.modeTitle}`);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [glyph, setGlyph] = useState<(typeof GAME_GLYPHS)[number]>((GAME_GLYPHS as readonly string[]).includes(editing?.glyph ?? '') ? (editing!.glyph as (typeof GAME_GLYPHS)[number]) : 'spark');
  const [hue, setHue] = useState(editing?.hue ?? setup.hue);
  const [visibility, setVisibility] = useState<GameVisibility>(editing?.visibility ?? 'private');
  const [busy, setBusy] = useState(false);
  // The preview is the Game Maker card itself: the mode's cover with the maker's mark, the name and what it is.
  const base = useModes().data?.modes.find((m) => m.meta.id === setup.modeId)?.meta;
  const body = { title, description, glyph, hue, visibility, setId: setup.setId, modeId: setup.modeId, variantId: setup.variantId, settings: setup.settings, common: setup.common, options: setup.options };
  const parsed = customGameInputSchema.safeParse(body);
  const fieldError = (k: string) => (parsed.success ? undefined : parsed.error.issues.find((i) => i.path[0] === k)?.message);

  const save = async () => {
    setBusy(true);
    try {
      const res = editing ? await api.put<{ game: MadeGame }>(`/api/games/${editing.id}`, body) : await api.post<{ game: MadeGame }>('/api/games', body);
      toast.success(editing ? 'Game saved' : `${res.game.title} is saved. Find it in the Game Maker.`);
      await qc.invalidateQueries({ queryKey: ['games'] });
      qc.setQueryData(['game', res.game.id], res);
      onOpenChange(false);
      onSaved(res.game);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The game was not saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Save ${editing.title}` : 'Save as a game'}
      description={`${setup.modeTitle}, with the question set and settings you picked.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!parsed.success} loading={busy} onClick={save}>
            Save game
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <figure className="flex flex-col gap-1.5">
          <div className="w-full max-w-[17rem] self-center overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised" aria-hidden>
            <div className="relative">
              <ModeArt thumb={{ glyph, hue, accentHue: (hue + 40) % 360 }} mode={base} mark={{ glyph, hue }} className="block aspect-[16/9] w-full" />
              {base?.stage === '3d' ? (
                <Badge tone="violet" className="absolute top-2 left-2">
                  <Box className="size-3.5" aria-hidden /> 3D
                </Badge>
              ) : null}
            </div>
            <div className="p-3">
              <p className="font-display text-xl leading-tight font-bold break-words">{title.trim() || 'Your game'}</p>
              <p className="text-sm break-words text-text-2">
                {setup.modeTitle}
                {setup.setTitle ? ` with “${setup.setTitle}”` : ''}
              </p>
              {description.trim() ? <p className="mt-1 text-sm break-words">{description.trim()}</p> : null}
            </div>
          </div>
          <figcaption className="text-center text-sm text-text-2">Your game's card in the Game Maker, as players see it.</figcaption>
        </figure>
        <Field label="Name" error={title ? fieldError('title') : undefined}>
          {(p) => <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} {...p} />}
        </Field>
        <Field label="About it (optional)" error={fieldError('description')}>
          {(p) => <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} {...p} />}
        </Field>
        <AiHelper<{ name: string; description: string }>
          task="any.name_describe"
          label="Suggest a name with AI"
          input={() => ({ kind: 'game', content: `A ${setup.modeTitle} game${setup.setTitle ? ` with the question set "${setup.setTitle}"` : ''}.${description.trim() ? ` About it: ${description.trim()}` : ''}`, nameMax: 40, descriptionMax: 200 })}
          current={
            <>
              <p className="font-semibold">{title || 'No name yet'}</p>
              <p>{description || 'Nothing about it yet'}</p>
            </>
          }
          renderSuggestion={(o) => (
            <>
              <p className="font-semibold">{o.name}</p>
              <p>{o.description}</p>
            </>
          )}
          acceptLabel="Use these"
          onAccept={(o) => {
            setTitle(o.name);
            setDescription(o.description);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Picture">
            {(p) => (
              <Select value={glyph} onChange={(e) => setGlyph(e.target.value as (typeof GAME_GLYPHS)[number])} {...p}>
                {GAME_GLYPHS.map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Colour: ${hue}`}>{(p) => <input type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="h-11 w-full accent-[var(--lantern)]" {...p} />}</Field>
        </div>
        <Field label="Who can find it" hint={trusted ? undefined : 'Listing a game for everyone needs a trusted account. Share its link instead.'}>
          {(p) => (
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as GameVisibility)} {...p}>
              {(['private', 'unlisted', 'public'] as const).map((v) => (
                <option key={v} value={v} disabled={v === 'public' && !trusted}>
                  {VISIBILITY_TEXT[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
