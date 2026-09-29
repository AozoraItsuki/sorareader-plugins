/**
 * Read-only REST surface over the plugin API.
 *
 * The browser never uses this: plugins are bundled into the client and run
 * there. `/api/*` exists for `scripts/test-plugin.ts`, for smoke tests and for
 * the standalone server, so it must stay cheap and must never become a
 * bottleneck for the UI.
 *
 * Endpoints:
 *   GET  /api/health                        – { ok, pluginCount, fetchMode, uptime }
 *   GET  /api/plugins                       – list all plugins
 *   GET  /api/plugin/:id/popular?page=1&latest=false&filters=<json>
 *   GET  /api/plugin/:id/search?q=…&page=1
 *   POST /api/plugin/:id/novel    body: { "path": "..." }
 *   POST /api/plugin/:id/chapter  body: { "path": "..." }
 *   POST /api/plugin/:id/page     body: { "path": "...", "page": "1" }
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';

import { applyApiCors } from './proxy';
import { getSettings } from './settings';
import type { Middleware } from './types';
import type { PluginLoader } from './plugin-loader';
import type { Plugin } from '../src/types/plugin';
import type {
  AnyFilterValue,
  Filters,
  FilterToValues,
  FilterTypes,
} from '../src/types/filters';

const PLUGIN_ROUTE = /^\/api\/plugin\/([^/]+)\/(\w+)$/;
const VALID_METHODS = 'popular | search | novel | chapter | page';

/**
 * `parsePage` only exists on paged plugins, so it is looked up through an
 * optional member instead of a cast: every `PluginBase` already satisfies this
 * shape.
 */
type MaybePagePlugin = Plugin.PluginBase & {
  parsePage?: (novelPath: string, page: string) => Promise<Plugin.SourcePage>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Mirrors the string values of the `FilterTypes` enum. */
const FILTER_TYPE_VALUES = [
  'Text',
  'Picker',
  'Checkbox',
  'Switch',
  'XCheckbox',
];

const isFilterTypes = (value: unknown): value is FilterTypes =>
  typeof value === 'string' && FILTER_TYPE_VALUES.indexOf(value) !== -1;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

/**
 * Validate one filter value against the union of every `ValueOfFilter` result.
 */
function toFilterValue(value: unknown): AnyFilterValue | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (isStringArray(value)) return value;
  if (isRecord(value)) {
    const include = value.include;
    const exclude = value.exclude;
    const includeOk = include === undefined || isStringArray(include);
    const excludeOk = exclude === undefined || isStringArray(exclude);
    if (includeOk && excludeOk) {
      return {
        include: isStringArray(include) ? include : undefined,
        exclude: isStringArray(exclude) ? exclude : undefined,
      };
    }
  }
  return null;
}

/**
 * Convert a plugin's declared `Filters` (`{ label, type, options, value }`) into
 * the `FilterToValues` shape the plugin methods expect (`{ type, value }`).
 *
 * The old REST handler passed the raw declared filters straight through, which
 * meant filter overrides could never be expressed over REST.
 */
export function toFilterValues(
  filters: Filters | undefined,
): FilterToValues<Filters> {
  const values: Record<string, { type: FilterTypes; value: AnyFilterValue }> =
    {};
  if (!filters) return values;
  Object.keys(filters).forEach(key => {
    const declared = filters[key];
    values[key] = { type: declared.type, value: declared.value };
  });
  return values;
}

/**
 * Normalise a user supplied `filters` argument. Both shapes are accepted: the
 * `{ type, value }` value shape and the full declared `{ label, type, options,
 * value }` shape. They are told apart by the presence of the declared-only
 * `label` / `options` keys, since both carry `type` and `value`.
 */
