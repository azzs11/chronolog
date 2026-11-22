import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Preload the two Latin font files the first screen uses, so they arrive with the CSS instead of
 * after first paint. Without this, swapping from the fallback font reflowed the page (CLS 0.11).
 */
const PRELOAD_FONTS = [/^assets\/nunito-latin-wght-normal-[\w-]+\.woff2$/, /^assets\/mochiy-pop-one-latin-400-normal-[\w-]+\.woff2$/];
function preloadFonts(base: string): Plugin {
  return {
    name: 'chronolog-preload-fonts',
    transformIndexHtml(_html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((name) => PRELOAD_FONTS.some((re) => re.test(name)));
      return files.map((file) => ({
        tag: 'link',
        attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${file}`, crossorigin: '' },
        injectTo: 'head-prepend' as const,
      }));
    },
  };
}

/**
 * In the demo build, swap the socket.io client for the in-browser stand-in (src/demo/socket.ts), so
 * the static site neither ships socket.io nor tries to reach a server.
 */
const socketService = fileURLToPath(new URL('./src/services/socketService.ts', import.meta.url));
const demoSocket = fileURLToPath(new URL('./src/demo/socket.ts', import.meta.url));
function demoSocketSwap(): Plugin {
  return {
    name: 'chronolog-demo-socket',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (process.env.VITE_DEMO !== 'true' || !importer || !source.endsWith('socketService')) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      return resolved?.id === socketService ? demoSocket : null;
    },
  };
}

// The engine is pure TypeScript with no dependencies, so the app builds it from source.
const engine = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));

// The demo lives at https://chronolog.akchhya.xyz/ (the root). A GitHub Pages site WITHOUT a custom domain
// is served from https://<user>.github.io/chronolog/ and would need VITE_BASE=/chronolog/.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [demoSocketSwap(), react(), tailwindcss(), preloadFonts(base)],
  resolve: { alias: { '@chronolog/engine': engine } },
  server: { port: 3000 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
});
