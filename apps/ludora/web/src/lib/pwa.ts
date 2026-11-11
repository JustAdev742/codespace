/*
 * Installing Ludora as an app. The service worker (public/sw.js) keeps only the app's
 * hashed files and an offline page; pages always come from the network first and nothing
 * under /api, /socket.io or /uploads is ever stored, so a deploy never serves an old app
 * and nothing private sits in the cache.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function startPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
  // Production builds only: in development the worker would get between Vite and the page.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* the app works the same without it */
      });
    });
  }
}

export type InstallState = 'installed' | 'ready' | 'ios' | 'unavailable';

export function installState(): InstallState {
  if (installed || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone) return 'installed';
  if (deferred) return 'ready';
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
  return 'unavailable';
}

export function subscribeInstall(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Shows the browser's own install prompt. Resolves true when the player installed it. */
export async function promptInstall(): Promise<boolean> {
  const p = deferred;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}
