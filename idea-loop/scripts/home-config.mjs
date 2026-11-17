#!/usr/bin/env node
/**
 * The mechanical part of setup's "three user-level changes", so setup can show them once and do them in one go:
 *
 *   1 plugin     user-level settings.json: enabledPlugins["<plugin>@<marketplace>"] = true
 *                (the key is read off the plugin's own install path, never hard-coded)
 *   2 memory     user-level settings.json: autoMemoryDirectory = <home>/memory
 *   3 claude-md  user-level CLAUDE.md becomes a symlink to <home>/AGENTS.md; a plain file's text moves into
 *                <home>/AGENTS.md first, before the idea-loop sections, verbatim
 *
 * Two commands, each over all three items or a subset (`--only 1,3`, numbers or names):
 *   plan    prints each item's before and after and whether it is already done; writes nothing
 *   apply   copies settings.json and CLAUDE.md into <home>/.backup/<time>/ (and makes sure <home>/.gitignore
 *           ignores .backup/), then does the items that are still to do. Items already in place are left alone,
 *           and when none is left nothing is written, not even a backup, so a second run changes no file.
 *           A CLAUDE.md that is a symlink to somewhere else is never touched: plan says a human has to deal with it.
 *
 * <home> is ~/home, or IDEA_LOOP_HOME. The user-level config directory is $HOME/.claude. Tests run it under a
 * temporary HOME.
 *
 * Usage:
 *   node home-config.mjs plan  [--only <items>] [--json]
 *   node home-config.mjs apply [--only <items>]
 * Exit: 0 = done (an item for a human is not a failure), 1 = refused (stderr says why; nothing was written).
 */
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ITEMS = ['plugin', 'memory', 'claude-md'];
/** The two sections idea-loop owns in <home>/AGENTS.md; moved text goes before the first of them. */
const OWNED_SECTIONS = ['## 设备地图', '## 项目'];

const userHome = (env) => env.HOME || homedir();
export const homeDir = (env = process.env) => env.IDEA_LOOP_HOME || join(userHome(env), 'home');
export const claudeDir = (env = process.env) => join(userHome(env), '.claude');

/** `<plugin>@<marketplace>`, from where the plugin is installed. Throws when the path does not say the marketplace. */
export function pluginKey(pluginRoot = PLUGIN_ROOT) {
  const manifest = join(pluginRoot, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifest)) throw new Error(`no .claude-plugin/plugin.json under ${pluginRoot}: cannot tell the plugin's name`);
  const name = JSON.parse(readFileSync(manifest, 'utf8')).name;
  const cache = pluginRoot.match(/[\\/]plugins[\\/]cache[\\/]([^\\/]+)[\\/][^\\/]+[\\/][^\\/]+$/);
  const listed = pluginRoot.match(/[\\/]plugins[\\/]marketplaces[\\/]([^\\/]+)[\\/]/);
  if (cache || listed) return `${name}@${(cache || listed)[1]}`;
  const catalog = join(dirname(pluginRoot), '.claude-plugin', 'marketplace.json');
  if (existsSync(catalog)) return `${name}@${JSON.parse(readFileSync(catalog, 'utf8')).name}`;
  throw new Error(`cannot tell which marketplace ${pluginRoot} was installed from (not under plugins/cache or plugins/marketplaces, no marketplace.json beside it)`);
}

/**
 * <home>/AGENTS.md with `text` added before the first idea-loop section (at the end when there is none).
 * Unchanged when the text is empty or already in the file, so a run that stopped half-way can be repeated.
 */
export function mergeAgents(agents, text) {
  if (!text.trim() || agents.includes(text)) return agents;
  const at = OWNED_SECTIONS.map((h) => agents.search(new RegExp(`^${h}\\s*$`, 'm'))).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const head = at === undefined ? agents : agents.slice(0, at);
  const rest = at === undefined ? '' : agents.slice(at);
  const body = text.endsWith('\n') ? text : `${text}\n`;
  const gap = head === '' || head.endsWith('\n\n') ? '' : head.endsWith('\n') ? '\n' : '\n\n';
  return `${head}${gap}${body}${rest ? `\n${rest}` : ''}`;
}

