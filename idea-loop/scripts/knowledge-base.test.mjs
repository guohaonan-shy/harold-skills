/**
 * knowledge-base.mjs end to end through its command line: real git repositories in a temp directory (a code
 * repository `app` with a worktree on `feature/x`, a second one `api`, a knowledge base `biz-kb` with an origin),
 * and a `projects.json` under `IDEA_LOOP_HOME`. Nothing here touches the real ~/.idea-loop.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'knowledge-base.mjs');

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  assert.equal(r.status, 0, `git ${args.join(' ')} in ${cwd}\n${r.stderr}`);
  return r.stdout.trim();
}

function commit(dir, file, text) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', `add ${file}`);
}

/** A repository with one commit on main. `withOrigin`: a bare origin it was cloned from (so origin/HEAD is set). */
function makeRepo(base, name, files, { withOrigin = false } = {}) {
  const seed = join(base, withOrigin ? `${name}-seed` : name);
  mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'main');
  for (const [file, text] of Object.entries(files)) commit(seed, file, text);
  if (!withOrigin) return seed;
  const origin = join(base, `${name}-origin.git`);
  git(base, 'clone', '-q', '--bare', seed, origin);
  const clone = join(base, name);
  git(base, 'clone', '-q', origin, clone);
  return clone;
}

const CONFIG = JSON.stringify({ business: 'biz', issues: 'o/app', repos: { app: 'o/app', api: 'o/api', web: 'o/web' } });

/** A code repository's pointer block (the spec's「代码仓库怎么指向它」). */
const POINTER = [
  '## idea-loop', '', '- 业务：`biz`', '- 知识库：`o/biz-kb`', '',
  '这个仓库的 spec、设计档案、产品说明、issue 分类都在知识库里。', '',
].join('\n');

/**
 * app (main checkout + worktree on feature/x) and api, each with a pointer block in AGENTS.md, and the knowledge base
 * biz-kb; projects.json holds the machine's paths for the business `biz`. `pointer` is what the code repositories'
 * AGENTS.md says (null: no AGENTS.md); `projects: false` leaves projects.json out; `unmapped` drops the business from it.
 */
function world({ pointer = `# app\n\n${POINTER}`, projects = true, unmapped = false } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'knowledge-base-')));
  const code = (name) => makeRepo(base, name, { 'README.md': name, ...(pointer === null ? {} : { 'AGENTS.md': pointer }) });
  const app = code('app');
  const api = code('api');
  const kb = makeRepo(base, 'biz-kb', { 'idea-loop.json': CONFIG, 'docs/index.md': '# docs' }, { withOrigin: true });
  const appWt = join(base, 'app-wt');
  git(app, 'worktree', 'add', '-q', '-b', 'feature/x', appWt);
  const home = join(base, 'home');
  mkdirSync(home);
  if (projects) {
    const map = unmapped ? { other: { knowledgeBase: kb, home: kb, repos: {} } } : { biz: { knowledgeBase: kb, home: app, repos: { app, api } } };
    writeFileSync(join(home, 'projects.json'), JSON.stringify(map));
  }
  return { base, app, api, kb, appWt, home };
}

function kbCli(w, args, cwd) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, IDEA_LOOP_HOME: w.home },
  });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr };
}

test('in a code worktree: root reads the knowledge base, root --write opens .tmp/kb on the session branch, then root finds it', () => {
  const w = world();
  assert.equal(kbCli(w, ['root'], w.appWt).out, w.kb);

  const written = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(written.status, 0, written.err);
  const dest = join(w.appWt, '.tmp', 'kb');
  assert.equal(written.out, dest);
  assert.equal(git(dest, 'branch', '--show-current'), 'feature/x');
  assert.ok(existsSync(join(dest, 'idea-loop.json')), 'it is the knowledge base');
  assert.ok(git(w.kb, 'worktree', 'list').includes(dest), 'a worktree of biz-kb');
  assert.equal(git(dest, 'rev-parse', 'HEAD'), git(w.kb, 'rev-parse', 'origin/main'), 'cut from the knowledge base default branch');

  assert.equal(kbCli(w, ['root'], w.appWt).out, dest);
});

test('root --write twice prints the same path; after .tmp/kb is deleted it opens again', () => {
  const w = world();
  const first = kbCli(w, ['root', '--write'], w.appWt);
  const again = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(again.status, 0, again.err);
  assert.equal(again.out, first.out);

  rmSync(first.out, { recursive: true, force: true });
  const reopened = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(reopened.status, 0, reopened.err);
  assert.equal(reopened.out, first.out);
  assert.equal(git(first.out, 'branch', '--show-current'), 'feature/x');
});

