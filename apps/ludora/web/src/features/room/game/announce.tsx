import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/*
 * What a screen reader says as the game moves on. One polite live region,
 * always in the page, hears each change once: a new question, the result, the
 * answer, the standings, a pause, the end. Regions added together with their
 * text are read unreliably, and ones that update on every answer get noisy in
 * a class of thirty, so game screens announce through this instead.
 */

const Say = createContext<(text: string) => void>(() => {});

export function Announcer({ children }: { children: ReactNode }) {
  const [text, setText] = useState('');
  const queue = useRef<string[]>([]);
  const timer = useRef(0);
  const say = useCallback((next: string) => {
    // Messages from one change (the result, then the answer) are read together, in order,
    // each once even if its effect ran twice.
    if (!queue.current.includes(next)) queue.current.push(next);
    window.clearTimeout(timer.current);
    // Empty the region first, so the same words twice in a row are still read.
    setText('');
    timer.current = window.setTimeout(() => {
      setText(queue.current.join(' '));
      queue.current = [];
    }, 80);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Say.Provider value={say}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {text}
      </div>
    </Say.Provider>
  );
}

/**
 * Says `text` when the component appears and whenever `key` changes; the key
 * defaults to the text. Counts that tick up while it is showing are not re-read.
 */
export function useAnnounce(text: string | null | undefined, key: unknown = text) {
  const say = useContext(Say);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    if (latest.current) say(latest.current);
  }, [key, say]);
}
