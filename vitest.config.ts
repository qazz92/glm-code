import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 15_000,
    include: ['packages/*/test/**/*.{test,spec}.{ts,tsx}'],
    coverage: { reporter: ['text', 'lcov'], include: ['packages/*/src/**/*.{ts,tsx}'] },
    exclude: ['**/repos/**', '**/node_modules/**', '**/dist/**']
  }
})
