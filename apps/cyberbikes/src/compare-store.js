// The bikes a shopper has picked to compare. Kept per browser (a convenience, not a record), so the
// selection follows them from page to page. Works in memory when storage is blocked.

const KEY = 'cb-compare';
export const MAX_COMPARE = 3;
let memory = [];

export function compareIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string').slice(0, MAX_COMPARE) : [];
  } catch { return memory; }
}

function save(ids) {
  memory = ids;
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* blocked: memory only */ }
  window.dispatchEvent(new CustomEvent('cb-compare-change', { detail: { ids } }));
}

/** Adds or removes a bike. Returns 'added', 'removed' or 'full'. */
export function toggleCompare(id) {
  const ids = compareIds();
  if (ids.includes(id)) { save(ids.filter(x => x !== id)); return 'removed'; }
  if (ids.length >= MAX_COMPARE) return 'full';
  save([...ids, id]);
  return 'added';
}

export const removeCompare = id => save(compareIds().filter(x => x !== id));
export const clearCompare = () => save([]);

/** Messages for screen readers go through the compare tray's live region. */
export const announce = message => window.dispatchEvent(new CustomEvent('cb-announce', { detail: { message } }));

window.addEventListener('storage', e => {
  if (e.key === KEY) window.dispatchEvent(new CustomEvent('cb-compare-change', { detail: { ids: compareIds() } }));
});

/** Wires every [data-compare] button inside `root` to the store and keeps their state current. */
export function bindCompareButtons(root, bikesById) {
  root.addEventListener('click', e => {
    const button = e.target.closest('[data-compare]');
    if (!button) return;
    const id = button.dataset.compare;
    const name = bikesById.get(id)?.name ?? 'This bike';
    const result = toggleCompare(id);
    if (result === 'full') announce(`You can compare up to ${MAX_COMPARE} bikes. Remove one to add ${name}.`);
    else announce(result === 'added' ? `${name} added to compare. ${compareIds().length} of ${MAX_COMPARE} chosen.`
      : `${name} removed from compare.`);
  });
}
