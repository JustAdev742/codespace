import { tutorialOf, type ModeControl, type ModeMeta, type VariantMeta } from '@ludora/shared';

/*
 * The steps of a mode's walkthrough, before a game (Walkthrough.tsx), worked out from the mode's
 * own metadata so every screen shows the same: the mode's two to four steps, its controls with a
 * moment to try them (unscored, on this device only), what this version changes, what calm play
 * changes when the room plays calm, and "Ready?". Pure, so it can be tested.
 */

export type WalkStep =
  | { kind: 'rule'; title: string; text: string }
  | { kind: 'controls'; title: string; controls: readonly ModeControl[] }
  | { kind: 'version'; title: string; text: string }
  | { kind: 'calm'; title: string; text: string }
  | { kind: 'ready'; title: string; text: string };

export interface WalkInput {
  meta: Pick<ModeMeta, 'title' | 'rules' | 'tutorial' | 'calmPlay'>;
  variant?: Pick<VariantMeta, 'title' | 'changes'> | null | undefined;
  /** The room plays calm. */
  calm: boolean;
  /** A solo game: the player chose calm play themselves, so it is not "your teacher". */
  solo?: boolean;
}

/** What calm play means in a mode with nothing to steer: the same game, with less going on around it. */
export const CALM_GENERAL = 'No flashing, no shaking and quieter sounds. The game is the same.';

export function walkthroughSteps({ meta, variant, calm, solo = false }: WalkInput): WalkStep[] {
  const t = tutorialOf(meta);
  const steps: WalkStep[] = t.steps.map((s) => ({ kind: 'rule', title: s.title, text: s.text }));
  if (t.controls?.length) steps.push({ kind: 'controls', title: 'Try the buttons', controls: t.controls });
  if (variant) steps.push({ kind: 'version', title: `In ${variant.title}`, text: variant.changes });
  if (calm) steps.push({ kind: 'calm', title: solo ? 'Calm play is on' : 'Your teacher chose calm play', text: meta.calmPlay ?? CALM_GENERAL });
  steps.push({ kind: 'ready', title: 'Ready?', text: 'Nothing you do in these steps counts. The game starts when everyone is ready.' });
  return steps;
}

/** The keys a control's words name ("Left arrow", "B", "W, A, S, D or the arrow keys"), as KeyboardEvent codes. */
export function keyCodes(words: string | undefined): string[] {
  if (!words) return [];
  const out = new Set<string>();
  for (const raw of words.split(/,| or /)) {
    const w = raw.trim().toLowerCase();
    if (!w) continue;
    if (w.includes('arrow keys')) ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach((c) => out.add(c));
    else if (/^(left|right|up|down) arrow$/.test(w)) out.add(`Arrow${w[0]!.toUpperCase()}${w.slice(1, w.indexOf(' '))}`);
    else if (w === 'space') out.add('Space');
    else if (/^[a-z]$/.test(w)) out.add(`Key${w.toUpperCase()}`);
  }
  return [...out];
}
