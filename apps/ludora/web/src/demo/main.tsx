import { StrictMode, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Navigate, RouterProvider, createHashRouter } from 'react-router';
import { Toaster } from 'sonner';
import { X } from 'lucide-react';
import '../styles/app.css';
import { Spinner, TooltipProvider } from '../ui/primitives.tsx';
import { buttonClass } from '../ui/Button.tsx';
import { LogoMark } from '../art/icons.tsx';
import DemoHome from './DemoHome.tsx';

/*
 * The playable demo: a static page with no server, for GitHub Pages. Routes
 * live after the # so any static host can serve it, and links the shared
 * screens make to pages the demo does not have (Host, Sign up) come back to
 * its start page.
 */

// A room gives its players random ids. Browsers only offer crypto.randomUUID on
// HTTPS and localhost, so a copy served over plain HTTP on a home network makes its own.
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}

function DemoError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark size={64} />
      <h1 className="font-display text-3xl font-extrabold">That page tripped over</h1>
      <p className="text-text-2">Something went wrong while showing this page. Reloading usually fixes it.</p>
      <div className="flex gap-2">
        <Link to="/" className={buttonClass('primary', 'lg')}>
          Start again
        </Link>
        <button type="button" className={buttonClass('secondary', 'lg')} onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </main>
  );
}

const router = createHashRouter([
  {
    errorElement: <DemoError />,
    hydrateFallbackElement: <Spinner label="Loading Ludora" />,
    children: [
      { index: true, element: <DemoHome /> },
      // The game, with the rules of every mode, loads when a game starts.
      { path: 'play', lazy: async () => ({ Component: (await import('./DemoGame.tsx')).default }) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

// Nothing in the demo asks a server for data; the client is here for any shared screen that expects one.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" closeButton icons={{ close: <X className="size-[18px]" strokeWidth={2.5} aria-hidden /> }} toastOptions={{ closeButtonAriaLabel: 'Close notification' }} style={{ '--width': '380px' } as CSSProperties} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
