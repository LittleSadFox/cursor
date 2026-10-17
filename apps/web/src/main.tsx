import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Styles first so a later import failure is not an unstyled blank document.
import './styles.css';
import './i18n.js';
import { router } from './router.js';
import { AppErrorBoundary } from './ui/error-boundary.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

document.getElementById('boot-fallback')?.remove();

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
