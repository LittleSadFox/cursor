import { randomBytes } from 'node:crypto';

import type { RandomBytes } from '@climbing-coach/core';

export const nodeRandomBytes: RandomBytes = (size) => randomBytes(size);
