/**
 * Cross-origin proxy middleware.
 *
 * Inbound convention (unchanged): the browser rewrites `https://host/path` to
 * `<origin>/https://host/path`, so the absolute target is recovered by parsing
 * `req.url` against the `/http:` / `/https:` mount prefix.
 *
 * Three fetch strategies are supported, selected by `settings.fetchMode`:
 *   PROXY      – http-proxy, manual redirect chasing + manual decompression
 *   NODE_FETCH – Node's global fetch
 *   CURL       – the curl binary, invoked through execFile (never a shell)
 */
import { Buffer } from 'node:buffer';
import { execFile, execFileSync } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import httpProxy from 'http-proxy';
import {
  brotliDecompressSync,
  gunzipSync,
  zstdDecompressSync,
} from 'node:zlib';

import {
  C,
  binaryBodySummary,
  bodyForLog,
  isTextualContentType,
  logRequest,
  logResponse,
  ts,
} from './logger';
import { getSettings, updateSettings } from './settings';
import { FetchMode } from './types';
import type { Middleware, ServerSetting } from './types';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const HTTP_PREFIX = '/http:';
const HTTPS_PREFIX = '/https:';

const MAX_REDIRECTS = 5;
const UPSTREAM_TIMEOUT_MS = 60_000;
const CURL_BIN = 'curl';
const CURL_TIMEOUT_MS = 30_000;
const CURL_MAX_BUFFER = 64 * 1024 * 1024;
const CURL_PROBE_TIMEOUT_MS = 5_000;
const CURL_STATUS_MARKER = '\n__HTTP_STATUS__';
const CURL_STATUS_FORMAT = `${CURL_STATUS_MARKER}%{http_code}`;
const PREFLIGHT_MAX_AGE = '86400';

/**
 * Request headers that must never reach the target: browser fingerprinting
 * headers, transport headers Node manages itself, and anything that would leak
 * the dev server's own host. This replaces the old "delete any header whose
 * value contains 'localhost'" heuristic.
 */
const STRIPPED_REQUEST_HEADERS = [
  'origin',
  'sec-fetch-site',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-user',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'pragma',
  'accept-encoding',
  'connection',
  'host',
  'content-length',
  'cookie',
];

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const METHOD_DOWNGRADE_STATUSES = [301, 302, 303];

/**
 * Our own CORS headers are authoritative: an upstream site that answers with
 * its own `Access-Control-Allow-Origin` (often `*`) must not be allowed to
 * clobber them, or the browser drops the credentialed response.
 */
const RESERVED_RESPONSE_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-max-age',
];

function isForwardableResponseHeader(
  key: string,
  settings: Readonly<ServerSetting>,
): boolean {
  if (RESERVED_RESPONSE_HEADERS.indexOf(key.toLowerCase()) !== -1) return false;
  return !settings.disAllowResponseHeaders.includes(key);
}

// ─────────────────────────────────────────────
// Per-request bookkeeping
// ─────────────────────────────────────────────
const requestStartTimes = new WeakMap<IncomingMessage, number>();
const redirectCounts = new WeakMap<IncomingMessage, number>();
/**
 * Absolute target of the request in flight. `PROXY` mode rewrites `req.url` to a
 * bare path because that is what `http-proxy` expects, so the original URL has
 * to be kept here for redirect resolution and logging.
 */
const proxyTargets = new WeakMap<IncomingMessage, string>();
const proxy = httpProxy.createProxyServer({});

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────

/**
 * Resolve the origin the proxy answers to.
 *
 * A configured CLIENT_HOST always wins. With the default `'*'` the inbound
 * Origin is echoed back so that credentialed requests (the browser forces
 * `credentials: 'include'`) are accepted by compliant browsers, which reject
 * `Access-Control-Allow-Origin: *` combined with credentials.
 */
export function resolveAllowedOrigin(
  req: IncomingMessage,
  settings: Readonly<ServerSetting>,
): string {
  const configured = settings.CLIENT_HOST;
  if (configured && configured !== '*') return configured;
  const origin = req.headers.origin;
  return typeof origin === 'string' && origin.length > 0 ? origin : '*';
}

