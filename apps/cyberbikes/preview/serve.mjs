// Local preview of the redesign on the mirrored Square site. Serves the offline copy made by
// scripts/site-mirror.mjs with the site-wide script injected into every page, as Square would once
// it is pasted into the site's custom code, and with each bike's drafted Specifications block added
// to its description, as if the owner had pasted the drafts. Nothing here touches the live site.
//
//   npm run build && npm run preview:data && node preview/serve.mjs [--port 8090] [--mirror <dir>]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const mirror = arg('--mirror') ?? join(app, '..', '..', 'mirror-output', 'cyberbikes', 'site');
const port = Number(arg('--port') ?? 8090);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.otf': 'font/otf',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon',
};

const drafts = JSON.parse(await readFile(join(app, 'reports', 'spec-blocks.json'), 'utf8').catch(() => '{}'));
const catalogue = JSON.parse(await readFile(join(app, 'data', 'catalogue.json'), 'utf8').catch(() => '{"products":[]}'));
const productIdByUrlId = new Map(catalogue.products.flatMap(p => [[p.id, p.id], [String(p.site_product_id), p.id]]));

// The opening hours the shop publishes on its Visit page and footer. Square's own business hours and
// pickup hours disagree with them (catalogue audit #11); the owner confirms which are right.
const PREVIEW_CONFIG = {
  catalogueSrc: '/__cb/preview/data/products.json',
  links: { finder: '/find-your-bike/' },
  store: { hours: [['Tuesday–Friday', '10am–5pm'], ['Saturday', '10am–4pm'], ['Sunday and Monday', 'Closed']] },
};
const INJECT = `<script>window.CYBERBIKES_CONFIG = ${JSON.stringify(PREVIEW_CONFIG)};</script>
<script src="/__cb/preview/preview.js"></script>
<script src="/__cb/dist/cyberbikes.js"></script>`;

const attr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function withDraft(page, urlId) {
  const draft = drafts[productIdByUrlId.get(urlId)];
  if (!draft) return page;
  return page.replace(/(class="[^"]*\bw-product-description\b[^"]*"[^>]*?\scontent=")([^"]*)(")/, (m, a, b, c) => a + b + attr(draft.block_html) + c);
}

async function file(path) {
  const info = await stat(path);
  return info.isDirectory() ? readFile(join(path, 'index.html')) : readFile(path);
}

function inside(base, path) {
  const full = normalize(join(base, path));
  return full === base || full.startsWith(base + sep) ? full : null;
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  try {
    if (path.startsWith('/__cb/')) {
      const rel = path.slice('/__cb/'.length);
      if (!/^(dist|preview)\//.test(rel)) throw new Error('not served');
      const full = inside(app, rel);
      res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(await readFile(full));
    }
    // The finder page does not exist on the live site yet; any simple page serves as its shell.
    const local = path.startsWith('/find-your-bike') ? '/repairs/' : path;
    const full = inside(mirror, local);
    let body = await file(full);
    const isHtml = extname(full) === '.html' || !extname(full);
    if (!isHtml) {
      res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream' });
      return res.end(body);
    }
    let page = body.toString('utf8');
    const product = path.match(/^\/product\/[^/]+\/([^/]+)/);
    if (product) page = withDraft(page, product[1]);
    // The last </body>: embed blocks carry whole documents in their srcdoc attributes.
    const end = page.lastIndexOf('</body>');
    page = end < 0 ? page + INJECT : page.slice(0, end) + INJECT + page.slice(end);
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
    res.end(page);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not in the mirror');
  }
}).listen(port, () => console.log(`Preview: http://localhost:${port}/`));
