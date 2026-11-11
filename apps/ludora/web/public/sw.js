/*
 * Ludora's service worker. It keeps the app shell only, so installed Ludora opens fast and says
 * clearly when it is offline:
 *   - pages (navigations) always come from the network; offline, the offline page is shown;
 *   - files under /assets/ have a content hash in their name, so a stored copy can never be stale;
 *   - nothing else is stored: never /api, /socket.io, /uploads or any private file.
 * A deploy changes the asset names, so the new app loads on the next visit.
 */
const VERSION = 'ludora-shell-v1';
const SHELL = ['/offline.html', '/icons/icon-192.png', '/favicon.svg'];
const MAX_ASSETS = 200;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Always the network, never a stored page.
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') {
          await cache.put(req, res.clone());
          void trim(cache);
        }
        return res;
      }),
    );
  }
  // Everything else (the API, live games, uploads) goes straight to the network, untouched.
});
