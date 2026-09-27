#!/usr/bin/env node
/**
 * site-mirror.mjs — save a website as an offline copy, including sites that build their pages in the browser.
 *
 * wget and HTTrack save what the server sends. Site builders (Square Online/Weebly, Wix, many
 * Shopify themes) and single-page apps send an empty shell plus JavaScript, so those copies open
 * blank. This renders each page in Chromium (Playwright) and saves the DOM the browser ended up
 * with: scripts removed, same-origin iframes inlined, and every stylesheet, font and image the
 * page used stored locally with its references rewritten.
 *
 * Usage:
 *   node scripts/site-mirror.mjs --url https://example.com [--out mirror-output] [--limit N]
 *        [--delay SECONDS] [--block REGEX] [--locale en-US] [--width 1440] [--height 900]
 *        [--max-fetch 3000] [--finalize-only]
 *
 * --block skips requests whose URL matches REGEX. Use it for calls that do not change how a page
 * looks (cart, account, pings) to cut the load each page puts on the site.
 * --locale is the language the browser reports (default en-US). Set it to the site's own, e.g.
 * en-AU, so prices and dates format as its visitors see them. It is always set because Chromium
 * started with no LANG reports en-US@posix, which makes toLocaleString throw; Square Online's
 * product pages then render empty.
 *
 * Output, in --out:
 *   site/            the offline copy: open site/index.html, or serve the folder
 *   site/_pages.html every saved page, linked
 *   site/_assets/    stylesheets, scripts, fonts, images and media, by host and path
 *   raw/             each page's HTML exactly as the server sent it
 *   source/          Square Online/Weebly only: the owner's custom code, page data and theme
 *   manifest.json    per page: HTTP status, timing, iframes inlined, references still pointing live
 *   work/            crawl state; re-running with the same --out resumes, --finalize-only rebuilds
 *
 * Politeness: pages come from the sitemap (or from links, if there is none), robots.txt
 * Disallow rules are obeyed, one page loads at a time with the robots.txt Crawl-delay (default
 * 2s) between loads, and analytics, ad and error-reporting requests are blocked. A 429 or 503
 * reply is waited out (Retry-After, else a doubling backoff) and slows the rest of the crawl by
 * half, up to 5 minutes between pages; five refusals in a row stop it, and a later run resumes.
 *
 * What no mirror can get is code that runs on the server: the backend, database and the CMS's
 * templates. Carts, search, forms, logins and checkout need that backend, so they do not work
 * offline. Third-party embeds (YouTube, Maps) stay live links, and open shadow roots are not
 * captured.
 *
 * Set PW_EXECUTABLE_PATH to force a specific Chromium binary if auto-detection fails.
 */
import { chromium, request as apiRequest } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';

// Analytics, ad and error-reporting hosts. Blocked so a crawl neither lands in the site's stats
// nor waits on them. ec.editmysite.com is Square Online's Snowplow collector.
const TRACKER_HOSTS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'googleadservices.com',
  'googlesyndication.com', 'facebook.com', 'facebook.net', 'hotjar.com', 'clarity.ms', 'sentry.io',
  'datadoghq.com', 'nr-data.net', 'segment.io', 'segment.com', 'mixpanel.com', 'analytics.tiktok.com',
  'bat.bing.com', 'ct.pinterest.com', 'px.ads.linkedin.com', 'snap.licdn.com', 'ec.editmysite.com',
];
// Same-site endpoints that only relay tracking (Square Online forwards pixel events through the site).
const TRACKER_PATHS = /\/pixel-events(\/|$)/;
const NOT_PAGES = /\.(pdf|zip|jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|mp3|xml|txt|json|css|js)$/i;
const MAX_ASSET_BYTES = 200 * 1024 * 1024;

const EXT_BY_TYPE = {
  'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js',
  'application/x-javascript': '.js', 'application/json': '.json', 'application/manifest+json': '.webmanifest',
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/avif': '.avif', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico',
  'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf',
  'application/font-woff': '.woff', 'application/font-woff2': '.woff2', 'application/vnd.ms-fontobject': '.eot',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s, n = 10) => createHash('sha1').update(s).digest('hex').slice(0, n);
const noHash = (s) => s.split('#')[0];
const isTracker = (u) =>
  TRACKER_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h)) || TRACKER_PATHS.test(u.pathname);
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// How long a 429 or 503 asks us to wait: its Retry-After (seconds or a date), else 30s doubling,
// kept within 30s-10min.
function retryAfterMs(header, attempt) {
  let s = 30 * 2 ** attempt;
  if (header != null) s = Number.isNaN(Number(header)) ? (Date.parse(header) - Date.now()) / 1000 : Number(header);
  return 1000 * Math.round(Math.min(Math.max(s || 0, 30), 600));
}

