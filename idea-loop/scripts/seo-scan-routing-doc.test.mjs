/**
 * Pins the sentences that make "扫描开出的 SEO issue 当场分流" true in the docs: seo-scan's 分流 section (only
 * `created`, at most 5 triagers at a time, four ways to flip), the SEO branch in issue-triager's 建议去向 table
 * (only a UI design asks for triage, an unsure one goes to todo, canceled keeps its three sources, done takes 已实现), the 分流 line
 * in the hand-back and research-log templates, and the old "等人分拣" exit being gone.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail
 * there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const section = (doc, title) => doc.split(/^## /m).find((s) => s.startsWith(title)) ?? '';

const SCAN = read('skills', 'seo', 'seo-scan', 'SKILL.md');
const SCAN_BODY = body(SCAN);
const TRIAGER = body(read('agents', 'issue-triager.md'));
const LOG = read('skills', 'seo', 'seo-scan', 'references', 'research-log.md');

test('seo-scan has a 分流 section: only created, at most 5 at a time, four ways to flip', () => {
  const s = section(SCAN_BODY, '分流');
  assert.ok(s, 'seo-scan has no「分流」section');
  assert.match(s, /issue-triager/);
  assert.match(s, /`created`/, 'does not say it only handles `created`');
  assert.match(s, /`commented`/, 'does not say `commented` ones are left alone');
  assert.match(s, /同时最多 5 个/);
  for (const flip of ['done', 'canceled', 'triage', 'todo']) assert.ok(s.includes(flip), `分流 does not mention ${flip}`);
  assert.match(s, /判不了/, 'an unsure (backlog) suggestion should say it goes to todo');
});

test('seo-scan sits 分流 between 提 issue and 研究日志, and leaves no 等人分拣 exit', () => {
  const titles = [...SCAN_BODY.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const i = titles.indexOf('分流');
  assert.ok(i > 0, '分流 section missing');
  assert.equal(titles[i - 1], '提 issue');
  assert.equal(titles[i + 1], '研究日志');
  assert.ok(!SCAN_BODY.includes('等人分拣'), 'seo-scan still says new issues wait for a human to sort them');
  assert.ok(!SCAN_BODY.includes('就是 backlog'), 'seo-scan still says opened issues are backlog');
});

test('seo-scan can run the flips: allowed-tools has dyna issues, dyna worktree and the fetch', () => {
  const tools = SCAN.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? '';
  for (const t of ['Bash(dyna issues:*)', 'Bash(git fetch:*)', 'Bash(dyna worktree:*)']) {
    assert.ok(tools.includes(t), `allowed-tools lacks ${t}`);
  }
});

test('seo-scan hand-back and research-log templates each carry the 分流 line; the log keeps its first two lines', () => {
  assert.ok(SCAN_BODY.includes('分流：todo <n>，triage <n>，done <n>，canceled <n>'), 'hand-back template lacks the 分流 line');
  assert.ok(LOG.includes('分流：todo <n>，triage <n>，done <n>，canceled <n>'), 'research-log template lacks the 分流 line');
  const tpl = LOG.match(/```\n([\s\S]*?)```/)[1].split('\n');
  assert.match(tpl[0], /^seo-scan <YYYY-MM-DD HH:MM>，方向：<方向\.\.\.>$/);
  assert.match(tpl[1], /^采集：<方向> <N> 条；/);
});

test('issue-triager has an SEO branch: only UI design asks for triage, an unsure one goes to todo', () => {
  assert.match(TRIAGER, /type:seo\//);
  assert.ok(TRIAGER.includes('只有 UI 设计建议 triage、判不了建议 todo'), 'SEO branch sentence missing');
  assert.match(TRIAGER, /todo 会话照推荐定/, 'does not say the todo session settles the plan by the recommendation');
});

test('issue-triager cancels only for the three reasons and routes 已实现 to done', () => {
  const row = TRIAGER.split('\n').find((l) => l.startsWith('| canceled'));
  assert.ok(row, 'canceled row missing');
  for (const k of ['重复', '「不做」清单', '复现不出']) assert.ok(row.includes(k), `canceled row lost「${k}」`);
  assert.ok(!row.includes('已实现'), 'canceled row still carries 已实现');
  const done = TRIAGER.split('\n').find((l) => l.startsWith('| done'));
  assert.ok(done && done.includes('已实现'), 'done row with 已实现 missing');
});
