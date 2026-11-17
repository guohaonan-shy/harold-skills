/**
 * project-map.mjs is what the SessionStart hook runs to inject the project map of the repository (or worktree) a
 * session opened in. The tests build a fake home, a fake git repository with an `origin` and a worktree of it in a
 * temporary directory, run the command registered in hooks.json through a shell exactly as the host does, and read stdout.
 *
 * Spec home-bootstrap, ticket 01.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IN_HOME, MAP_LIMIT, NOT_CONNECTED, NOT_MOVED, TRUNCATED_NOTICE, findProject, locate, locateByDocs, mapText, normalizeRemote, parseProjects } from './project-map.mjs';

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

// ---- where, commit, and the 项目目录 line (spec skills-read-home, ticket 01) ----------------------------------------

const script = join(pluginRoot, 'scripts', 'project-map.mjs');
/** Run `project-map.mjs <args>` in `cwd` with exactly this env: the fake home, a HOME beside `cwd`, never the machine's own. */
const cli = (args, cwd, home) =>
  spawnSync('node', [script, ...args], { cwd, env: { PATH: process.env.PATH, HOME: dirname(cwd), IDEA_LOOP_HOME: home }, encoding: 'utf8' });

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

const subjects = (dir, ...rev) => sh(dir, 'log', '--format=%s', ...rev).split('\n');
const filesOf = (dir, rev) => sh(dir, 'show', '--name-only', '--format=', rev).split('\n').filter(Boolean);
const write = (dir, rel, text = 'x\n') => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const DOCS = 'projects/example-app/docs';

test('where, from a worktree of the code repository: the project directory in home, the owner/repo of the registered remote', () => {
  const { code, home, root } = moved();
  const worktree = join(root, 'worktrees', 'feature');
  sh(code, 'worktree', 'add', '-q', '-b', 'feature', worktree);
  const r = cli(['where'], worktree, home);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    project: 'example-app',
    projectDir: join(home, 'projects', 'example-app'),
    docs: join(home, DOCS),
    repo: 'acme/example-app',
    clone: '~/projects/example-app',
    cloneDir: join(dirname(worktree), 'projects', 'example-app'), // `~` is the HOME the child got
    inHome: true,
  });
});

test('locateByDocs: the docs/ of a project directory in home is that project; the answer is the one `where --project` gives', () => {
  const { home, root } = moved();
  const env = { IDEA_LOOP_HOME: home, HOME: root };
  const found = locateByDocs({ docs: join(home, DOCS), env });
  assert.equal(found.ok, true);
  assert.equal(found.project, 'example-app');
  assert.equal(found.repo, 'acme/example-app');
  assert.equal(found.projectDir, join(home, 'projects', 'example-app'));
  assert.equal(found.cloneDir, join(root, 'projects', 'example-app'));
  assert.deepEqual(found, locate({ project: 'example-app', env }));
});

test('locateByDocs: the docs/ of a code repository is not moved yet; a directory with nothing of idea-loop is not connected; an unlisted name in home is not connected', () => {
  const { code, home, root } = moved();
  const env = { IDEA_LOOP_HOME: home, HOME: root };
  mkdirSync(join(code, 'docs'));
  const unmoved = locateByDocs({ docs: join(code, 'docs'), env });
  assert.equal(unmoved.ok, false);
  assert.equal(unmoved.code, 'not-moved');
  assert.equal(unmoved.message, NOT_MOVED);
  const loose = join(root, 'loose', 'notes');
  mkdirSync(loose, { recursive: true });
  const nothing = locateByDocs({ docs: loose, env });
  assert.equal(nothing.code, 'not-connected');
  assert.equal(nothing.message, NOT_CONNECTED);
  mkdirSync(join(home, 'projects', 'stranger', 'docs'), { recursive: true });
  const stranger = locateByDocs({ docs: join(home, 'projects', 'stranger', 'docs'), env });
  assert.equal(stranger.ok, false);
  assert.equal(stranger.code, 'unlisted');
  assert.match(stranger.message, /没接上/);
});

test('locateByDocs: a path that reaches the docs/ of home through a symlink is still that project', () => {
  const { home, root } = moved();
  const link = join(root, 'link');
  symlinkSync(home, link);
  const found = locateByDocs({ docs: join(link, DOCS), env: { IDEA_LOOP_HOME: home, HOME: root } });
  assert.equal(found.ok, true);
  assert.equal(found.project, 'example-app');
});

test('where --project from home gives the same directory, and so does it from anywhere; without --project, home itself is refused', () => {
  const { code, home, root } = moved();
  const fromCode = JSON.parse(cli(['where'], code, home).stdout);
  const named = cli(['where', '--project', 'example-app'], home, home);
  assert.equal(named.status, 0, named.stderr);
  assert.equal(JSON.parse(named.stdout).projectDir, fromCode.projectDir);
  assert.equal(JSON.parse(cli(['where', '--project', 'example-app'], root, home).stdout).projectDir, fromCode.projectDir);
  const bare = cli(['where'], home, home);
  assert.notEqual(bare.status, 0);
  assert.equal(bare.stderr.trim(), '当前目录是 home 本身，要带 --project <名字>');
  assert.equal(bare.stdout, '');
});

