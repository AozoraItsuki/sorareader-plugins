/**
 * Composition root of the plugin server.
 *
 * `createMiddleware` returns a plain node:http style middleware, so the exact
 * same stack can be mounted inside the Vite dev server or served by the
 * standalone entrypoint. Nothing here knows about Vite.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';

import { createApiMiddleware } from './api';
import { C, ts } from './logger';
import { applyProxyCors } from './proxy';
import { createProxyMiddleware, ensureSupportedFetchMode } from './proxy';
import { configureSettings, getSettings, updateSettings } from './settings';
import { settingsSource } from './settings';
import { createStaticMiddleware } from './static';
import type { Middleware } from './types';
import type { PluginLoader } from './plugin-loader';

export type { PluginLoader } from './plugin-loader';

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '0.0.0.0';

export type CreateMiddlewareOptions = {
  loadPlugins: PluginLoader;
  /** When provided, static files are served with SPA fallback. */
  staticDir?: string;
  /** Base dir for settings persistence, defaults to process.cwd(). */
  rootDir?: string;
};

const SETTINGS_PATHS = ['/settings', '/settings/'];

/** `GET` returns the current settings, `POST` merges a validated patch. */
function createSettingsMiddleware(): Middleware {
  return (req, res, next) => {
    const pathname = (req.url ?? '/').split('?')[0];
    const isSettings = SETTINGS_PATHS.indexOf(pathname) !== -1;
    if (!isSettings) {
      next();
      return;
    }

    applyProxyCors(req, res, getSettings());

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'GET') {
      res.statusCode = 200;
      res.end(JSON.stringify(getSettings(), null, 2));
      return;
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
      return;
    }

    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      let patch: unknown;
      try {
        patch = JSON.parse(raw);
      } catch (err) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: `Settings parse error: ${
              err instanceof Error ? err.message : String(err)
            }`,
          }),
        );
        return;
      }

      const result = updateSettings(patch);
      if (!result.ok) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: result.message }, null, 2));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify(result.settings, null, 2));
    });
  };
}

export function createMiddleware(
  opts: CreateMiddlewareOptions,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const rootDir = opts.rootDir ?? process.cwd();

  configureSettings(rootDir);
  ensureSupportedFetchMode();
  console.log(
    `${ts()} ${C.dim}Settings loaded from ${settingsSource()}${C.reset}`,
  );

  const api = createApiMiddleware(opts.loadPlugins);
  const settings = createSettingsMiddleware();
  const proxy = createProxyMiddleware();
  const staticMw = opts.staticDir
    ? createStaticMiddleware(opts.staticDir, { spaFallback: true })
    : null;

  return (req, res, next) => {
    const url = req.url ?? '/';

    // 1. REST API
    if (url === '/api' || url.indexOf('/api/') === 0) {
      api(req, res, next);
      return;
    }

    // 2. settings
    if (SETTINGS_PATHS.indexOf(url.split('?')[0]) !== -1) {
      settings(req, res, next);
      return;
    }

    // 3. proxied traffic: /https://host/path or /http://host/path
    if (url.indexOf('/http:') === 0 || url.indexOf('/https:') === 0) {
      proxy(req, res, next);
      return;
    }

    // 4. built client bundle
    if (staticMw) {
      staticMw(req, res, next);
      return;
    }

    // 5. nothing here
    next();
  };
}
