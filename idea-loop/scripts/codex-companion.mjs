#!/usr/bin/env node
/**
 * Finds the Codex plugin's companion script (codex-companion.mjs), which pr-review's reviewer drives.
 *
 * Plugins live under a directory named `plugins`; walking up from this plugin's root finds it. An
 * installed, versioned copy under `cache/openai-codex/codex/<version>/scripts/` is preferred (highest
 * version), then the marketplace checkout under `marketplaces/openai-codex/plugins/codex/scripts/`.
 * A candidate counts only if it offers the `task` command.
 *
 * Usage: node codex-companion.mjs [<start-dir>]   → prints the path
 * Exit: 0 = found, 1 = not found (what was searched, on stderr).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const versionKey = (v) => v.split('.').map((n) => Number(n) || 0);
const newer = (a, b) => {
  const [x, y] = [versionKey(a), versionKey(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
};

/** The `plugins` directory at or above `start`, or null. */
export function pluginsDir(start) {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (basename(dir) === 'plugins') return dir;
    dir = dirname(dir);
  }
  return null;
}

/** Companion paths to try, best first. */
export function candidates(plugins) {
  const cache = join(plugins, 'cache', 'openai-codex', 'codex');
  const versions = existsSync(cache) ? readdirSync(cache).sort(newer) : [];
  return [
    ...versions.map((v) => join(cache, v, 'scripts', 'codex-companion.mjs')),
    join(plugins, 'marketplaces', 'openai-codex', 'plugins', 'codex', 'scripts', 'codex-companion.mjs'),
  ];
}

export function findCompanion(start) {
  const plugins = pluginsDir(start);
  if (!plugins) return { path: null, searched: [] };
  const list = candidates(plugins);
  const path = list.find((p) => existsSync(p) && /\btask\b/.test(readFileSync(p, 'utf8')));
  return { path: path ?? null, searched: list };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const start = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const { path, searched } = findCompanion(start);
  if (path) console.log(path);
  else {
    console.error(`没找到支持 task 的 codex-companion.mjs。找过：\n${searched.map((p) => `  ${p}`).join('\n') || `  （${start} 往上没有 plugins 目录）`}\n装 Codex 插件后再试；不猜路径、不改 Codex 配置。`);
    process.exitCode = 1;
  }
}
