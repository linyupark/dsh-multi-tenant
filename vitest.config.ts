import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // .ts (node) + .tsx (jsdom, per-file @vitest-environment annotation)
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
