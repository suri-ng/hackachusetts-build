import { defineWorkspace } from 'vitest/config';

// Two projects:
//  - node:  pure lib/ core + server (route/SQL) tests, no DOM
//  - jsdom: React component tests, with jest-dom matchers via vitest.setup.ts
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'node',
      environment: 'node',
      include: [
        'lib/**/*.test.ts',
        'supabase/**/*.test.ts',
        'app/api/**/*.test.ts',
        'scripts/**/*.test.ts',
      ],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'jsdom',
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      include: ['app/**/*.test.tsx', 'components/**/*.test.tsx'],
    },
  },
]);
