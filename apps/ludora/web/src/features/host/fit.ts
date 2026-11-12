/**
 * Ranking game modes for a set, with the reason in words: "Made for this set", "All 12 questions
 * work", "Has listening questions: plays them", "3 questions will be left out". And the settings
 * that suit the set (time per question from its reading time, how many questions). The server
 * sends the counts (sets/fit.ts); this decides the order and the words. Pure: no React, no DOM.
 */
import type { SetProfile } from '@ludora/shared';

export interface ModeFit {
  id: string;
  shown: number;
  converted: number;
  skipped: number;
  playable: boolean;
  /** The fewest questions the mode needs. */
  min?: number;
  reason: string | null;
}

export interface RankedMode {
  id: string;
  score: number;
  playable: boolean;
  madeFor: boolean;
  /** Short reasons, best first. */
  reasons: string[];
}

/** Modes whose screens show prompts as something other than the shared question card, so a question's sound does not play. */
export const NO_SOUND_SCREENS = new Set(['lantern-match']);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function rankModes(profile: SetProfile, fits: readonly ModeFit[], selfPaced: ReadonlySet<string> = new Set()): RankedMode[] {
  const total = profile.count;
  const ranked = fits.map((f) => {
    const madeFor = profile.play.modes.includes(f.id);
    const reasons: string[] = [];
    let score = 0;
    if (madeFor) {
      reasons.push('Made for this set');
      score += 1000;
    }
    if (!f.playable) {
      reasons.push(f.shown === 0 ? 'Cannot show any of these questions' : f.min && f.shown >= total ? `Needs at least ${f.min} questions; this set has ${total}` : `Can show ${f.shown} of ${plural(total, 'question')}: too few to play`);
      score -= 2000;
    } else if (f.skipped === 0 && f.converted === 0) {
      reasons.push(total === 1 ? 'The question works' : `All ${total} questions work`);
      score += 300;
    } else if (f.skipped === 0) {
      reasons.push(`All ${total} questions work, ${plural(f.converted, 'question')} in another form`);
      score += 200;
    } else {
      reasons.push(`${plural(f.skipped, 'question')} will be left out`);
      score += 200 - Math.round((f.skipped / Math.max(1, total)) * 300);
    }
    if (profile.listening > 0 && f.playable) {
      if (NO_SOUND_SCREENS.has(f.id)) {
        reasons.push('Has listening questions: this mode does not play their sounds');
        score -= Math.round((profile.listening / Math.max(1, total)) * 300);
      } else {
        reasons.push('Has listening questions: plays them');
        score += 40;
      }
    }
    // Long reading suits modes where each player goes at their own pace.
    if (profile.longReads > profile.count / 3 && selfPaced.has(f.id) && f.playable) {
      reasons.push('Long questions: players read at their own pace');
      score += 30;
    }
    return { id: f.id, score, playable: f.playable, madeFor, reasons };
  });
  return ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Settings that suit the set, which the host can change: seconds per question, and how many to ask. */
export function suggestedSettings(profile: SetProfile): { questionTimeSec: number; questionLimit: number; why: string } {
  const readingTimeChosen = profile.play.readingChosen;
  const sec = Math.max(5, Math.min(120, readingTimeChosen ? profile.questionSec : profile.autoQuestionSec));
  const why = readingTimeChosen ? (profile.play.readingTime === 'auto' ? 'worked out from its questions, as its author asked' : `its author chose ${profile.play.readingTime} reading time`) : 'worked out from how long its questions are';
  return { questionTimeSec: sec, questionLimit: profile.play.randomCount ?? 0, why };
}