test('root --write uses the knowledge base branch that already exists, locally or on origin', () => {
  const w = world();
  // a local branch with its own commit
  git(w.kb, 'branch', 'feature/x');
  git(w.kb, 'worktree', 'add', '-q', join(w.base, 'kb-scratch'), 'feature/x');
  commit(join(w.base, 'kb-scratch'), 'docs/spec/a.md', 'from an earlier session');
  git(w.kb, 'worktree', 'remove', join(w.base, 'kb-scratch'));
  const local = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(local.status, 0, local.err);
  assert.ok(existsSync(join(local.out, 'docs/spec/a.md')), 'the local branch was reused, not cut afresh');

  // a branch that only exists on origin
  const appWtY = join(w.base, 'app-wt-y');
  git(w.app, 'worktree', 'add', '-q', '-b', 'feature/y', appWtY);
  const pusher = join(w.base, 'pusher');
  git(w.base, 'clone', '-q', join(w.base, 'biz-kb-origin.git'), pusher);
  git(pusher, 'checkout', '-q', '-b', 'feature/y');
  commit(pusher, 'docs/spec/b.md', 'pushed from another machine');
  git(pusher, 'push', '-q', 'origin', 'feature/y');
  const remote = kbCli(w, ['root', '--write'], appWtY);
  assert.equal(remote.status, 0, remote.err);
  assert.equal(git(remote.out, 'branch', '--show-current'), 'feature/y');
  assert.ok(existsSync(join(remote.out, 'docs/spec/b.md')), 'the origin branch was used');
});

test('inside the knowledge base itself (main checkout, a worktree, a subdirectory) root and root --write give that checkout', () => {
  const w = world();
  const kbWt = join(w.base, 'kb-wt');
  git(w.kb, 'worktree', 'add', '-q', '-b', 'topic', kbWt);
  for (const [cwd, root] of [[w.kb, w.kb], [kbWt, kbWt], [join(w.kb, 'docs'), w.kb]]) {
    assert.equal(kbCli(w, ['root'], cwd).out, root, `root in ${cwd}`);
    assert.equal(kbCli(w, ['root', '--write'], cwd).out, root, `root --write in ${cwd}`);
  }
  assert.equal(existsSync(join(w.kb, '.tmp')), false, 'no .tmp/kb is opened inside the knowledge base');
});

test('there is no repo subcommand: repository-level settings stay in the code repository', () => {
  const w = world();
  const r = kbCli(w, ['repo'], w.appWt);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.err, /repo \[/);
});

test('worktree <repo>: .tmp/repos/<repo> is that repository on the session branch, and opening it again is the same', () => {
  const w = world();
  const r = kbCli(w, ['worktree', 'api'], w.appWt);
  assert.equal(r.status, 0, r.err);
  const dest = join(w.appWt, '.tmp', 'repos', 'api');
  assert.equal(r.out, dest);
  assert.equal(git(dest, 'branch', '--show-current'), 'feature/x');
  assert.equal(git(dest, 'rev-parse', '--git-common-dir'), join(w.api, '.git'), 'a worktree of api, not of app');
  assert.equal(kbCli(w, ['worktree', 'api'], w.appWt).out, dest);

  for (const name of ['web', 'nope']) {
    const unknown = kbCli(w, ['worktree', name], w.appWt);
    assert.equal(unknown.status, 1, `${name} has no checkout on this machine`);
    assert.ok(unknown.err.includes(name));
  }
});

test('business: the business, the knowledge base, home, and every repository with its path and GitHub name', () => {
  const w = world();
  const r = kbCli(w, ['business'], w.appWt);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), {
    business: 'biz',
    knowledgeBase: w.kb,
    home: w.app,
    repos: {
      app: { path: w.app, github: 'o/app' },
      api: { path: w.api, github: 'o/api' },
      web: { path: null, github: 'o/web' }, // in the knowledge base's list, not cloned on this machine
    },
  });
});

