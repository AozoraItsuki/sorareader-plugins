import process from 'node:process';
import { Buffer } from 'buffer';
import { FetchMode, ServerSetting } from './src/types/types';
import { Connect } from 'vite';
import httpProxy from 'http-proxy';
import { exec } from 'child_process';
import { brotliDecompressSync, gunzipSync, zstdDecompressSync } from 'zlib';

// ─────────────────────────────────────────────
// ANSI color palette
// ─────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const METHOD_COLORS: Record<string, string> = {
  GET: C.green,
  POST: C.blue,
  PUT: C.yellow,
  PATCH: C.magenta,
  DELETE: C.red,
  OPTIONS: C.gray,
  HEAD: C.cyan,
};

function statusColor(code: number): string {
  if (code < 300) return C.green;
  if (code < 400) return C.yellow;
  if (code < 500) return C.magenta;
  return C.red;
}

function methodBadge(method = 'GET'): string {
  const color = METHOD_COLORS[method.toUpperCase()] ?? C.white;
  return `${color}${C.bold}${method.padEnd(7)}${C.reset}`;
}

function statusBadge(code: number): string {
  return `${statusColor(code)}${C.bold}${code}${C.reset}`;
}

function ts(): string {
  return `${C.gray}[${new Date().toLocaleTimeString('en-US', { hour12: false })}]${C.reset}`;
}

function hr(char = '─', width = 60): string {
  return C.dim + char.repeat(width) + C.reset;
}

function truncate(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max) + C.dim + '…' + C.reset : s;
}

function prettyHeaders(
  headers: Record<string, unknown>,
  indent = '  ',
): string {
  return Object.entries(headers)
    .map(
      ([k, v]) => `${indent}${C.dim}${k}:${C.reset} ${C.white}${v}${C.reset}`,
    )
    .join('\n');
}

function prettyBody(raw: string | undefined, contentType = ''): string {
  if (!raw || raw.length === 0) return C.gray + '  (empty body)' + C.reset;
  try {
    if (
      contentType.includes('application/json') ||
      raw.trimStart().startsWith('{') ||
      raw.trimStart().startsWith('[')
    ) {
      const parsed = JSON.parse(raw);
      const pretty = JSON.stringify(parsed, null, 2);
      return pretty
        .split('\n')
        .map(line => {
          // color keys blue, strings green, numbers yellow, booleans/null magenta
          return (
            '  ' +
            line
              .replace(/"([^"]+)":/g, `${C.blue}"$1":${C.reset}`)
              .replace(/: "([^"]*)"/g, `: ${C.green}"$1"${C.reset}`)
              .replace(/: (\d+\.?\d*)/g, `: ${C.yellow}$1${C.reset}`)
              .replace(/: (true|false|null)/g, `: ${C.magenta}$1${C.reset}`)
          );
        })
        .join('\n');
    }
  } catch {
    /* fall through */
  }
  return '  ' + truncate(raw);
}

// ─────────────────────────────────────────────
// Request log
// ─────────────────────────────────────────────
interface LogRequestOptions {
  method: string;
  url: string;
  headers: Record<string, unknown>;
  body?: string;
  contentType?: string;
}

function logRequest({
  method,
  url,
  headers,
  body,
  contentType,
}: LogRequestOptions): void {
  const _url = new URL(url);
  console.log('\n' + hr());
  console.log(
    `${ts()} ${methodBadge(method)} ${C.cyan}${C.bold}${_url.href}${C.reset}`,
  );

  if (_url.search) {
    const params = [..._url.searchParams.entries()];
    if (params.length) {
      console.log(`\n${C.bold}  Query Params${C.reset}`);
      params.forEach(([k, v]) =>
        console.log(
          `  ${C.dim}${k}${C.reset} ${C.gray}=${C.reset} ${C.green}${decodeURIComponent(v)}${C.reset}`,
        ),
      );
    }
  }

  const filteredHeaders = { ...headers };
  const HIDE_IN_LOG = new Set(['host', 'connection', 'content-length']);
  for (const key of HIDE_IN_LOG) delete filteredHeaders[key];

  if (Object.keys(filteredHeaders).length) {
    console.log(`\n${C.bold}  Request Headers${C.reset}`);
    console.log(prettyHeaders(filteredHeaders as Record<string, unknown>));
  }

  if (body && body.length > 0 && method !== 'GET' && method !== 'HEAD') {
    console.log(`\n${C.bold}  Body${C.reset}`);
    console.log(prettyBody(body, contentType));
  }

  console.log(hr());
}

