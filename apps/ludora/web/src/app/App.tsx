import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { TooltipProvider } from '../ui/primitives.tsx';
import { router } from './routes.tsx';
import { ApiError } from '../lib/api.ts';

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
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
