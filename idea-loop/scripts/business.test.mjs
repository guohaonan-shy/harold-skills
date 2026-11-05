import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { businessRoot, instructions, issueRepo, kb, land, recommendInstructions, switchOn } from './business.mjs';
import { contextFor } from './business-context-hook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'business.mjs');
const hook = join(here, 'business-context-hook.mjs');

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function repo(dir, files = {}) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

/** biz/ (knowledge base, ignores its code repos) with app/ and web/ under it, and a worktree of app outside biz/. */
function business({ ignore = true } = {}) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'business-')));
  const biz = repo(join(top, 'biz'), { 'AGENTS.md': '业务说明\n', 'docs/index.md': '# docs\n', '.gitignore': ignore ? 'app/\nweb/\n' : '' });
  const app = repo(join(biz, 'app'), { 'CLAUDE.md': '@AGENTS.md\n', 'AGENTS.md': '仓库说明\n' });
  repo(join(biz, 'web'), { 'AGENTS.md': 'web\n' });
  const outside = join(top, 'wt', 'app-1');
  git(app, 'worktree', 'add', '-q', '-b', 'w1', outside);
  return { top, biz, app, outside };
}

test('root: a code repo, its worktree outside the business, and the knowledge base all find the same root', () => {
  const { biz, app, outside } = business();
  for (const dir of [app, join(app, 'src'.replace('src', '')), outside]) {
    assert.deepEqual(businessRoot(dir), { root: biz, repo: 'app', repos: ['app', 'web'], legacy: false });
  }
  assert.deepEqual(businessRoot(biz), { root: biz, repo: null, repos: ['app', 'web'], legacy: false });
});

test('root: a lone repo is its own root, the legacy layout', () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'business-')));
  const solo = repo(join(top, 'solo'), { 'docs/index.md': 'x' });
  assert.deepEqual(businessRoot(solo), { root: solo, repo: 'solo', repos: [], legacy: true });
});

test('root: an enclosing repo that does not ignore the code repo is not a business', () => {
  const { app } = business({ ignore: false });
  assert.equal(businessRoot(app).legacy, true);
  assert.equal(businessRoot(app).root, app);
});

test('root: outside any git repo the CLI exits 2', () => {
  const r = spawnSync(process.execPath, [cli, 'root', realpathSync(mkdtempSync(join(tmpdir(), 'nogit-')))], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('instructions: all CLAUDE.md → CLAUDE.md; all AGENTS.md → AGENTS.md; mixed → AGENTS.md and the switch', () => {
  assert.deepEqual(recommendInstructions({ a: 'claude', b: 'claude' }), { file: 'CLAUDE.md', needsSwitch: false });
  assert.deepEqual(recommendInstructions({ a: 'agents', b: 'none' }), { file: 'AGENTS.md', needsSwitch: false });
  assert.deepEqual(recommendInstructions({ a: 'claude', b: 'agents' }), { file: 'AGENTS.md', needsSwitch: true });
  const { biz, app } = business();
  const settings = join(biz, '..', 'settings.json');
  writeFileSync(settings, JSON.stringify({ pluginConfigs: { 'cc-plugin-agents-md@builtin': { options: { instructionFiles: 'claude-md-and-agents-md' } } } }));
  assert.deepEqual(instructions(app, settings), {
    root: biz,
    repos: { app: 'claude', web: 'agents' },
    current: ['AGENTS.md'],
    recommend: 'AGENTS.md',
    needsSwitch: true,
    switchOn: true,
  });
  assert.equal(switchOn(join(biz, 'missing.json')), false);
});

test('kb: opens the branch worktree inside the knowledge base, excluded locally, and reuses it', () => {
  const { biz, outside } = business();
  const first = kb('issue-7', outside);
  assert.deepEqual(first, { path: join(biz, '.worktrees', 'issue-7'), branch: 'issue-7', legacy: false, created: true });
  assert.ok(existsSync(join(first.path, 'docs', 'index.md')));
  assert.match(readFileSync(join(biz, '.git', 'info', 'exclude'), 'utf8'), /^\/\.worktrees\/$/m);
  assert.equal(git(biz, 'status', '--porcelain'), '');
  assert.equal(kb('issue-7', outside).created, false);
  assert.throws(() => kb('../x', outside), /分支名不合法/);
});

test('kb: in the legacy layout it is the current checkout', () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'business-')));
  const solo = repo(join(top, 'solo'));
  assert.deepEqual(kb('issue-1', solo), { path: solo, branch: null, legacy: true, created: false });
});

