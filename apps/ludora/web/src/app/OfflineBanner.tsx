import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

/** A clear banner on app pages while the device is offline, and "Back online" for a moment when it returns. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [back, setBack] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    const up = () => {
      setOnline(true);
      setBack(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBack(false), 4000);
    };
    const down = () => {
      setOnline(false);
      setBack(false);
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.clearTimeout(timer.current);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="sticky top-16 z-20 empty:hidden">
      {!online || back ? (
        <p className={`flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-bold text-on-accent ${online ? 'bg-glim' : 'bg-ember'}`}>
          {online ? <Wifi className="size-4 shrink-0" aria-hidden /> : <WifiOff className="size-4 shrink-0" aria-hidden />}
          {online ? 'Back online.' : 'You are offline. Pages and games need a connection; anything you were typing is still here.'}
        </p>
      ) : null}
    </div>
  );
}
