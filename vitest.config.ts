import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// Root config shared by the workspace projects (see vitest.workspace.ts).
// The node project exercises the pure lib/ + server core; the jsdom project
// runs React component tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
});
