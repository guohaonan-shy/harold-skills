#!/usr/bin/env node
/**
 * Install the retro replay runner at a fixed place, so the nightly job and the people calling it use one path that
 * does not move with a worktree or a plugin upgrade — and so one permission rule covers every call.
 *
 *   node retro-install.mjs [--dest ~/.idea-loop/bin]
 *
 * What lands in <dest>:
 *   retro-replay.mjs      the entry. Its path is the one the permission rule and the scheduled task use.
 *   runtime/              a copy of the runner and what it imports, in the plugin's own layout
 *                         (evals/retro/*.mjs, scripts/claude-stream.mjs), so no import needs rewriting.
 *
 * It prints the permission rule and the scheduled task's command. It does not touch any settings file: the rule is
 * the human's to add to ~/.claude/settings.json. Running it again replaces the copy with the plugin's current one.
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ENTRY_NAME = 'retro-replay.mjs';
const RUNTIME_FILES = [
  ['evals/retro', ['retro-replay.mjs', 'queue.mjs', 'replay.mjs', 'cases.mjs']],
  ['scripts', ['claude-stream.mjs']],
];

const ENTRY = `#!/usr/bin/env node
// Installed by idea-loop (scripts/retro-install.mjs, run by /idea-loop:setup). Do not edit: running setup replaces it.
import { main } from './runtime/evals/retro/retro-replay.mjs';

process.exitCode = await main(process.argv.slice(2));
`;

/** A path as it is written in the permission rule and the scheduled command: \`~/…\` when it is under the home directory. */
export function displayPath(path, home = homedir()) {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** The command the scheduled task runs. It starts with the exact text the permission rule covers. */
export const taskCommand = (dest, home) => `node ${displayPath(join(dest, ENTRY_NAME), home)} --queue`;

/** The fallback command for a result that could not reach its session: the same runner, so the same rule covers it. */
export const notifyCommand = (dest, home) => `node ${displayPath(join(dest, ENTRY_NAME), home)} --notify`;

/**
 * The scheduled task's whole prompt. The runner prints one `回放结果 {json}` line per finished PR; the session this task
 * starts cannot be reached by the runner (it is a script), so this prompt has the agent forward each line.
 */
export function taskPrompt(dest, home) {
  return [
    `运行下面这一条命令，不要重试，不要读写其他文件。它可能跑很久（每个 PR 的回放要几十分钟），Bash 的 timeout 设成最大值。`,
    '',
    taskCommand(dest, home),
    '',
    '它的输出里，每一行以「回放结果 」开头、后面跟一段 JSON 的，是一个 PR 的回放结果。逐行处理：',
    '- JSON 里的 `session` 是一个会话 id：用 SendMessage，`to` 填这个 id，`message` 填 JSON 里 `message` 字段的原文，不改写；',
    `- 发不出去（会话已归档、找不到、报错）：改跑 \`${notifyCommand(dest, home)} "<message 的第一行>"\`，发一条 macOS 通知；`,
    '- `session` 是 null 的行：runner 已经自己发过通知，不用处理。',
    '',
    '命令没有输出这样的行（队列空，或不在 00:00–07:00 的时间窗里）就什么都不发。最后回复：命令输出的最后几行，加上每一行是发给了会话、发了通知，还是没发。',
  ].join('\n');
}

/** The permission rule that lets that command (and the single-PR calls) run unattended. */
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
  console.log(`计划任务的命令：${taskCommand(dest)}`);
  console.log(`计划任务的 prompt（create_scheduled_task / update_scheduled_task 的 prompt 原文）：\n----\n${taskPrompt(dest)}\n----`);
  console.log(`允许规则（请你自己加进 ~/.claude/settings.json 的 permissions.allow，这个脚本不改权限设置）：\n  ${allowRule(dest)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
