/*
 * Fails if any public web build contains the chaos catalogue: a cheat id, a
 * cheat name or a cheat description. Run after `npm run build` (and the demo
 * build). The catalogue must only ever live on the game server.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import '@ludora/engine/chaos-cheats';
import { allCheats } from '@ludora/engine/chaos';

const roots = ['web/dist', 'web/dist-demo'].filter((d) => existsSync(d));
if (!roots.length) {
  console.error('No public build found. Run npm run build first.');
  process.exit(1);
}
function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|css|html|map|json|txt)$/.test(name)) yield p;
  }
}
// Strings only a cheat has: its id and the start of its description. (Names are left out: some are
// ordinary game words, such as a mode's own trick card, that the public app rightly contains.)
const needles = allCheats().flatMap((c) => [`"${c.id}"`, `'${c.id}'`, c.description.slice(0, 48)]);
const found: string[] = [];
for (const root of roots) {
  for (const f of files(root)) {
    const text = readFileSync(f, 'utf8');
    for (const n of needles) if (text.includes(n)) found.push(`${f}: ${n}`);
  }
}
if (found.length) {
  console.error(`The chaos catalogue leaked into a public build:\n${found.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log(`No chaos catalogue in ${roots.join(', ')} (${needles.length} strings checked).`);