test('a repository with no pointer block is told to run setup, exit code 1, and nothing is opened', () => {
  for (const pointer of [null, '# app\n\nno idea-loop section here\n', '# app\n\n## idea-loop\n\n- 开发设置：DEVELOPMENT.md\n']) {
    const w = world({ pointer });
    for (const args of [['root'], ['root', '--write'], ['worktree', 'api'], ['business']]) {
      const r = kbCli(w, args, w.appWt);
      assert.equal(r.status, 1, `${args.join(' ')} with pointer ${JSON.stringify(pointer)}`);
      assert.match(r.err, /这个仓库还没配进任何业务：跑 \/idea-loop:setup/);
    }
    assert.equal(existsSync(join(w.appWt, '.tmp')), false, 'nothing was opened');
  }
});

test('a pointer block but no clone of that knowledge base on this machine: told to clone it, naming its GitHub name', () => {
  for (const opts of [{ unmapped: true }, { projects: false }]) {
    const w = world(opts);
    const r = kbCli(w, ['root'], w.appWt);
    assert.equal(r.status, 1);
    assert.match(r.err, /这台机器还没 clone 知识库 o\/biz-kb/);
    assert.match(r.err, /\/idea-loop:setup/);
  }
  // the mapped path is gone from disk
  const w = world();
  writeFileSync(join(w.home, 'projects.json'), JSON.stringify({ biz: { knowledgeBase: join(w.base, 'deleted'), home: w.app, repos: {} } }));
  assert.match(kbCli(w, ['root'], w.appWt).err, /这台机器还没 clone 知识库 o\/biz-kb/);
});

test('the pointer block is also read from CLAUDE.md when AGENTS.md has no pointer section', () => {
  const w = world({ pointer: null });
  writeFileSync(join(w.appWt, 'AGENTS.md'), '# app\n\n## idea-loop\n\n- 开发设置：DEVELOPMENT.md\n');
  writeFileSync(join(w.appWt, 'CLAUDE.md'), `@AGENTS.md\n\n${POINTER}`);
  assert.equal(kbCli(w, ['root'], w.appWt).out, w.kb);
});

test('the pointer block ends at the next heading, and its lines are read as written (full-width or plain colon)', () => {
  const w = world({ pointer: null });
  writeFileSync(join(w.appWt, 'AGENTS.md'), '## idea-loop\n\n- 业务: `biz`\n- 知识库: `o/biz-kb`\n\n## Other\n\n- 业务：`not-this-one`\n');
  assert.equal(kbCli(w, ['root'], w.appWt).out, w.kb);
  writeFileSync(join(w.appWt, 'AGENTS.md'), '## idea-loop\n\n## Other\n\n- 业务：`biz`\n- 知识库：`o/biz-kb`\n');
  assert.equal(kbCli(w, ['root'], w.appWt).status, 1, 'lines under another heading are not the pointer');
});

test('a directory that is not a git repository is the same refusal', () => {
  const w = world();
  const outside = join(w.base, 'plain');
  mkdirSync(outside);
  const n = kbCli(w, ['root'], outside);
  assert.equal(n.status, 1);
  assert.match(n.err, /这个仓库还没配进任何业务：跑 \/idea-loop:setup/);
});

test('the business comes from the pointer, not from where the checkout sits: an unmapped checkout of a repository still finds the knowledge base', () => {
  const w = world();
  const web = join(w.base, 'web'); // never mentioned in projects.json
  mkdirSync(web);
  git(web, 'init', '-q', '-b', 'main');
  commit(web, 'AGENTS.md', POINTER);
  assert.equal(kbCli(w, ['root'], web).out, w.kb);
});

test('a projects.json that is not JSON is reported by file, not as a crash', () => {
  const w = world();
  writeFileSync(join(w.home, 'projects.json'), '{ not json');
  const r = kbCli(w, ['root'], w.appWt);
  assert.equal(r.status, 1);
  assert.match(r.err, /projects\.json/);
});

test('--cwd works from anywhere; an unknown subcommand is a usage error', () => {
  const w = world();
  assert.equal(kbCli(w, ['root', '--cwd', w.appWt], w.base).out, w.kb);
  assert.equal(kbCli(w, ['bogus'], w.appWt).status, 2);
  assert.equal(kbCli(w, [], w.appWt).status, 2);
});

test('a new session branch starts from the knowledge base default branch on origin, not from whatever its main checkout has checked out', () => {
  const w = world();
  git(w.kb, 'checkout', '-q', '-b', 'unrelated');
  commit(w.kb, 'docs/spec/unrelated.md', 'half-done work in the main checkout');
  const r = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(r.status, 0, r.err);
  assert.equal(git(r.out, 'rev-parse', 'HEAD'), git(w.kb, 'rev-parse', 'origin/main'));
  assert.equal(existsSync(join(r.out, 'docs/spec/unrelated.md')), false);
});

