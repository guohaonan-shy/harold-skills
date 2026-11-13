/**
 * Doc test — large replay cases are run on the spot by the orchestrator of `idea-loop:implement`, once the PR is open.
 *
 * Spec replay-run-large-now, ticket 02 (there is no night queue and no scheduled task any more). The runner's behaviour
 * is covered end to end in retro-run-large.test.mjs and retro-install.test.mjs; this test reads the documents and catches
 * a sentence being dropped: implement's 「没活了就停下」 names the large cases waiting to run, tells the human three things,
 * does not wait for a nod, runs `--run-large` in the background and handles the result with `replay-result.md`;
 * issue-session no longer has the night's result paragraph; setup removes the old scheduled task and the queue directory;
 * and no document outside the decision records still tells anyone to use the queue. It cannot tell whether a session
 * then does what the text says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pluginRoot, '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}
const body = (doc) => {
  const m = doc.match(/^---\n[\s\S]*?\n---\n/);
  return m ? doc.slice(m[0].length) : doc;
};
const chars = (doc) => [...body(doc)].length;

const implement = read('skills', 'engineering', 'implement', 'SKILL.md');
const issueSession = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const setup = read('skills', 'engineering', 'setup', 'SKILL.md');
const setupRef = read('skills', 'engineering', 'setup', 'references', 'replay-runner.md');
const stop = section(implement, '没活了就停下');

test('implement 「没活了就停下」 runs the large cases waiting to run: tells the human three things, does not wait for a nod, runs --run-large in the background', () => {
  const line = stop.split('\n').find((l) => l.includes('大用例待跑'));
  assert.ok(line, 'the step never names 大用例待跑');
  assert.match(line, /几个用例|个数/, 'tell how many cases');
  assert.match(line, /3×45 分钟/, 'tell the longest a case takes');
  assert.match(line, /1\.05–3\.50 美元/, 'tell the cost per case');
  assert.match(line, /起 agent.*(高|多)/, 'a case that starts agents costs more');
  assert.match(line, /不等人点头/, 'no waiting for a nod');
  assert.match(line, /run_in_background|后台/, 'run it in the background');
  assert.match(line, /--run-large/, 'the flag');
  assert.match(line, /--pr <PR 号>/, 'the main PR number');
  assert.match(line, /--worktree <集成 worktree 绝对路径>/, 'which worktree');
  assert.match(line, /references\/replay-result\.md/, 'the result is handled by the reference');
});

test('implement does not queue anything: no --enqueue, no queue directory, no night', () => {
  assert.doesNotMatch(implement, /--enqueue|replay-queue|夜间|夜里|回放在队列里/);
});

test('implement 「全部落地」 waits for runs and unsettled replays, not for a queue', () => {
  const line = implement.split('\n').find((l) => l.startsWith('**全部落地'));
  assert.ok(line, 'the 「全部落地」 paragraph is gone');
  assert.match(line, /没有在跑或未处理的回放/);
  assert.doesNotMatch(line, /队列/);
});

test('replay-result.md moved from issue-session to implement, and handles the output of a finished run', () => {
  assert.equal(existsSync(join(pluginRoot, 'skills', 'engineering', 'issue-session', 'references', 'replay-result.md')), false, 'still in issue-session');
  const doc = read('skills', 'engineering', 'implement', 'references', 'replay-result.md');
  assert.match(doc, /规则回放/, 'read the 规则回放 entry in the review loop file');
  assert.match(doc, /全过/);
  assert.match(doc, /有不过的/);
  assert.match(doc, /判定对.*判定错.*用例有问题|三个处理/s, 'the three rulings');
  assert.match(doc, /retro-install\.mjs/, 'reinstall the fixed-path runner when it does not know --run-large');
  assert.match(doc, /unknown argument/);
  assert.doesNotMatch(doc, /夜|队列|macOS 通知|会话间消息|当场跑/, 'nothing of the night run is left');
});

test('issue-session has no paragraph about the replay result any more, and stays under 5000 characters', () => {
  assert.doesNotMatch(issueSession, /规则回放的结果|replay-result|会话间消息/);
  assert.ok(chars(issueSession) < 5000, `issue-session body is ${chars(issueSession)} characters`);
});

test('setup 「规则回放 runner」 installs the runner only; its reference removes the old scheduled task and the queue directory', () => {
  assert.match(setup, /^## 规则回放 runner$/m);
  assert.doesNotMatch(setup, /夜间/);
  assert.match(section(setup, '规则回放 runner'), /references\/replay-runner\.md/);
  assert.match(setupRef, /idea-loop-retro-replay/, 'delete the old scheduled task by its id');
  assert.match(setupRef, /『定时任务』/, 'with the scheduled-task capability');
  assert.match(setupRef, /~\/\.idea-loop\/replay-queue\//, 'delete the old queue directory');
  assert.match(setupRef, /retro-install\.mjs/);
  assert.match(setupRef, /允许规则/);
  assert.ok(chars(setup) < 5000, `setup body is ${chars(setup)} characters`);
});

test('implement SKILL.md body is not longer than it was before this change (9019 characters)', () => {
  assert.ok(chars(implement) <= 9019, `implement body is ${chars(implement)} characters`);
});

test('implementer: a large case is only written and committed; the result of `--run-large` is the orchestrator\'s', () => {
  const doc = readFileSync(join(pluginRoot, 'agents', 'implementer.md'), 'utf8');
  assert.match(doc, /大用例待跑：<用例>/);
  assert.match(doc, /PR 开出后当场跑/);
  assert.doesNotMatch(doc, /--enqueue|夜里|夜间|回放在队列里|队列/);
  assert.match(doc, /规则回放 runner/, 'a runner that is not there means setup\'s 「规则回放 runner」 step was not done');
});

// ---------- nothing else still tells anyone to use the queue ----------

const SKIP_DIRS = new Set(['.git', 'node_modules', '.tmp']);
const SKIP_PREFIXES = ['docs/adr/', 'docs/raw/', 'docs/records/', 'docs/spec/'];
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(repoRoot, full);
    if (SKIP_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(md|mjs|json|ya?ml|txt)$/.test(name)) yield [rel, full];
  }
}

test('outside docs/adr, docs/raw, docs/records and docs/spec, no file mentions the night queue, --enqueue, --queue, a 回放结果 line or the queue directory', () => {
  const banned = [/--enqueue/, /--queue/, /回放结果/, /夜间队列/, /replay-queue/];
  const hits = [];
  for (const [rel, full] of walk(repoRoot)) {
    // the tests name the strings they look for and the flags they check are refused
    if (['idea-loop/scripts/implement-replay-large-doc.test.mjs', 'idea-loop/scripts/retro-run-large.test.mjs', 'idea-loop/scripts/retro-install.test.mjs'].includes(rel)) continue;
    const text = readFileSync(full, 'utf8');
    for (const re of banned) {
      if (!re.test(text)) continue;
      // setup's reference deletes the old directory: that sentence is the one allowed mention
      if (rel === 'idea-loop/skills/engineering/setup/references/replay-runner.md' && re.source === 'replay-queue') continue;
      hits.push(`${rel}: ${re.source}`);
    }
  }
  assert.deepEqual(hits, []);
});
