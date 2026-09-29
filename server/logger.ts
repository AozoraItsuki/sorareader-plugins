/**
 * ANSI coloured request/response logging.
 *
 * Extracted from the original root-level proxy.ts so that the logger can be
 * shared by the proxy, the access banner and the standalone entrypoint without
 * dragging the Vite dev server in.
 */
import process from 'node:process';

// `Buffer` is deliberately left as the ambient global type. With `target: ES5`
// and no explicit `lib`, `Buffer<ArrayBufferLike>` inherits
// `Uint8Array.toString()` from lib.es5.d.ts, whose signature takes zero
// arguments, so the encoding overload is not available here. Node's
// argument-less `toString()` already defaults to utf8, which is what we want.

/**
 * Escape codes are only useful on a real terminal. When the output is piped
 * (CI logs, `npm run dev:start > file`) they just add noise, so respect the
 * NO_COLOR convention and the TTY flag.
 */
export const supportsColor = ((): boolean => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout && process.stdout.isTTY);
})();

const ansi = (code: string): string => (supportsColor ? code : '');

// ─────────────────────────────────────────────
// ANSI color palette
// ─────────────────────────────────────────────
export const C = {
  reset: ansi('\x1b[0m'),
  dim: ansi('\x1b[2m'),
  bold: ansi('\x1b[1m'),
  cyan: ansi('\x1b[36m'),
  green: ansi('\x1b[32m'),
  yellow: ansi('\x1b[33m'),
  red: ansi('\x1b[31m'),
  magenta: ansi('\x1b[35m'),
  blue: ansi('\x1b[34m'),
  white: ansi('\x1b[37m'),
  gray: ansi('\x1b[90m'),
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

export function ts(): string {
  return `${C.gray}[${new Date().toLocaleTimeString('en-US', { hour12: false })}]${C.reset}`;
}

export function hr(char = '─', width = 60): string {
  return C.dim + char.repeat(width) + C.reset;
}

export function truncate(s: string, max = 200): string {
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
type LogRequestOptions = {
  method: string;
  url: string;
  headers: Record<string, unknown>;
  body?: string;
  contentType?: string;
};

export function logRequest({
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
    const params: [string, string][] = [];
    _url.searchParams.forEach((value, key) => {
      params.push([key, value]);
    });
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
  const HIDE_IN_LOG = ['host', 'connection', 'content-length'];
  HIDE_IN_LOG.forEach(key => {
    delete filteredHeaders[key];
  });

  if (Object.keys(filteredHeaders).length) {
    console.log(`\n${C.bold}  Request Headers${C.reset}`);
    console.log(prettyHeaders(filteredHeaders));
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
type LogResponseOptions = {
  method: string;
  url: string;
  status: number;
  headers: Record<string, unknown>;
  body?: string;
  durationMs?: number;
};

export function logResponse({
  method,
  url,
  status,
  headers,
  body,
  durationMs,
}: LogResponseOptions): void {
  const _url = safeUrl(url);
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

/**
 * `logResponse` is also called for internal failures where the URL may no
 * longer be parsable, so never let logging itself throw.
 */
function safeUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    return new URL('http://localhost/');
  }
}

/**
 * Whether a `content-type` carries human readable text. Anything else (images,
 * archives, fonts, …) must never be decoded just to be printed.
 */
export function isTextualContentType(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('ecmascript') ||
    type.includes('xml') ||
    type.includes('x-www-form-urlencoded') ||
    type.includes('graphql')
  );
}

/**
 * Collapse a binary payload into a one line summary so that the terminal is
 * not filled with mojibake.
 */
export function binaryBodySummary(
  contentType: string,
  byteLength: number,
): string {
  return `<${byteLength} bytes of ${contentType.split(';')[0].trim() || 'binary'}>`;
}

/**
 * Turn a response body into something safe to log: text is decoded, binary
 * payloads collapse into a `<N bytes of image/png>` summary.
 */
export function bodyForLog(bytes: Buffer, contentType: string): string {
  if (bytes.length === 0) return '';
  if (isTextualContentType(contentType)) return bytes.toString();
  return binaryBodySummary(contentType, bytes.length);
}
