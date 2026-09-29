/**
 * Plugin loading strategies.
 *
 * The server core never touches Vite directly: it receives a `PluginLoader`
 * closure, and the two factories below build that closure either from a
 * `ViteDevServer` (dev) or from a pre-built SSR bundle (production).
 */
import type { Plugin } from '../src/types/plugin';

/** The module Vite's SSR graph is asked for, resolved through its aliases. */
export const PLUGIN_ENTRY = '/plugins/index.ts';

export type PluginLoader = () => Promise<Plugin.PluginBase[]>;

/**
 * The structural slice of `ViteDevServer` that is actually needed. Declaring it
 * here keeps `vite` out of the server core's import graph entirely.
 */
export type VitePluginServer = {
  ssrLoadModule(url: string): Promise<unknown>;
};

const toPluginList = (value: unknown): Plugin.PluginBase[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      `Plugin entry did not export an array (received ${typeof value})`,
    );
  }
  const invalid = value.findIndex(
    item => typeof item !== 'object' || item === null,
  );
  if (invalid !== -1) {
    throw new Error(`Plugin entry contains a non-object at index ${invalid}`);
  }
  return value as Plugin.PluginBase[];
};

/**
 * Dev loader. Nothing is cached here on purpose: `ssrLoadModule` is called on
 * every request so that Vite's own module graph decides when a plugin edit is
 * live. The previous module-level cache meant edits only appeared after a
 * restart.
 */
export function createVitePluginLoader(
  getServer: () => VitePluginServer,
): PluginLoader {
  return async () => {
    const server = getServer();
    const mod = await server.ssrLoadModule(PLUGIN_ENTRY);
    return toPluginList(isModuleNamespace(mod) ? mod.default : mod);
  };
}

/**
 * Production loader for a built SSR bundle. The bundle is static, so the
 * dynamic import is memoised after the first call.
 */
export function createBundledPluginLoader(fileUrl: string): PluginLoader {
  let cached: Plugin.PluginBase[] | null = null;
  return async () => {
    if (cached === null) {
      const mod: unknown = await import(/* @vite-ignore */ fileUrl);
      cached = toPluginList(isModuleNamespace(mod) ? mod.default : mod);
    }
    return cached;
  };
}

function isModuleNamespace(mod: unknown): mod is { default: unknown } {
  return typeof mod === 'object' && mod !== null && 'default' in mod;
}
