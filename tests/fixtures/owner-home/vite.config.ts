import { defineConfig, mergeConfig } from 'vite';
import base from '../offline-mobile/vite.config';

export default defineConfig(mergeConfig(base, {
  build: { rollupOptions: { input: 'tests/fixtures/owner-home/index.html' } },
}));
