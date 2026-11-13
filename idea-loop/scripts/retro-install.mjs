#!/usr/bin/env node
/**
 * Install the retro replay runner at a fixed place, so the people calling it (and the orchestrator that runs large cases)
 * use one path that does not move with a worktree or a plugin upgrade — and so one permission rule covers every call.
 *
 *   node retro-install.mjs [--dest ~/.idea-loop/bin]
 *
 * What lands in <dest>:
 *   retro-replay.mjs      the entry. Its path is the one the permission rule uses.
 *   runtime/              a copy of the runner and what it imports, in the plugin's own layout
 *                         (evals/retro/*.mjs, scripts/claude-stream.mjs, scripts/codex-companion.mjs), so no import needs rewriting.
 *
 * It prints the permission rule. It does not touch any settings file: the rule is the human's to add to the runtime's
 * permission settings. Running it again replaces the copy with the plugin's current one.
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ENTRY_NAME = 'retro-replay.mjs';
const RUNTIME_FILES = [
  ['evals/retro', ['retro-replay.mjs', 'queue.mjs', 'replay.mjs', 'cases.mjs']],
  ['scripts', ['claude-stream.mjs', 'codex-companion.mjs']],
];

const ENTRY = `#!/usr/bin/env node
// Installed by idea-loop (scripts/retro-install.mjs, run by /idea-loop:setup). Do not edit: running setup replaces it.
import { main } from './runtime/evals/retro/retro-replay.mjs';

process.exitCode = await main(process.argv.slice(2));
`;

/** A path as it is written in the permission rule: \`~/…\` when it is under the home directory. */
export function displayPath(path, home = homedir()) {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** The permission rule that lets every call of the installed runner run unattended. */
export const allowRule = (dest, home) => `Bash(node ${displayPath(join(dest, ENTRY_NAME), home)}:*)`;

export function install(dest, root = PLUGIN_ROOT) {
  rmSync(join(dest, 'runtime'), { recursive: true, force: true });
  for (const [dir, files] of RUNTIME_FILES) {
    const to = join(dest, 'runtime', dir);
    mkdirSync(to, { recursive: true });
    for (const f of files) copyFileSync(join(root, dir, f), join(to, f));
  }
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, ENTRY_NAME), ENTRY, { mode: 0o755 });
  return { entry: join(dest, ENTRY_NAME), files: readdirSync(join(dest, 'runtime', 'evals', 'retro')) };
}

function main() {
  const argv = process.argv.slice(2);
  let dest = join(homedir(), '.idea-loop', 'bin');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dest' && argv[i + 1]) dest = resolve(argv[++i]);
    else {
      console.error('usage: retro-install.mjs [--dest <dir>]');
      return 2;
    }
  }
  const { entry } = install(dest);
  console.log(`runner 已装到 ${entry}`);
  console.log(`允许规则（请你自己加进运行环境的 permissions.allow，位置见 idea-loop:runtime 的『装与设置』，这个脚本不改权限设置）：\n  ${allowRule(dest)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
