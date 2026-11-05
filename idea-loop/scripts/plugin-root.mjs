/**
 * Where another plugin of the same marketplace lives, for the few scripts that import one across
 * plugins (seo-issues.mjs → idea-loop's issues.mjs, flow-compose.mjs --archive → design's
 * design-archive.mjs). Skills and agents call each other by name; only scripts need this.
 *
 * Looks, in order, at: the env var `<NAME>_PLUGIN_ROOT` (dashes become underscores); the sibling
 * directory `../<name>` (this repository, `--plugin-dir`, the marketplace clone); the plugin cache
 * `../../<name>/<version>` with the highest version. A directory counts only when it holds
 * `.claude-plugin/plugin.json` with that name.
 *
 * idea-loop/scripts/plugin-root.mjs and seo/scripts/plugin-root.mjs are the same file (a repository
 * test keeps them identical): a plugin cannot import this from another plugin before it found it.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));

const isPlugin = (dir, name) => {
  const f = join(dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(f)) return false;
  try {
    return JSON.parse(readFileSync(f, 'utf8')).name === name;
  } catch {
    return false;
  }
};

const byVersion = (a, b) => {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

/** The root directory of plugin `name`, seen from plugin root `from`; null when it is not installed. */
export function pluginRoot(name, { from = HERE, env = process.env } = {}) {
  const fromEnv = env[`${name.toUpperCase().replace(/-/g, '_')}_PLUGIN_ROOT`];
  if (fromEnv && isPlugin(resolve(fromEnv), name)) return resolve(fromEnv);
  const sibling = resolve(from, '..', name);
  if (isPlugin(sibling, name)) return sibling;
  const cache = resolve(from, '..', '..', name);
  if (existsSync(cache)) {
    const versions = readdirSync(cache).filter((v) => isPlugin(join(cache, v), name)).sort(byVersion);
    if (versions.length) return join(cache, versions.at(-1));
  }
  return null;
}

/** Imports `scripts/<file>` from plugin `name`, or throws saying which plugin is missing. */
export async function importFrom(name, file, opts) {
  const root = pluginRoot(name, opts);
  if (!root) throw new Error(`找不到 ${name} 插件（要用它的 scripts/${file}）：先装上 ${name}`);
  return import(new URL(`file://${join(root, 'scripts', file)}`).href);
}