function readSettings(path) {
  if (!existsSync(path)) return { data: {}, indent: 2, newline: true };
  const text = readFileSync(path, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON (${err.message}); nothing was written`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${path} is not a JSON object`);
  if ('enabledPlugins' in data && (data.enabledPlugins === null || typeof data.enabledPlugins !== 'object')) {
    throw new Error(`${path}: enabledPlugins is not an object`);
  }
  return { data, indent: text.match(/^([ \t]+)"/m)?.[1] ?? 2, newline: text.endsWith('\n') };
}

/** What is at CLAUDE.md: 'missing', 'file', or { link: <absolute target> }. */
function claudeMdState(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return 'missing';
  }
  return st.isSymbolicLink() ? { link: resolve(dirname(path), readlinkSync(path)) } : 'file';
}

/** The state of the selected items, in item order: { id, label, status: 'todo' | 'already' | 'manual', before, after }. */
export function plan({ env = process.env, pluginRoot = PLUGIN_ROOT, only = ITEMS } = {}) {
  const home = homeDir(env);
  const settings = readSettings(join(claudeDir(env), 'settings.json')).data;
  const key = pluginKey(pluginRoot);
  const memory = join(home, 'memory');
  const agents = join(home, 'AGENTS.md');
  const claudeMd = join(claudeDir(env), 'CLAUDE.md');

  const enabled = settings.enabledPlugins?.[key];
  const all = {
    plugin: {
      label: `settings.json 的 enabledPlugins 启用 ${key}`,
      status: enabled === true ? 'already' : 'todo',
      before: enabled === undefined ? '没有这一项' : `"${key}": ${JSON.stringify(enabled)}`,
      after: `"${key}": true`,
    },
    memory: {
      label: 'settings.json 的 autoMemoryDirectory',
      status: settings.autoMemoryDirectory === memory ? 'already' : 'todo',
      before: 'autoMemoryDirectory' in settings ? JSON.stringify(settings.autoMemoryDirectory) : '没设',
      after: JSON.stringify(memory),
    },
  };
  const state = claudeMdState(claudeMd);
  const linked = typeof state === 'object';
  all['claude-md'] = {
    label: `${claudeMd} 软链到 home 的 AGENTS.md`,
    status: linked ? (state.link === resolve(agents) ? 'already' : 'manual') : 'todo',
    before: linked ? `软链 → ${state.link}` : state === 'file' ? `普通文件（${readFileSync(claudeMd, 'utf8').length} 字）` : '不存在',
    after: `软链 → ${agents}${state === 'file' ? '；原文件全文搬进 AGENTS.md（idea-loop 的两节之前）' : ''}`,
  };
  return only.map((id) => ({ id, ...all[id] }));
}

const STATUS_TEXT = { todo: '待改', already: '已是', manual: '已是别处的软链，要人处理' };

/** The plan as a Markdown table. */
export function table(items) {
  const cell = (s) => String(s).replaceAll('|', '\\|');
  const rows = items.map((i) => `| ${ITEMS.indexOf(i.id) + 1} | ${cell(i.label)} | ${cell(i.before)} | ${cell(i.after)} | ${STATUS_TEXT[i.status]} |`);
  return ['| # | 改什么 | 改前 | 改后 | 状态 |', '|---|---|---|---|---|', ...rows].join('\n') + '\n';
}

const stamp = (now) => now.toISOString().replace(/\.\d+Z$/, 'Z').replaceAll(':', '-');

/** Do the items still to do. Returns { backup: <dir> | null, changed: [ids], manual: [ids] }. */
export function apply({ env = process.env, pluginRoot = PLUGIN_ROOT, only = ITEMS, now = new Date() } = {}) {
  const home = homeDir(env);
  if (!existsSync(join(home, 'AGENTS.md'))) {
    throw new Error(`${home} has no AGENTS.md: build home first (setup's first step); nothing was written`);
  }
  const items = plan({ env, pluginRoot, only });
  const todo = items.filter((i) => i.status === 'todo').map((i) => i.id);
  const manual = items.filter((i) => i.status === 'manual').map((i) => i.id);
  if (todo.length === 0) return { backup: null, changed: [], manual };

  const settingsPath = join(claudeDir(env), 'settings.json');
  const claudeMd = join(claudeDir(env), 'CLAUDE.md');
  const agentsPath = join(home, 'AGENTS.md');
  const settings = readSettings(settingsPath);
  const original = claudeMdState(claudeMd) === 'file' ? readFileSync(claudeMd, 'utf8') : null;

  // The backup comes first, and .backup/ must never reach git: settings.json can hold secrets in env.
  let backup = join(home, '.backup', stamp(now));
  for (let n = 1; existsSync(backup); n++) backup = join(home, '.backup', `${stamp(now)}-${n}`);
  mkdirSync(backup, { recursive: true });
  if (existsSync(settingsPath)) copyFileSync(settingsPath, join(backup, 'settings.json'));
  if (original !== null) copyFileSync(claudeMd, join(backup, 'CLAUDE.md'));
  const ignorePath = join(home, '.gitignore');
  const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  if (!ignore.split('\n').some((l) => l.trim() === '.backup/')) {
    writeFileSync(ignorePath, `${ignore}${ignore === '' || ignore.endsWith('\n') ? '' : '\n'}.backup/\n`);
  }

  if (todo.includes('plugin') || todo.includes('memory')) {
    const data = settings.data;
    if (todo.includes('plugin')) data.enabledPlugins = { ...data.enabledPlugins, [pluginKey(pluginRoot)]: true };
    if (todo.includes('memory')) data.autoMemoryDirectory = join(home, 'memory');
    writeFileSync(settingsPath, JSON.stringify(data, null, settings.indent) + (settings.newline ? '\n' : ''));
  }

  if (todo.includes('claude-md')) {
    if (original !== null) writeFileSync(agentsPath, mergeAgents(readFileSync(agentsPath, 'utf8'), original));
    // link beside the file and rename over it, so CLAUDE.md is never missing half-way
    mkdirSync(claudeDir(env), { recursive: true });
    const tmp = `${claudeMd}.tmp-${process.pid}`;
    rmSync(tmp, { force: true });
    symlinkSync(agentsPath, tmp);
    renameSync(tmp, claudeMd);
  }
  return { backup, changed: todo, manual };
}

/** `--only 1,3` or `--only plugin,claude-md` → item ids in item order. */
export function parseOnly(value) {
  if (value === undefined) return ITEMS;
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (/^[1-3]$/.test(s) ? ITEMS[Number(s) - 1] : s));
  const unknown = ids.filter((id) => !ITEMS.includes(id));
  if (ids.length === 0 || unknown.length) {
    throw new Error(`--only takes items from 1 plugin, 2 memory, 3 claude-md (numbers or names, comma-separated); got ${unknown.join(', ') || 'nothing'}`);
  }
  return ITEMS.filter((id) => ids.includes(id));
}

function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => rest.indexOf(name);
  const only = parseOnly(flag('--only') >= 0 ? rest[flag('--only') + 1] : undefined);
  if (command === 'plan') {
    const items = plan({ only });
    process.stdout.write(flag('--json') >= 0 ? `${JSON.stringify(items, null, 2)}\n` : table(items));
  } else if (command === 'apply') {
    const done = apply({ only });
    const lines = [];
    if (done.changed.length) lines.push(`已改：${done.changed.join('、')}；备份在 ${done.backup}`);
    else lines.push('没有要改的项，什么都没写');
    if (done.manual.length) lines.push(`没动：${done.manual.join('、')}（别处的软链，要人处理）`);
    process.stdout.write(`${lines.join('\n')}\n`);
  } else {
    throw new Error('usage: home-config.mjs <plan|apply> [--only <items>] [--json]');
  }
}

// import.meta.url is the real path, argv[1] is the path as given: through a symlink they differ
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
