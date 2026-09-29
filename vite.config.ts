import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';

import { createMiddleware } from './server/app';
import { createVitePluginLoader } from './server/plugin-loader';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The playground server lives in `server/` and has no dependency on Vite, so
 * the same middleware stack can be mounted here for dev/HMR or booted standalone
 * by `server/bin/serve.ts` against a prebuilt bundle.
 */
const playgroundServer = (): PluginOption => ({
  name: 'playground-server',
  configureServer(server) {
    server.middlewares.use(
      createMiddleware({
        loadPlugins: createVitePluginLoader(() => server),
        rootDir: dirname,
      }),
    );
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
  build: isSsrBuild
    ? {
        // `server/bin/serve.ts` imports a fixed `dist/ssr/index.js`, and Vite
        // would otherwise name the chunk after the entry file.
        outDir: 'dist/ssr',
        rollupOptions: {
          output: { entryFileNames: 'index.js' },
        },
      }
    : { outDir: 'dist/client' },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    open: false,
    watch: {
      ignored: ['**/.local/**', '**/.cache/**', '**/.git/**', '**/dist/**'],
    },
  },
}));