function parseArgs(argv) {
  const args = { out: 'mirror-output', limit: Infinity, width: 1440, height: 900, maxFetch: 3000, locale: 'en-US' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--delay') args.delay = Number(argv[++i]);
    else if (a === '--block') args.block = new RegExp(argv[++i]);
    else if (a === '--width') args.width = Number(argv[++i]);
    else if (a === '--height') args.height = Number(argv[++i]);
    else if (a === '--locale') args.locale = argv[++i];
    else if (a === '--max-fetch') args.maxFetch = Number(argv[++i]);
    else if (a === '--finalize-only') args.finalizeOnly = true;
    else if (a === '--executable') args.executable = argv[++i];
  }
  if (!args.url) {
    console.error('Provide --url <https://…>');
    process.exit(1);
  }
  return args;
}

async function launchBrowser(executable) {
  const exe = executable || process.env.PW_EXECUTABLE_PATH;
  try {
    return await chromium.launch(exe ? { executablePath: exe } : {});
  } catch (e) {
    // Fall back to a common preinstalled path (e.g. managed CI images).
    return await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

// ---------------------------------------------------------------------------------------------
// robots.txt and sitemaps

// Rules for "User-agent: *" only. The longest matching rule wins and Allow wins ties (RFC 9309).
function parseRobots(text) {
  const rules = [];
  let delay = null, inStar = false, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) inStar = false;
      inStar = inStar || val === '*';
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!inStar) continue;
    if ((key === 'disallow' || key === 'allow') && val) rules.push({ allow: key === 'allow', path: val });
    else if (key === 'crawl-delay' && !Number.isNaN(parseFloat(val))) delay = parseFloat(val);
  }
  const compiled = rules.map((r) => ({
    ...r,
    re: new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')),
  }));
  const allowed = (u) => {
    const p = u.pathname + u.search;
    let best = null;
    for (const r of compiled) {
      if (!r.re.test(p)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
    return !best || best.allow;
  };
  return { allowed, delay, rules: rules.length };
}

const decodeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Every page URL listed in the site's sitemaps, following sitemap indexes.
async function sitemapUrls(http, start, robotsText) {
  const queue = [...robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  if (!queue.length) queue.push(new URL('/sitemap.xml', start).href);
  const seen = new Set(), urls = [];
  while (queue.length) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const res = await http.get(sm, { timeout: 30000 }).catch(() => null);
    const xml = res && res.ok() ? await res.text() : '';
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeXml(m[1]));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else urls.push(...locs);
  }
  return urls;
}

// ---------------------------------------------------------------------------------------------
// Local paths. Everything in site/ is addressed relative to site/, with forward slashes.

// A path segment that is safe on Windows, macOS and Linux. Altered segments get a hash suffix so
// two URLs never collide on one file.
function safeSegment(seg) {
  let clean = seg.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(clean)) clean = '_' + clean;
  if (clean === seg && seg.length <= 100) return seg;
  return clean.slice(0, 80) + '~' + hash(seg, 8);
}

// /a/b -> a/b/index.html and / -> index.html; a query string becomes its own folder.
function pageFile(u) {
  const segs = u.pathname.split('/').filter(Boolean).map(safeSegment);
  if (u.search) segs.push('q~' + hash(u.search));
  return posix.join(...segs, 'index.html');
}

// _assets/<host>/<path>, with the query folded into the name and an extension from the content type.
function assetFile(u, contentType) {
  const segs = u.pathname.split('/').filter(Boolean).map(safeSegment);
  const name = segs.pop() || 'index';
  const dot = name.lastIndexOf('.');
  let stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : EXT_BY_TYPE[(contentType || '').split(';')[0].trim()] || '.bin';
  if (u.search) stem += '~' + hash(u.search);
  return posix.join('_assets', safeSegment(u.host), ...segs, stem + ext);
}

function relHref(fromFile, toFile) {
  const rel = posix.relative(posix.dirname(fromFile), toFile) || posix.basename(toFile);
  return rel.split('/').map(encodeURIComponent).join('/');
}

// One key per page: no fragment, no trailing slash.
function pageKey(s) {
  try {
    const u = new URL(s);
    return u.origin + u.pathname.replace(/\/+$/, '') + u.search;
  } catch {
    return s;
  }
}

