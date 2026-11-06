#!/usr/bin/env node
/**
 * Which runtime is this session in? Prints its name; skills/productivity/runtime/ holds one reference per name.
 *
 * IDEA_LOOP_RUNTIME (a known name) wins; otherwise MAGI_SESSION_ID means magi; otherwise claude-desktop.
 * The command line and IDE plugins have no reliable marker variable, so they land on claude-desktop and the
 * capabilities they lack go through the fallback in the runtime skill. A forced name that is not known is an
 * error, never a guess.
 *
 * Usage:
 *   node runtime-detect.mjs          → the name
 *   node runtime-detect.mjs --line   → the one line the SessionStart hook injects
 * Exit: 0 = printed, 1 = IDEA_LOOP_RUNTIME is not a known name (stderr lists them).
 */
import { pathToFileURL } from 'node:url';

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

export const sessionLine = (name) => `当前运行环境：${name}，用到能力时照 idea-loop:runtime 做`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const name = detect();
    console.log(process.argv.includes('--line') ? sessionLine(name) : name);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
