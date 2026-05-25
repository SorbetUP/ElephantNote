import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    environment: 'jsdom',
    // Many tests rely on file-level module mocks (vi.mock). Ensure mocks/modules do not leak
    // across test files, otherwise ordering becomes flaky when running in a shared worker.
    isolate: true,
    // Some UI-heavy tests (markdown rendering, share flows) can exceed the default 5s under load
    // when running in a threaded pool. Keep this high enough to avoid spurious timeouts.
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    clearMocks: true,
  },
});
