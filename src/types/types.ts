import { Plugin } from '@/types/plugin';

export type PluginList = Record<string, Plugin.PluginItem[]>;

/**
 * `FetchMode` and `ServerSetting` live in the server core so that the settings
 * store, the proxy and the settings UI all share one definition. They are
 * re-exported here because this module is the one the browser bundle imports.
 */
export { FetchMode } from '../../server/types';
export type { ServerSetting } from '../../server/types';
