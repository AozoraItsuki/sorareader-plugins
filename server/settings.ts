/**
 * Validated, persisted server settings.
 *
 * The settings UI POSTs a partial patch to `/settings`; every field is checked
 * against an explicit validator before it is merged, unknown keys are rejected
 * by name, and the merged result is written to `<rootDir>/.cache`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { C, ts } from './logger';
import { FetchMode } from './types';
import type { ServerSetting } from './types';

export const SETTINGS_CACHE_DIR = '.cache';
export const SETTINGS_CACHE_FILE = 'server-settings.json';

export const DEFAULT_SETTINGS: ServerSetting = {
  CLIENT_HOST: '*',
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
// Store state
// ─────────────────────────────────────────────
let current: ServerSetting = { ...DEFAULT_SETTINGS };
let cacheDir = path.join(process.cwd(), SETTINGS_CACHE_DIR);
let cacheFile = path.join(cacheDir, SETTINGS_CACHE_FILE);
let loadedFrom = 'defaults';

type SettingsListener = (settings: ServerSetting) => void;
const listeners: SettingsListener[] = [];

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────
export type ValidationResult =
  | { ok: true; values: Partial<ServerSetting> }
  | { ok: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

/** `'*'`, or anything that parses to a bare origin such as `http://192.168.1.5:3000`. */
const isValidClientHost = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value === '*') return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.origin !== 'null' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
};

/**
 * The UI round-trips the numeric enum through `parseInt`, and the
 * `FETCH_MODE` env var arrives as a string, so numbers are parsed here.
 */
const toFetchMode = (value: unknown): FetchMode | null => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed)) return null;
  if (parsed === 0) return FetchMode.PROXY;
  if (parsed === 1) return FetchMode.NODE_FETCH;
  if (parsed === 2) return FetchMode.CURL;
  return null;
};

/** Accepts real booleans plus the `'true'` / `'false'` strings env vars use. */
const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

/**
 * Validate a partial settings patch. Rejects unknown keys by name so a typo in
 * the UI surfaces immediately instead of being silently dropped.
 */
export function validateSettingsPatch(patch: unknown): ValidationResult {
  if (!isRecord(patch)) {
    return { ok: false, message: 'Settings payload must be a JSON object' };
  }

  const values: Partial<ServerSetting> = {};
  const errors: string[] = [];
  const unknown: string[] = [];

  Object.keys(patch).forEach(key => {
    const value = patch[key];
    switch (key) {
      case 'CLIENT_HOST':
        if (isValidClientHost(value)) values.CLIENT_HOST = value;
        else errors.push("'CLIENT_HOST' must be '*' or a parseable origin");
        break;

      case 'fetchMode': {
        const mode = toFetchMode(value);
        if (mode === null) errors.push("'fetchMode' must be an integer 0|1|2");
        else values.fetchMode = mode;
        break;
      }

      // `null` is accepted as "clear the cookies"; the empty string is what the
      // settings UI actually sends and is falsy everywhere it is read.
      case 'cookies':
        if (typeof value === 'string') values.cookies = value;
        else if (value === null) values.cookies = '';
        else errors.push("'cookies' must be a string");
        break;

      case 'useUserAgent': {
        const flag = toBoolean(value);
        if (flag === null) errors.push("'useUserAgent' must be a boolean");
        else values.useUserAgent = flag;
        break;
      }

      case 'disAllowedRequestHeaders':
        if (isStringArray(value)) values.disAllowedRequestHeaders = value;
        else
          errors.push("'disAllowedRequestHeaders' must be an array of strings");
        break;

      case 'disAllowResponseHeaders':
        if (isStringArray(value)) values.disAllowResponseHeaders = value;
        else
          errors.push("'disAllowResponseHeaders' must be an array of strings");
        break;

      default:
        unknown.push(key);
    }
  });

  if (unknown.length) {
    errors.push(`unknown setting(s): ${unknown.join(', ')}`);
  }
  if (errors.length) {
    return { ok: false, message: errors.join('; ') };
  }
  return { ok: true, values };
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────
export function settingsCacheFile(): string {
  return cacheFile;
}

function persist(): void {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(current, null, 2), 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `${ts()} ${C.yellow}⚠  Could not persist settings to ${cacheFile}: ${message}${C.reset}`,
    );
  }
}

