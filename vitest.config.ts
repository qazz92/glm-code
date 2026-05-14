import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 15_000,
    coverage: { reporter: ['text', 'lcov'], include: ['packages/*/src/**/*.ts'] },
    exclude: ['**/repos/**', '**/node_modules/**', '**/dist/**']
  }
})