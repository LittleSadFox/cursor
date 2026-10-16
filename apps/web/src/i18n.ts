import { i18n } from '@lingui/core';

import { loadCatalog } from './catalog.js';
import { messages } from './locales/en.js';

loadCatalog(i18n, 'en', messages);

export { i18n };
