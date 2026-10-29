/** Focus has nowhere useful to be: it is on the page itself, or on an element that has gone or is hidden. */
export function focusAdrift(): boolean {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected || a.getClientRects().length === 0;
}

/**
 * Moves focus to an element that has just appeared. Browsers can turn the first try down while a
 * new screen settles (WebKit sometimes does), and focus can fall back to the page in the first
 * moments, so it checks again on each frame for a second, until the person clicks, taps or presses
 * a key: from then on, where focus goes is theirs. (A press on plain text puts focus on the page
 * for a moment; taking it back then would scroll the page under the pointer and lose the click.)
 *
 * Without `force`, focus moves only if it is adrift. With it, the first try always moves focus,
 * and later ones do while focus has not moved since. Returns a function that stops checking.
 */
export function focusSettled(target: () => HTMLElement | null | undefined, { force = false, preventScroll = false, ms = 1000 } = {}): () => void {
  const from = document.activeElement;
  const until = performance.now() + ms;
  let frame = 0;
  const attempt = (first: boolean) => {
    const el = target();
    if (!el?.isConnected || document.activeElement === el) return;
    if (focusAdrift() || (force && (first || document.activeElement === from))) el.focus({ preventScroll });
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('pointerdown', stop, true);
    document.removeEventListener('keydown', stop, true);
  };
  attempt(true);
  document.addEventListener('pointerdown', stop, true);
  document.addEventListener('keydown', stop, true);
  const tick = () => {
    attempt(false);
    if (performance.now() < until) frame = requestAnimationFrame(tick);
    else stop();
  };
  frame = requestAnimationFrame(tick);
  return stop;
}
