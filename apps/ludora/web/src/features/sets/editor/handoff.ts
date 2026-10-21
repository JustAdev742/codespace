/**
 * What the editor for a set it has just created should start with. Held in
 * memory rather than in router state, because browsers keep router state
 * across reloads, and a reload should start from the saved set alone.
 */
export interface Handoff {
  /** Which questions were expanded when the set was first saved. */
  open: Record<string, boolean>;
}

const pending = new Map<string, Handoff>();

export const handoff = {
  put(setId: string, value: Handoff) {
    pending.set(setId, value);
  },
  /** Reading does not remove it: React may render twice before committing. */
  peek(setId: string): Handoff | null {
    return pending.get(setId) ?? null;
  },
  clear(setId: string) {
    pending.delete(setId);
  },
};
