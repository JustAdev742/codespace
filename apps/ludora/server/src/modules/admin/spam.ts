/*
 * Telling junk accounts apart: names that are keyboard mashes ("aaa", "ihfjosifjso", "asdfgh") and
 * copies of another account's name ("singto2", "s1ngt0", "singtoo"). Used by the super administrator's
 * clean-up list (cleanup.ts) and by the AI reviewer's records (aiReview/evidence.ts). These are
 * signals for a person (or the reviewer) to weigh, never a decision on their own.
 */

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'l' };

const squeeze = (s: string) => s.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
const plain = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const readLeet = (s: string) => [...s].map((ch) => LEET[ch] ?? ch).join('');

/**
 * Every way to read the name with the disguises taken off: lower case, look-alike digits and symbols
 * read as letters, everything else dropped, doubled letters squeezed. A number on the end can be a
 * counter ("singto2", "singto1") or a disguised letter ("s1ngt0"), so both readings are kept.
 */
export function nameKeys(name: string | null | undefined): string[] {
  if (!name) return [];
  const p = plain(name);
  const keys = new Set([squeeze(readLeet(p)), squeeze(readLeet(p.replace(/[\s_.-]*\d+$/, '')))]);
  return [...keys].filter(Boolean);
}

/** The likeliest of those readings: digits inside the name mean look-alikes ("s1ngt0"); otherwise a number on the end is a counter. */
export function nameKey(name: string | null | undefined): string {
  if (!name) return '';
  const p = plain(name);
  const inner = /[a-z][0-9@$!|]+[a-z]/.test(p);
  return squeeze(readLeet(inner ? p : p.replace(/[\s_.-]*\d+$/, '')));
}

/** The commonest letter pairs in English words and names: a long name made mostly of other pairs is no word at all. */
const COMMON = new Set(
  'th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be ma si om ur ca el ta la ns di fo ho pe ec pr no ct us ac ot il tr ly nc et ut ss so rs un lo wa ge ie wh ee wi em ad ol rt po we na ul ni ts mo ow pa im mi ai sh ir su id os iv ia am fi ci vi pl ig tu ev ld ry mp fe bl ab gh ty op wo sa ay ex ke fr oo av ag if ap gr od bo sp rd do uc bu ei ov by rm ep tt oc fa ef cu rn sc gi da yo cr cl du ga qu ue ff ba ey ls va um pp ua up lu go ht ru ug ds lt pi rc rr eg au ck ew mu br bi pt ak pu ui rg ib tl ny ki rk ys ob mm fu ph og ms ye ud mb ip ub oi rl gu dr cc tw ft wn nu af hu nn eo vo rv iz ok my gl aw ju oa sy sl ps jo je nk kn dy hy ze ks bs ik dd cy sk oe oy ya ah yn yl ae zi az ja ka eb'.split(' '),
);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '1234567890'];

/** Why a name looks like a keyboard mash, or an empty list. */
export function mashSigns(name: string | null | undefined): string[] {
  if (!name) return [];
  const n = name.toLowerCase().replace(/\s+/g, '');
  const letters = n.replace(/[^a-z]/g, '');
  const signs: string[] = [];
  if (/(.)\1\1/.test(n)) signs.push('the same character three or more times in a row');
  const distinct = new Set(letters).size;
  if ((letters.length >= 3 && distinct === 1) || (letters.length >= 6 && distinct <= 2)) signs.push(distinct === 1 ? 'only one letter' : 'only two different letters');
  const vowels = letters.replace(/[^aeiouy]/g, '').length;
  if (letters.length >= 5 && vowels === 0) signs.push('no vowels');
  else if (letters.length >= 9 && vowels / letters.length < 0.2) signs.push('almost no vowels');
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(letters)) signs.push('five or more consonants in a row');
  for (const row of ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      if (n.includes(row.slice(i, i + 4))) {
        signs.push(`a run of keys in a row ("${row.slice(i, i + 4)}")`);
        i = row.length;
      }
    }
    if (signs.some((s) => s.startsWith('a run of keys'))) break;
  }
  if (letters.length >= 10) {
    const pairs = [...letters].slice(1).map((ch, i) => letters[i]! + ch);
    const odd = pairs.filter((p) => !COMMON.has(p));
    const counts = new Map<string, number>();
    for (const p of odd) counts.set(p, (counts.get(p) ?? 0) + 1);
    if (odd.length / pairs.length > 0.6 || [...counts.values()].some((n) => n >= 3)) signs.push('letters in an order no word uses');
  }
  return [...new Set(signs)];
}

export interface NamedAccount {
  id: string;
  username: string | null;
  displayName: string;
  createdAt: Date;
}

/**
 * For each account whose name, with the disguises off, matches an older account's username: that
 * older account. Usernames are unique, so a second "singto" has to disguise itself ("singto2",
 * "s1ngt0"). Display names are not unique (many children are called Ava), so a display name only
 * counts when it copies another account's username and is five letters or more. Short keys (under
 * 3 letters) are left out. A match is a signal: "sam2" may simply have found "sam" taken.
 */
export function copiesOf<T extends NamedAccount>(accounts: readonly T[]): Map<string, T> {
  const holders = new Map<string, T[]>();
  for (const a of accounts) for (const k of new Set(nameKeys(a.username).filter((k) => k.length >= 3))) holders.set(k, [...(holders.get(k) ?? []), a]);
  const oldest = new Map<string, T>();
  for (const [k, group] of holders) oldest.set(k, [...group].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())[0]!);
  const copies = new Map<string, T>();
  for (const a of accounts) {
    const keys = [...nameKeys(a.username).filter((k) => k.length >= 3), ...nameKeys(a.displayName).filter((k) => k.length >= 5)];
    for (const k of keys) {
      const first = oldest.get(k);
      if (first && first.id !== a.id && first.createdAt <= a.createdAt) {
        copies.set(a.id, first);
        break;
      }
    }
  }
  return copies;
}
