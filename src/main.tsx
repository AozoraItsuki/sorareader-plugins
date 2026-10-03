// Plugin-facing polyfills. These install globals that plugins rely on at
// runtime, so they stay first and stay in this order.
import 'cheerio';
import 'htmlparser2';
import 'dayjs';
import 'protobufjs';
import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

/**
 * `Window` is augmented through a local alias rather than `declare global`,
 * because declaration merging needs an `interface` and merging `Window` for a
 * single playground-owned slot would leak the type into every module.
 */
type PatchedWindow = typeof window & {
  /**
   * The untouched native `fetch`, parked on `window` so re-evaluating this
   * module (Vite HMR, a duplicated script tag) swaps the override out instead
   * of stacking a second wrapper on top of the first one.
   */
  __lnreaderNativeFetch?: typeof fetch;
};

const patchedWindow = window as PatchedWindow;

const nativeFetch: typeof fetch =
  patchedWindow.__lnreaderNativeFetch ?? window.fetch;
patchedWindow.__lnreaderNativeFetch = nativeFetch;

/**
 * True when `url` is served by this very playground, i.e. its **host name and
 * port** both match the current location. A substring test cannot do this: it
 * lets `https://localhost-cdn.example.com/feed.xml` and
 * `https://notlocalhost.io/x` pass as "local", while failing to recognise the
 * playground's own origin once it is reached over a LAN IP (`192.168.1.50`),
 * the Android emulator alias (`10.0.2.2`) or an IPv6 literal.
 */
const isOwnServer = (url: string): boolean => {
  try {
    // `host` is already normalised (lower-cased, IPv6 in brackets, default port
    // omitted) by the URL parser, on both sides of the comparison.
    return new URL(url, window.location.href).host === window.location.host;
  } catch {
    return false;
  }
};

/**
 * Roots a target at the playground's origin with **exactly one** slash.
 *
 * The dev server mounts its proxy middleware at the literal prefixes `'/https:'`
 * and `'/http:'`, so an external absolute URL keeps its scheme and is rewritten
 * to `origin + '/' + 'https://target.site/path'`, which the browser puts on the
 * wire as `GET /https://target.site/path`. Relative targets carry no scheme, so
 * they are simply re-rooted: `'settings'` -> `origin + '/settings'`, which is
 * the route `src/components/settings.tsx` calls. A caller-supplied leading slash
 * is stripped first, otherwise `'/bar'` would become `origin + '//bar'`.
 */
const toOriginPath = (target: string): string =>
  window.location.origin +
  '/' +
  target.replace(/^\/+/, '').replace(/^\.\//, '');

type Route =
  /** Hand the resource to the browser untouched. */
  | { kind: 'direct' }
  /**
   * Re-root it against the playground's origin, then send it.
   * `url` is what goes on the wire; `original` is the absolute URL a plugin
   * should see reported back as `response.url` (equal to `url` for relative
   * targets, which carry no absolute form of their own).
   */
  | { kind: 'origin'; url: string; original: string };

/**
 * Decides what to do with an incoming fetch target.
 *
 * | target                          | result                                   |
 * | ------------------------------- | ---------------------------------------- |
 * | `'settings'`                    | rewrite -> `origin + '/settings'`        |
 * | `'./foo'`                       | rewrite -> `origin + '/foo'`             |
 * | `'/bar'`                        | rewrite -> `origin + '/bar'`             |
 * | `'https://a.site/x'`            | rewrite -> `origin + '/https://a.site/x'`|
 * | `'//a.site/x'`                  | rewrite, adopting the page scheme        |
 * | `'http://192.168.1.50:3000/x'`  | direct (same host **and** port)          |
 * | `'https://localhost-cdn.example.com/x'` | rewrite (not our host)          |
 * | `'data:…'`, `'blob:…'`          | direct (no server counterpart)           |
 */
const routeTarget = (target: string): Route => {
  // Protocol-relative `//host/path` adopts the page's scheme so it is judged as
  // an absolute URL instead of a bare path.
  const absolute =
    target.slice(0, 2) === '//' ? window.location.protocol + target : target;

  const scheme = /^([a-zA-Z][a-zA-Z\d+\-.]*):/.exec(absolute);
  if (!scheme) {
    // Relative. Deliberately *not* short-circuited by `isOwnServer`: resolving
    // `'settings'` against the document would be wrong whenever the app is
    // mounted under a path, and the re-rooted form is what the server routes on.
    const url = toOriginPath(absolute);
    return { kind: 'origin', url, original: url };
  }

  const protocol = scheme[1].toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') {
    // `data:`, `blob:`, `file:` … have no proxy counterpart.
    return { kind: 'direct' };
  }

  if (isOwnServer(absolute)) return { kind: 'direct' };
  // The raw string is kept verbatim rather than re-serialised through `URL`, so
  // the server receives byte-for-byte what the plugin asked for.
  return { kind: 'origin', url: toOriginPath(absolute), original: absolute };
};

/**
 * `RequestInit` off `lib.dom` is resolved structurally instead of by name, so
 * this file needs no ambient DOM global for the compiler or the linter.
 */
type RequestInitLike = NonNullable<Parameters<typeof fetch>[1]>;

/**
 * Copies a `Request` into a plain `RequestInit` so its URL can be swapped while
 * its method, headers and body survive the trip.
 */
const initFromRequest = async (request: Request): Promise<RequestInitLike> => {
  const init: RequestInitLike = {
    method: request.method,
    headers: new Headers(request.headers),
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    keepalive: request.keepalive,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
  };
  // GET/HEAD never carry a body. `clone()` keeps the caller's own `Request`
  // intact, so re-reading the stream here cannot disturb it.
  if (
    request.body !== null &&
    request.method !== 'GET' &&
    request.method !== 'HEAD'
  ) {
    init.body = await request.clone().arrayBuffer();
  }
  return init;
};

const proxiedFetch: typeof fetch = async (input, init) => {
  // `fetch` accepts a `Request`, and `String(request)` is `"[object Request]"`
  // — so the real URL has to be read off the object itself.
  const target =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  const route = routeTarget(target);
  if (route.kind === 'direct') return await nativeFetch(input, init);

  // An explicit `init` still wins over the `Request`, matching the
  // `new Request(input, init)` precedence the platform itself applies.
  const carried = input instanceof Request ? await initFromRequest(input) : {};
  const response = await nativeFetch(route.url, {
    ...carried,
    ...init,
    // Forced for every re-rooted request. The middleware echoes the request
    // `Origin` instead of a literal `*`, which is what makes sending
    // credentials legal here.
    credentials: 'include',
    mode: 'cors',
  });

  // `url` is a read-only accessor on `Response.prototype`, and plugins read it to
  // spot a redirect to a mobile site or a login wall. Put the original target
  // back — but only when the response really did come out of our own origin,
  // which is the same host/port check used above rather than a substring guess.
  if (response.url !== route.original && isOwnServer(response.url)) {
    Object.defineProperty(response, 'url', {
      value: route.original,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  }
  return response;
};

/** Module-level flag: installing the override twice would make it call itself. */
let overrideInstalled = false;
if (!overrideInstalled) {
  overrideInstalled = true;
  window.fetch = proxiedFetch;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
