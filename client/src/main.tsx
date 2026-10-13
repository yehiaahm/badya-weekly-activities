import '@fontsource-variable/oswald';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/student.css';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { FeedbackProvider } from './components/feedback.tsx';
import { ApiError } from './lib/api.ts';
import { keys } from './lib/queries.ts';
import { router } from './router.tsx';

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // An expired session shows up as a 401 on any query: re-check the session so
    // the admin area redirects to sign-in and My Reservations asks to verify again.
    onError: (error, failedQuery) => {
      if (error instanceof ApiError && error.status === 401 && failedQuery.queryKey[0] !== 'session') {
        void queryClient.invalidateQueries({ queryKey: keys.session });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Client errors (401/403/404/409…) won't fix themselves on retry.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </QueryClientProvider>
  </StrictMode>,
);
