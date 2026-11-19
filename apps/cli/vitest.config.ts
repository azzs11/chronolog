import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run the engine from source, so they never depend on a stale build.
const engine = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@chronolog/engine': engine } },
  test: { globals: true, include: ['tests/**/*.test.ts'] },
});
