/**
 * Keeps an unsaved copy of the editor in this browser, so a closed tab or a
 * lost connection does not lose work. Storage can be missing or full (private
 * windows, blocked site data), so every call is wrapped and failure is quiet:
 * the editor works the same without it.
 */
import { reviveDetails, reviveQuestion, type DraftQuestion, type SetDetails } from './model.ts';

const PREFIX = 'ludora.setDraft.v1';

export interface StoredDraft {
  /** When the draft was written (ms since 1970). */
  savedAt: number;
  /** The set's updatedAt when editing began; null for a new set. */
  baseUpdatedAt: string | null;
  details: SetDetails;
  questions: DraftQuestion[];
}

/** One draft per account and per set, so people sharing a computer never see each other's work. */
export function draftKey(userId: string, setId: string | null): string {
  return `${PREFIX}:${userId}:${setId ?? 'new'}`;
}

export function readDraft(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const details = reviveDetails(data.details);
    const questions = Array.isArray(data.questions) ? data.questions.map(reviveQuestion).filter((q): q is DraftQuestion => q !== null) : null;
    if (!details || !questions || typeof data.savedAt !== 'number') return null;
    return { savedAt: data.savedAt, baseUpdatedAt: typeof data.baseUpdatedAt === 'string' ? data.baseUpdatedAt : null, details, questions };
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: StoredDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
