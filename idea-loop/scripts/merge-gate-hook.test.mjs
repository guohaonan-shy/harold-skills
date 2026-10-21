import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocking, isMergeCommand, pendingRequirements } from './merge-gate-hook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, 'merge-gate-hook.mjs');

/** A git repository in a temp dir; `files` are written under it. */
function repo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'merge-gate-'));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  put(root, files);
  return root;
}
function put(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
}

function runHook(payload, env = {}) {
  return spawnSync(process.execPath, [hook], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}
const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } });

test('which commands count as a merge', () => {
  for (const yes of ['gh pr merge 12', 'gh pr merge 12 --squash --delete-branch', 'cd app && gh pr merge', 'gh -R acme/app pr merge 3', 'gh  pr   merge']) {
    assert.equal(isMergeCommand(yes), true, yes);
  }
  for (const no of ['gh pr view 12', 'gh pr list --state merged', 'git merge main', 'echo hello', 'gh issue close 3', '', undefined]) {
    assert.equal(isMergeCommand(no), false, String(no));
  }
});

test('pendingRequirements: only folders that hold a file, sorted; empty or absent tmp/ is nothing', () => {
  assert.deepEqual(pendingRequirements(repo()), []);
  const root = repo({
    'docs/design/tmp/zeta/delta/x.md': 'x',
    'docs/design/tmp/alpha/canvas/assets/flows/a.png': 'png',
    'docs/design/tmp/dsstore/.DS_Store': '',
  });
  mkdirSync(join(root, 'docs/design/tmp/empty/delta/pages'), { recursive: true });
  assert.deepEqual(pendingRequirements(root), ['alpha', 'zeta']);
});

test('pendingRequirements: research pages from uiux-research are scratch, not an unarchived design', () => {
  // no-spec research lives at tmp/research/, with-spec research at tmp/<spec-slug>/research/
  const root = repo({
    'docs/design/tmp/research/leave-confirm/index.html': '<html></html>',
    'docs/design/tmp/research/leave-confirm/shots/a-1.png': 'png',
    'docs/design/tmp/only-research/research/empty-state/index.html': '<html></html>',
    'docs/design/tmp/with-delta/research/q/index.html': '<html></html>',
    'docs/design/tmp/with-delta/delta/pages/p/p.md': 'x',
  });
  assert.deepEqual(pendingRequirements(root), ['with-delta']);
  assert.equal(runHook(bash('gh pr merge 12', repo({ 'docs/design/tmp/research/q/index.html': 'x', 'docs/design/tmp/s/research/q/shots/a.png': 'x' }))).status, 0);
});

test('a merge command is blocked while tmp/ holds a requirement, and the message names it and the way out', () => {
  const root = repo({ 'docs/design/tmp/demo-spec/delta/pages/p/p.md': 'x' });
  const r = runHook(bash('gh pr merge 12', root));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /demo-spec/);
  assert.match(r.stderr, /design-archive-write\.mjs/);
  // the way out is the review flow, not the bare script: UI review first, a human reads the draft, only then the script
  assert.match(r.stderr, /pr-review/);
  assert.match(r.stderr, /UI 审查/);
  assert.match(r.stderr, /人通过后/);
  assert.equal(r.stdout, '');
});

test('every pending requirement is named', () => {
  const root = repo({ 'docs/design/tmp/one/canvas/a.html': 'x', 'docs/design/tmp/two/imagine/n.md': 'x' });
  const r = runHook(bash('gh pr merge 12 --squash', root));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /- one\b/);
  assert.match(r.stderr, /- two\b/);
});

test('once tmp/ is emptied the same command passes', () => {
  const root = repo({ 'docs/design/tmp/demo-spec/delta/x.md': 'x' });
  assert.equal(runHook(bash('gh pr merge 12', root)).status, 2);
  rmSync(join(root, 'docs/design/tmp/demo-spec'), { recursive: true });
  assert.equal(runHook(bash('gh pr merge 12', root)).status, 0);
});

