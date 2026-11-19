#!/usr/bin/env node
/**
 * Open an issue session unattended and hand it to Claude Desktop as an ordinary sidebar session.
 *
 * Why two steps: `claude -p` runs without anyone present but its session is invisible to the desktop app,
 * and `/desktop` does not exist in `-p` mode ("/desktop isn't available in this environment"). So the script
 * runs `claude -p` once to create a session and read its id, then resumes that session in interactive mode
 * (under `expect`, which supplies the terminal) and types `/desktop`. The desktop app then shows it as the
 * session `local_<same id>`. Nothing else happens here: no task is sent, no title set, no group moved —
 * the caller does those with its session-management tools.
 *
 * Usage:
 *   node desktop-handoff.mjs [--worktree <dir>] [--issue <n> --repo <name> --period <label>]
 *                            [--claude <bin>] [--timeout-sec N] [--p-timeout-sec N] [--idle-ms N] [--dir <records-dir>]
 *   --worktree     where both claude runs happen (default: the current directory); a resumed session
 *                  is only found from the directory it was created in
 *   --issue --repo --period   all three or none; with them, a success appends one entry to
 *                  <records-dir>/<repo>.json: { issue, desktopSessionId, openedAt, period }
 *   --claude       the claude executable (env DESKTOP_HANDOFF_CLAUDE; default `claude`)
 *   --timeout-sec  how long the interactive step may take before it counts as failed (env DESKTOP_HANDOFF_TIMEOUT_SEC; default 90)
 *   --p-timeout-sec  the same for the `claude -p` step (env DESKTOP_HANDOFF_P_TIMEOUT_SEC; default 180)
 *   --idle-ms      how long the resumed session's output must be quiet before `/desktop` is typed (default 2500)
 *   --dir          records directory (env IDEA_LOOP_DISPATCH_DIR; default ~/.idea-loop/dispatch)
 * Output: success → one JSON line on stdout: { sessionId, desktopSessionId, recorded }.
 *         failure → "交出失败：<reason>" on stderr.
 * Exit: 0 = handed over, 1 = failed to hand over or usage error. The expect child and the claude under it
 *       are gone when this exits.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const READY_PROMPT = '只回一个字：就绪';
// 2.1.327 prints "Opening in Claude Desktop…"; the spec's shorter wording is accepted too
export const SUCCESS = /Opening (?:in )?Claude Desktop/;
const SUCCESS_LABEL = '「Opening Claude Desktop」';

// Inputs come in the environment (expect -c leaves no room for argv): HANDOFF_CLAUDE, HANDOFF_SESSION, HANDOFF_IDLE_MS,
// HANDOFF_TIMEOUT_SEC. Everything the resumed claude prints goes to our stdout. Exit: 0 = /desktop was typed and the
// session either ended or the deadline came (the caller reads the screen to tell success from failure), 3 = the
// session never went quiet before the deadline, 4 = it ended before /desktop could be typed.
const EXPECT_SCRIPT = `
set claude $env(HANDOFF_CLAUDE)
set sid $env(HANDOFF_SESSION)
set idle [expr {$env(HANDOFF_IDLE_MS) / 1000.0}]
set limit $env(HANDOFF_TIMEOUT_SEC)
set deadline [expr {[clock seconds] + $limit}]
set timeout -1
log_user 1
spawn $claude --resume $sid
set pid [exp_pid]
proc leave {code} {
  global pid
  catch {exec kill -9 $pid}
  catch {close}
  catch {wait}
  exit $code
}
# type /desktop only once the resumed session has stopped printing
set quiet 0
while {!$quiet} {
  set left [expr {$deadline - [clock seconds]}]
  if {$left <= 0} { leave 3 }
  set timeout [expr {$idle < $left ? $idle : $left}]
  expect {
    -re {.+} { exp_continue }
    timeout { set quiet 1 }
    eof { leave 4 }
  }
}
send "/desktop"
sleep 0.4
send "\\r"
set left [expr {$deadline - [clock seconds]}]
if {$left <= 0} { leave 0 }
set timeout $left
expect {
  -re {.+} { exp_continue -continue_timer }
  timeout { leave 0 }
  eof { leave 0 }
}
leave 0
`;

/**
 * What the terminal would show after \`raw\` was printed: the resumed claude repaints with cursor moves, so
 * "Opening Claude Desktop…" is never one contiguous run in the byte stream (it arrives as "Op" + "ning Claude…"
 * over the previous line). Handles carriage return, line feed, cursor up/down/forward/back/column, erase line.
 */
