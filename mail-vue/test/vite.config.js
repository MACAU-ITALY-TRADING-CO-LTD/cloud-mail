import { defineConfig, mergeConfig } from 'vite';
import appConfig from '../vite.config.js';

// Exercise production bundles. A cold Vite dev server can reload during dependency
// discovery, which interrupts the first parallel test's dynamic imports on CI.
export default defineConfig(env => mergeConfig(appConfig(env), {
  build: {
    outDir: '.signature-test-dist',
    rollupOptions: { input: 'test/signatures.html' }
  }
}));