/** Add a field to `Vary` without clobbering what is already there. */
export function appendVary(res: ServerResponse, field: string): void {
  const existing = res.getHeader('Vary');
  const parts: string[] = [];
  if (typeof existing === 'string') {
    parts.push(existing);
  } else if (Array.isArray(existing)) {
    existing.forEach(value => {
      if (typeof value === 'string') parts.push(value);
    });
  }
  const wanted = field.toLowerCase();
  const already = parts.some(part => part.toLowerCase() === wanted);
  res.setHeader(
    'Vary',
    already ? parts.join(', ') : [...parts, field].join(', '),
  );
}

/** Echo the preflight request headers onto the response. */
function applyPreflightEcho(req: IncomingMessage, res: ServerResponse): void {
  const requestedMethod = req.headers['access-control-request-method'];
  if (typeof requestedMethod === 'string' && requestedMethod.length > 0) {
    res.setHeader('Access-Control-Allow-Methods', requestedMethod);
    delete req.headers['access-control-request-method'];
  }
  const requestedHeaders = req.headers['access-control-request-headers'];
  if (typeof requestedHeaders === 'string' && requestedHeaders.length > 0) {
    res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
    delete req.headers['access-control-request-headers'];
  }
  res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE);
}

/**
 * CORS for proxied (credentialed) traffic. The credentials header is only ever
 * sent together with a concrete origin — never with the wildcard.
 */