export function renderScreen(raw) {
  const rows = new Map();
  let r = 0;
  let c = 0;
  const row = (n) => rows.get(n) ?? rows.set(n, []).get(n);
  const chars = [...raw];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '\x1b') {
      const next = chars[i + 1];
      if (next === '[') {
        let j = i + 2;
        let params = '';
        while (j < chars.length && /[0-?]/.test(chars[j])) params += chars[j++];
        while (j < chars.length && /[ -/]/.test(chars[j])) j++;
        const fin = chars[j];
        i = j;
        if (params.startsWith('?') || params.startsWith('>') || params.startsWith('<')) continue;
        const n = Number.parseInt(params, 10);
        const k = Number.isNaN(n) ? 1 : Math.max(n, 1);
        if (fin === 'A') r -= k;
        else if (fin === 'B') r += k;
        else if (fin === 'C') c += k;
        else if (fin === 'D') c = Math.max(0, c - k);
        else if (fin === 'G') c = k - 1;
        else if (fin === 'H') {
          r = 0;
          c = 0;
        } else if (fin === 'K') {
          if (n === 2) rows.set(r, []);
          else row(r).length = Math.min(row(r).length, c);
        }
      } else if (next === '(' || next === ')') i += 2;
      else i += 1;
    } else if (ch === '\r') c = 0;
    else if (ch === '\n') r += 1;
    else if (ch >= ' ') {
      const line = row(r);
      while (line.length < c) line.push(' ');
      line[c++] = ch;
    }
  }
  return [...rows.keys()]
    .sort((x, y) => x - y)
    .map((k) => rows.get(k).map((x) => x ?? ' ').join('').trimEnd())
    .join('\n');
}

function fail(reason) {
  console.error(`交出失败：${reason}`);
  return 1;
}

/** `claude -p` once; resolves to the session id or throws an Error whose message is the reason. */
export function createSession({ claude, cwd, timeoutSec }) {
  const r = spawnSync(claude, ['-p', READY_PROMPT, '--output-format', 'json'], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) throw new Error(`claude -p 没跑成：${r.error.code === 'ETIMEDOUT' ? `超过 ${timeoutSec} 秒` : r.error.message}`);
  if (r.status !== 0) throw new Error(`claude -p 退出码 ${r.status}：${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
  let id;
  try {
    id = JSON.parse(r.stdout).session_id;
  } catch {
    throw new Error(`claude -p 的输出不是 JSON：${r.stdout.trim().slice(0, 300)}`);
  }
  if (typeof id !== 'string' || !id) throw new Error('claude -p 的 JSON 里没有 session_id');
  if (!/^[\w-]+$/.test(id)) throw new Error(`session_id 的样子不对：${id}`);
  return id;
}

/** Resume the session interactively and type /desktop; resolves when the success text showed up. */
export function handOff({ claude, cwd, sessionId, idleMs, timeoutSec }) {
  return new Promise((resolve, reject) => {
    const child = spawn('expect', ['-c', EXPECT_SCRIPT], {
      cwd,
      env: { ...process.env, HANDOFF_CLAUDE: claude, HANDOFF_SESSION: sessionId, HANDOFF_IDLE_MS: String(idleMs), HANDOFF_TIMEOUT_SEC: String(timeoutSec) },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    // the backstop: expect has its own deadline, this one only fires if expect itself hangs
    const watchdog = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, (timeoutSec + 10) * 1000);
    child.on('error', (e) => {
      clearTimeout(watchdog);
      reject(new Error(e.code === 'ENOENT' ? '找不到 expect（交互模式要靠它提供终端）' : e.message));
    });
    child.on('close', (code) => {
      clearTimeout(watchdog);
      try {
        process.kill(-child.pid, 'SIGKILL'); // nothing from that process group outlives us
      } catch {}
      const screen = renderScreen(out);
      const tail = screen.split('\n').filter(Boolean).slice(-6).join(' | ').slice(-300);
      if (code === 3 || code === null) return reject(new Error(`${timeoutSec} 秒内会话没安静下来，没来得及敲 /desktop（会话 ${sessionId}）：${tail}`));
      if (code === 4) return reject(new Error(`交互模式的 claude 在能敲 /desktop 之前就退出了：${tail}`));
      if (code !== 0) return reject(new Error(`expect 退出码 ${code}：${(err || tail).trim().slice(0, 300)}`));
      if (SUCCESS.test(screen)) return resolve();
      reject(new Error(`敲了 /desktop，${timeoutSec} 秒内（或到它退出为止）没看到${SUCCESS_LABEL}（会话 ${sessionId}）：${tail}`));
    });
  });
}

/** Append one entry to <dir>/<repo>.json (an array); an unreadable existing file is left untouched. */
export function appendRecord(dir, repo, entry) {
  if (!/^[\w][\w.-]*$/.test(repo)) throw new Error(`仓库名不能当文件名：${repo}`);
  const file = join(dir, `${repo}.json`);
  let list = [];
  if (existsSync(file)) {
    try {
      list = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`${file} 读不出来，没动它`);
    }
    if (!Array.isArray(list)) throw new Error(`${file} 不是一个数组，没动它`);
  }
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify([...list, entry], null, 2)}\n`);
  renameSync(tmp, file);
  return file;
}