test('land: merges into main, pushes to the remote, removes worktree and branch', () => {
  const { top, biz, outside } = business();
  const remote = join(top, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(biz, 'remote', 'add', 'origin', remote);
  git(biz, 'push', '-q', '-u', 'origin', 'main');
  const { path } = kb('issue-7', outside);
  writeFileSync(join(path, 'docs', 'x.md'), 'spec\n');
  git(path, 'add', '-A');
  git(path, 'commit', '-q', '-m', 'spec');
  assert.deepEqual(land('issue-7', outside), { root: biz, branch: 'issue-7', main: 'main', merged: true, pushed: true });
  assert.equal(readFileSync(join(biz, 'docs', 'x.md'), 'utf8'), 'spec\n');
  assert.equal(git(biz, 'log', '-1', '--format=%s'), '知识库：合入 issue-7');
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'main'), '知识库：合入 issue-7');
  assert.ok(!existsSync(path));
  assert.equal(git(biz, 'branch', '--list', 'issue-7'), '');
});

test('land: without a remote it merges locally only', () => {
  const { biz, outside } = business();
  const { path } = kb('issue-8', outside);
  writeFileSync(join(path, 'docs', 'y.md'), 'y\n');
  git(path, 'add', '-A');
  git(path, 'commit', '-q', '-m', 'y');
  assert.equal(land('issue-8', outside).pushed, false);
  assert.ok(existsSync(join(biz, 'docs', 'y.md')));
});

test('land: refuses uncommitted work and conflicts, leaving main as it was', () => {
  const { biz, outside } = business();
  const { path } = kb('issue-9', outside);
  writeFileSync(join(path, 'docs', 'index.md'), '# branch\n');
  let r = spawnSync(process.execPath, [cli, 'land', 'issue-9', outside], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /没提交的改动[\s\S]*docs\/index\.md/);
  git(path, 'commit', '-q', '-am', 'branch');
  writeFileSync(join(biz, 'docs', 'index.md'), '# main\n');
  git(biz, 'commit', '-q', '-am', 'main');
  const before = git(biz, 'rev-parse', 'HEAD');
  r = spawnSync(process.execPath, [cli, 'land', 'issue-9', outside], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /冲突[\s\S]*docs\/index\.md/);
  assert.equal(git(biz, 'rev-parse', 'HEAD'), before);
  assert.equal(git(biz, 'status', '--porcelain'), '');
  assert.ok(existsSync(path));
});

test('land: refuses in the legacy layout and when the root is off main', () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'business-')));
  const solo = repo(join(top, 'solo'));
  git(solo, 'branch', 'issue-1');
  assert.throws(() => land('issue-1', solo), /旧布局/);
  const { biz, outside } = business();
  kb('issue-2', outside);
  git(biz, 'switch', '-q', '-c', 'other');
  assert.throws(() => land('issue-2', outside), /不在知识库 main/);
});

test('issueRepo: read from ISSUE_TRACKER.md next to docs/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  mkdirSync(join(dir, 'docs'));
  assert.equal(issueRepo(join(dir, 'docs')), null);
  writeFileSync(join(dir, 'ISSUE_TRACKER.md'), '# Issue tracker\n\n- issue 所在仓库：`acme/app`\n');
  assert.equal(issueRepo(join(dir, 'docs')), 'acme/app');
});

test('hook: injects the business instruction files only for a session outside the business root', () => {
  const { biz, app, outside } = business();
  const ctx = contextFor(outside);
  assert.match(ctx, new RegExp(`### ${join(biz, 'AGENTS.md')}\\n\\n业务说明`));
  assert.doesNotMatch(ctx, /仓库说明/);
  assert.equal(contextFor(app), null);
  assert.equal(contextFor(biz), null);
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: outside }), encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
  const quiet = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: app }), encoding: 'utf8' });
  assert.equal(quiet.stdout, '');
});

test('hook: a CLAUDE.md that imports AGENTS.md is expanded and not repeated', () => {
  const { biz, outside } = business();
  writeFileSync(join(biz, 'CLAUDE.md'), '@AGENTS.md\n');
  const ctx = contextFor(outside);
  assert.equal(ctx.match(/业务说明/g).length, 1);
  assert.match(ctx, /### .*CLAUDE\.md/);
});
