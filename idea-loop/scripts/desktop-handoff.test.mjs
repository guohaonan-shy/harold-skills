import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderScreen } from './desktop-handoff.mjs';

const SCRIPT = fileURLToPath(new URL('./desktop-handoff.mjs', import.meta.url));

// A stand-in for `claude`. `-p` prints one JSON object; `--resume <id>` is a tiny interactive prompt that reacts
// to a typed /desktop line. FAKE_MODE picks the behaviour; FAKE_LOG gets one line per call (args and cwd);
// FAKE_PID_FILE gets the pid of the interactive process so a test can check it is gone afterwards.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = process.env.FAKE_MODE || 'ok';
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === '-p') {
  if (mode === 'p-fail') { console.error('boom: not logged in'); process.exit(2); }
  if (mode === 'p-no-id') { console.log(JSON.stringify({ result: '就绪' })); process.exit(0); }
  if (mode === 'p-hang') setTimeout(() => {}, 60000);
  else { console.log(JSON.stringify({ type: 'result', session_id: 'fake-session-123', result: '就绪' })); process.exit(0); }
} else {
  if (process.env.FAKE_PID_FILE) fs.writeFileSync(process.env.FAKE_PID_FILE, String(process.pid));
  console.log('fake claude ready>');
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (line.trim() !== '/desktop') return;
    if (mode === 'silent') return;
    if (mode === 'repaint') {
      process.stdout.write('\\x1b[3G✳\\x1b[5GChecking\\x1b[14Gfor\\x1b[18GClaude\\x1b[25GDesktop…\\r\\r\\n\\r\\x1b[4C\\x1b[1AOp\\x1b[8Gning Claude Desktop…\\x1b[K\\r\\r\\n\\r\\x1b[2C\\x1b[1A✻\\r\\r\\n\\r\\x1b[12C\\x1b[1Ain Claud\\x1b[22G Desktop…\\r\\r\\n');
      process.exit(0);
    }
    console.log('Opening Claude Desktop…');
    process.exit(0);
  });
  setInterval(() => {}, 1000);
}
`;

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'desktop-handoff-'));
  const fake = join(root, 'fake-claude');
  writeFileSync(fake, FAKE);
  chmodSync(fake, 0o755);
  const home = join(root, 'home');
  const worktree = join(root, 'worktree');
  mkdirSync(home);
  mkdirSync(worktree);
  const log = join(root, 'calls.log');
  const pidFile = join(root, 'pid');
  const dir = join(root, 'records');
  // HOME points into the temp dir, so even the default records directory never reaches the real ~/.idea-loop/
  const run = (args, env = {}) => {
    const r = spawnSync('node', [SCRIPT, '--claude', fake, '--worktree', worktree, '--idle-ms', '300', ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, FAKE_LOG: log, FAKE_PID_FILE: pidFile, ...env },
    });
    return { status: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr };
  };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { root, fake, home, worktree, log, pidFile, dir, run, calls };
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitGone = async (pid) => {
  for (let i = 0; i < 20 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  return !alive(pid);
};

test('renderScreen rebuilds the line the resumed claude paints in pieces', () => {
  // taken from a real `/desktop` run (Claude Code 2.1.327): the text is never contiguous in the byte stream
  const raw =
    '\x1b[3G✳\x1b[5GChecking\x1b[14Gfor\x1b[18GClaude\x1b[25GDesktop…\r\r\n\r\x1b[4C\x1b[1AOp\x1b[8Gning Claude Desktop…\x1b[K\r\r\n' +
    '\r\x1b[2C\x1b[1A✻\r\r\n\r\x1b[12C\x1b[1Ain Claud\x1b[22G Desktop…\r\r\n';
  assert.ok(!raw.includes('Opening'));
  assert.match(renderScreen(raw), /Opening in Claude Desktop…/);
  assert.equal(renderScreen('a\r\nb\x1b[2Kc\r\x1b[?25lx'), 'a\nxc'); // erase-line, carriage return, private modes ignored
});

test('CLI: both steps work → exit 0, one JSON line with the session id and local_<id>', () => {
  const t = setup();
  const r = t.run([]);
  assert.equal(r.status, 0, r.all);
  const j = JSON.parse(r.out.trim());
  assert.equal(j.sessionId, 'fake-session-123');
  assert.equal(j.desktopSessionId, 'local_fake-session-123');
  assert.equal(j.recorded, false);
  assert.match(r.all, /local_fake-session-123/);
});

test('CLI: claude -p and the resumed session both run in the given worktree, with the ready prompt only', () => {
  const t = setup();
  t.run([]);
  const [p, resume] = t.calls();
  assert.deepEqual(p.args.slice(0, 1), ['-p']);
  assert.ok(p.args.includes('--output-format') && p.args.includes('json'));
  assert.deepEqual(resume.args, ['--resume', 'fake-session-123']);
  assert.equal(realpathSync(p.cwd), realpathSync(t.worktree));
  assert.equal(realpathSync(resume.cwd), realpathSync(t.worktree));
});

test('CLI: the success text arriving as cursor-move repaints still counts', () => {
  const t = setup();
  const r = t.run([], { FAKE_MODE: 'repaint' });
  assert.equal(r.status, 0, r.all);
  assert.equal(JSON.parse(r.out.trim()).desktopSessionId, 'local_fake-session-123');
});

test('CLI: the claude path can come from DESKTOP_HANDOFF_CLAUDE instead of --claude', () => {
  const t = setup();
  const r = spawnSync('node', [SCRIPT, '--worktree', t.worktree, '--idle-ms', '300'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: t.home, DESKTOP_HANDOFF_CLAUDE: t.fake, FAKE_LOG: t.log },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('CLI: an interactive session that never prints → non-zero within the timeout, 交出失败, no process left', async () => {
  const t = setup();
  const started = Date.now();
  const r = t.run(['--timeout-sec', '3'], { FAKE_MODE: 'silent' });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /交出失败/);
  assert.ok(Date.now() - started < 15_000, 'gave up on time');
  const pid = Number(readFileSync(t.pidFile, 'utf8'));
  assert.ok(await waitGone(pid), `fake claude ${pid} is still running`);
});

test('CLI: claude -p exiting non-zero → 交出失败 with the exit code and what it said', () => {
  const t = setup();
  const r = t.run([], { FAKE_MODE: 'p-fail' });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /交出失败/);
  assert.match(r.err, /退出码 2/);
  assert.match(r.err, /not logged in/);
  assert.equal(t.calls().length, 1, 'never got as far as the interactive step');
});

test('CLI: claude -p output without a session id → 交出失败 naming the missing field', () => {
  const t = setup();
  const r = t.run([], { FAKE_MODE: 'p-no-id' });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /交出失败/);
  assert.match(r.err, /session_id/);
});

test('CLI: claude -p that hangs is cut off at its own timeout', () => {
  const t = setup();
  const r = t.run(['--p-timeout-sec', '1'], { FAKE_MODE: 'p-hang' });
  assert.notEqual(r.status, 0);
  assert.match(r.err, /交出失败/);
  assert.match(r.err, /超过 1 秒/);
});

test('CLI: with issue, repo and period a success appends one entry and keeps the old ones', () => {
  const t = setup();
  mkdirSync(t.dir);
  const old = { issue: 1, desktopSessionId: 'local_old', openedAt: '2026-11-17T22:05:00.000Z', period: 'night' };
  writeFileSync(join(t.dir, 'demo.json'), JSON.stringify([old]));
  const args = ['--issue', '302', '--repo', 'demo', '--period', 'night', '--dir', t.dir];
  const first = t.run(args);
  assert.equal(first.status, 0, first.all);
  assert.equal(JSON.parse(first.out.trim()).recorded, true);
  assert.equal(t.run(['--issue', '137', '--repo', 'demo', '--period', 'night', '--dir', t.dir]).status, 0);
  const list = JSON.parse(readFileSync(join(t.dir, 'demo.json'), 'utf8'));
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], old);
  assert.equal(list[1].issue, 302);
  assert.equal(list[1].desktopSessionId, 'local_fake-session-123');
  assert.equal(list[1].period, 'night');
  assert.ok(!Number.isNaN(Date.parse(list[1].openedAt)));
  assert.equal(list[2].issue, 137);
});

test('CLI: the records file is created when it does not exist', () => {
  const t = setup();
  const r = t.run(['--issue', '5', '--repo', 'demo', '--period', 'night', '--dir', join(t.dir, 'nested')]);
  assert.equal(r.status, 0, r.all);
  assert.equal(JSON.parse(readFileSync(join(t.dir, 'nested', 'demo.json'), 'utf8')).length, 1);
});

test('CLI: a failed hand-over writes nothing', () => {
  const t = setup();
  const r = t.run(['--issue', '5', '--repo', 'demo', '--period', 'night', '--dir', t.dir], { FAKE_MODE: 'p-fail' });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(t.dir, 'demo.json')), false);
});

test('CLI: the records directory defaults under HOME, and IDEA_LOOP_DISPATCH_DIR overrides it', () => {
  const t = setup();
  assert.equal(t.run(['--issue', '5', '--repo', 'demo', '--period', 'day']).status, 0);
  assert.ok(existsSync(join(t.home, '.idea-loop', 'dispatch', 'demo.json')));
  const elsewhere = join(t.root, 'elsewhere');
  assert.equal(t.run(['--issue', '6', '--repo', 'demo', '--period', 'day'], { IDEA_LOOP_DISPATCH_DIR: elsewhere }).status, 0);
  assert.ok(existsSync(join(elsewhere, 'demo.json')));
});

test('CLI: a records file that cannot be read is left alone; the hand-over still counts but says so', () => {
  const t = setup();
  mkdirSync(t.dir);
  writeFileSync(join(t.dir, 'demo.json'), '{not json');
  const r = t.run(['--issue', '5', '--repo', 'demo', '--period', 'night', '--dir', t.dir]);
  assert.equal(r.status, 0, r.all);
  assert.equal(JSON.parse(r.out.trim()).recorded, false);
  assert.match(r.err, /记录没写进去/);
  assert.equal(readFileSync(join(t.dir, 'demo.json'), 'utf8'), '{not json');
});

test('CLI: issue, repo and period come all together or not at all — checked before claude is called', () => {
  const t = setup();
  const r = t.run(['--issue', '5']);
  assert.equal(r.status, 1);
  assert.match(r.err, /要么都给，要么都不给/);
  assert.equal(t.calls().length, 0);
  assert.equal(t.run(['--issue', 'abc', '--repo', 'demo', '--period', 'night']).status, 1);
  assert.equal(t.run(['--bogus', 'x']).status, 1);
  assert.equal(t.calls().length, 0);
});

test('CLI: a repo name that cannot be a file name is refused instead of written', () => {
  const t = setup();
  const r = t.run(['--issue', '5', '--repo', '../escape', '--period', 'night', '--dir', t.dir]);
  assert.equal(r.status, 0, 'the session is handed over');
  assert.equal(JSON.parse(r.out.trim()).recorded, false);
  assert.match(r.err, /仓库名不能当文件名/);
  assert.equal(existsSync(join(t.root, 'escape.json')), false);
});