function parse(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--') || argv[i + 1] === undefined) throw new Error(`参数不对：${a}`);
    flags[a.slice(2)] = argv[++i];
  }
  return flags;
}

async function main(argv) {
  let f;
  try {
    f = parse(argv);
    const known = new Set(['worktree', 'issue', 'repo', 'period', 'claude', 'timeout-sec', 'p-timeout-sec', 'idle-ms', 'dir']);
    for (const k of Object.keys(f)) if (!known.has(k)) throw new Error(`没有这个参数：--${k}`);
    const given = ['issue', 'repo', 'period'].filter((k) => f[k] !== undefined);
    if (given.length && given.length < 3) throw new Error('--issue、--repo、--period 要么都给，要么都不给');
    if (f.issue !== undefined && !/^\d+$/.test(f.issue)) throw new Error('--issue 要是 issue 号');
  } catch (e) {
    console.error(`desktop-handoff: ${e.message}`);
    console.error('usage: desktop-handoff.mjs [--worktree <dir>] [--issue <n> --repo <name> --period <label>] [--claude <bin>] [--timeout-sec N] [--dir <records-dir>]');
    return 1;
  }
  const claude = f.claude ?? process.env.DESKTOP_HANDOFF_CLAUDE ?? 'claude';
  const cwd = f.worktree ?? process.cwd();
  const timeoutSec = Number(f['timeout-sec'] ?? process.env.DESKTOP_HANDOFF_TIMEOUT_SEC ?? 90);
  const pTimeoutSec = Number(f['p-timeout-sec'] ?? process.env.DESKTOP_HANDOFF_P_TIMEOUT_SEC ?? 180);
  const idleMs = Number(f['idle-ms'] ?? 2500);
  if (![timeoutSec, pTimeoutSec, idleMs].every((n) => Number.isFinite(n) && n > 0)) return fail('超时和等待时间要是正数');

  let sessionId;
  try {
    sessionId = createSession({ claude, cwd, timeoutSec: pTimeoutSec });
    await handOff({ claude, cwd, sessionId, idleMs, timeoutSec });
  } catch (e) {
    return fail(e.message);
  }

  const desktopSessionId = `local_${sessionId}`;
  let recorded = false;
  if (f.issue !== undefined) {
    try {
      appendRecord(f.dir ?? process.env.IDEA_LOOP_DISPATCH_DIR ?? join(homedir(), '.idea-loop', 'dispatch'), f.repo, {
        issue: Number(f.issue),
        desktopSessionId,
        openedAt: new Date().toISOString(),
        period: f.period,
      });
      recorded = true;
    } catch (e) {
      // the session is already in the sidebar; say so loudly rather than hand it over twice on a retry
      console.error(`desktop-handoff: 会话已交出，但记录没写进去：${e.message}`);
    }
  }
  console.log(JSON.stringify({ sessionId, desktopSessionId, recorded }));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
