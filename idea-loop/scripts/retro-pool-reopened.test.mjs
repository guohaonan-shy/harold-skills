/**
 * The seam is the command line: feed `retro-pool-reopened.mjs` the path of one candidate file that sits in a
 * git repository, read back the JSON it prints and the exit code. Each test builds a throwaway repository,
 * commits the candidate through the states a pool really goes through (rejected, a new occurrence, rejected
 * again), and asks whether the candidate has come up again since the latest rejection.
 *
 * Order is the order of commits, never the date: two of the tests commit on the very same day (one of them in
 * the very same second), which a date comparison cannot tell apart.
 *
 * All candidates below are invented (a fictional "checkout" product's rules); nothing names a real project.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'retro-pool-reopened.mjs');

const OCC = {
  a: '- shop-app#12（2026-10-01）：「折扣码填错了要等提交才报错」；决定记录：[[12]]',
  b: '- shop-app#15（2026-10-05）：「又是提交后才提示」；决定记录：[[15]]',
  c: '- shop-app#18（2026-10-20）：「还是这样」；决定记录：[[18]]',
};

function candidate({ status = '在池里', occurrences = [OCC.a] } = {}) {
  return [
    '---',
    'type: record',
    'captured: 2026-10-26',
    'title: "结算页：折扣码输入框失焦后再校验"',
    'tags: [retro-candidates]',
    '---',
    '',
    '- 信号：纠正与追问',
    '- 落点：插件 `checkout-skill` 的「折扣」一节',
    '- 旧文：提交时才校验',
    '- 新文：失焦时校验',
    '- 例子：输入 SAVE0 后离开输入框，当场提示无效',
    `- 状态：${status}`,
    '',
    '## 出现',
    '',
    ...occurrences,
    '',
  ].join('\n');
}

/** A throwaway repo with one pool file; `commit(md, when)` commits that content with a fixed commit time. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'retro-reopened-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  const file = join(dir, 'docs', 'records', 'retro-candidates', 'retro-candidate-1.md');
  execFileSync('mkdir', ['-p', dirname(file)]);
  return {
    file,
    commit(md, when) {
      writeFileSync(file, md);
      git('add', '-A');
      execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'c'], {
        env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
      });
    },
  };
}

function run(file) {
  const r = spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* leave null: the test will say what it saw */
  }
  return { status: r.status, json, raw: r.stdout + r.stderr };
}

test('rejected once, nothing new since: not reopened', () => {
  const r = repo();
  r.commit(candidate({ occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-02-01T09:00:00');
  r.commit(candidate({ status: '驳回（人说这条太窄）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-03-01T09:00:00');
  const { status, json, raw } = run(r.file);
  assert.equal(status, 0, raw);
  assert.equal(json.reopened, false);
  assert.deepEqual(json.newOccurrences, []);
});

test('rejected once, a new session came up afterwards: reopened, and it names the session', () => {
  const r = repo();
  r.commit(candidate({ status: '驳回（人说这条太窄）', occurrences: [OCC.a, OCC.b] }), '2026-02-01T09:00:00');
  r.commit(candidate({ status: '驳回（人说这条太窄）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-03-01T09:00:00');
  const { status, json, raw } = run(r.file);
  assert.equal(status, 0, raw);
  assert.equal(json.reopened, true);
  assert.deepEqual(json.newOccurrences, ['shop-app#18']);
});

test('rejected again with a new reason after that occurrence: the second rejection is the one that counts', () => {
  const r = repo();
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b] }), '2026-02-01T09:00:00');
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-03-01T09:00:00');
  r.commit(candidate({ status: '驳回（shop-app#18 再次出现后仍驳回：折扣码规则由后端定）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-04-01T09:00:00');
  const { status, json, raw } = run(r.file);
  assert.equal(status, 0, raw);
  assert.equal(json.reopened, false, raw);
  assert.deepEqual(json.newOccurrences, []);
});

test('after the second rejection a third session comes up: reopened again, only that one is new', () => {
  const r = repo();
  const d = '- shop-app#21（2026-10-24）：「第四次了」；决定记录：[[21]]';
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b] }), '2026-02-01T09:00:00');
  r.commit(candidate({ status: '驳回（再驳回的理由）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-04-01T09:00:00');
  r.commit(candidate({ status: '驳回（再驳回的理由）', occurrences: [OCC.a, OCC.b, OCC.c, d] }), '2026-05-01T09:00:00');
  const { json, raw } = run(r.file);
  assert.equal(json.reopened, true, raw);
  assert.deepEqual(json.newOccurrences, ['shop-app#21']);
});

test('same day: rejected at nine, a new session added at three in the afternoon: reopened', () => {
  const r = repo();
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b] }), '2026-10-26T09:00:00');
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-10-26T15:00:00');
  const { json, raw } = run(r.file);
  assert.equal(json.reopened, true, raw);
  assert.deepEqual(json.newOccurrences, ['shop-app#18']);
});

test('same second: commit order alone decides', () => {
  const r = repo();
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b] }), '2026-10-26T09:00:00');
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-10-26T09:00:00');
  const { json, raw } = run(r.file);
  assert.equal(json.reopened, true, raw);
});

test('a new line for a session that was already there, or one already marked overturned, is not a new occurrence', () => {
  const r = repo();
  const again = '- shop-app#12（2026-10-30）：「同一场会话里又说了一次」；决定记录：[[12]]';
  const overturned = `${OCC.c}（已推翻：「当时选错了」）`;
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b] }), '2026-02-01T09:00:00');
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b, again, overturned] }), '2026-03-01T09:00:00');
  const { json, raw } = run(r.file);
  assert.equal(json.reopened, false, raw);
  assert.deepEqual(json.newOccurrences, []);
});

test('rejected, put back in the pool, rejected again: the latest rejection counts', () => {
  const r = repo();
  r.commit(candidate({ status: '驳回（太窄）', occurrences: [OCC.a, OCC.b] }), '2026-02-01T09:00:00');
  r.commit(candidate({ status: '在池里', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-03-01T09:00:00');
  r.commit(candidate({ status: '驳回（第二次的理由）', occurrences: [OCC.a, OCC.b, OCC.c] }), '2026-04-01T09:00:00');
  const { json, raw } = run(r.file);
  assert.equal(json.reopened, false, raw);
});

test('a status that is not a rejection, or a rejection that was never committed, is reported, not guessed', () => {
  const r = repo();
  r.commit(candidate({ status: '在池里' }), '2026-02-01T09:00:00');
  const notRejected = run(r.file);
  assert.equal(notRejected.status, 2, notRejected.raw);

  const r2 = repo();
  r2.commit(candidate({ status: '在池里' }), '2026-02-01T09:00:00');
  writeFileSync(r2.file, candidate({ status: '驳回（还没提交）' }));
  const uncommitted = run(r2.file);
  assert.equal(uncommitted.status, 2, uncommitted.raw);
  assert.match(uncommitted.raw, /驳回/);
});

test('no argument: usage error', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});