export function parseUserFilters(raw: unknown): FilterToValues<Filters> | null {
  if (!isRecord(raw)) return null;
  const result: Record<string, { type: FilterTypes; value: AnyFilterValue }> =
    {};
  const keys = Object.keys(raw);
  for (const key of keys) {
    const entry = raw[key];
    if (!isRecord(entry)) return null;
    if (!isFilterTypes(entry.type)) return null;
    if (!('value' in entry)) return null;
    const value = toFilterValue(entry.value);
    if (value === null) return null;
    result[key] = { type: entry.type, value };
  }
  return result;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Arguments come from the query string, then from a JSON body, so
 * `/popular?page=2` and `POST { page: 2 }` behave identically. Body values are
 * flattened to strings; objects are re-parsed where a structure is expected.
 */
async function readArgs(
  url: URL,
  req: IncomingMessage,
): Promise<Record<string, string | undefined>> {
  const args: Record<string, string | undefined> = {};
  url.searchParams.forEach((value, key) => {
    args[key] = value;
  });
  if (req.method === 'POST' || req.method === 'PUT') {
    const raw = await readBody(req);
    if (raw.trim().length > 0) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        Object.keys(parsed).forEach(key => {
          const value = parsed[key];
          if (value === undefined || value === null) {
            args[key] = '';
          } else if (typeof value === 'string') {
            args[key] = value;
          } else {
            args[key] = JSON.stringify(value);
          }
        });
      }
    }
  }
  return args;
}

function parseJsonArg(
  raw: string | undefined,
): { ok: true; value: unknown } | { ok: false } {
  if (raw === undefined || raw.trim().length === 0) {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

export function createApiMiddleware(loadPlugins: PluginLoader): Middleware {
  return (req, res, next) => {
    const rawUrl = req.url ?? '/';
    if (!rawUrl.startsWith('/api/')) {
      next();
      return;
    }

    applyApiCors(req, res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    handleApiRequest(req, res, loadPlugins).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      if (!res.writableEnded) sendError(res, 500, message);
    });
  };
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  loadPlugins: PluginLoader,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const allPlugins = await loadPlugins();

  // GET /api/health
  if (url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      pluginCount: allPlugins.length,
      fetchMode: getSettings().fetchMode,
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  // GET /api/plugins
  if (url.pathname === '/api/plugins') {
    sendJson(
      res,
      200,
      allPlugins.map(p => ({
        id: p.id,
        name: p.name,
        site: p.site,
        version: p.version,
      })),
    );
    return;
  }

  const match = url.pathname.match(PLUGIN_ROUTE);
  if (!match) {
    sendError(res, 404, `Unknown API route: ${url.pathname}`);
    return;
  }

  const pluginId = match[1];
  const method = match[2];
  const plugin = allPlugins.find(p => p.id === pluginId);
  if (!plugin) {
    sendError(res, 404, `Plugin '${pluginId}' not found`);
    return;
  }

  const args = await readArgs(url, req);
  let result: unknown;

  switch (method) {
    case 'popular': {
      const parsedFilters = parseJsonArg(args.filters);
      if (!parsedFilters.ok) {
        sendError(res, 400, "'filters' must be valid JSON");
        return;
      }
      let overrides: FilterToValues<Filters> | null = null;
      if (parsedFilters.value !== undefined) {
        overrides = parseUserFilters(parsedFilters.value);
        if (overrides === null) {
          sendError(
            res,
            400,
            "'filters' must be an object of { type, value } pairs",
          );
          return;
        }
      }
      result = await plugin.popularNovels(Number(args.page ?? 1), {
        showLatestNovels: args.latest === 'true',
        filters: { ...toFilterValues(plugin.filters), ...(overrides ?? {}) },
      });
      break;
    }

    case 'search':
      result = await plugin.searchNovels(args.q ?? '', Number(args.page ?? 1));
      break;

    case 'novel': {
      if (!args.path) {
        sendError(res, 400, "Missing required param: 'path'");
        return;
      }
      result = await plugin.parseNovel(args.path);
      break;
    }

    case 'chapter': {
      if (!args.path) {
        sendError(res, 400, "Missing required param: 'path'");
        return;
      }
      result = await plugin.parseChapter(args.path);
      break;
    }

    // Paged plugins expose parsePage(novelPath, page); the browser calls it
    // directly, so REST needs it too.
    case 'page': {
      if (!args.path) {
        sendError(res, 400, "Missing required param: 'path'");
        return;
      }
      const pagePlugin: MaybePagePlugin = plugin;
      const { parsePage } = pagePlugin;
      if (typeof parsePage !== 'function') {
        sendError(
          res,
          400,
          `Plugin '${pluginId}' does not implement 'parsePage'`,
        );
        return;
      }
      result = await parsePage.call(pagePlugin, args.path, args.page ?? '1');
      break;
    }

    default:
      sendError(
        res,
        400,
        `Unknown method '${method}'. Valid: ${VALID_METHODS}`,
      );
      return;
  }

  sendJson(res, 200, result);
}
