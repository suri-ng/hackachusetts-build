// Vitest setup for the jsdom (React component) project.
// Extends `expect` with jest-dom matchers (toBeInTheDocument, etc.)
// and clears the DOM between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
