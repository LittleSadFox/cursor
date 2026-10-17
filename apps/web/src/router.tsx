import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { api } from './api.js';
import { ComparePage } from './pages/compare/compare.js';
import { compareSearch } from './pages/compare/search.js';
import { HomePage } from './pages/home.js';
import { PlaceholderPage } from './pages/placeholder.js';
import { RecordingsPage } from './pages/recordings.js';
import { ReviewPage } from './pages/review/review-page.js';
import { SettingsPage } from './pages/settings.js';
import { SetupPage } from './pages/setup.js';
import { TrashPage } from './pages/trash.js';
import { Shell } from './ui/shell.js';

const rootRoute = createRootRoute({
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const settings = await api.system.getSettings();
    if (!settings.libraryReady) throw redirect({ to: '/setup' });
  },
  component: HomePage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trash',
  component: TrashPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  component: () => <PlaceholderPage messageId="placeholder.library" />,
});

const recordingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recordings',
  component: RecordingsPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recordings/$id/review',
  component: function ReviewRoute() {
    const { id } = reviewRoute.useParams();
    return <ReviewPage key={id} id={id} />;
  },
});

const compareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/compare',
  validateSearch: compareSearch,
  component: function CompareRoute() {
    return <ComparePage {...compareRoute.useSearch()} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  settingsRoute,
  trashRoute,
  libraryRoute,
  recordingsRoute,
  reviewRoute,
  compareRoute,
]);

export const router = createRouter({ routeTree });
