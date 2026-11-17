/**
 * project-map.mjs is what the SessionStart hook runs to inject the project map of the repository (or worktree) a
 * session opened in. The tests build a fake home, a fake git repository with an `origin` and a worktree of it in a
 * temporary directory, run the command registered in hooks.json through a shell exactly as the host does, and read stdout.
 *
 * Spec home-bootstrap, ticket 01.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_LIMIT, TRUNCATED_NOTICE, findProject, mapText, normalizeRemote, parseProjects } from './project-map.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const hookCommands = hooks.SessionStart.flatMap((e) => e.hooks).filter((h) => h.type === 'command').map((h) => h.command);
const command = hookCommands.find((c) => c.includes('project-map.mjs'));

const REMOTE = 'https://github.com/acme/example-app';
const MAP = '# example-app 项目地图\n\n知识库在 docs/，过去的决定先查 docs/spec/。\n';

const sh = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

/** A repository with one commit and the given origin, or no origin at all with `origin: null`. */
function repo(dir, origin) {
  mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '-q', '-b', 'main');
  if (origin) sh(dir, 'remote', 'add', 'origin', origin);
  writeFileSync(join(dir, 'README.md'), 'x\n');
  sh(dir, 'add', 'README.md');
  sh(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

const listLine = (name, remote) => `${name}（一个例子）: ~/projects/${name}. Clone from ${remote} if missing.`;

/** A temp world: a home (a git repository, as a real one is) that registers example-app with its map, and a code repository whose origin is the SSH form of the registered remote. */
function world({ map = MAP, remote = REMOTE, origin = 'git@github.com:acme/example-app.git', agents } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'project-map-')));
  const home = join(root, 'home');
  repo(home, null);
  writeFileSync(join(home, 'AGENTS.md'), agents ?? `# 设备\n\n## 设备地图\n\n看地图。\n\n## 项目\n\n${listLine('example-app', remote)}\n${listLine('other-app', 'https://github.com/acme/other-app')}\n`);
  if (map !== null) {
    mkdirSync(join(home, 'projects', 'example-app'), { recursive: true });
    writeFileSync(join(home, 'projects', 'example-app', 'AGENTS.md'), map);
  }
  const code = repo(join(root, 'code', 'example-app'), origin);
  return { root, home, code };
}

// The child gets exactly the env given here, so the machine running the test (its own ~/home, a magi session) cannot leak in.
const run = (cwd, home) =>
  spawnSync('sh', ['-c', command], { cwd, env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: pluginRoot, HOME: dirname(cwd), ...(home ? { IDEA_LOOP_HOME: home } : {}) }, encoding: 'utf8' });

