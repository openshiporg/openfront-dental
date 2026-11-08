import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    include: ['features/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', '.keystone/**', 'tests/**/*.test.cjs'],
    environment: 'node',
    // A fixed throwaway key so sealed secrets work in tests (never a real key).
    env: { DENTAL_SECRET_KEY: '0707070707070707070707070707070707070707070707070707070707070707' },
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Database suites share one scratch database; run files one at a time.
    fileParallelism: false,
  },
})
