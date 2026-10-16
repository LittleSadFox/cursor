import base from '@climbing-coach/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(base, defineConfig({}));
