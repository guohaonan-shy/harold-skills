/**
 * Scan — every `dyna <module> <command>` the plugin writes down must exist in the command registry of the
 * lowest dyna version the plugin accepts.
 *
 * The plugin's skills, agents, README, hooks.json and .mcp.json call dyna by name. This reads each mention,
 * walks it down the stored registry (`dyna/registry/<version>.json`, written by `dyna registry --json` when a
 * version is released) and reports, with file and line:
 *   - a module or command that is not there, or a flag the command does not have;
 *   - a command only a hook may call (caller `hook`) written anywhere but hooks.json;
 *   - a command only tests may call (caller `test`) written in the plugin at all;
 *   - a lowest version (the floor of `idea-loop/dyna-version`) that has no stored registry: it is not released.
 *
 * Only code is read: inline `code spans` and fenced blocks in markdown, every line of a .json file. Prose
 * that says "dyna" is not a command.
 *
 * It lives at the repository root, not in the plugin: it reads the dyna/ directory, which does not ship
 * with the plugin.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

/** The floor of a version range such as `>=0.4.0 <1.0.0`, or null. */
export function lowerBound(range) {
  for (const c of String(range).trim().split(/\s+/)) {
    const m = c.match(/^(?:>=|=)?v?(\d+\.\d+\.\d+)$/);
    if (m) return m[1];
  }
  return null;
}

/** The range written in a `dyna-version` file: comment lines dropped, one line. */
export const readRange = (text) => String(text).split('\n').filter((l) => !/^\s*#/.test(l) && l.trim()).join(' ').trim().replace(/\s+/g, ' ');

const WORD = /^[a-z][a-z0-9-]*$/;
/** What `dyna self <x>` the plugin's launcher does by itself, without the binary. */
const SELF = ['install', 'upgrade'];
const STOP = /^(?:\||\|\||&&|;|>|>>|<|\)|&)$/;

