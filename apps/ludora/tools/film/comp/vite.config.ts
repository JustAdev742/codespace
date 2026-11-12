import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

// The film is one page drawn with Three.js. The footage it plays is on disk outside the
// repository (frames are big); this serves that folder at /media.
const MEDIA = process.env.FILM_OUT ?? '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film';
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };

function media(): Plugin {
  return {
    name: 'film-media',
    configureServer(server) {
      server.middlewares.use('/media', (req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!));
        const file = join(MEDIA, path);
        if (!file.startsWith(MEDIA) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = file.slice(file.lastIndexOf('.'));
        res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
        void next;
      });
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [media()],
  server: { port: 5188, strictPort: true, host: '127.0.0.1', fs: { allow: [resolve(import.meta.dirname, '../../..')] } },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { include: ['three', 'react', 'react-dom/server'] },
});
