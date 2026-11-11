import { PLANTS, type Kind, type PlotView } from '@ludora/engine/glim-garden';

/*
 * Glim Garden in words: what a plot holds, what just happened, and the label
 * for the picture. Short and plain, for a young reader and a screen reader
 * alike. Shared by the player and host screens and the 2D garden.
 */

export const KIND_WORD: Record<Kind, string> = { flower: 'flower', bush: 'bush', tree: 'lantern tree' };

export type Stage = 'bare' | 'seed' | 'sprout' | 'growing' | 'bud' | 'bloom';

/** How far along a plant is, for the pictures and the words. */
export function stageOf(p: Pick<PlotView, 'k' | 'g' | 'b'>): Stage {
  if (!p.k) return 'bare';
  if (p.b) return 'bloom';
  const need = PLANTS[p.k].need;
  if (p.g <= 0) return 'seed';
  if (p.g >= need - 1) return 'bud';
  return p.g / need < 0.5 ? 'sprout' : 'growing';
}

/** Drops a plant still needs (0 once it has bloomed). */
export const dropsToGo = (p: Pick<PlotView, 'k' | 'g' | 'b'>) => (p.k && !p.b ? Math.max(0, PLANTS[p.k].need - p.g) : 0);

export const dropsText = (n: number) => `${n} ${n === 1 ? 'drop' : 'drops'}`;
export const firefliesText = (n: number) => `${n} ${n === 1 ? 'firefly' : 'fireflies'}`;

/** "a bush, 2 drops to go, drooping" / "bare earth" / "a lantern tree in bloom". */
export function plantLine(p: PlotView, asleep = false): string {
  if (!p.k) return 'bare earth';
  const word = KIND_WORD[p.k];
  if (p.b) return `a ${word} in bloom`;
  const left = dropsToGo(p);
  const parts = [p.g === 0 ? `a ${word} seed` : `a ${word}`, left === 1 ? 'nearly open, 1 drop to go' : `${dropsText(left)} to go`];
  if (p.d) parts.push('drooping');
  if (asleep) parts.push('asleep until night');
  if (p.l) parts.push('in lantern light');
  return parts.join(', ');
}

/** A plot's fireflies against what makes it glow. */
export function jarLine(p: PlotView, need: number): string {
  return p.j >= need ? `glowing, ${firefliesText(p.j)}` : `${p.j} of ${need} fireflies`;
}

export interface NamedPlot {
  plot: PlotView;
  name: string;
}

/**
 * The words for the player's picture: their own plot, each neighbour's plot,
 * and the garden's progress. Changes as the garden grows.
 */
export function playerPicture(o: { mine: PlotView; neighbours: NamedPlot[]; need: number; glowing: number; goal: number; asleep: boolean; dark: boolean | null }): string {
  const lines = [`Your plot: ${plantLine(o.mine, o.asleep)}. ${capital(jarLine(o.mine, o.need))}.`];
  if (o.neighbours.length) lines.push(`Next to you: ${o.neighbours.map((n) => `${n.name}, ${plantLine(n.plot)}`).join('; ')}.`);
  else lines.push('No plots next to yours.');
  lines.push(`The garden: ${o.glowing} of ${o.goal} plots glowing.`);
  if (o.dark !== null) lines.push(o.dark ? 'It is night.' : 'It is day.');
  return lines.join(' ');
}

/** The words for the big screen's picture. */
export function hostPicture(o: { plots: number; glowing: number; goal: number; fireflies: number; blooming: number; teams: { name: string; glowing: number; goal: number }[] | null; dark: boolean | null }): string {
  const day = o.dark === null ? '' : o.dark ? ' It is night.' : ' It is day.';
  if (o.teams) return `The team gardens. ${o.teams.map((t) => `${t.name}: ${t.glowing} of ${t.goal} plots glowing`).join('. ')}. ${firefliesText(o.fireflies)} in all.${day}`;
  return `The class garden at night: ${o.plots} plots, ${o.blooming} in bloom, ${o.glowing} of ${o.goal} glowing. ${capital(firefliesText(o.fireflies))}.${day}`;
}

/** What a plot's latest change was, in words, for the person who made it happen or owns it. */
export function eventLine(p: PlotView, owner: string, giver: string | null, you: boolean): string | null {
  const whose = you ? 'Your' : `${owner}’s`;
  const word = p.k ? KIND_WORD[p.k] : 'plant';
  switch (p.e) {
    case 'plant':
      return you ? `You planted a ${word} seed.` : `${owner} planted a ${word} seed.`;
    case 'water':
      return `${whose} ${word} drank a drop. ${capital(dropsText(dropsToGo(p)))} to go.`;
    case 'gift':
      return `${giver ?? 'A neighbour'} gave ${you ? 'your' : `${owner}’s`} ${word} a drop.`;
    case 'bloom':
      return `${whose} ${word} opened!`;
    case 'droop':
      return `${whose} ${word} is drooping.`;
    case 'perk':
      return `${whose} ${word} perked up.`;
    case 'light':
      return `${whose} ${word} grew in the lantern light.`;
    default:
      return null;
  }
}

/** "Ava", or "Ava and 2 more", for a stacked name tag's short form. */
export function capital(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Names in a stacked tag: one per line, at most `max`, then "and N more". */
export function stackNames(names: string[], max = 5): string {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  return (sorted.length > max ? [...sorted.slice(0, max - 1), `and ${sorted.length - (max - 1)} more`] : sorted).join('\n');
}
