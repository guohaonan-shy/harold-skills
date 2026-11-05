#!/usr/bin/env node
/**
 * SessionStart hook — hands a session the business root's instruction files when Claude Code cannot find
 * them itself (skills/productivity/wiki-conventions/SKILL.md, section 业务与知识库).
 *
 * Claude Code loads CLAUDE.md / AGENTS.md from the session's directory upwards. A worktree opened outside
 * the business root (the desktop app puts every worktree in one place of its own) never walks past the
 * business root, so the business's rules would be missing. This hook finds the root through the main
 * checkout (business.mjs) and, when the root is not above the session's directory, prints its CLAUDE.md
 * and AGENTS.md as additional context, one level of `@file` imports expanded.
 *
 * Silent (exit 0, no output) when: not in a git repo, the legacy layout (no business root above the main
 * checkout), or the session already sits inside the business root. Never fails the session.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { businessRoot } from './business.mjs';

const FILES = ['CLAUDE.md', 'AGENTS.md'];

function inside(dir, root) {
  const rel = relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The file's text with lines that are only `@path` replaced by that file's text (one level). */
export function expandImports(file) {
  const base = dirname(file);
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => {
      const m = line.trim().match(/^@(\S+)$/);
      if (!m) return line;
      const target = resolve(base, m[1]);
      return existsSync(target) ? readFileSync(target, 'utf8').trimEnd() : line;
    })
    .join('\n');
}

/** The additional context for a session in cwd, or null when there is nothing to add. */
export function contextFor(cwd) {
  if (!cwd || !existsSync(cwd)) return null;
  const b = businessRoot(cwd);
  if (!b || b.legacy || inside(resolve(cwd), b.root)) return null;
  const present = FILES.filter((f) => existsSync(join(b.root, f)));
  if (!present.length) return null;
  // CLAUDE.md that only imports AGENTS.md would repeat it: keep a file once.
  const seen = new Set();
  const parts = [];
  for (const f of present) {
    const text = expandImports(join(b.root, f)).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(`### ${join(b.root, f)}\n\n${text}`);
  }
  if (!parts.length) return null;
  const head = `这个会话在业务「${b.root}」的仓库 ${b.repo ?? ''} 里，worktree 开在业务根目录外面，Claude Code 读不到业务根目录的说明文件，下面是它们的原文。业务的知识库（docs/、PRODUCT.md、GLOSSARY.md 等）在 ${b.root}。`;
  return `${head}\n\n${parts.join('\n\n')}`;
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {}
  let ctx = null;
  try {
    ctx = contextFor(input.cwd ?? process.cwd());
  } catch {}
  if (ctx) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
