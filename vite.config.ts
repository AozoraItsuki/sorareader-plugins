import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';

import { createMiddleware } from './server/app';
import { createVitePluginLoader } from './server/plugin-loader';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The playground server lives in `server/` and imports nothing from Vite, so the
 * exact same middleware stack is mounted here for development and by
 * `server/bin/serve.ts` for the production build.
 *
 * Dev wires plugins through `server.ssrLoadModule('/plugins/index.ts')` on
 * every request, so Vite's own module graph decides when a plugin edit goes
 * live — the old module-level cache meant edits only appeared after a restart.
 */
const playgroundServer = (): PluginOption => ({
  name: 'playground-server',
  configureServer(server) {
    const middleware = createMiddleware({
      loadPlugins: createVitePluginLoader(() => server),
      rootDir: dirname,
    });
    server.middlewares.use(middleware);
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [tailwindcss(), nodePolyfills(), react(), playgroundServer()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@plugins': path.resolve(dirname, './plugins'),
      '@libs': path.resolve(dirname, './src/libs'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    open: false,
    watch: {
      ignored: ['**/.local/**', '**/.cache/**', '**/.git/**', '**/dist/**'],
    },
  },
  build: isSsrBuild
    ? {
        // `server/bin/serve.ts` imports a fixed path, so the SSR bundle must be
        // named `index.js` rather than `ssr-entry.js`.
        outDir: 'dist/ssr',
        rollupOptions: { output: { entryFileNames: 'index.js' } },
      }
    : {
        outDir: 'dist/client',
      },
}));
