/**
 * Static file serving for the built client bundle (used by the standalone
 * server, not by the Vite dev server which already serves the app itself).
 */
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import type { Middleware } from './types';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

export type StaticOptions = {
  /** Answer unmatched GETs with index.html so client side routing works. */
  spaFallback?: boolean;
};

function contentTypeOf(file: string): string {
  return (
    MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  );
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function decodePathname(rawUrl: string | undefined): string | null {
  if (!rawUrl) return '/';
  let pathname: string;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    return null;
  }
  try {
    const decoded = decodeURIComponent(pathname);
    // Reject traversal before it can reach the filesystem.
    if (decoded.indexOf('\0') !== -1) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Resolve inside `root`, or return null when the path escapes it. */
function resolveWithinRoot(root: string, pathname: string): string | null {
  const relative = pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  if (target !== root && target.indexOf(root + path.sep) !== 0) return null;
  return target;
}

function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  headOnly: boolean,
): void {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypeOf(file));
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'no-cache');

  if (headOnly) {
    res.end();
    return;
  }

  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end();
    }
  });
  stream.pipe(res);
}

export function createStaticMiddleware(
  dir: string,
  options: StaticOptions = {},
): Middleware {
  const root = path.resolve(dir);
  const indexFile = path.join(root, 'index.html');

  return (req, res, next) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      next();
      return;
    }

    const pathname = decodePathname(req.url);
    if (pathname === null) {
      next();
      return;
    }

    const target = resolveWithinRoot(root, pathname);
    if (target === null) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (isFile(target)) {
      sendFile(req, res, target, method === 'HEAD');
      return;
    }

    if (isDirectory(target) && isFile(path.join(target, 'index.html'))) {
      sendFile(req, res, path.join(target, 'index.html'), method === 'HEAD');
      return;
    }

    if (options.spaFallback && isFile(indexFile)) {
      sendFile(req, res, indexFile, method === 'HEAD');
      return;
    }

    next();
  };
}