test('a missing tmp/ passes; a folder inside the repository resolves to the repository root', () => {
  const clean = repo({ 'README.md': 'x' });
  assert.equal(runHook(bash('gh pr merge 12', clean)).status, 0);
  const root = repo({ 'docs/design/tmp/demo-spec/delta/x.md': 'x', 'src/deep/file.txt': 'x' });
  assert.equal(runHook(bash('gh pr merge 12', join(root, 'src/deep'))).status, 2);
});

const git = (root, ...args) => assert.equal(spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root }).status, 0, args.join(' '));

/** A repository whose main branch (origin/HEAD) holds `onMain`, with `onBranch` committed on top. */
function branchRepo(onMain, onBranch) {
  const root = repo(onMain);
  git(root, 'add', '-A', '-f');
  git(root, 'commit', '-qm', 'main');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  put(root, onBranch);
  git(root, 'add', '-A', '-f');
  git(root, 'commit', '-qm', 'branch');
  return root;
}

test('blocking: a docs-only branch answers for nothing; otherwise only the specs it touches; unknown means all', () => {
  assert.deepEqual(blocking(['a', 'b'], ['docs/spec/a/a.md', 'docs/design/tmp/a/canvas/v3.html']), []);
  assert.deepEqual(blocking(['a', 'b'], ['src/x.ts', 'docs/spec/a/a.md']), ['a']);
  assert.deepEqual(blocking(['a', 'b'], ['src/x.ts', 'docs/design/tmp/b/delta/x.md']), ['b']);
  assert.deepEqual(blocking(['a', 'b'], ['src/x.ts']), []);
  assert.deepEqual(blocking(['a', 'b'], null), ['a', 'b']);
});

test('a design PR merges with its frozen design in tmp/; another spec\'s frozen design on main does not block an implementation', () => {
  const design = branchRepo({ 'README.md': 'x' }, { 'docs/spec/a/a.md': 'x', 'docs/design/tmp/a/canvas/v3.html': 'x', 'docs/design/tmp/a/delta/p.md': 'x' });
  assert.equal(runHook(bash('gh pr merge 3 --squash', design)).status, 0);
  const impl = branchRepo({ 'docs/design/tmp/b/delta/p.md': 'x', 'docs/design/tmp/a/delta/p.md': 'x' }, { 'src/a.ts': 'x', 'docs/spec/a/a.md': 'x' });
  const r = runHook(bash('gh pr merge 4', impl));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /- a\b/);
  assert.doesNotMatch(r.stderr, /- b\b/);
});

test('other commands are never blocked', () => {
  const root = repo({ 'docs/design/tmp/demo-spec/delta/x.md': 'x' });
  for (const cmd of ['gh pr view 12', 'git status', 'npm test', 'gh pr list']) {
    assert.equal(runHook(bash(cmd, root)).status, 0, cmd);
  }
});

test('outside a git repository everything passes', () => {
  const outer = mkdtempSync(join(tmpdir(), 'merge-gate-nogit-'));
  put(outer, { 'docs/design/tmp/demo-spec/delta/x.md': 'x' });
  const r = runHook(bash('gh pr merge 12', outer), { GIT_CEILING_DIRECTORIES: dirname(outer) });
  assert.equal(r.status, 0);
});

test('malformed or foreign input passes quietly', () => {
  assert.equal(runHook('not json').status, 0);
  assert.equal(runHook({}).status, 0);
  assert.equal(runHook({ tool_name: 'Write', tool_input: { file_path: '/x' } }).status, 0);
  assert.equal(runHook(bash('gh pr merge 1', '/no/such/dir')).status, 0);
});

test('the hook is registered on Bash in the plugin hooks, and the three PostToolUse hooks are untouched', () => {
  const hooks = JSON.parse(readFileSync(join(here, '..', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.deepEqual(hooks.PreToolUse, [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/merge-gate-hook.mjs"' }] },
  ]);
  assert.deepEqual(hooks.PostToolUse, [
    {
      matcher: 'Write|Edit',
      hooks: ['design-lint-hook', 'design-md-hook', 'glossary-check-hook'].map((n) => ({
        type: 'command',
        command: `node "\${CLAUDE_PLUGIN_ROOT}/scripts/${n}.mjs"`,
      })),
    },
  ]);
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse']);
});
