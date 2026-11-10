import type { RoomView } from '@ludora/shared';

/*
 * Names hidden on the big screen. The host's projector view is rewritten so each person shows as
 * "Player 3": any value that is exactly a player's name (under any key, or in a compact tuple), and
 * the names inside the room's news and labels. Question content is left alone. Each player's own device is untouched, so they still see their place.
 */

const NAME_KEY = /name/i;
const TEXT_KEY = /^(text|label|summary|detail|title|caption|line|message|news)$/i;
/** Question content: never rewritten, so an answer that happens to be someone's name stays an answer. */
const QUESTION_KEY = /^(q|question|questions|reveal|prompt|choices|items|pairs|answer|explanation|media)$/i;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hideNames(view: RoomView, aliases: ReadonlyMap<string, string>): RoomView {
  if (!aliases.size) return view;
  // Longest first, so "Sam Lee" is replaced before "Sam".
  const names = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  const inText = (s: string) => s.replace(pattern, (m) => aliases.get(m) ?? m);
  const walk = (value: unknown, key: string): unknown => {
    if (QUESTION_KEY.test(key)) return value;
    if (typeof value === 'string') {
      if (NAME_KEY.test(key)) return aliases.get(value) ?? inText(value);
      if (TEXT_KEY.test(key)) return inText(value);
      // A whole name on its own, as compact modes send it (["p1", "Sam Lee", ...]).
      return aliases.get(value) ?? value;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, k);
      return out;
    }
    return value;
  };
  // The host's own name and the room's title stay as they are.
  const { room, me, ...rest } = view;
  return { ...(walk(rest, '') as Omit<RoomView, 'room' | 'me'>), room: { ...room, teams: room.teams }, me };
}
