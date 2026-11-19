#!/usr/bin/env node
/**
 * Which runtime is this session in? Prints its name; runtime/ holds one data file per name.
 *
 * IDEA_LOOP_RUNTIME (a known name) wins; otherwise MAGI_SESSION_ID means magi; otherwise claude-desktop.
 * The command line and IDE plugins have no reliable marker variable, so they land on claude-desktop and the
 * capabilities they lack go through the fallback in runtime/capabilities.md. A forced name that is not known is an
 * error, never a guess.
 *
 * Also what the SessionStart hook runs: `--inject <section>` prints one of the three sections a main session
 * starts with, one hook command each (a hook's output is cut at 10,000 characters, so they stay apart):
 *   decision-rules  the body of idea-loop:decision-rules
 *   runtime         "当前运行环境：<name>", then the body of runtime/capabilities.md
 *   reference       the whole data of the current runtime (runtime/<name>.md)
 * The frontmatter is dropped and `${CLAUDE_PLUGIN_ROOT}` is replaced by the real plugin path (the host does that
 * for a skill it loads, not for hook output).
 *
 * Usage:
 *   node runtime-detect.mjs                     → the name
 *   node runtime-detect.mjs --inject <section>  → that section
 * Exit: 0 = printed, 1 = IDEA_LOOP_RUNTIME is not a known name (stderr lists them; the two sections that need the
 * runtime print nothing on stdout), or the section is not one of the three.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const RUNTIMES = ['claude-desktop', 'magi'];

export function detect(env = process.env) {
  const forced = env.IDEA_LOOP_RUNTIME;
  if (forced) {
    if (!RUNTIMES.includes(forced)) {
      throw new Error(`IDEA_LOOP_RUNTIME=${forced} is not a known runtime; known: ${RUNTIMES.join(', ')}`);
    }
    return forced;
  }
  return env.MAGI_SESSION_ID ? 'magi' : 'claude-desktop';
}

export const SECTIONS = ['decision-rules', 'runtime', 'reference'];

const stripFrontmatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');

/** One section of the SessionStart injection. Throws for an unknown section, and (runtime, reference) for an unknown runtime. */
export function injection(section, { env = process.env, pluginRoot = PLUGIN_ROOT } = {}) {
  if (!SECTIONS.includes(section)) throw new Error(`unknown section ${section}; known: ${SECTIONS.join(', ')}`);
  const read = (...p) =>
    stripFrontmatter(readFileSync(join(pluginRoot, ...p), 'utf8')).replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).trim();
  if (section === 'decision-rules') {
    return `以下是 \`idea-loop:decision-rules\` 的正文，开场注入，不必再调它。「核心」一节针对有 spec 的工作；没有 spec 的会话里，把「spec」读作人这次交代的事。\n\n${read('skills', 'productivity', 'decision-rules', 'SKILL.md')}\n`;
  }
  const name = detect(env);
  if (section === 'runtime') {
    return `当前运行环境：${name}\n以下是运行环境的能力清单，开场注入，不必再取。\n\n${read('runtime', 'capabilities.md')}\n`;
  }
  return `以下是运行环境「${name}」的做法全文，开场注入，不必再取。\n\n${read('runtime', `${name}.md`)}\n`;
}

// import.meta.url is the real path, argv[1] is the path as given: through a symlink (macOS /var → /private/var) they differ
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const at = process.argv.indexOf('--inject');
    process.stdout.write(at >= 0 ? injection(process.argv[at + 1]) : `${detect()}\n`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