export function applyProxyCors(
  req: IncomingMessage,
  res: ServerResponse,
  settings: Readonly<ServerSetting>,
): void {
  const origin = resolveAllowedOrigin(req, settings);
  appendVary(res, 'Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  applyPreflightEcho(req, res);
}

/**
 * CORS for the read-only REST API. It is a public surface consumed by
 * `scripts/test-plugin.ts` with plain credential-less `fetch`, so it keeps the
 * literal wildcard and never advertises credentials.
 */
export function applyApiCors(req: IncomingMessage, res: ServerResponse): void {
  appendVary(res, 'Origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  applyPreflightEcho(req, res);
}

// ─────────────────────────────────────────────
// curl availability
// ─────────────────────────────────────────────
let curlAvailable: boolean | null = null;

/**
 * Probe for the curl binary once, without a shell, and cache the answer.
 * `execFile` resolves the binary through PATH (and PATHEXT on Windows), so no
 * git-bash lookup is needed any more.
 */
export function isCurlAvailable(): boolean {
  if (curlAvailable !== null) return curlAvailable;
  try {
    execFileSync(CURL_BIN, ['--version'], {
      stdio: 'ignore',
      timeout: CURL_PROBE_TIMEOUT_MS,
    });
    curlAvailable = true;
    console.log(
      `${ts()} ${C.green}✓${C.reset} curl found at startup ${C.dim}(FetchMode.CURL usable)${C.reset}`,
    );
  } catch {
    curlAvailable = false;
  }
  return curlAvailable;
}

/**
 * Called once during startup: a configured CURL mode without curl on PATH
 * would leave the playground dead on arrival, so fall back to NODE_FETCH.
 */
export function ensureSupportedFetchMode(): void {
  if (getSettings().fetchMode !== FetchMode.CURL) return;
  if (isCurlAvailable()) return;
  console.warn(
    `${ts()} ${C.red}${C.bold}✖  FetchMode.CURL is selected but '${CURL_BIN}' is not available.${C.reset}\n` +
      `${ts()}   Falling back to FetchMode.NODE_FETCH (1).`,
  );
  updateSettings({ fetchMode: FetchMode.NODE_FETCH });
}

// ─────────────────────────────────────────────
// Request preparation
// ─────────────────────────────────────────────

/** Which scheme prefix, if any, an inbound URL carries. */
function schemeOf(url: string | undefined): 'http:' | 'https:' | null {
  if (!url) return null;
  if (url.startsWith(HTTPS_PREFIX)) return 'https:';
  if (url.startsWith(HTTP_PREFIX)) return 'http:';
  return null;
}

/**
 * Turn `/https://example.com/x?y=1` into the absolute target URL. The
 * remainder is parsed rather than concatenated, so a malformed path fails
 * loudly instead of being forwarded to a bogus host.
 */
export function parseProxyTarget(
  url: string | undefined,
): { scheme: 'http:' | 'https:'; target: URL } | null {
  const scheme = schemeOf(url);
  if (scheme === null || url === undefined) return null;
  try {
    return { scheme, target: new URL(url.slice(1)) };
  } catch {
    return null;
  }
}

function sanitiseRequestHeaders(
  req: IncomingMessage,
  target: URL,
  settings: Readonly<ServerSetting>,
): void {
  const stripped = STRIPPED_REQUEST_HEADERS.concat(
    settings.disAllowedRequestHeaders,
  );
  stripped.forEach(name => {
    delete req.headers[name];
  });

  // Some sites reject requests without a referer, so forge one.
  req.headers.referer = target.href;

  if (!settings.useUserAgent) delete req.headers['user-agent'];
  req.headers.host = target.host;
  if (settings.cookies) req.headers.cookie = settings.cookies;
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
export function createProxyMiddleware(): Middleware {
  return (req, res, next) => {
    if (schemeOf(req.url) === null) {
      next();
      return;
    }

    const settings = getSettings();
    applyProxyCors(req, res, settings);

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    const parsed = parseProxyTarget(req.url);
    if (parsed === null) {
      console.warn(
        `${ts()} ${C.yellow}⚠  Malformed proxy target: ${req.url}${C.reset}`,
      );
      res.statusCode = 400;
      res.end(`Malformed proxy target: ${req.url}`);
      return;
    }

    try {
      sanitiseRequestHeaders(req, parsed.target, settings);
      requestStartTimes.set(req, Date.now());
      proxyRequest(req, res, parsed.target);
    } catch (err) {
      console.error(
        `\n${ts()} ${C.red}${C.bold}✖  Proxy handler error${C.reset}`,
      );
      console.error(err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end();
      }
    }
  };
}

// ─────────────────────────────────────────────
// Core dispatcher
// ─────────────────────────────────────────────
function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: URL,
): void {
  const settings = getSettings();
  const method = req.method || 'GET';

  logRequest({
    method,
    url: target.href,
    headers: { ...req.headers },
  });

  switch (settings.fetchMode) {
    case FetchMode.CURL:
      if (isCurlAvailable()) {
        proxyViaCurl(req, res, target, settings);
        return;
      }
      proxyViaFetch(req, res, target, settings);
      return;
    case FetchMode.NODE_FETCH:
      proxyViaFetch(req, res, target, settings);
      return;
    case FetchMode.PROXY:
      // `http-proxy` derives the request path from `req.url`, which still holds
      // the scheme-prefixed form `/https://example.com/`. Left alone it would
      // ask the upstream for `https://example.com/https://example.com/`.
      proxyTargets.set(req, target.href);
      req.url = target.pathname + target.search;
      proxyViaHttpProxy(req, res, target);
      return;
  }
}

// ── CURL mode ─────────────────────────────────
function proxyViaCurl(
  req: IncomingMessage,
  res: ServerResponse,
  target: URL,
  settings: Readonly<ServerSetting>,
): void {
  const headerArgs: string[] = [];
  const userAgent = settings.useUserAgent
    ? req.headers['user-agent']
    : undefined;
  if (typeof userAgent === 'string' && userAgent.length > 0) {
    headerArgs.push('-H', `User-Agent: ${userAgent}`);
  }
  if (settings.cookies) headerArgs.push('-H', `Cookie: ${settings.cookies}`);

  const start = Date.now();
  execFile(
    CURL_BIN,
    // No shell, no interpolation: the URL is always its own argv entry.
    ['-sSL', '-w', CURL_STATUS_FORMAT, target.href, ...headerArgs],
    { maxBuffer: CURL_MAX_BUFFER, timeout: CURL_TIMEOUT_MS },
    (error, stdout, stderr) => {
      if (error) {
        console.error(
          `${ts()} ${C.red}✖  curl error:${C.reset}`,
          error.message,
        );
        if (stderr) console.error(C.dim + stderr + C.reset);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end(`exec error: ${error.message}`);
        }
        return;
      }

      const raw = String(stdout);
      const markerIndex = raw.lastIndexOf(CURL_STATUS_MARKER);
      const statusText =
        markerIndex === -1
          ? ''
          : raw.slice(markerIndex + CURL_STATUS_MARKER.length);
      const parsedStatus = Number(statusText.trim());
      const status =
        markerIndex === -1 || !Number.isInteger(parsedStatus)
          ? 200
          : parsedStatus;
      const body = markerIndex === -1 ? raw : raw.slice(0, markerIndex);

      logResponse({
        method: req.method || 'GET',
        url: target.href,
        status,
        headers: {},
        body,
        durationMs: Date.now() - start,
      });

      res.statusCode = status;
      res.end(body);
    },
  );
}

// ── NODE_FETCH mode ───────────────────────────
async function proxyViaFetch(
  req: IncomingMessage,
  res: ServerResponse,
  target: URL,
  settings: Readonly<ServerSetting>,
): Promise<void> {
  const start = Date.now();
  const method = req.method || 'GET';

  try {
    const headers = new Headers();
    if (settings.useUserAgent) {
      const userAgent = req.headers['user-agent'];
      if (typeof userAgent === 'string' && userAgent.length > 0) {
        headers.set('user-agent', userAgent);
      }
    }
    if (settings.cookies) headers.set('cookie', settings.cookies);
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string' && contentType.length > 0) {
      headers.set('content-type', contentType);
    }

    // Forward the real method and body; the old implementation always issued a
    // GET, which silently broke every plugin that posts.
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const requestBody = hasBody ? await readRequestBody(req) : undefined;

    const init: RequestInit = { method, headers, redirect: 'follow' };
    if (requestBody !== undefined) init.body = requestBody;

    const upstream = await fetch(target.href, init);
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
      // `content-encoding` / `content-length` are dropped on purpose: the body
      // below is already decoded by fetch and no longer matches the upstream
      // byte count. Our CORS headers are never overwritten by the target.
      if (isForwardableResponseHeader(key, settings)) {
        res.setHeader(key, value);
      }
    });

    const status = upstream.status;
    const upstreamType = responseHeaders['content-type'] ?? '';

    if (upstream.body === null || isTextualContentType(upstreamType)) {
      const text = await upstream.text();
      logResponse({
        method,
        url: target.href,
        status,
        headers: responseHeaders,
        body: text,
        durationMs: Date.now() - start,
      });
      res.statusCode = status;
      res.end(text);
      return;
    }

    // Binary payload: pipe it through instead of buffering the whole body.
    res.statusCode = status;
    const reader = upstream.body.getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !res.writableEnded) {
        total += value.byteLength;
        res.write(value);
      }
    }
    logResponse({
      method,
      url: target.href,
      status,
      headers: responseHeaders,
      body: binaryBodySummary(upstreamType, total),
      durationMs: Date.now() - start,
    });
    res.end();
  } catch (err) {
    console.error(`${ts()} ${C.red}✖  fetch error:${C.reset}`, err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end();
    }
  }
}

