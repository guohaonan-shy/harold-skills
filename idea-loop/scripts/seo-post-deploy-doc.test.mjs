/**
 * Pins the sentences that make "合并后上线自查，失败自动回滚" true in the docs: merge.md's 上线后自查 section (the way in from
 * both the human's "合并" and the SEO auto-merge, waiting for the deploy, the four outcomes: not live, all passed, a failed
 * item rolled back, the check could not run), SEO.md's 上线等待 key in the format reference, and the scripts the section
 * calls being the ones that exist.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => (existsSync(path(...p)) ? readFileSync(path(...p), 'utf8') : '');
const section = (doc, title) => doc.split(/^#{2,3} /m).find((s) => s.startsWith(title)) ?? '';
/** The outcome bullets of 上线后自查: `1. **\`not-live\`…`, cut at the next numbered outcome. */
const outcome = (text, name) => text.split(/\n(?=\d\. \*\*)/).find((s) => s.includes(name)) ?? '';

const MERGE = read('skills', 'engineering', 'pr-review', 'references', 'merge.md');
const AUTO = read('skills', 'engineering', 'pr-review', 'references', 'seo-auto-merge.md');
const FORMAT = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
const CHECK = section(MERGE, '上线后自查');

test('merge.md has an 上线后自查 section, and 合并 points into it for both the human and the automatic path', () => {
  assert.ok(CHECK, 'merge.md has no 上线后自查 section');
  const merge = section(MERGE, '合并\n');
  assert.match(merge, /上线后自查/);
  assert.match(merge, /type:seo\/\*/);
  assert.match(merge, /上线自查的网址/);
  assert.match(merge, /人说合并和自动合并两条路都走/);
  assert.match(merge, /没有这一节[^\n]*跳过/, 'a PR without the section is not checked, and the human is told');
  assert.match(AUTO, /上线后自查/, 'seo-auto-merge.md sends the merged PR into the same section');
});

test('the section reads the URLs from the PR description and compares with the merge commit\'s build', () => {
  assert.match(CHECK, /pr-body\.mjs[^\n]* get [^\n]*live-check/);
  assert.match(CHECK, /合并提交/);
  assert.match(CHECK, /seo-live-check\.mjs/);
  assert.match(CHECK, /--wait/);
  assert.match(CHECK, /每分钟/);
  assert.match(CHECK, /上线等待/);
  assert.match(CHECK, /title 与 description/);
  for (const item of ['能打开', 'noindex', 'X-Robots-Tag', 'sitemap\\.xml']) assert.match(CHECK, new RegExp(item), item);
});

test('等满没上线: no rollback, a push naming the URLs, a comment saying 未上线 and no marker, no rank tracking', () => {
  const o = outcome(CHECK, 'not-live');
  assert.ok(o, 'no not-live outcome');
  assert.match(o, /不回滚/);
  assert.match(o, /部署可能没跑/);
  assert.match(o, /issues\.mjs note/);
  assert.match(o, /未上线/);
  assert.match(o, /不带标记/);
  assert.match(o, /不开排名追踪/);
});

test('全过: a comment with the marker, the target words into the rank tracker within this week\'s 排名追踪 share, the cost in the research log', () => {
  const o = outcome(CHECK, '`pass`');
  assert.ok(o, 'no pass outcome');
  assert.match(o, /seo-live-record\.mjs body/);
  assert.match(o, /issues\.mjs note/);
  assert.match(o, /隐藏标记/);
  assert.match(o, /seo-live-record\.mjs list/, 'says how the change list is read back');
  assert.match(o, /排名追踪/);
  assert.match(o, /add_rank_tracking_keywords/);
  assert.match(o, /estimate_rank_tracker_cost/);
  assert.match(o, /seo-budget\.mjs/);
  assert.match(o, /week\.shares/);
  assert.match(o, /超过 `left` 就不加/, 'over the share: not added, the human is told');
  assert.match(o, /appendResearchLog/);
  assert.match(o, /份：排名追踪/);
});

test('有一项不过: revert the merge, merge the revert PR when checks pass, push, and open a todo issue of the same category', () => {
  const o = outcome(CHECK, '`fail`');
  assert.ok(o, 'no fail outcome');
  assert.match(o, /git revert -m 1 <合并提交>/);
  assert.match(o, /revert PR/);
  assert.match(o, /原 PR/);
  assert.match(o, /gh pr checks/);
  assert.match(o, /gh pr merge/);
  assert.match(o, /护栏的 revert PR 例外/);
  assert.match(o, /检查没过[^\n]*不合并/, 'a revert PR whose checks fail waits for the human');
  assert.match(o, /已回滚 #<PR 号>：<网址> <哪一项>/);
  assert.match(o, /已是 done，状态机不允许翻回/);
  assert.match(o, /issues\.mjs new/);
  assert.match(o, /--state=todo/);
  assert.match(o, /--type=/, 'the new issue keeps the original category');
  assert.match(o, /已回滚，后续见 #<新 issue 号>/);
});

test('the check that could not run does not roll anything back', () => {
  const o = outcome(CHECK, '自查本身没跑成');
  assert.ok(o);
  assert.match(o, /不回滚/);
});

test('SEO.md format: 上线等待 sits in 构建与检查, minutes, 30 when not written, read by seo-live-check.mjs', () => {
  assert.match(FORMAT, /- 上线等待：\d+/);
  assert.match(FORMAT, /\| 构建与检查 \|[^\n]*上线等待[^\n]*按 30[^\n]*seo-live-check\.mjs/);
});