test('where --project with a name that is not in the list, or that would leave projects/: exit non-zero, nothing on stdout', () => {
  const { home } = moved();
  for (const name of ['nope', '..', 'a/b']) {
    const r = cli(['where', '--project', name], home, home);
    assert.notEqual(r.status, 0, name);
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.includes(NOT_CONNECTED), r.stderr);
  }
  assert.notEqual(cli(['where', '--project'], home, home).status, 0);
});

test('where, projects/<名字>/docs/ gone and a DEVELOPMENT.md in the repository root: not moved yet, run setup to migrate', () => {
  const { code, home } = moved();
  rmSync(join(home, DOCS), { recursive: true });
  writeFileSync(join(code, 'DEVELOPMENT.md'), '# dev\n');
  const r = cli(['where'], code, home);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr.trim(), '这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移');
  assert.equal(NOT_MOVED, '这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移');
});

test('where: any one bootstrap file, or a docs/ directory, in the repository root means not moved; an unregistered repository with one too', () => {
  for (const file of ['DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md', 'PRODUCT.md', 'ISSUE_TRACKER.md', 'GLOSSARY.md', 'DESIGN.md', 'SEO.md', 'docs/']) {
    const { code, home } = world();
    if (file.endsWith('/')) mkdirSync(join(code, 'docs'));
    else writeFileSync(join(code, file), 'x\n');
    const r = cli(['where'], code, home);
    assert.notEqual(r.status, 0, file);
    assert.ok(r.stderr.includes(NOT_MOVED), `${file}: ${r.stderr}`);
  }
  const { code, home } = world({ origin: 'git@github.com:acme/unregistered.git' });
  writeFileSync(join(code, 'REVIEW.md'), 'x\n');
  assert.ok(cli(['where'], code, home).stderr.includes(NOT_MOVED));
});

test('where for a repository that is not in the project list, has no origin, or is no repository: not connected to idea-loop', () => {
  const unlisted = world({ origin: 'git@github.com:acme/unregistered.git' });
  const noOrigin = repo(join(unlisted.root, 'code', 'local-only'), null);
  const plain = join(unlisted.root, 'plain');
  mkdirSync(plain);
  for (const cwd of [unlisted.code, noOrigin, plain]) {
    const r = cli(['where'], cwd, unlisted.home);
    assert.notEqual(r.status, 0, cwd);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr.trim(), '这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`');
  }
  assert.equal(NOT_CONNECTED, '这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`');
  assert.ok(IN_HOME.includes('--project'));
});

test('where, a listed project with no docs/ in home and nothing to migrate in the clone: not connected, not "not moved"', () => {
  const { code, home } = world();
  assert.ok(cli(['where'], code, home).stderr.includes(NOT_CONNECTED));
});

test('an unknown command: usage on stderr, exit non-zero', () => {
  const { home } = moved();
  const r = cli(['frobnicate'], home, home);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage/);
});

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