test('hooks.json registers the command as its own SessionStart command, next to the three runtime-detect ones', () => {
  assert.ok(command, 'a SessionStart command runs project-map.mjs');
  assert.equal(command, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/project-map.mjs"');
  assert.equal(hookCommands.filter((c) => c.includes('project-map.mjs')).length, 1);
  assert.equal(hookCommands.filter((c) => c.includes('runtime-detect.mjs')).length, 3);
  assert.ok(hooks.SessionStart.every((e) => !('matcher' in e)), 'no matcher: startup, resume, clear, compact and fork all inject');
});

test('a worktree of a repository registered under its https remote, whose origin is the ssh form: stdout holds the whole project map', () => {
  const { code, home, root } = world();
  const worktree = join(root, 'worktrees', 'feature');
  sh(code, 'worktree', 'add', '-q', '-b', 'feature', worktree);
  const r = run(worktree, home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(MAP.trim()), r.stdout);
  assert.ok(!r.stdout.includes(TRUNCATED_NOTICE));
  assert.ok(!r.stdout.includes('other-app'));
});

test('the main checkout and a subdirectory of it get the map too', () => {
  const { code, home } = world();
  assert.ok(run(code, home).stdout.includes(MAP.trim()));
  mkdirSync(join(code, 'src'));
  assert.ok(run(join(code, 'src'), home).stdout.includes(MAP.trim()));
});

test('opened in home itself: nothing', () => {
  const { home } = world();
  const r = run(home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a repository whose remote is not in the list: nothing', () => {
  const { code, home } = world({ origin: 'git@github.com:acme/unregistered.git' });
  const r = run(code, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a repository with no origin: nothing', () => {
  const { root, home } = world();
  const r = run(repo(join(root, 'code', 'local-only'), null), home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a directory that is not in a git repository: nothing', () => {
  const { root, home } = world();
  const dir = join(root, 'plain');
  mkdirSync(dir);
  const r = run(dir, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a device with no home directory: nothing, exit 0', () => {
  const { code, root } = world();
  const r = run(code, join(root, 'no-such-home'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a home without AGENTS.md, or with one that has no project section: nothing, exit 0', () => {
  const none = world({ agents: '# 设备\n\n没有项目一节。\n' });
  assert.equal(run(none.code, none.home).stdout, '');
  const bare = world();
  writeFileSync(join(bare.home, 'AGENTS.md'), '');
  const r = run(bare.code, bare.home);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('a project map of 2500 characters: the first 2000 characters and one line saying it was cut', () => {
  const long = '字'.repeat(2500);
  const { code, home } = world({ map: long });
  const r = run(code, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${'字'.repeat(2000)}\n${TRUNCATED_NOTICE}\n`);
  assert.equal(TRUNCATED_NOTICE, '项目地图超过 2000 字，已截断');
});

test('a project map of exactly 2000 characters is injected whole, and characters are counted as Unicode characters, not bytes or UTF-16 units', () => {
  assert.equal(mapText('字'.repeat(MAP_LIMIT)), `${'字'.repeat(MAP_LIMIT)}\n`);
  assert.equal(mapText('😀'.repeat(MAP_LIMIT)), `${'😀'.repeat(MAP_LIMIT)}\n`);
  assert.equal(mapText('😀'.repeat(MAP_LIMIT + 1)), `${'😀'.repeat(MAP_LIMIT)}\n${TRUNCATED_NOTICE}\n`);
});

test('registered, but the map file is not there: one line saying where the directory is and that the map is not written', () => {
  const { code, home } = world({ map: null });
  const r = run(code, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split('\n').length, 1);
  assert.ok(r.stdout.includes(join(home, 'projects', 'example-app')), r.stdout);
  assert.match(r.stdout, /还没写/);
});

test('an unreadable home (AGENTS.md is a directory): nothing on stdout, exit 0, the session still starts', () => {
  const { code, home } = world();
  const agents = join(home, 'AGENTS.md');
  rmSync(agents);
  mkdirSync(agents);
  const r = run(code, home);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('a project name that would leave projects/ is never matched', () => {
  const { code, home } = world({ agents: `## 项目\n\n${listLine('../escape', REMOTE)}\n` });
  assert.equal(run(code, home).stdout, '');
});

test('normalizeRemote: https, ssh, scp-like, with and without .git, any host case — one project', () => {
  const want = 'github.com/acme/example-app';
  for (const r of [
    'https://github.com/acme/example-app',
    'https://github.com/acme/example-app.git',
    'https://github.com/acme/example-app/',
    'https://GitHub.com/acme/example-app',
    'http://github.com/acme/example-app.git',
    'https://user:token@github.com/acme/example-app.git',
    'git@github.com:acme/example-app.git',
    'git@github.com:acme/example-app',
    'git@GITHUB.COM:acme/example-app.git',
    'ssh://git@github.com/acme/example-app.git',
    'ssh://git@github.com:22/acme/example-app.git',
    '  git@github.com:acme/example-app.git\n',
  ]) assert.equal(normalizeRemote(r), want, r);
});

test('normalizeRemote: the owner and repository keep their case, different repositories stay different, nonsense is null', () => {
  assert.equal(normalizeRemote('https://github.com/Acme/Example-App.git'), 'github.com/Acme/Example-App');
  assert.notEqual(normalizeRemote('https://github.com/acme/example-app'), normalizeRemote('https://github.com/acme/example-app2'));
  assert.notEqual(normalizeRemote('https://github.com/acme/example-app'), normalizeRemote('https://gitlab.com/acme/example-app'));
  for (const r of ['', '   ', null, undefined, '/local/path/repo', 'https://github.com/']) assert.equal(normalizeRemote(r), null, String(r));
});

test('parseProjects reads only the 项目 section, one project per line', () => {
  const md = `## 设备地图\n\nfoo（不是项目）: ~/x. Clone from https://example.com/x if missing.\n\n## 项目\n\n- harold-skills（Claude Code 插件 marketplace）: ~/projects/harold-skills. Clone from https://github.com/acme/harold-skills if missing.\n${listLine('example-app', 'git@github.com:acme/example-app.git')}\n随手写的一句话。\n\n## 其他\n\n${listLine('later', 'https://example.com/later')}\n`;
  assert.deepEqual(parseProjects(md), [
    { name: 'harold-skills', path: '~/projects/harold-skills', remote: 'https://github.com/acme/harold-skills' },
    { name: 'example-app', path: '~/projects/example-app', remote: 'git@github.com:acme/example-app.git' },
  ]);
  assert.deepEqual(parseProjects(''), []);
  assert.deepEqual(parseProjects(undefined), []);
});

test('findProject matches across spellings and returns null for no match', () => {
  const projects = parseProjects(`## 项目\n${listLine('example-app', REMOTE)}\n`);
  assert.equal(findProject(projects, 'git@github.com:acme/example-app.git').name, 'example-app');
  assert.equal(findProject(projects, 'git@github.com:acme/else.git'), null);
  assert.equal(findProject(projects, null), null);
});