/** The words after `dyna` in a piece of code, up to the end of the command. */
function wordsAfter(tail) {
  const out = [];
  for (const raw of tail.split(/\s+/).filter(Boolean)) {
    if (STOP.test(raw)) break;
    // a closing quote or punctuation glued to the last word
    const w = raw.replace(/["'`)，。；;,.]+$/, '');
    if (w) out.push(w);
    if (w !== raw) break;
  }
  return out;
}

// `dyna ...` in code, or the path of the launcher followed by the words (in hooks.json the closing quote of the path is escaped)
const MENTION = /(?:(?<![\w./-])dyna|bin\/dyna(?:\\?")?)[ \t]+([^\n]*)/g;

/** Every mention of a dyna command in one piece of code: the words after `dyna`. */
export function mentions(code) {
  return [...code.matchAll(MENTION)].map((m) => wordsAfter(m[1]));
}

/** The pieces of code in a file: [{ line, code }]. */
export function codeOf(file, text) {
  const lines = text.split('\n');
  if (file.endsWith('.json')) return lines.map((code, i) => ({ line: i + 1, code }));
  const out = [];
  let fence = null;
  lines.forEach((l, i) => {
    const f = l.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) {
      out.push({ line: i + 1, code: l });
      return;
    }
    for (const span of l.matchAll(/`([^`]+)`/g)) out.push({ line: i + 1, code: span[1] });
  });
  return out;
}

/** Walks one mention down the registry: { path, leaf } or a complaint. */
function resolve(words, registry) {
  const leaves = new Map(registry.commands.map((c) => [c.command, c]));
  const groups = new Set();
  for (const c of registry.commands) {
    const parts = c.command.split(' ');
    for (let i = 1; i < parts.length; i++) groups.add(parts.slice(0, i).join(' '));
  }
  const path = [];
  let i = 0;
  for (; i < words.length; i++) {
    const next = [...path, words[i]].join(' ');
    if (!WORD.test(words[i])) break;
    if (leaves.has(next)) {
      path.push(words[i]);
      return { path: path.join(' '), leaf: leaves.get(next), rest: words.slice(i + 1) };
    }
    if (groups.has(next)) {
      path.push(words[i]);
      continue;
    }
    return { path: path.join(' '), missing: words[i] };
  }
  return { path: path.join(' '), group: true };
}

/** The commands an `.mcp.json` starts: [{ line, words }] for each server whose command is dyna. */
function mcpMentions(text) {
  let servers;
  try {
    servers = JSON.parse(text).mcpServers ?? {};
  } catch {
    return [];
  }
  const lines = text.split('\n');
  return Object.entries(servers).flatMap(([name, s]) => {
    if (!/(^|\/)dyna$/.test(String(s?.command ?? ''))) return [];
    const at = lines.findIndex((l) => l.includes(`"${name}"`));
    return [{ line: at < 0 ? 1 : at + 1, words: (s.args ?? []).map(String) }];
  });
}

/** Violations in one file's text. `registry` is the stored registry; `name` how the file is reported. */
export function scanText({ name, text, registry }) {
  const out = [];
  const isHooks = basename(name) === 'hooks.json';
  const found = basename(name) === '.mcp.json'
    ? mcpMentions(text)
    : codeOf(name, text).flatMap(({ line, code }) => mentions(code).map((words) => ({ line, words })));
  for (const { line, words } of found) {
    if (!words.length || !WORD.test(words[0])) continue; // `dyna <模块>`, `dyna --help`: no command named
    const at = `${name}:${line}`;
    if (words[0] === 'self') {
      // handled by the plugin's launcher, not the binary: it is not in the registry
      if (WORD.test(words[1] ?? '') && !SELF.includes(words[1])) out.push(`${at}  dyna self ${words[1]}：启动小脚本只有 ${SELF.join(' / ')}`);
      continue;
    }
    const r = resolve(words, registry);
    if (r.missing !== undefined) {
      out.push(`${at}  dyna ${[r.path, r.missing].filter(Boolean).join(' ')}：${r.path ? `「${r.path}」下没有命令「${r.missing}」` : `没有模块或命令「${r.missing}」`}（登记表 ${registry.version}）`);
      continue;
    }
    if (r.group) continue;
    for (const w of r.rest) {
      if (w === '--') break;
      const f = w.match(/^--([a-z][a-z0-9-]*)(?:=.*)?$/);
      if (!f || f[1] === 'help') continue;
      if (!r.leaf.args.some((a) => a.kind === 'flag' && a.name === f[1])) out.push(`${at}  dyna ${r.path}：没有参数 --${f[1]}（登记表 ${registry.version}）`);
    }
    if (r.leaf.caller === 'hook' && !isHooks) out.push(`${at}  dyna ${r.path}：这条命令只许 hooks.json 引用`);
    if (r.leaf.caller === 'test') out.push(`${at}  dyna ${r.path}：这条命令只许测试、REVIEW.md、DEVELOPMENT.md 引用，插件里不能写`);
  }
  return out;
}

function walk(dir, ok) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p, ok);
    return ok(n) ? [p] : [];
  });
}

/** The files of a plugin that may call dyna. */
export function pluginFiles(pluginRoot) {
  return [
    ...walk(join(pluginRoot, 'skills'), (n) => n.endsWith('.md')),
    ...walk(join(pluginRoot, 'agents'), (n) => n.endsWith('.md')),
    ...['README.md', join('hooks', 'hooks.json'), '.mcp.json'].map((f) => join(pluginRoot, f)).filter(existsSync),
  ];
}

/**
 * Scans a plugin against the stored registries. The lowest dyna version comes from the plugin's `dyna-version`;
 * with no stored registry for it the plugin asks for a version that is not released.
 */
export function scanPlugin({ pluginRoot, registryDir }) {
  const rangeFile = join(pluginRoot, 'dyna-version');
  if (!existsSync(rangeFile)) return [`${basename(pluginRoot)}/dyna-version：没有这个文件，插件没写要哪个版本的命令行`];
  const floor = lowerBound(readRange(readFileSync(rangeFile, 'utf8')));
  if (!floor) return [`${basename(pluginRoot)}/dyna-version：范围里没有下限（要写成 >=0.0.1 <1.0.0）`];
  const stored = join(registryDir, `${floor}.json`);
  if (!existsSync(stored)) return [`${basename(pluginRoot)}/dyna-version：最低版本 ${floor} 还没发布（${relative(join(registryDir, '..', '..'), stored)} 不存在）：先合命令行的改动、发版、存下登记表，再提高下限`];
  const registry = JSON.parse(readFileSync(stored, 'utf8'));
  return pluginFiles(pluginRoot).flatMap((f) => scanText({ name: relative(pluginRoot, f), text: readFileSync(f, 'utf8'), registry }));
}