// ─────────────────────────────────────────────
// Response log
// ─────────────────────────────────────────────
interface LogResponseOptions {
  method: string;
  url: string;
  status: number;
  headers: Record<string, unknown>;
  body?: string;
  durationMs?: number;
}

function logResponse({
  method,
  url,
  status,
  headers,
  body,
  durationMs,
}: LogResponseOptions): void {
  const _url = new URL(url);
  const duration =
    durationMs !== undefined ? ` ${C.dim}${durationMs}ms${C.reset}` : '';

  console.log(
    `\n${ts()} ${statusBadge(status)} ${methodBadge(method)} ${C.dim}${_url.pathname}${C.reset}${duration}`,
  );

  const ct = (headers['content-type'] as string) ?? '';
  const SHOW_RESP_HEADERS = [
    'content-type',
    'cache-control',
    'x-request-id',
    'x-ratelimit-remaining',
  ];
  const relevantHeaders = Object.fromEntries(
    Object.entries(headers).filter(([k]) => SHOW_RESP_HEADERS.includes(k)),
  );
  if (Object.keys(relevantHeaders).length) {
    console.log(`\n${C.bold}  Response Headers${C.reset}`);
    console.log(prettyHeaders(relevantHeaders));
  }

  if (body && body.length > 0) {
    const preview = body.slice(0, 2000);
    console.log(
      `\n${C.bold}  Response Body${C.reset} ${C.dim}(${body.length} bytes)${C.reset}`,
    );
    console.log(prettyBody(preview, ct));
    if (body.length > 2000) {
      console.log(
        `  ${C.dim}… ${body.length - 2000} more bytes (truncated)${C.reset}`,
      );
    }
  }

  console.log(hr('─'));
}

// ─────────────────────────────────────────────
// Per-request start times
// ─────────────────────────────────────────────
const requestStartTimes = new WeakMap<object, number>();

// ─────────────────────────────────────────────
// Proxy instance
// ─────────────────────────────────────────────
const proxy = httpProxy.createProxyServer({});

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────
const settings: ServerSetting = {
  CLIENT_HOST: 'http://localhost:3000',
  fetchMode: FetchMode.PROXY,
  disAllowedRequestHeaders: [
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-site',
    'origin',
    'sec-fetch-dest',
    'pragma',
  ],
  disAllowResponseHeaders: [
    'link',
    'set-cookie',
    'set-cookie2',
    'content-encoding',
    'content-length',
  ],
  useUserAgent: true,
};

// ─────────────────────────────────────────────
// Settings middleware
// ─────────────────────────────────────────────
const proxySettingMiddleware: Connect.NextHandleFunction = (req, res) => {
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify(settings, null, 2));
    res.end();
    return;
  }

  let str = '';
  req.on('data', chunk => {
    str += chunk;
  });
  req.on('end', () => {
    try {
      const newSettings = JSON.parse(str);
      const updated: string[] = [];
      for (const key in newSettings) {
        // @ts-ignore
        settings[key] = newSettings[key];
        updated.push(key);
      }
      console.log(
        `\n${ts()} ${C.yellow}${C.bold}⚙  Settings updated:${C.reset} ${updated.map(k => C.cyan + k + C.reset).join(', ')}`,
      );
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error(
        `${ts()} ${C.red}${C.bold}✖  Settings parse error:${C.reset}`,
        err,
      );
      res.statusCode = 400;
    } finally {
      res.end();
    }
  });
};