test('root --write follows the session branch: .tmp/kb opened on branch A moves to branch B when the code worktree switches (cut from origin default, or reused if it exists)', () => {
  const w = world();
  const dest = join(w.appWt, '.tmp', 'kb');
  assert.equal(kbCli(w, ['root', '--write'], w.appWt).out, dest);
  assert.equal(git(dest, 'branch', '--show-current'), 'feature/x');

  // the session moves from review to implementation: a new branch in the code worktree
  git(w.appWt, 'switch', '-q', '-c', 'impl/my-spec', 'main');
  const moved = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(moved.status, 0, moved.err);
  assert.equal(moved.out, dest);
  assert.equal(git(dest, 'branch', '--show-current'), 'impl/my-spec');
  assert.equal(git(dest, 'rev-parse', 'HEAD'), git(w.kb, 'rev-parse', 'origin/main'), 'a branch that did not exist is cut from the default branch');

  // switching back to a knowledge base branch that already exists reuses it, with its commits
  commit(dest, 'docs/spec/impl.md', 'written on impl/my-spec');
  git(w.appWt, 'switch', '-q', 'feature/x');
  assert.equal(kbCli(w, ['root', '--write'], w.appWt).status, 0);
  assert.equal(git(dest, 'branch', '--show-current'), 'feature/x');
  git(w.appWt, 'switch', '-q', 'impl/my-spec');
  assert.equal(kbCli(w, ['root', '--write'], w.appWt).status, 0);
  assert.equal(git(dest, 'branch', '--show-current'), 'impl/my-spec');
  assert.ok(existsSync(join(dest, 'docs/spec/impl.md')), 'the existing branch was reused');
});

test('root --write: when the branch only exists on origin, .tmp/kb switches onto it', () => {
  const w = world();
  const dest = join(w.appWt, '.tmp', 'kb');
  assert.equal(kbCli(w, ['root', '--write'], w.appWt).status, 0);
  const pusher = join(w.base, 'pusher');
  git(w.base, 'clone', '-q', join(w.base, 'biz-kb-origin.git'), pusher);
  git(pusher, 'checkout', '-q', '-b', 'impl/remote');
  commit(pusher, 'docs/spec/r.md', 'pushed from another machine');
  git(pusher, 'push', '-q', 'origin', 'impl/remote');
  git(w.appWt, 'switch', '-q', '-c', 'impl/remote', 'main');
  const r = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(r.status, 0, r.err);
  assert.equal(git(dest, 'branch', '--show-current'), 'impl/remote');
  assert.ok(existsSync(join(dest, 'docs/spec/r.md')), 'the origin branch was used');
});

test('root --write: .tmp/kb with uncommitted changes cannot follow the branch: exit 1, nothing changed', () => {
  const w = world();
  const dest = join(w.appWt, '.tmp', 'kb');
  assert.equal(kbCli(w, ['root', '--write'], w.appWt).status, 0);
  commit(dest, 'docs/spec/a.md', 'v1');
  writeFileSync(join(dest, 'docs/spec/a.md'), 'v2 not committed yet');
  git(w.appWt, 'switch', '-q', '-c', 'impl/my-spec', 'main');

  const r = kbCli(w, ['root', '--write'], w.appWt);
  assert.equal(r.status, 1);
  assert.ok(r.err.includes('feature/x') && r.err.includes('impl/my-spec'), 'names both branches');
  assert.equal(git(dest, 'branch', '--show-current'), 'feature/x', 'still on the old branch');
  assert.equal(git(dest, 'status', '--porcelain'), 'M docs/spec/a.md', 'the uncommitted change is untouched');
  assert.equal(git(w.kb, 'branch', '--list', 'impl/my-spec'), '', 'no branch was created');
});

test('worktree <repo> follows the session branch too', () => {
  const w = world();
  const dest = join(w.appWt, '.tmp', 'repos', 'api');
  assert.equal(kbCli(w, ['worktree', 'api'], w.appWt).out, dest);
  git(w.appWt, 'switch', '-q', '-c', 'impl/my-spec', 'main');
  assert.equal(kbCli(w, ['worktree', 'api'], w.appWt).status, 0);
  assert.equal(git(dest, 'branch', '--show-current'), 'impl/my-spec');
});
