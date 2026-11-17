#!/usr/bin/env node
/**
 * Memory index check — the measuring step of `dreaming`'s memory pass.
 *
 * One device has one memory: `<home>/memory/`, whose root index `MEMORY.md` Claude Code loads on every turn
 * (only the first 140 lines / 25,000 bytes are safe: past 140 lines a write is refused, past 25 KB the tail is
 * cut). Entries that belong to one project live under `<home>/projects/<name>/memory/`, with an index of their
 * own that is not loaded every turn and has no size limit.
 *
 * This file measures and never judges content — no model, no network. Given a memory directory it reports:
 *   - the root index is within 140 lines and within 25,000 bytes (both must hold);
 *   - every link in the root index and in each project index points at a file that exists;
 *   - every entry file in the root directory is listed in the root index;
 *   - every line of the root index's `## 项目` section points at an existing project memory index.
 *
 * Usage: memory-check.mjs [<memory directory>]   (default: `<home>/memory`, home is ~/home or IDEA_LOOP_HOME)
 * Exit: 0 all within limits, 2 problems (one line each), 1 unusable input.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homeDir } from './home-config.mjs';

export const MAX_LINES = 140;
export const MAX_BYTES = 25000;
const PROJECT_SECTION = '项目';

/** Lines and bytes of an index text; a final newline does not add a line. */
export function measureIndex(text) {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return { lines: text === '' ? 0 : body.split('\n').length, bytes: Buffer.byteLength(text) };
}

/** The local link targets of one line or text, in order: `[x](target)` without a scheme, `#anchor` or query. */
export function localLinks(text) {
  const out = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    out.push(decodeURI(target.split('#')[0].split('?')[0]));
  }
  return out;
}

/** The lines of one `## <title>` section (up to the next `## ` heading), or [] when there is none. */
export function sectionLines(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === `## ${title}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/**
 * Check a memory directory.
 * @returns { ok, problems: string[], lines, bytes }
 */
export function checkMemory(dir) {
  const problems = [];
  const root = join(dir, 'MEMORY.md');
  if (!isFile(root)) {
    return { ok: false, problems: [`${dir} 里没有 MEMORY.md`], lines: 0, bytes: 0 };
  }
  const text = readFileSync(root, 'utf8');
  const { lines, bytes } = measureIndex(text);
  if (lines > MAX_LINES) problems.push(`根索引 ${root} 有 ${lines} 行，超 ${MAX_LINES} 行`);
  if (bytes > MAX_BYTES) problems.push(`根索引 ${root} 有 ${bytes} 字节，超 ${MAX_BYTES.toLocaleString('en-US')} 字节`);

  // the project-pointer lines are judged as pointers, so the plain link check skips them
  const projectLines = sectionLines(text, PROJECT_SECTION).filter((l) => /^\s*[-*]\s/.test(l));
  const projectLineSet = new Set(projectLines);
  const rootLinked = new Set();
  const projectIndexes = [];

  for (const line of text.split('\n')) {
    if (projectLineSet.has(line)) continue;
    for (const target of localLinks(line)) {
      const path = resolve(dir, target);
      if (isFile(path)) rootLinked.add(path);
      else problems.push(`根索引的链接 ${target} 指到的文件不存在`);
    }
  }

  for (const line of projectLines) {
    const targets = localLinks(line);
    if (targets.length === 0) {
      problems.push(`「## ${PROJECT_SECTION}」的这一行没有指到项目记忆索引的链接：${line.trim().slice(0, 60)}`);
      continue;
    }
    for (const target of targets) {
      const path = resolve(dir, target);
      if (isFile(path) && basename(path) === 'MEMORY.md') projectIndexes.push(path);
      else problems.push(`「## ${PROJECT_SECTION}」的一行指到 ${target}，项目记忆索引不存在`);
    }
  }

  for (const index of [...new Set(projectIndexes)]) {
    for (const target of localLinks(readFileSync(index, 'utf8'))) {
      if (!isFile(resolve(dirname(index), target))) problems.push(`项目索引 ${index} 的链接 ${target} 指到的文件不存在`);
    }
  }

  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name === 'MEMORY.md' || !name.endsWith('.md') || !isFile(path)) continue;
    if (!rootLinked.has(path)) problems.push(`根目录的条目文件 ${name} 没进根索引`);
  }

  return { ok: problems.length === 0, problems, lines, bytes };
}

// CLI. import.meta.url is the real path, argv[1] the path as given: through a symlink (macOS /var → /private/var) they differ.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [arg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dir = arg ? resolve(arg) : join(homeDir(), 'memory');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`memory-check: ${dir} 不是一个目录`);
    process.exit(1);
  }
  const result = checkMemory(dir);
  if (result.ok) {
    console.log(`memory-check: green ✓ (${dir}) —— 根索引 ${result.lines} 行 / ${result.bytes} 字节，在 ${MAX_LINES} 行、${MAX_BYTES.toLocaleString('en-US')} 字节以内`);
    process.exit(0);
  }
  console.log([`memory-check: 有问题 (${dir}) ——`, ...result.problems.map((p) => `  - ${p}`)].join('\n'));
  process.exit(2);
}
