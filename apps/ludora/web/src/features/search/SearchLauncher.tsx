import { lazy, Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

/* The palette itself loads only when it is first opened, so the header stays light. */
const SearchPalette = lazy(() => import('./SearchPalette.tsx'));

/**
 * Search everything: a button in the header, and Ctrl+K or Cmd+K anywhere. Opens a palette
 * over pages, game modes, question sets, classes and friends.
 */
export function SearchLauncher() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
        className="flex h-11 items-center gap-2 rounded-full border border-line bg-raised px-3 text-sm font-semibold text-text-2 hover:bg-surface-2 hover:text-text"
      >
        <Search className="size-5" aria-hidden />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd className="hidden rounded-[var(--radius-s)] border border-line px-1.5 font-sans text-xs lg:inline" aria-hidden>
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {loaded ? (
        <Suspense fallback={null}>
          <SearchPalette open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
