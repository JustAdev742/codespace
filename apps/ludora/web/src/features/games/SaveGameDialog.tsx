import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GAME_GLYPHS, customGameInputSchema, type GameVisibility } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useCan } from '../../lib/session.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Dialog, Field, Input, Select, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

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
        <div className="flex items-center gap-3">
          <ModeArt thumb={{ glyph, hue, accentHue: (hue + 40) % 360 }} className="h-20 w-32 shrink-0 rounded-[var(--radius-m)]" />
          <p className="text-sm text-text-2">Your game's card, as players see it.</p>
        </div>
        <Field label="Name" error={title ? fieldError('title') : undefined}>
          {(p) => <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} {...p} />}
        </Field>
        <Field label="About it (optional)" error={fieldError('description')}>
          {(p) => <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} {...p} />}
        </Field>
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
