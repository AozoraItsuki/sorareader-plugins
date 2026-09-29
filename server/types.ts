/**
 * Shared contracts for the plugin server.
 *
 * This module is imported by the BROWSER bundle as well (see src/types/types.ts),
 * so it must stay dependency free: only `import type` declarations are allowed
 * here, never a real import. Everything below has to survive being bundled for
 * the browser as well as being loaded by plain Node.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * How the proxy talks to the target site.
 *
 * The numeric values are part of a public contract: the settings UI
 * (src/components/settings.tsx) and the mobile app both persist the raw number,
 * so these must never be renumbered.
 */
export enum FetchMode {
  PROXY,
  NODE_FETCH,
  CURL,
}

export type ServerSetting = {
  /** Allowed CORS origin, or '*' to echo whatever the browser sends. */
  CLIENT_HOST: string;
  fetchMode: FetchMode;
  /** Extra cookies injected into every proxied request. */
  cookies?: string;
  disAllowedRequestHeaders: string[];
  disAllowResponseHeaders: string[];
  useUserAgent: boolean;
};

export type NextFn = () => void;

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: NextFn,
) => void;
