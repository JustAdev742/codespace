// Serves the static demo build the way GitHub Pages serves a project site: under
// a sub-path, files only, no fallback page and no API. Used by playwright.demo.config.ts.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'web/dist-demo');
const port = Number(process.argv[3] ?? 8898);
const prefix = '/ludora-demo/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.map': 'application/json' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (!path.startsWith(prefix)) return void res.writeHead(404).end('Not found');
  const rel = normalize(path.slice(prefix.length) || 'index.html');
  if (rel.startsWith('..')) return void res.writeHead(400).end();
  const file = join(root, rel.endsWith('/') ? `${rel}index.html` : rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1');