// ── PROXY (http-proxy) mode ───────────────────
function proxyViaHttpProxy(
  req: IncomingMessage,
  res: ServerResponse,
  target: URL,
): void {
  proxy.web(
    req,
    res,
    {
      target: target.origin,
      selfHandleResponse: true,
      followRedirects: true,
      // A hung upstream must not leak the connection forever.
      timeout: UPSTREAM_TIMEOUT_MS,
    },
    err => {
      console.error(
        `${ts()} ${C.red}✖  http-proxy error:${C.reset}`,
        err.message,
      );
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end();
      }
    },
  );
}

// ─────────────────────────────────────────────
// http-proxy response handler
// ─────────────────────────────────────────────
proxy.on('proxyRes', (proxyRes, req, res) => {
  const settings = getSettings();
  const statusCode = proxyRes.statusCode ?? 200;
  const method = req.method || 'GET';

  // ── Redirect handling ──────────────────────
  // `content-encoding` is stripped below, so redirects have to be chased by
  // hand; 5 hops is the cap.
  if (REDIRECT_STATUSES.indexOf(statusCode) !== -1) {
    const location = proxyRes.headers.location;
    if (location) {
      let redirectUrl: URL | null = null;
      try {
        redirectUrl = new URL(
          location,
          proxyTargets.get(req) ?? req.url ?? targetOf(req),
        );
      } catch (err) {
        console.error(
          `${ts()} ${C.red}✖  Redirect parse error:${C.reset}`,
          err,
        );
      }

      if (redirectUrl) {
        const hops = redirectCounts.get(req) ?? 0;
        if (hops >= MAX_REDIRECTS) {
          console.warn(
            `${ts()} ${C.yellow}⚠  Too many redirects (${hops}) for ${redirectUrl.href}${C.reset}`,
          );
          res.statusCode = 508;
          res.end('Too many redirects');
          return;
        }

        console.log(
          `${ts()} ${C.yellow}↪  Redirect ${statusCode}${C.reset} → ${C.cyan}${redirectUrl.href}${C.reset} ${C.dim}(${hops + 1}/${MAX_REDIRECTS})${C.reset}`,
        );
        redirectCounts.set(req, hops + 1);
        proxyTargets.set(req, redirectUrl.href);
        req.url = redirectUrl.href;

        if (METHOD_DOWNGRADE_STATUSES.indexOf(statusCode) !== -1) {
          req.method = 'GET';
          req.headers['content-length'] = '0';
          delete req.headers['content-type'];
        }

        req.removeAllListeners();
        proxyRequest(req, res, redirectUrl);
        return;
      }
    }
  }

  res.statusCode = statusCode;

  // ── Propagate filtered headers ─────────────
  const responseHeaders: Record<string, string> = {};
  Object.keys(proxyRes.headers).forEach(key => {
    const value = proxyRes.headers[key];
    if (value === undefined) return;
    responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
    if (isForwardableResponseHeader(key, settings)) {
      res.setHeader(key, value);
    }
  });

  if (statusCode === 304) {
    logResponse({
      method,
      url: proxyTargets.get(req) ?? req.url ?? '',
      status: 304,
      headers: responseHeaders,
    });
    res.end();
    return;
  }

  const contentEncoding = proxyRes.headers['content-encoding'] ?? '';
  const chunks: Buffer[] = [];
  proxyRes.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  proxyRes.on('end', () => {
    const compressed = Buffer.concat(chunks);
    const { body, encoding } = decompressBody(compressed, contentEncoding);

    // When decompression failed we forward the untouched bytes, so the
    // upstream content-encoding has to travel with them.
    if (encoding && !res.headersSent)
      res.setHeader('content-encoding', encoding);

    if (body.length > 0 && !res.writableEnded) res.write(body);

    const start = requestStartTimes.get(req);
    logResponse({
      method,
      url: proxyTargets.get(req) ?? req.url ?? '',
      status: statusCode,
      headers: responseHeaders,
      body: bodyForLog(body, responseHeaders['content-type'] ?? ''),
      durationMs: start ? Date.now() - start : undefined,
    });

    res.end();
  });
});