test('commit: two files written and a third staged by another session; only one handed over: the commit has just that one, the others stay as they were', () => {
  const { home } = moved();
  write(home, `${DOCS}/spec/a.md`);
  write(home, `${DOCS}/spec/b.md`);
  write(home, `${DOCS}/other-session.md`);
  sh(home, 'add', `${DOCS}/other-session.md`);
  const r = cli(['commit', 'docs(spec): a', `${DOCS}/spec/a.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(filesOf(home, 'HEAD'), [`${DOCS}/spec/a.md`]);
  assert.equal(subjects(home)[0], 'docs(spec): a');
  assert.equal(sh(home, 'diff', '--cached', '--name-only'), `${DOCS}/other-session.md`);
  assert.equal(sh(home, 'ls-files', '--others', '--exclude-standard'), `${DOCS}/spec/b.md`);
});

test('commit: paths are relative to where it is run, absolute paths work, a deleted file is committed as a deletion', () => {
  const { home } = moved();
  const docs = join(home, DOCS);
  write(home, `${DOCS}/gone.md`);
  sh(home, 'add', '-A');
  sh(home, 'commit', '-q', '-m', 'add gone');
  rmSync(join(docs, 'gone.md'));
  write(home, `${DOCS}/new.md`, 'a different text, so git does not call this a rename\n');
  const r = cli(['commit', 'tidy', 'gone.md', join(docs, 'new.md')], docs, home);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(filesOf(home, 'HEAD').sort(), [`${DOCS}/gone.md`, `${DOCS}/new.md`]);
  assert.equal(sh(home, 'status', '--porcelain'), '');
});

test('commit: a file outside home is refused and nothing is committed, not even the listed file that is inside', () => {
  const { home, root } = moved();
  write(home, `${DOCS}/inside.md`);
  const before = sh(home, 'rev-parse', 'HEAD');
  for (const bad of [join(root, 'code', 'example-app', 'README.md'), '../outside.md', join(root, 'home-evil', 'x.md')]) {
    const r = cli(['commit', 'nope', `${DOCS}/inside.md`, bad], home, home);
    assert.notEqual(r.status, 0, bad);
    assert.ok(r.stderr.includes('不在 home'), r.stderr);
  }
  assert.equal(sh(home, 'rev-parse', 'HEAD'), before);
  assert.equal(sh(home, 'diff', '--cached', '--name-only'), '');
});

test('commit without a message or without files: refused', () => {
  const { home } = moved();
  assert.notEqual(cli(['commit'], home, home).status, 0);
  assert.notEqual(cli(['commit', 'only a message'], home, home).status, 0);
});

test('commit: a listed file with no change makes no commit and still exits 0', () => {
  const { home } = moved();
  const before = sh(home, 'rev-parse', 'HEAD');
  const r = cli(['commit', 'nothing', `${DOCS}/index.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sh(home, 'rev-parse', 'HEAD'), before);
  assert.match(r.stdout, /没有改动/);
});

test('commit: home without an origin: exit 0, no complaint about not pushing', () => {
  const { home } = moved();
  write(home, `${DOCS}/a.md`);
  const r = cli(['commit', 'a', `${DOCS}/a.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes('没推上去'), r.stdout);
  assert.equal(subjects(home)[0], 'a');
});

test('commit: home with an origin that cannot be reached: exit 0, a line 「home 没推上去：…」, the commit is there', () => {
  const { home, root } = moved();
  sh(home, 'remote', 'add', 'origin', join(root, 'no-such-remote.git'));
  write(home, `${DOCS}/a.md`);
  const r = cli(['commit', 'a', `${DOCS}/a.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^home 没推上去：.+/m);
  assert.equal(subjects(home)[0], 'a');
});

test('commit: home with a working origin that is still empty: pushed', () => {
  const { home, root } = moved();
  const remote = join(root, 'remote.git');
  sh(root, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(home, 'remote', 'add', 'origin', remote);
  write(home, `${DOCS}/a.md`);
  const r = cli(['commit', 'a', `${DOCS}/a.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes('没推上去'), r.stdout);
  assert.equal(subjects(remote, 'main')[0], 'a');
});

test('commit: the remote moved on meanwhile and another session has a file staged in home: rebased and pushed, the staged file is still staged and uncommitted', () => {
  const { home, root } = moved();
  const remote = join(root, 'remote.git');
  sh(root, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(home, 'remote', 'add', 'origin', remote);
  sh(home, 'push', '-q', '-u', 'origin', 'main');
  const other = join(root, 'other-device');
  sh(root, 'clone', '-q', remote, other);
  sh(other, 'config', 'user.name', 'o');
  sh(other, 'config', 'user.email', 'o@example.com');
  write(other, `${DOCS}/from-other-device.md`);
  sh(other, 'add', '-A');
  sh(other, 'commit', '-q', '-m', 'other device');
  sh(other, 'push', '-q', 'origin', 'main');

  write(home, `${DOCS}/a.md`);
  write(home, `${DOCS}/other-session.md`);
  sh(home, 'add', `${DOCS}/other-session.md`);
  const r = cli(['commit', 'a', `${DOCS}/a.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes('没推上去'), r.stdout);
  assert.deepEqual(subjects(remote, 'main').slice(0, 2), ['a', 'other device']);
  assert.ok(existsSync(join(home, DOCS, 'from-other-device.md')));
  assert.equal(sh(home, 'diff', '--cached', '--name-only'), `${DOCS}/other-session.md`);
});

test('commit: a held index.lock that is gone within a second: retried, the commit succeeds', () => {
  const { home } = moved();
  write(home, `${DOCS}/a.md`);
  const lock = join(home, '.git', 'index.lock');
  writeFileSync(lock, '');
  spawn('sh', ['-c', `sleep 0.3; rm -f "${lock}"`], { stdio: 'ignore', detached: true }).unref();
  const r = cli(['commit', 'a', `${DOCS}/a.md`], home, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(subjects(home)[0], 'a');
});

test('commit: an index.lock that stays: one retry, then exit non-zero and nothing committed', () => {
  const { home } = moved();
  write(home, `${DOCS}/a.md`);
  const before = sh(home, 'rev-parse', 'HEAD');
  writeFileSync(join(home, '.git', 'index.lock'), '');
  const r = cli(['commit', 'a', `${DOCS}/a.md`], home, home);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /index\.lock/);
  rmSync(join(home, '.git', 'index.lock'));
  assert.equal(sh(home, 'rev-parse', 'HEAD'), before);
});

test('commit: a home that is not a git repository: refused', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'project-map-')));
  const home = join(root, 'home');
  mkdirSync(home);
  writeFileSync(join(home, 'a.md'), 'x\n');
  const r = cli(['commit', 'a', 'a.md'], home, home);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /不是 git 仓库/);
});
