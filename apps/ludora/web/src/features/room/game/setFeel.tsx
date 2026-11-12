import { createContext, useContext, useEffect } from 'react';
import type { SetFeel } from '@ludora/shared';
import { sound } from '../../../lib/sound/engine.ts';
import { schoolLook } from '../../../lib/school.ts';
import { isBackdrop, useBackdrop, type BackdropId } from './Backdrop.tsx';

/*
 * The set's own feel in a game played from it: its sounds for right, wrong and winning (through
 * the sound engine, so mute, effects off, calm mode and quiet rooms still silence them), its
 * backdrop on the big screen until the host picks another, and its accent colour on question
 * cards, unless this copy wears a school's look, whose colours win.
 */

export const SetFeelContext = createContext<SetFeel | null>(null);

/** The set's accent hue for question cards, or null (none chosen, or a school's look is on). */
export function useSetAccent(): number | null {
  const feel = useContext(SetFeelContext);
  if (feel?.accent === undefined || schoolLook()) return null;
  return feel.accent;
}

/** Plays the set's own sounds for these moments while the game is on. */
export function useApplySetFeel(feel: SetFeel | null | undefined) {
  const right = feel?.right;
  const wrong = feel?.wrong;
  const win = feel?.win;
  useEffect(() => {
    sound.setFeel({ ...(right ? { correct: right } : {}), ...(wrong ? { wrong } : {}), ...(win ? { win, fanfare: win } : {}) });
    return () => sound.setFeel({});
  }, [right, wrong, win]);
}

/** The host chose a backdrop in this visit: it wins over the set's. */
export const BACKDROP_CHOSEN_KEY = 'ludora.backdrop.chosen';

function hostChose(): boolean {
  try {
    return sessionStorage.getItem(BACKDROP_CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** The big screen's backdrop: the set's, until the host picks one; otherwise the host's own. */
export function useRoomBackdrop(feel: SetFeel | null | undefined): BackdropId {
  const [own] = useBackdrop();
  const set = feel?.backdrop;
  return set && isBackdrop(set) && !hostChose() ? set : own;
}
