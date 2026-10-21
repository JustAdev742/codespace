// Production build: one ESM bundle per entry point in dist/. Workspace packages
// (@ludora/*) are TypeScript source, so they are bundled in; npm packages stay
// external and load from node_modules, which keeps native modules (argon2) working.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

const externalNpm = {
  name: 'external-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@ludora/') || args.path.startsWith('node:')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: {
    index: 'src/index.ts',
    admin: 'src/cli/admin.ts',
    migrate: 'src/db/migrate-cli.ts',
    seed: 'src/db/seed-cli.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  plugins: [externalNpm],
  logLevel: 'info',
});
