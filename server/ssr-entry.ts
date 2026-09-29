/**
 * Vite SSR build entry.
 *
 * `vite build --ssr server/ssr-entry.ts` bundles the plugins (and their
 * cheerio/htmlparser2 usage) into a single Node module so the standalone server
 * can load them without Vite. Plugins are pulled in through the `@plugins`
 * alias, exactly like the browser bundle does.
 */
import plugins from '@plugins/index';

export default plugins;
