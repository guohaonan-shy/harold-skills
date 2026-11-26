/**
 * `dyna home map` is what the SessionStart hook runs to inject the project map of the repository (or worktree) a
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
import { dynaBinary } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const hookCommands = hooks.SessionStart.flatMap((e) => e.hooks).filter((h) => h.type === 'command').map((h) => h.command);
const command = hookCommands.find((c) => c.includes('home map'));

// What `dyna home map` prints when the map is longer than 2000 characters, and when the project has not moved into home.
const TRUNCATED_NOTICE = '项目地图超过 2000 字，已截断';
const NOT_MOVED = '这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移';
const MAP_LIMIT = 2000;

// home's three fixed sections, as the plugin ships them; a fake home carries them so that only the map is on stdout
const RULES = readFileSync(join(pluginRoot, 'skills', 'engineering', 'setup', 'references', 'home-rules.md'), 'utf8');
const LAG_LINE = 'home 的固定文案落后于插件，跑 `/idea-loop:setup`';

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
  writeFileSync(join(home, 'AGENTS.md'), (agents ?? `# 设备\n\n## 设备地图\n\n看地图。\n\n## 项目\n\n${listLine('example-app', remote)}\n${listLine('other-app', 'https://github.com/acme/other-app')}\n`) + '\n' + RULES);
  if (map !== null) {
    mkdirSync(join(home, 'projects', 'example-app'), { recursive: true });
    writeFileSync(join(home, 'projects', 'example-app', 'AGENTS.md'), map);
  }
  const code = repo(join(root, 'code', 'example-app'), origin);
  return { root, home, code };
}

// The child gets exactly the env given here, so the machine running the test (its own ~/home, a magi session) cannot leak in.
// The plugin's launcher hands the call to a dyna built from this repository, not to the one installed in ~/.idea-loop/bin/.
const run = (cwd, home) =>
  spawnSync('sh', ['-c', command], { cwd, env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: pluginRoot, IDEA_LOOP_DYNA_BIN: dynaBinary(), HOME: dirname(cwd), ...(home ? { IDEA_LOOP_HOME: home } : {}) }, encoding: 'utf8' });

test('hooks.json registers the command as its own SessionStart command, next to the two `runtime inject` ones', () => {
  assert.ok(command, 'a SessionStart command runs `dyna home map`');
  assert.equal(command, '"${CLAUDE_PLUGIN_ROOT}/bin/dyna" home map --hook');
  assert.equal(hookCommands.filter((c) => c.includes('home map')).length, 1);
  assert.equal(hookCommands.filter((c) => c.includes('project-map.mjs')).length, 0);
  assert.equal(hookCommands.filter((c) => c.includes('runtime inject')).length, 2);
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
  writeFileSync(join(bare.home, 'AGENTS.md'), RULES);
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
});

test('a project map of exactly 2000 characters is injected whole, and characters are counted as Unicode characters, not bytes or UTF-16 units', () => {
  const out = (map) => {
    const { code, home } = world({ map });
    return run(code, home).stdout;
  };
  assert.equal(out('字'.repeat(MAP_LIMIT)), `${'字'.repeat(MAP_LIMIT)}\n`);
  assert.equal(out('😀'.repeat(MAP_LIMIT)), `${'😀'.repeat(MAP_LIMIT)}\n`);
  assert.equal(out('😀'.repeat(MAP_LIMIT + 1)), `${'😀'.repeat(MAP_LIMIT)}\n${TRUNCATED_NOTICE}\n`);
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

// ---- the 项目目录 line (spec skills-read-home, ticket 01) ----------------------------------------

/** A world whose project directory in home has a docs/, i.e. one that has moved; home has a committer identity. */
function moved(opts = {}) {
  const w = world(opts);
  mkdirSync(join(w.home, 'projects', 'example-app', 'docs'), { recursive: true });
  writeFileSync(join(w.home, 'projects', 'example-app', 'docs', 'index.md'), '# docs\n');
  sh(w.home, 'config', 'user.name', 't');
  sh(w.home, 'config', 'user.email', 't@example.com');
  sh(w.home, 'config', 'commit.gpgsign', 'false');
  sh(w.home, 'add', '-A');
  sh(w.home, 'commit', '-q', '-m', 'project');
  return w;
}

const DOCS = 'projects/example-app/docs';

test('the hook in a moved project: a 项目目录 line with the directory first, then the map', () => {
  const { code, home } = moved();
  const r = run(code, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[0], `项目目录：${join(home, 'projects', 'example-app')}`);
  assert.ok(r.stdout.includes(MAP.trim()), r.stdout);
});

test('the hook in a moved project whose map is not written: the 项目目录 line, then the not-written line', () => {
  const { code, home } = moved({ map: null });
  const r = run(code, home);
  assert.equal(r.stdout.split('\n')[0], `项目目录：${join(home, 'projects', 'example-app')}`);
  assert.match(r.stdout, /还没写/);
});

test('the hook in a project that has not moved: the migration sentence and nothing else; exit 0', () => {
  const { code, home } = moved();
  rmSync(join(home, DOCS), { recursive: true });
  writeFileSync(join(code, 'DEVELOPMENT.md'), '# dev\n');
  const r = run(code, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${NOT_MOVED}\n`);
});

test('the hook in a project whose repository has only a plain docs/: no migration sentence, the map alone as for a project with nothing to migrate; with a docs/spec/, the migration sentence', () => {
  const { code, home } = world();
  mkdirSync(join(code, 'docs', 'guides'), { recursive: true });
  const plain = run(code, home);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout, MAP);
  mkdirSync(join(code, 'docs', 'spec'));
  assert.equal(run(code, home).stdout, `${NOT_MOVED}\n`);
});

test('the hook with no home directory: nothing and exit 0, even in a repository that has not moved', () => {
  const { code, root } = world();
  writeFileSync(join(code, 'DEVELOPMENT.md'), '# dev\n');
  const r = run(code, join(root, 'no-such-home'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('the hook opened in home itself prints nothing even though home has a project with docs/', () => {
  const { home } = moved();
  assert.equal(run(home, home).stdout, '');
});

test('home\'s three fixed sections behind the plugin\'s (changed or missing): one line after the map; the same text: the map alone', () => {
  const { code, home } = world();
  const agents = join(home, 'AGENTS.md');
  assert.equal(run(code, home).stdout, MAP, 'a home that carries the plugin\'s text hears nothing extra');
  const current = readFileSync(agents, 'utf8');

  writeFileSync(agents, current.replace(RULES, RULES.replace('先确认问题', '先想想问题')));
  const changed = run(code, home);
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(changed.stdout, `${MAP}${LAG_LINE}\n`);

  writeFileSync(agents, current.replace(RULES, ''));
  assert.equal(run(code, home).stdout, `${MAP}${LAG_LINE}\n`);

  // outside any project the line is still there: it is about this device, not about the repository
  assert.equal(run(home, home).stdout, `${LAG_LINE}\n`);
});
