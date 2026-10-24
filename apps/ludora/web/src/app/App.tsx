import type { CSSProperties } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { X } from 'lucide-react';
import { TooltipProvider } from '../ui/primitives.tsx';
import { router } from './routes.tsx';
import { ApiError } from '../lib/api.ts';
import { NoticeGate } from '../features/moderation/NoticeGate.tsx';
import { SoundSettingsSync } from '../lib/sound/react.tsx';

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
        <SoundSettingsSync />
        {/* Styled in app.css: a solid fill by kind (white, mint, coral, gold or blue) with ink text, floating on a soft shadow. */}
        <Toaster position="top-center" closeButton icons={{ close: <X className="size-[18px]" strokeWidth={2.5} aria-hidden /> }} toastOptions={{ closeButtonAriaLabel: 'Close notification' }} style={{ '--width': '380px' } as CSSProperties} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