/** Absolute URL of the request currently in flight, for redirect resolution. */
function targetOf(req: IncomingMessage): string {
  const parsed = parseProxyTarget(req.url);
  return parsed ? parsed.target.href : 'http://localhost/';
}

/**
 * `content-encoding` is listed in `disAllowResponseHeaders`, so the body has to
 * be decoded by hand. A decoder failure is not fatal: the raw bytes are
 * forwarded together with their `content-encoding` instead of a 500.
 */
function decompressBody(
  raw: Buffer,
  contentEncoding: string,
): { body: Buffer; encoding: string } {
  if (raw.length === 0) return { body: raw, encoding: '' };
  try {
    if (contentEncoding.includes('br')) {
      return { body: brotliDecompressSync(raw), encoding: '' };
    }
    if (contentEncoding.includes('gzip')) {
      return { body: gunzipSync(raw), encoding: '' };
    }
    if (contentEncoding.includes('zstd')) {
      return { body: zstdDecompressSync(raw), encoding: '' };
    }
  } catch (err) {
    console.error(
      `${ts()} ${C.yellow}⚠  Decompression failed (${contentEncoding}); forwarding raw bytes${C.reset}`,
      err,
    );
    return { body: raw, encoding: contentEncoding };
  }
  return { body: raw, encoding: '' };
}

/** Exposed so the standalone entrypoint can shut the proxy down cleanly. */
export function closeProxy(): void {
  proxy.close();
}
