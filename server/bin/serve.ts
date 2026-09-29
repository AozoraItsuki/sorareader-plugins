#!/usr/bin/env node
/**
 * Standalone production entrypoint.
 *
 * Serves the built client bundle plus the API and proxy middlewares from a
 * plain node:http server, with no Vite in the process:
 *
 *   npx tsx server/bin/serve.ts --port 3000 --host 0.0.0.0
 *
 * Requires a build first (`dist/ssr/index.js` for the plugins, `dist/client` for
 * the UI).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEFAULT_HOST, DEFAULT_PORT, createMiddleware } from '../app';
import { C, ts } from '../logger';
import { collectAccessUrls, formatAccessBanner } from '../network';
import { createBundledPluginLoader } from '../plugin-loader';
import { closeProxy } from '../proxy';

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const SSR_ENTRY = path.join(ROOT_DIR, 'dist', 'ssr', 'index.js');
const CLIENT_DIR = path.join(ROOT_DIR, 'dist', 'client');

type Options = { port: number; host: string };

/** `--port 4000`, `--port=4000`, then PORT, then DEFAULT_PORT. */
function parseOptions(argv: string[]): Options {
  let port = Number(process.env.PORT ?? DEFAULT_PORT);
  let host = process.env.HOST ?? DEFAULT_HOST;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const value = Number(argv[++i]);
      if (Number.isInteger(value)) port = value;
    } else if (arg.indexOf('--port=') === 0) {
      const value = Number(arg.slice('--port='.length));
      if (Number.isInteger(value)) port = value;
    } else if (arg === '--host' || arg === '-H') {
      const value = argv[++i];
      if (value) host = value;
    } else if (arg.indexOf('--host=') === 0) {
      host = arg.slice('--host='.length);
    }
  }

  return { port, host };
}

function fail(message: string): never {
  console.error(`${C.red}${C.bold}✖  ${message}${C.reset}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { port, host } = parseOptions(process.argv.slice(2));

  if (!fs.existsSync(SSR_ENTRY)) {
    console.error(
      `${ts()} ${C.red}${C.bold}✖  Missing ${SSR_ENTRY}${C.reset}`,
    );
    console.error(
      [
        '',
        `  The standalone server runs the pre-built plugin bundle, so build it first:`,
        '',
        `    ${C.cyan}npm run build:web${C.reset}   ${C.dim}(client + SSR bundle into dist/)${C.reset}`,
        '',
        `  ${C.dim}For the dev playground, use ${C.reset}${C.cyan}npm run dev:start${C.reset}${C.dim} instead.${C.reset}`,
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const loadPlugins = createBundledPluginLoader(pathToFileURL(SSR_ENTRY).href);
  const middleware = createMiddleware({
    loadPlugins,
    staticDir: CLIENT_DIR,
    rootDir: ROOT_DIR,
  });

  const server = http.createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end('Not Found');
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        [
          '',
          `${ts()} ${C.red}${C.bold}✖  Port ${port} is already in use.${C.reset}`,
          '',
          `  Stop whatever is listening on it, or pick another port:`,
          '',
          `    ${C.cyan}npm start -- --port ${port + 1}${C.reset}`,
          '',
        ].join('\n'),
      );
    } else {
      console.error(`${ts()} ${C.red}✖  Server error:${C.reset}`, err);
    }
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log('\n' + formatAccessBanner(collectAccessUrls(port, host)));
    console.log(
      `${ts()} ${C.dim}Plugins:${C.reset} ${SSR_ENTRY}  ${C.dim}Client:${C.reset} ${CLIENT_DIR}`,
    );
    console.log('');
  });

  const shutdown = (signal: string) => {
    console.log(
      `\n${ts()} ${C.yellow}⚙  ${signal} received, shutting down…${C.reset}`,
    );
    closeProxy();
    server.close(() => process.exit(0));
    // Do not wait forever for keep-alive sockets.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