// ─────────────────────────────────────────────
// Proxy handler middleware
// ─────────────────────────────────────────────
const proxyHandlerMiddle: Connect.NextHandleFunction = (req, res) => {
  const rawUrl = 'https:' + req.url;

  // CORS preflight
  if (req.headers['access-control-request-method']) {
    res.setHeader(
      'access-control-allow-methods',
      req.headers['access-control-request-method'],
    );
    delete req.headers['access-control-request-method'];
  }
  if (req.headers['access-control-request-headers']) {
    res.setHeader(
      'access-control-allow-headers',
      req.headers['access-control-request-headers'],
    );
    delete req.headers['access-control-request-headers'];
  }
  res.setHeader('Access-Control-Allow-Origin', settings.CLIENT_HOST);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  req.headers.referer = rawUrl;

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const _url = new URL(rawUrl);

    // Strip disallowed / localhost headers
    for (const header in req.headers) {
      if (
        (req.headers[header] as string)?.includes('localhost') ||
        settings.disAllowedRequestHeaders.includes(header)
      ) {
        delete req.headers[header];
      }
    }

    req.headers['sec-fetch-mode'] = 'cors';
    if (settings.cookies) req.headers['cookie'] = settings.cookies;
    if (!settings.useUserAgent) delete req.headers['user-agent'];
    req.headers.host = _url.host;
    req.url = _url.toString();

    // Record start time
    requestStartTimes.set(req, Date.now());

    proxyRequest(req, res);
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

// ─────────────────────────────────────────────
// Core proxy request dispatcher
// ─────────────────────────────────────────────
const proxyRequest: Connect.SimpleHandleFunction = (req, res) => {
  const _url = new URL(req.url || '');

  logRequest({
    method: req.method || 'GET',
    url: _url.href,
    headers: req.headers as Record<string, unknown>,
  });

  // ── CURL mode ──────────────────────────────
  if (settings.fetchMode === FetchMode.CURL) {
    let curl = `curl -L '${_url.href}'`;
    if (settings.useUserAgent)
      curl += ` -H 'User-Agent: ${req.headers['user-agent']}'`;
    if (settings.cookies) curl += ` -H 'Cookie: ${settings.cookies}'`;
    if (req.headers.origin2) curl += ` -H 'Origin: ${req.headers.origin2}'`;

    const isWindows = process.platform === 'win32';
    const options = isWindows
      ? {
          shell:
            process.env.BASH_LOCATION ||
            `${process.env.ProgramFiles}\\git\\usr\\bin\\bash.exe`,
        }
      : {};

    const start = Date.now();
    exec(curl, options, (error, stdout) => {
      if (error) {
        console.error(
          `${ts()} ${C.red}✖  curl error:${C.reset}`,
          error.message,
        );
        res.statusCode = 500;
        res.write(`exec error: ${error}`);
        res.end();
        return;
      }
      logResponse({
        method: req.method || 'GET',
        url: _url.href,
        status: 200,
        headers: {},
        body: stdout,
        durationMs: Date.now() - start,
      });
      res.statusCode = 200;
      res.write(stdout);
      res.end();
    });

    // ── NODE_FETCH mode ────────────────────────
  } else if (settings.fetchMode === FetchMode.NODE_FETCH) {
    const headers = new Headers();
    if (settings.useUserAgent)
      headers.append('user-agent', req.headers['user-agent'] as string);
    if (settings.cookies) headers.append('cookie', settings.cookies);
    if (req.headers.origin2)
      headers.append('origin', req.headers.origin2 as string);

    const start = Date.now();
    fetch(_url.href, { headers })
      .then(async res2 => {
        const body = await res2.text();
        const respHeaders: Record<string, string> = {};
        res2.headers.forEach((val, key) => {
          respHeaders[key] = val;
          if (!settings.disAllowResponseHeaders.includes(key)) {
            res.setHeader(key, val);
          }
        });

        logResponse({
          method: req.method || 'GET',
          url: _url.href,
          status: res2.status,
          headers: respHeaders,
          body,
          durationMs: Date.now() - start,
        });

        res.statusCode = res2.status;
        res.write(body);
        res.end();
      })
      .catch(err => {
        console.error(`${ts()} ${C.red}✖  fetch error:${C.reset}`, err);
        res.statusCode = 500;
        res.end();
      });

    // ── PROXY (http-proxy) mode ────────────────
  } else if (settings.fetchMode === FetchMode.PROXY) {
    proxy.web(
      req,
      res,
      { target: _url.origin, selfHandleResponse: true, followRedirects: true },
      err => {
        console.error(
          `${ts()} ${C.red}✖  http-proxy error:${C.reset}`,
          err.message,
        );
        res.statusCode = 500;
        res.end();
      },
    );
  }
};

// ─────────────────────────────────────────────
// http-proxy response handler
// ─────────────────────────────────────────────
proxy.on('proxyRes', (proxyRes, req, res) => {
  const statusCode = proxyRes.statusCode ?? 200;

  // ── Redirect handling ──────────────────────
  if ([301, 302, 303, 307, 308].includes(statusCode)) {
    const location = proxyRes.headers['location'];
    if (location) {
      try {
        const _url = new URL(req.url || '');
        const redirectUrl = new URL(location, _url.href);

        const reqWithRedirect = req as Connect.IncomingMessage & {
          _redirectCount?: number;
        };
        const redirectCount = reqWithRedirect._redirectCount ?? 0;

        if (redirectCount >= 5) {
          console.warn(
            `${ts()} ${C.yellow}⚠  Too many redirects (${redirectCount}) for ${_url.href}${C.reset}`,
          );
          res.statusCode = 508;
          res.end('Too many redirects');
          return;
        }

        console.log(
          `${ts()} ${C.yellow}↪  Redirect ${statusCode}${C.reset} → ${C.cyan}${redirectUrl.href}${C.reset} ${C.dim}(${redirectCount + 1}/5)${C.reset}`,
        );
        reqWithRedirect._redirectCount = redirectCount + 1;
        req.url = redirectUrl.toString();

        if ([301, 302, 303].includes(statusCode)) {
          req.method = 'GET';
          req.headers['content-length'] = '0';
          delete req.headers['content-type'];
        }

        req.removeAllListeners();
        proxyRequest(req, res);
        return;
      } catch (err) {
        console.error(
          `${ts()} ${C.red}✖  Redirect parse error:${C.reset}`,
          err,
        );
      }
    }
  }

  res.statusCode = statusCode;

  // Propagate filtered headers
  const respHeaders: Record<string, string> = {};
  Object.keys(proxyRes.headers).forEach(key => {
    const val = proxyRes.headers[key] as string;
    respHeaders[key] = val;
    if (!settings.disAllowResponseHeaders.includes(key)) {
      res.setHeader(key, val);
    }
  });

  if (statusCode === 304) {
    logResponse({
      method: req.method || 'GET',
      url: req.url || '',
      status: 304,
      headers: respHeaders,
    });
    res.end();
    return;
  }

  const contentEncoding = proxyRes.headers['content-encoding'] ?? '';
  const chunks: Buffer[] = [];
  proxyRes.on('data', chunk => chunks.push(Buffer.from(chunk)));
  proxyRes.on('end', () => {
    try {
      const compressed = Buffer.concat(chunks);
      let body: Buffer = compressed;

      if (compressed.length > 0) {
        if (contentEncoding.includes('br')) {
          body = brotliDecompressSync(compressed);
        } else if (contentEncoding.includes('gzip')) {
          body = gunzipSync(compressed);
        } else if (contentEncoding.includes('zstd')) {
          body = zstdDecompressSync(compressed);
        }
        res.write(body);
      }

      const start = requestStartTimes.get(req);
      logResponse({
        method: req.method || 'GET',
        url: req.url || '',
        status: statusCode,
        headers: respHeaders,
        body: body.toString('utf-8'),
        durationMs: start ? Date.now() - start : undefined,
      });

      res.end();
    } catch (err) {
      console.error(`${ts()} ${C.red}✖  Decompression error:${C.reset}`, err);
      res.statusCode = 500;
      res.end('Decompression error');
    }
  });
});

export { proxyHandlerMiddle, proxySettingMiddleware };
