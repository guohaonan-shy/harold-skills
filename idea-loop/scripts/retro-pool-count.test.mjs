/**
 * The seam is the command line: feed `retro-pool-count.mjs` a candidate-pool directory, read back the
 * JSON it prints and the exit code. Every test goes through that door, not through an exported function,
 * so the parser can be restructured without touching the tests.
 *
 * All candidates below are invented (a fictional "checkout" product's rules); nothing names a real project.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'retro-pool-count.mjs');

/** A candidate file in the pool's shape; each part can be bent or dropped by a test. */
function candidate({
  title = '结算页：折扣码输入框失焦后再校验',
  landing = '- 落点：插件 `checkout-skill` 的「折扣」一节',
  status = '- 状态：在池里',
  occurrences = ['- shop-app#12（2026-10-01）：「折扣码填错了要等提交才报错」；决定记录：[[12]]'],
  section = '## 出现',
} = {}) {
  return [
    '---',
    'type: record',
    'captured: 2026-10-26',
    `title: "${title}"`,
    'tags: [retro-candidates]',
    '---',
    '',
    '- 信号：纠正与追问',
    landing,
    '- 旧文：提交时才校验',
    '- 新文：失焦时校验',
    '- 例子：输入 SAVE0 后离开输入框，当场提示无效',
    status,
    '',
    ...(section ? [section, '', ...occurrences, ''] : []),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Write the given files into a fresh pool directory, run the CLI on it. */
function run(files) {
  const dir = mkdtempSync(join(tmpdir(), 'retro-pool-'));
  for (const [name, md] of Object.entries(files)) writeFileSync(join(dir, name), md);
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* leave null: the test will say what it saw */
  }
  return { status: r.status, json, raw: r.stdout + r.stderr };
}

const byFile = (json, name) => json.candidates.find((c) => c.file === name);
const line = (session, text, extra = '') => `- ${session}（2026-10-01）：「${text}」；决定记录：[[x]]${extra}`;

test('three occurrences, one of them overturned later: counts 2 and does not pass the threshold', () => {
  const { status, json } = run({
    'a.md': candidate({
      occurrences: [
        line('shop-app#1', '第一次'),
        line('shop-app#2', '第二次', '（已推翻：「当时选错了」）'),
        line('shop-app#3', '第三次'),
      ],
    }),
  });
  assert.equal(status, 0);
  const a = byFile(json, 'a.md');
  assert.equal(a.count, 2);
  assert.equal(a.passes, false);
});

test('three occurrences that all stand: counts 3 and passes', () => {
  const { status, json } = run({
    'a.md': candidate({
      occurrences: [line('shop-app#1', '一'), line('shop-app#2', '二'), line('admin-app#7', '三')],
    }),
  });
  assert.equal(status, 0);
  const a = byFile(json, 'a.md');
  assert.equal(a.count, 3);
  assert.equal(a.passes, true);
  assert.equal(json.threshold, 3);
});

test('two lines from the same session count once; the same number in another repo is another session', () => {
  const { json } = run({
    'same.md': candidate({
      occurrences: [line('shop-app#5', '一'), line('shop-app#5', '同一场里又一句'), line('shop-app#6', '三')],
    }),
    'other-repo.md': candidate({
      occurrences: [line('shop-app#5', '一'), line('admin-app#5', '另一个仓库的 5 号')],
    }),
  });
  assert.equal(byFile(json, 'same.md').count, 2);
  assert.equal(byFile(json, 'other-repo.md').count, 2);
});

test('a session with one overturned line and one standing line still counts once', () => {
  const { json } = run({
    'a.md': candidate({
      occurrences: [
        line('shop-app#5', '这句后来推翻了', '（已推翻：「选错了」）'),
        line('shop-app#5', '这句仍成立'),
        line('shop-app#6', '另一场里被推翻', '（已推翻：「也选错了」）'),
      ],
    }),
  });
  assert.equal(byFile(json, 'a.md').count, 1);
});

test('a quote that merely contains the word 已推翻 is not an overturn', () => {
  const { json } = run({
    'a.md': candidate({ occurrences: [line('shop-app#1', '那条规则已推翻过一次，现在照旧')] }),
  });
  assert.equal(byFile(json, 'a.md').count, 1);
});

test('reports title, landing and the status kind with its detail', () => {
  const { json } = run({
    'open.md': candidate({ status: '- 状态：已开 issue（https://example.test/o/r/issues/9）' }),
    'dropped.md': candidate({ status: '- 状态：驳回（只在一个页面出现）' }),
    'pool.md': candidate(),
  });
  const pool = byFile(json, 'pool.md');
  assert.equal(pool.title, '结算页：折扣码输入框失焦后再校验');
  assert.equal(pool.landing, '插件 `checkout-skill` 的「折扣」一节');
  assert.equal(pool.status, '在池里');
  const open = byFile(json, 'open.md');
  assert.equal(open.status, '已开 issue');
  assert.equal(open.statusDetail, 'https://example.test/o/r/issues/9');
  assert.equal(byFile(json, 'dropped.md').status, '驳回');
  assert.equal(byFile(json, 'dropped.md').statusDetail, '只在一个页面出现');
});

test('a clean pool exits 0 with no problems; files other than .md are ignored', () => {
  const { status, json } = run({ 'a.md': candidate(), 'b.md': candidate(), 'notes.txt': 'not a candidate' });
  assert.equal(status, 0);
  assert.deepEqual(json.problems, []);
  assert.equal(json.candidates.length, 2);
});

test('missing the 出现 section: a problem naming the file, non-zero exit', () => {
  const { status, json } = run({ 'good.md': candidate(), 'bad.md': candidate({ section: null }) });
  assert.notEqual(status, 0);
  assert.equal(json.problems.length, 1);
  assert.equal(json.problems[0].file, 'bad.md');
  assert.match(json.problems[0].message, /出现/);
  assert.equal(byFile(json, 'bad.md').passes, false);
});

test('an 出现 section with no line in it is a problem too', () => {
  const { status, json } = run({ 'bad.md': candidate({ occurrences: [] }) });
  assert.notEqual(status, 0);
  assert.match(json.problems[0].message, /出现/);
});

test('missing the 状态 line: a problem', () => {
  const { status, json } = run({ 'bad.md': candidate({ status: null }) });
  assert.notEqual(status, 0);
  assert.equal(json.problems[0].file, 'bad.md');
  assert.match(json.problems[0].message, /状态/);
});

test('a status outside the closed set: a problem that shows the offending text', () => {
  for (const status of ['- 状态：待定', '- 状态：已开 issue', '- 状态：驳回', '- 状态：已开 issue（）']) {
    const r = run({ 'bad.md': candidate({ status }) });
    assert.notEqual(r.status, 0, status);
    assert.match(r.json.problems[0].message, /状态/, status);
  }
  const { json } = run({ 'bad.md': candidate({ status: '- 状态：待定' }) });
  assert.match(json.problems[0].message, /待定/);
});

test('an 出现 line that names no session (repo#number) is a problem, not a silent zero', () => {
  const { status, json } = run({
    'bad.md': candidate({ occurrences: ['- 上周某次会话里：「折扣码填错了」'] }),
  });
  assert.notEqual(status, 0);
  assert.match(json.problems[0].message, /出现/);
});

test('missing the title or the landing is a problem', () => {
  const noLanding = run({ 'a.md': candidate({ landing: null }) });
  assert.notEqual(noLanding.status, 0);
  assert.match(noLanding.json.problems[0].message, /落点/);
  const noTitle = run({ 'a.md': candidate().replace(/^title: .*\n/m, '') });
  assert.notEqual(noTitle.status, 0);
  assert.match(noTitle.json.problems[0].message, /title/);
});

test('usage: no directory, or one that does not exist, exits 1', () => {
  const none = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(none.status, 1);
  const missing = spawnSync(process.execPath, [SCRIPT, join(tmpdir(), 'no-such-retro-pool-dir')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
});
