// Bundles the site-wide script into dist/cyberbikes.js: one file, minified, with the tokens and the
// Square CSS layer inlined. Paste it into Square (Settings → Custom code → footer) inside a
// <script> tag, or host it and reference it with <script src="…" defer>.
//
//   node scripts/build.mjs [--watch]

import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  stdin: {
    // window.CYBERBIKES_CONFIG, if the page defines it before this script, overrides config.js
    // (opening hours, links) without a rebuild.
    contents: "import { start } from './square/site.js'; import { configure } from './config.js';"
      + " if (window.CYBERBIKES_CONFIG) configure(window.CYBERBIKES_CONFIG); start();",
    resolveDir: join(root, 'src'),
    sourcefile: 'cyberbikes-entry.js',
  },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome111', 'safari16.4', 'firefox115'],
  loader: { '.css': 'text' },
  outfile: join(root, 'dist', 'cyberbikes.js'),
  legalComments: 'none',
  metafile: true,
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/ …');
} else {
  const result = await build(options);
  const bytes = Object.values(result.metafile.outputs)[0].bytes;
  console.log(`dist/cyberbikes.js ${(bytes / 1024).toFixed(1)} KB`);
}