/**
 * Load persisted settings, then let the environment win. A corrupt file is
 * reported and ignored rather than fatal, so the playground always boots.
 */
function load(): void {
  current = { ...DEFAULT_SETTINGS };
  loadedFrom = 'defaults';

  let raw: string | null = null;
  try {
    raw = fs.readFileSync(cacheFile, 'utf8');
  } catch {
    raw = null; // no file yet: perfectly normal on first run
  }

  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `${ts()} ${C.yellow}⚠  Ignoring corrupt ${cacheFile} (${message}); using defaults${C.reset}`,
      );
      parsed = null;
    }
    if (parsed !== null) {
      const result = validateSettingsPatch(parsed);
      if (result.ok) {
        current = { ...current, ...result.values };
        loadedFrom = cacheFile;
      } else {
        console.warn(
          `${ts()} ${C.yellow}⚠  Ignoring invalid ${cacheFile}: ${result.message}${C.reset}`,
        );
      }
    }
  }

  applyEnvOverrides();
}

function applyEnvOverrides(): void {
  const envFetchMode = process.env.FETCH_MODE;
  if (envFetchMode !== undefined && envFetchMode !== '') {
    const mode = toFetchMode(envFetchMode);
    if (mode === null) {
      console.warn(
        `${ts()} ${C.yellow}⚠  Ignoring FETCH_MODE='${envFetchMode}': expected 0, 1 or 2${C.reset}`,
      );
    } else {
      current.fetchMode = mode;
    }
  }

  const envCookies = process.env.PROXY_COOKIES;
  if (envCookies !== undefined && envCookies !== '')
    current.cookies = envCookies;

  const envUserAgent = process.env.USE_USER_AGENT;
  if (envUserAgent !== undefined && envUserAgent !== '') {
    const flag = toBoolean(envUserAgent);
    if (flag === null) {
      console.warn(
        `${ts()} ${C.yellow}⚠  Ignoring USE_USER_AGENT='${envUserAgent}': expected true or false${C.reset}`,
      );
    } else {
      current.useUserAgent = flag;
    }
  }

  const envClientHost = process.env.CLIENT_HOST;
  if (envClientHost !== undefined && envClientHost !== '') {
    if (isValidClientHost(envClientHost)) {
      current.CLIENT_HOST = envClientHost;
    } else {
      console.warn(
        `${ts()} ${C.yellow}⚠  Ignoring CLIENT_HOST='${envClientHost}': expected '*' or an origin${C.reset}`,
      );
    }
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Point the store at `<rootDir>/.cache/server-settings.json` and load it.
 * Safe to call more than once: it re-reads the file and re-applies env
 * overrides, which is what a Vite config reload needs.
 */
export function configureSettings(rootDir: string): void {
  cacheDir = path.join(rootDir, SETTINGS_CACHE_DIR);
  cacheFile = path.join(cacheDir, SETTINGS_CACHE_FILE);
  load();
}

export function getSettings(): Readonly<ServerSetting> {
  return current;
}

export function settingsSource(): string {
  return loadedFrom;
}

export type UpdateResult =
  | { ok: true; settings: ServerSetting; updated: string[] }
  | { ok: false; message: string };

/** Merge a validated patch into the current settings and persist the result. */
export function updateSettings(patch: unknown): UpdateResult {
  const result = validateSettingsPatch(patch);
  if (!result.ok) return { ok: false, message: result.message };

  const updated = Object.keys(result.values);
  if (updated.length) {
    current = { ...current, ...result.values };
    persist();
    notify();
  }

  if (updated.length) {
    console.log(
      `\n${ts()} ${C.yellow}${C.bold}⚙  Settings updated:${C.reset} ${updated.map(k => C.cyan + k + C.reset).join(', ')}`,
    );
  }

  return { ok: true, settings: current, updated };
}

/** Subscribe to changes; returns the unsubscribe function. */
export function subscribe(fn: SettingsListener): () => void {
  listeners.push(fn);
  return () => {
    const index = listeners.indexOf(fn);
    if (index !== -1) listeners.splice(index, 1);
  };
}

function notify(): void {
  listeners.slice().forEach(listener => {
    try {
      listener(current);
    } catch (err) {
      console.error(
        `${ts()} ${C.red}✖  Settings listener failed:${C.reset}`,
        err,
      );
    }
  });
}
