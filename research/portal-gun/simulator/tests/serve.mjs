// Minimal static server for local use and the browser check.
// index.html is written as a page fragment (the artifact publisher wraps it in a
// document skeleton), so this server adds the same skeleton when serving it.
// Usage: node tests/serve.mjs [port]   then open http://localhost:PORT/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

export const SKELETON_HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

export function startServer(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/' || p === '/index.html') {
        const body = await readFile(path.join(root, 'index.html'), 'utf8');
        res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
        res.end(SKELETON_HEAD + body + '</body></html>');
        return;
      }
      if (p.startsWith('/vendor/three/')) p = p.replace('/vendor/three/', '/node_modules/three/build/');
      const file = path.join(root, path.normalize(p));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8080);
  startServer(port).then(() => console.log(`Portal Traversal Lab: http://localhost:${port}/`));
}
