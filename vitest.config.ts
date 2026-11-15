import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    coverage: {
      include: ['client/assets/scripts/core/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90 },
    },
  },
});
