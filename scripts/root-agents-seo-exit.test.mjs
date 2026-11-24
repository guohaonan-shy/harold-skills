/**
 * Guard — the repo's AGENTS.md says where `seo-scan`'s output goes. It lives at the repo root (not in the
 * plugin) because the file it reads is the repo's own and does not ship with the plugin.
 *
 * The exit is: issues routed on the spot (not left in backlog for a weekly triage), and the effect report PR
 * every 3 days; and SEO auto-merge is named as an exception to the user rule 「只由我做」.
 *
 * ROOT_AGENTS_MD points the test at another copy of the file (e.g. the text before the change).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.ROOT_AGENTS_MD ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'AGENTS.md');
const doc = readFileSync(file, 'utf8');
const item = doc.split('\n').find((l) => /^\s*1\. \*\*调用方式按出口定\*\*/.test(l)) ?? '';
const seoScan = item.slice(item.indexOf('`seo-scan` 可被模型调用'), item.indexOf('其余可被模型调用'));

test('AGENTS.md item 1 describes seo-scan, between its invocation rule and the next sentence', () => {
  assert.ok(item, 'item 1 of the idea-loop exceptions is there');
  assert.ok(seoScan.length > 0, 'the seo-scan sentences are there');
});

test('AGENTS.md item 1: seo-scan no longer leaves SEO issues in backlog for a weekly triage', () => {
  assert.doesNotMatch(seoScan, /开成 backlog 的 issue/);
  assert.doesNotMatch(seoScan, /每周的分拣按建议去向翻状态/);
  assert.match(seoScan, /每天定时任务/);
});

test('AGENTS.md item 1: the exits are the issues routed on the spot and the 3-day effect report PR', () => {
  assert.match(seoScan, /当场分流/);
  assert.match(seoScan, /canceled \/ triage \/ todo/);
  assert.match(seoScan, /每 3 天[^。]*效果报告 PR/);
});

test('AGENTS.md item 1: SEO auto-merge is written as an exception to the user rule 「只由我做」', () => {
  assert.match(seoScan, /自动合并[^。]*「只由我做」[^。]*的一条例外/);
  assert.match(seoScan, /`type:seo\/\*`/);
  assert.match(seoScan, /三条都满足/);
});
