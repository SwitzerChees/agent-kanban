import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'tests',
    // Keep plain `vitest run <file>` invocations from walking the persistent
    // task worktrees under .data (they contain full repository copies and
    // break type-level collection).
    exclude: [
      'node_modules',
      '.nuxt',
      '.output',
      '.data',
      'dist',
    ],
  },
});