async function loadJsonl(file) {
  if (!existsSync(file)) return [];
  return (await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const appendJsonl = (file, obj) => appendFile(file, JSON.stringify(obj) + '\n');

async function saveFile(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

// ---------------------------------------------------------------------------------------------
// In-page snapshot

// Runs inside one frame. Returns its DOM as HTML with scripts and event handlers removed, image
// choices and form state frozen, and every URL made absolute and wrapped for the Node side:
// ⟦R:url⟧ a resource to store locally, ⟦S:url⟧ a srcset candidate (stored only if the browser
// used it), ⟦A:url⟧ a link that may point at another saved page, ⟦F:n⟧ an inlined iframe's HTML.
function serializeDocument() {
  const base = document.baseURI;
  const abs = (u) => {
    try { return new URL(String(u).trim(), base).href; } catch { return null; }
  };
  const wrap = (kind, u) => {
    if (u == null) return u;
    const t = String(u).trim();
    if (!t || /^(data:|blob:|javascript:|about:|mailto:|tel:|sms:|#)/i.test(t)) return u;
    const a = abs(t);
    return a ? `⟦${kind}:${a}⟧` : u;
  };
  const cssUrls = (css) => css
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (m, q, u) => `url(${q}${wrap('R', u)}${q})`)
    .replace(/@import\s+(['"])(.*?)\1/g, (m, q, u) => `@import ${q}${wrap('R', u)}${q}`);
  const srcset = (v) => {
    const out = [];
    let i = 0;
    while (i < v.length) {
      while (i < v.length && /[\s,]/.test(v[i])) i++;
      if (i >= v.length) break;
      let j = i;
      while (j < v.length && !/\s/.test(v[j])) j++;
      let url = v.slice(i, j), desc = '';
      if (/,+$/.test(url)) {
        url = url.replace(/,+$/, '');
        i = j;
      } else {
        let k = j;
        while (k < v.length && v[k] !== ',') k++;
        desc = v.slice(j, k).trim();
        i = k + 1;
      }
      out.push(desc ? `${wrap('S', url)} ${desc}` : wrap('S', url));
    }
    return out.join(', ');
  };

  // Tag live elements whose state lives outside their markup, clone, then copy that state across.
  const live = new Map();
  let n = 0;
  for (const el of document.querySelectorAll('style, link[rel~="stylesheet"], img, video, input, textarea, select, canvas, iframe')) {
    el.setAttribute('data-mirror-n', String(++n));
    live.set(String(n), el);
  }
  const root = document.documentElement.cloneNode(true);
  for (const el of live.values()) el.removeAttribute('data-mirror-n');
  for (const el of root.querySelectorAll('[data-mirror-n]')) {
    const src = live.get(el.getAttribute('data-mirror-n'));
    el.removeAttribute('data-mirror-n');
    const tag = el.localName;
    if (tag === 'style') {
      try {
        if (!src.textContent.trim() && src.sheet && src.sheet.cssRules.length) {
          el.textContent = [...src.sheet.cssRules].map((r) => r.cssText).join('\n');
        }
      } catch {}
    } else if (tag === 'link') {
      // Stylesheets generated at runtime (Square Online puts its custom fonts in one) sit behind
      // blob: URLs that die with the page, so carry their rules over as a <style> element.
      if (/^(blob|data):/i.test(src.href)) {
        try {
          const st = document.createElement('style');
          st.textContent = [...src.sheet.cssRules].map((r) => r.cssText).join('\n');
          if (src.getAttribute('media')) st.setAttribute('media', src.getAttribute('media'));
          el.replaceWith(st);
        } catch {}
      }
    } else if (tag === 'img' && src.currentSrc) {
      // Keep the one candidate the browser downloaded, so the copy never asks for one it lacks.
      el.setAttribute('src', src.currentSrc);
      el.removeAttribute('srcset');
      el.removeAttribute('sizes');
      if (el.parentElement && el.parentElement.localName === 'picture') {
        for (const s of [...el.parentElement.querySelectorAll('source')]) s.remove();
      }
    } else if (tag === 'video' && src.currentSrc) {
      el.setAttribute('src', src.currentSrc);
      for (const s of [...el.querySelectorAll('source')]) s.remove();
    } else if (tag === 'input') {
      if (src.type === 'checkbox' || src.type === 'radio') {
        if (src.checked) el.setAttribute('checked', '');
        else el.removeAttribute('checked');
      } else if (src.type !== 'password' && src.type !== 'file') el.setAttribute('value', src.value);
    } else if (tag === 'textarea') {
      el.textContent = src.value;
    } else if (tag === 'select') {
      [...el.options].forEach((o, i) => {
        if (src.options[i] && src.options[i].selected) o.setAttribute('selected', '');
        else o.removeAttribute('selected');
      });
    } else if (tag === 'canvas') {
      try {
        const img = document.createElement('img');
        img.src = src.toDataURL();
        for (const a of ['class', 'style', 'width', 'height']) if (el.hasAttribute(a)) img.setAttribute(a, el.getAttribute(a));
        el.replaceWith(img);
      } catch {} // a canvas tainted by cross-origin images cannot be read
    } else if (tag === 'iframe' && !el.hasAttribute('data-mirror-frame')) {
      // Hidden third-party frames (payment SDKs, trackers) have nothing to show offline.
      const cs = getComputedStyle(src);
      if (cs.display === 'none' || (parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1)) el.remove();
    }
  }

  for (const el of root.querySelectorAll(
    'script:not([type="application/ld+json"]), noscript, base, meta[charset], meta[http-equiv="content-type" i], ' +
    'meta[http-equiv="content-security-policy" i], link[rel~="preload"], link[rel~="modulepreload"], ' +
    'link[rel~="prefetch"], link[rel~="preconnect"], link[rel~="dns-prefetch"]',
  )) el.remove();
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  }

  for (const el of root.querySelectorAll('iframe, frame')) {
    const id = el.getAttribute('data-mirror-frame');
    if (id) {
      el.removeAttribute('data-mirror-frame');
      el.removeAttribute('src');
      el.setAttribute('srcdoc', `⟦F:${id}⟧`);
    } else if (el.getAttribute('src')) el.setAttribute('src', wrap('A', el.getAttribute('src')));
  }
  for (const [sel, attr] of [['img', 'src'], ['source', 'src'], ['video', 'src'], ['video', 'poster'],
    ['audio', 'src'], ['track', 'src'], ['embed', 'src'], ['object', 'data'], ['input', 'src']]) {
    for (const el of root.querySelectorAll(`${sel}[${attr}]`)) el.setAttribute(attr, wrap('R', el.getAttribute(attr)));
  }
  for (const el of root.querySelectorAll('img[srcset], source[srcset]')) el.setAttribute('srcset', srcset(el.getAttribute('srcset')));
  for (const el of root.querySelectorAll('link[href]')) {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    el.setAttribute('href', wrap(/stylesheet|icon|manifest|apple-touch/.test(rel) ? 'R' : 'A', el.getAttribute('href')));
  }
  for (const el of root.querySelectorAll('a[href], area[href]')) el.setAttribute('href', wrap('A', el.getAttribute('href')));
  for (const el of root.querySelectorAll('form[action]')) el.setAttribute('action', abs(el.getAttribute('action')) || '');
  for (const el of root.querySelectorAll('use, image, feImage')) {
    for (const a of ['href', 'xlink:href']) {
      const v = el.getAttribute(a);
      if (v && !v.startsWith('#')) el.setAttribute(a, wrap('R', v));
    }
  }
  for (const el of root.querySelectorAll('[style]')) el.setAttribute('style', cssUrls(el.getAttribute('style')));
  for (const el of root.querySelectorAll('style')) el.textContent = cssUrls(el.textContent);

  const head = root.querySelector('head');
  if (head) {
    const meta = document.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    head.prepend(meta);
  }
  const dt = document.doctype;
  const doctype = dt
    ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>\n`
    : '';
  return doctype + root.outerHTML;
}

// Serialize the page and every iframe it wrote itself or loaded from its own origin, deepest
// first, so finalize can nest each finished child into its parent as srcdoc.
async function snapshotFrames(page) {
  const main = page.mainFrame();
  const depth = (f) => {
    let d = 0;
    for (let p = f.parentFrame(); p; p = p.parentFrame()) d++;
    return d;
  };
  const origin = new URL(main.url()).origin;
  const ids = new Map([[main, 0]]);
  let next = 1;
  for (const f of page.frames().filter((f) => !f.isDetached()).sort((a, b) => depth(a) - depth(b))) {
    if (f === main || !ids.has(f.parentFrame())) continue;
    const fu = f.url();
    let sameOrigin = false;
    try { sameOrigin = new URL(fu).origin === origin; } catch {}
    if (!(fu === '' || fu.startsWith('about:') || sameOrigin)) continue;
    const el = await f.frameElement().catch(() => null);
    if (!el) continue;
    const id = next++;
    const ok = await el.evaluate((e, v) => e.setAttribute('data-mirror-frame', v), String(id)).then(() => true, () => false);
    if (ok) ids.set(f, id);
  }
  const frames = [];
  for (const [f, id] of [...ids].sort((a, b) => depth(b[0]) - depth(a[0]))) {
    frames.push({ id, html: await f.evaluate(serializeDocument).catch(() => null) });
  }
  return frames;
}

async function networkQuiet(page, net, idleMs, maxMs) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (net.inflight <= 0 && Date.now() - net.last >= idleMs) return;
    await page.waitForTimeout(100);
  }
}

// Scroll to the bottom in steps so lazy images and scroll-triggered sections load.
async function autoScroll(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(innerHeight * 0.8));
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 200; y += step, i++) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
  }).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Phase 1: crawl

async function crawl(args, out) {
  const start = new URL(args.url);
  const work = join(out, 'work');
  await mkdir(join(work, 'pages'), { recursive: true });

  const browser = await launchBrowser(args.executable);
  const context = await browser.newContext({
    viewport: { width: args.width, height: args.height }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: args.locale,
  });
  const robotsRes = await context.request.get(new URL('/robots.txt', start).href, { timeout: 30000 }).catch(() => null);
  const robotsText = robotsRes && robotsRes.ok() ? await robotsRes.text() : '';
  await writeFile(join(work, 'robots.txt'), robotsText);
  const robots = parseRobots(robotsText);
  let delay = 1000 * (args.delay ?? robots.delay ?? 2);
  const sameSite = (u) => u.host === start.host;
  const wanted = (s) => {
    try {
      const u = new URL(s);
      return /^https?:$/.test(u.protocol) && sameSite(u) && robots.allowed(u) && !NOT_PAGES.test(u.pathname);
    } catch {
      return false;
    }
  };

  const listed = (await sitemapUrls(context.request, start, robotsText)).filter(wanted);
  const fromSitemap = listed.length > 0;
  const queue = [], queued = new Set();
  const enqueue = (s) => {
    const key = pageKey(noHash(s));
    if (!queued.has(key) && queue.length < args.limit) {
      queued.add(key);
      queue.push(noHash(s));
    }
  };
  enqueue(start.href);
  listed.forEach(enqueue);
  console.log(`${fromSitemap ? `Sitemap lists ${listed.length} pages` : 'No sitemap; following links'}; ` +
    `robots.txt: ${robots.rules} rules, ${delay / 1000}s between pages.`);

  const done = new Set((await loadJsonl(join(work, 'pages.jsonl'))).filter((p) => p.ok).map((p) => pageKey(p.url)));
  const assets = new Set((await loadJsonl(join(work, 'assets.jsonl'))).filter((a) => existsSync(join(out, 'site', a.file))).map((a) => a.url));
  const media = new Set((await loadJsonl(join(work, 'media.jsonl'))).map((m) => m.url));
  const pending = new Map();

  await context.route('**/*', (route) => {
    const req = route.request();
    let u;
    try { u = new URL(req.url()); } catch { return route.continue(); }
    if (!/^https?:$/.test(u.protocol)) return route.continue();
    if (isTracker(u) || (sameSite(u) && !robots.allowed(u)) || (args.block && args.block.test(u.href))) {
      return route.abort('blockedbyclient');
    }
    // Third-party iframes stay live links in the copy, so their players need not load.
    let childFrame = false;
    try { childFrame = req.isNavigationRequest() && !!req.frame().parentFrame(); } catch {}
    if (childFrame && !sameSite(u)) return route.abort('blockedbyclient');
    return route.continue();
  });

  // Store every asset the first time any page receives it.
  context.on('response', (res) => {
    const url = noHash(res.url());
    if (!/^https?:/.test(url) || assets.has(url) || pending.has(url)) return;
    const type = res.request().resourceType();
    const ct = (res.headers()['content-type'] || '').toLowerCase();
    if (type === 'media') {
      // Browsers fetch video in ranges; finalize downloads the whole file instead.
      if (!media.has(url)) {
        media.add(url);
        appendJsonl(join(work, 'media.jsonl'), { url }).catch(() => {});
      }
      return;
    }
    const isAsset = ['stylesheet', 'font', 'image', 'script', 'manifest'].includes(type) ||
      (['xhr', 'fetch', 'other'].includes(type) && /^(image\/|font\/|text\/css|application\/(x-)?font)/.test(ct));
    if (!isAsset || res.status() !== 200) return;
    pending.set(url, (async () => {
      try {
        const body = await res.body();
        const file = assetFile(new URL(url), ct);
        await saveFile(join(out, 'site', file), body);
        if (/^text\/css/.test(ct) || type === 'stylesheet') await saveFile(join(work, 'css', file), body);
        assets.add(url);
        await appendJsonl(join(work, 'assets.jsonl'), { url, file, type: ct.split(';')[0] });
      } catch {} finally {
        pending.delete(url);
      }
    })());
  });

  let count = 0, refused = 0;
  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    if (done.has(pageKey(url))) continue;
    if (count++ > 0) await sleep(delay);
    const rec = await capturePage(context, url, pending, fromSitemap);
    if (rec.ok) {
      if (rec.raw) await saveFile(join(out, 'raw', pageFile(new URL(url))), rec.raw);
      rec.work = posix.join('pages', hash(url, 16) + '.json');
      await writeFile(join(work, rec.work), JSON.stringify({ url, finalUrl: rec.finalUrl, frames: rec.frames }));
    }
    for (const link of rec.links || []) if (wanted(link)) enqueue(link);
    const { raw, frames, links, ...summary } = rec;
    summary.frames = frames ? frames.length - 1 : 0;
    await appendJsonl(join(work, 'pages.jsonl'), summary);
    console.log(`[${i + 1}/${queue.length}] ${rec.ok ? 'ok ' : 'ERR'} ${rec.status ?? '-'} ${(rec.ms / 1000).toFixed(1)}s ` +
      `${summary.frames} frames  ${url}${rec.error ? '  ' + rec.error : ''}` +
      `${rec.jsErrors ? `  [${rec.jsErrors} JS errors, first: ${rec.firstJsError.slice(0, 90)}]` : ''}`);
    if (rec.throttled) {
      delay = Math.max(delay, Math.min(delay * 1.5, 300000)); // never shorter than asked for
      console.log(`  Rate-limited ${rec.throttled}x on this page; now ${delay / 1000}s between pages.`);
    }
    refused = !rec.ok && [403, 429, 503].includes(rec.status) ? refused + 1 : 0;
    if (refused >= 5) {
      console.log('The site refused 5 pages in a row, so stopping. Run the same command later to resume.');
      break;
    }
  }
  await Promise.allSettled([...pending.values()]);
  await browser.close();
}

async function capturePage(context, url, pending, fromSitemap) {
  const page = await context.newPage();
  const net = { inflight: 0, last: Date.now(), requests: 0, failed: 0, blocked: 0 };
  page.on('request', () => { net.inflight++; net.requests++; net.last = Date.now(); });
  const settle = () => { net.inflight--; net.last = Date.now(); };
  page.on('requestfinished', settle);
  page.on('requestfailed', (r) => {
    if (/BLOCKED_BY_CLIENT/.test((r.failure() || {}).errorText || '')) net.blocked++;
    else net.failed++;
    settle();
  });
  // A page can load fine and still render half empty when its own code throws, so count errors.
  // Frameworks log the exceptions they catch with console.error; failed loads of blocked requests are noise.
  const js = { errors: 0, first: null };
  const jsError = (text) => { js.errors++; js.first = js.first || text.slice(0, 200); };
  page.on('pageerror', (e) => jsError(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) jsError(m.text()); });
  const t0 = Date.now();
  const rec = { url, ok: false };
  try {
    let res = null, networkRetry = true;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch((e) => {
        rec.error = e.message.split('\n')[0];
        return null;
      });
      if (!res) {
        if (!networkRetry) break;
        networkRetry = false;
        await sleep(10000);
        continue;
      }
      if (res.status() !== 429 && res.status() !== 503) break;
      // The site asked us to slow down: wait as long as it says, then try again.
      rec.throttled = (rec.throttled || 0) + 1;
      if (attempt === 3) break;
      const wait = retryAfterMs(res.headers()['retry-after'], attempt);
      console.log(`  ${res.status()} from the site; waiting ${wait / 1000}s before retrying ${url}`);
      await sleep(wait);
    }
    if (!res) return rec;
    delete rec.error;
    rec.status = res.status();
    rec.finalUrl = page.url();
    if (rec.status >= 400) return rec; // an error page: nothing to keep, so stop asking the site for its assets
    rec.raw = await res.body().catch(() => null);
    await networkQuiet(page, net, 1000, 20000);
    await autoScroll(page);
    await networkQuiet(page, net, 1000, 15000);
    await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(500);
    await Promise.allSettled([...pending.values()]);
    rec.title = await page.title().catch(() => '');
    rec.frames = await snapshotFrames(page);
    if (!fromSitemap) {
      rec.links = await page.$$eval('a[href]', (as) => as.map((a) => a.href)).catch(() => []);
    }
    rec.ok = rec.status < 400 && rec.frames[rec.frames.length - 1].html != null;
  } finally {
    Object.assign(rec, { ms: Date.now() - t0, requests: net.requests, blocked: net.blocked, failedRequests: net.failed });
    if (js.errors) Object.assign(rec, { jsErrors: js.errors, firstJsError: js.first });
    await page.close().catch(() => {});
  }
  return rec;
}

// ---------------------------------------------------------------------------------------------
// Phase 2: finalize — fetch what the pages referenced but the browser never loaded, rewrite
// stylesheets and pages to local paths, extract platform source, write the manifest.

const cssRefs = (css) => [
  ...[...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => m[2]),
  ...[...css.matchAll(/@import\s+(['"])(.*?)\1/g)].map((m) => m[2]),
].filter((u) => u && !/^(data:|#)/i.test(u.trim()));

function rewriteCss(css, cssUrl, cssFile, assets) {
  const map = (u) => {
    if (/^(data:|#)/i.test(u.trim())) return null;
    let a;
    try { a = new URL(u.trim(), cssUrl).href; } catch { return null; }
    const f = assets.get(noHash(a));
    return f ? relHref(cssFile, f) + (a.includes('#') ? a.slice(a.indexOf('#')) : '') : a;
  };
  return css
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (m, q, u) => { const r = map(u); return r == null ? m : `url(${q}${r}${q})`; })
    .replace(/@import\s+(['"])(.*?)\1/g, (m, q, u) => { const r = map(u); return r == null ? m : `@import ${q}${r}${q}`; });
}

// Resolve one page's markers and nest its iframes, deepest first.
function renderPage(rec, file, assets, pages) {
  let unresolved = 0;
  const resolveMarkers = (html) => html.replace(/⟦([RSA]):([^⟧]*)⟧/g, (m, kind, text) => {
    const url = text.replace(/&amp;/g, '&');
    const frag = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    const target = kind === 'A' ? pages.get(pageKey(url)) : assets.get(noHash(url));
    if (target) return relHref(file, target) + frag;
    if (kind !== 'A') unresolved++;
    return text;
  });
  const done = new Map();
  for (const fr of rec.frames) {
    const html = resolveMarkers(fr.html || '').replace(/⟦F:(\d+)⟧/g, (m, id) => escapeAttr(done.get(Number(id)) || ''));
    done.set(fr.id, html);
  }
  const note = `<!-- Offline copy of ${rec.finalUrl || rec.url}, saved by scripts/site-mirror.mjs. Scripts removed. -->\n`;
  const html = done.get(0);
  const cut = html.startsWith('<!DOCTYPE') ? html.indexOf('>') + 2 : 0;
  return { html: html.slice(0, cut) + note + html.slice(cut), unresolved };
}

// Square Online and Weebly ship each page's content, theme and the owner's custom code as JSON in
// window.__BOOTSTRAP_STATE__. That JSON is the nearest thing these sites have to source files.
function squareOnlineSource(raw) {
  const m = raw.match(/window\.__BOOTSTRAP_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!m) return null;
  let state;
  try { state = JSON.parse(m[1]); } catch { return null; }
  const embeds = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.embedCode && typeof o.embedCode.content === 'string') embeds.push(o.embedCode.content);
    for (const v of Object.values(o)) walk(v);
  })(state.siteData && state.siteData.page);
  const sd = state.siteData || {};
  return {
    customCodes: (sd.snapshot && sd.snapshot.properties && sd.snapshot.properties.customCodes) || [],
    embeds,
    page: sd.page,
    site: { site: sd.site, snapshot: sd.snapshot, storeInfo: state.storeInfo },
  };
}

async function finalize(args, out) {
  const start = new URL(args.url);
  const work = join(out, 'work');
  const robotsText = existsSync(join(work, 'robots.txt')) ? await readFile(join(work, 'robots.txt'), 'utf8') : '';
  const robots = parseRobots(robotsText);
  const records = new Map();
  for (const p of await loadJsonl(join(work, 'pages.jsonl'))) records.set(pageKey(p.url), p);
  const okPages = [...records.values()].filter((p) => p.ok && p.work);
  // raw/ keeps only pages that loaded; earlier versions also saved error pages there.
  for (const p of records.values()) if (!p.ok) await rm(join(out, 'raw', pageFile(new URL(p.url))), { force: true });
  const assetRows = (await loadJsonl(join(work, 'assets.jsonl'))).filter((a) => existsSync(join(out, 'site', a.file)));
  const assets = new Map(assetRows.map((a) => [a.url, a.file]));
  const types = new Map(assetRows.map((a) => [a.url, a.type]));

  const pages = new Map();
  for (const p of okPages) {
    const file = pageFile(new URL(p.url));
    pages.set(pageKey(p.url), file);
    if (p.finalUrl) pages.set(pageKey(p.finalUrl), file);
  }

  // 1. Download what pages and stylesheets reference but the browser never fetched, plus whole media files.
  const http = await apiRequest.newContext({ timeout: 60000 });
  let fetched = 0, attempted = 0;
  const tried = new Set();
  const fetchAsset = async (url, { checkSize = false } = {}) => {
    if (assets.has(url) || tried.has(url) || attempted >= args.maxFetch) return;
    tried.add(url);
    let u;
    try { u = new URL(url); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || isTracker(u) || (u.host === start.host && !robots.allowed(u))) return;
    attempted++;
    if (checkSize) {
      // Ask for the size first: a get() holds the whole body in memory.
      const head = await http.head(url, { maxRedirects: 5 }).catch(() => null);
      if (!head || !head.ok() || Number(head.headers()['content-length'] || 0) > MAX_ASSET_BYTES) return;
    }
    const res = await http.get(url, { maxRedirects: 5 }).catch(() => null);
    if (u.host === start.host) await sleep(250);
    if (!res || !res.ok()) return;
    const ct = (res.headers()['content-type'] || '').toLowerCase();
    if (/^text\/html/.test(ct) || Number(res.headers()['content-length'] || 0) > MAX_ASSET_BYTES) return;
    const body = await res.body().catch(() => null);
    if (!body) return;
    const file = assetFile(u, ct);
    await saveFile(join(out, 'site', file), body);
    if (/^text\/css/.test(ct)) await saveFile(join(work, 'css', file), body);
    assets.set(url, file);
    types.set(url, ct.split(';')[0]);
    await appendJsonl(join(work, 'assets.jsonl'), { url, file, type: ct.split(';')[0] });
    fetched++;
  };
  for (const m of await loadJsonl(join(work, 'media.jsonl'))) await fetchAsset(m.url, { checkSize: true });
  for (const p of okPages) {
    const rec = JSON.parse(await readFile(join(work, p.work), 'utf8'));
    for (const fr of rec.frames) {
      for (const m of (fr.html || '').matchAll(/⟦R:([^⟧]*)⟧/g)) await fetchAsset(noHash(m[1].replace(/&amp;/g, '&')));
    }
  }
  // Stylesheets can import stylesheets, so follow a few levels.
  for (let level = 0, seenCss = new Set(); level < 3; level++) {
    const sheets = [...assets].filter(([url, file]) => /^text\/css/.test(types.get(url) || '') && !seenCss.has(url));
    if (!sheets.length) break;
    for (const [url, file] of sheets) {
      seenCss.add(url);
      const css = await readFile(join(work, 'css', file), 'utf8').catch(() => '');
      for (const ref of cssRefs(css)) {
        try { await fetchAsset(noHash(new URL(ref.trim(), url).href)); } catch {}
      }
    }
  }
  await http.dispose();

  // 2. Point stylesheets at local copies, always rewriting from the original text.
  for (const [url, file] of assets) {
    if (!/^text\/css/.test(types.get(url) || '')) continue;
    const css = await readFile(join(work, 'css', file), 'utf8').catch(() => null);
    if (css != null) await writeFile(join(out, 'site', file), rewriteCss(css, url, file, assets));
  }

  // 3. Pages.
  let unresolvedTotal = 0;
  for (const p of okPages) {
    const rec = JSON.parse(await readFile(join(work, p.work), 'utf8'));
    const file = pageFile(new URL(p.url));
    const { html, unresolved } = renderPage(rec, file, assets, pages);
    await saveFile(join(out, 'site', file), html);
    p.file = posix.join('site', file);
    p.unresolved = unresolved;
    unresolvedTotal += unresolved;
  }
  const list = okPages.map((p) => `<li><a href="${relHref('_pages.html', pageFile(new URL(p.url)))}">` +
    `${escapeAttr(p.title || p.url).replace(/</g, '&lt;')}</a> <small>${escapeAttr(new URL(p.url).pathname)}</small></li>`);
  await writeFile(join(out, 'site', '_pages.html'),
    `<!DOCTYPE html>\n<meta charset="utf-8"><title>Saved pages</title>\n<h1>${okPages.length} saved pages of ${start.host}</h1>\n<ol>\n${list.join('\n')}\n</ol>\n`);

  // 4. Platform source (Square Online / Weebly), regenerated from raw/ each time.
  await rm(join(out, 'source'), { recursive: true, force: true });
  let sourceNote = null;
  const seenCode = new Set();
  for (const p of okPages) {
    const rawFile = join(out, 'raw', pageFile(new URL(p.url)));
    if (!existsSync(rawFile)) continue;
    const src = squareOnlineSource(await readFile(rawFile, 'utf8'));
    if (!src) continue;
    if (!sourceNote) {
      sourceNote = { platform: 'Square Online / Weebly', customCodes: 0, pagesWithEmbeds: 0, embeds: 0 };
      await saveFile(join(out, 'source', 'site.json'), JSON.stringify(src.site, null, 2));
    }
    for (const c of src.customCodes) {
      const body = typeof c === 'string' ? c : c.content || '';
      if (!body || seenCode.has(hash(body))) continue;
      seenCode.add(hash(body));
      await saveFile(join(out, 'source', 'custom-code', `custom-code-${++sourceNote.customCodes}.html`), body);
    }
    const pageDir = posix.dirname(pageFile(new URL(p.url)));
    const dir = join(out, 'source', 'pages', pageDir === '.' ? '_home' : pageDir);
    await saveFile(join(dir, 'page.json'), JSON.stringify(src.page, null, 2));
    for (const [i, e] of src.embeds.entries()) await saveFile(join(dir, `embed-${i + 1}.html`), e);
    if (src.embeds.length) sourceNote.pagesWithEmbeds++;
    sourceNote.embeds += src.embeds.length;
  }

  // 5. Manifest.
  const byType = {};
  for (const [url, file] of assets) {
    const t = types.get(url) || '';
    const kind = /css/.test(t) ? 'css' : /javascript/.test(t) ? 'js' : /font/.test(t) ? 'font'
      : /^image\//.test(t) ? 'image' : /^(video|audio)\//.test(t) ? 'media' : 'other';
    const size = (await stat(join(out, 'site', file)).catch(() => ({ size: 0 }))).size;
    byType[kind] = byType[kind] || { files: 0, bytes: 0 };
    byType[kind].files++;
    byType[kind].bytes += size;
  }
  const failed = [...records.values()].filter((p) => !p.ok);
  const manifest = {
    site: start.href,
    finalizedAt: new Date().toISOString(),
    robots: { rules: robots.rules, crawlDelaySeconds: robots.delay },
    pages: { saved: okPages.length, failed: failed.length },
    assets: { stored: assets.size, fetchedInFinalize: fetched, byType },
    referencesStillLive: unresolvedTotal,
    pagesWithJsErrors: okPages.filter((p) => p.jsErrors).length,
    platformSource: sourceNote,
    pageDetail: [...records.values()],
  };
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Finalized: ${okPages.length} pages, ${failed.length} failed, ${assets.size} assets ` +
    `(${fetched} fetched now), ${unresolvedTotal} references left pointing live.` +
    (sourceNote ? ` Square Online source: ${sourceNote.customCodes} custom code blocks, ${sourceNote.embeds} embeds.` : ''));
}

async function main() {
  const args = parseArgs(process.argv);
  const out = resolve(args.out);
  if (!args.finalizeOnly) await crawl(args, out);
  await finalize(args, out);
  console.log(`\nOffline copy → ${join(out, 'site', 'index.html')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
