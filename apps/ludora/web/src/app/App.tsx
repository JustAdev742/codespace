import type { CSSProperties } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { X } from 'lucide-react';
import { TooltipProvider } from '../ui/primitives.tsx';
import { router } from './routes.tsx';
import { ApiError } from '../lib/api.ts';
import { NoticeGate } from '../features/moderation/NoticeGate.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <NoticeGate />
        {/* Styled as Ludora tags in app.css: paper or an accent fill by type, with an ink edge, like the game's news. */}
        <Toaster position="top-center" closeButton icons={{ close: <X className="size-[18px]" strokeWidth={2.5} aria-hidden /> }} toastOptions={{ closeButtonAriaLabel: 'Close notification' }} style={{ '--width': '380px' } as CSSProperties} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
