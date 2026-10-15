import type { LinguiConfig } from '@lingui/conf';

/**
 * Lingui is required from day one (BUILD_PLAN §1.1). Catalogs and the ESLint plugin
 * activate when real UI strings land in P2-A; English is the launch locale.
 */
const config: LinguiConfig = {
  locales: ['en'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: '<rootDir>/apps/web/src/locales/{locale}/messages',
      include: ['apps/web/src'],
    },
  ],
  format: 'po',
};

export default config;
