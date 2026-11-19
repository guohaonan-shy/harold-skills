/**
 * The results direction (效果报告): its findings are ordinary findings filed under the direction of the change they
 * are about, so they pass the same validation, merge through the same file convention and become issues with an
 * ordinary `type:seo/<direction>` label — there is no `type:seo/results`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { apply, plan, rejection } from './seo-issues.mjs';
import { parseTypes } from './issues.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const finding = (over = {}) => ({
  direction: 'pages',
  kind: 'change-no-lift',
  title: '「weeknight dinner ideas」改标题满 14 天，点击没有增加',
  targets: ['https://cookbook.example/blog/weeknight-dinners'],
  evidence: { what: 'get_search_console_performance dimensions=[date] filters=[page equals …] 改动前后各 14 天', when: '2026-11-16', values: '前 14 天 40 次点击，后 14 天 38 次点击；平均排名 7.4 → 7.5' },
  ratio: { numerator: 38, denominator: 40 },
  repro: 'get_search_console_performance projectId=<SEO.md 的项目> dimensions=[date] dateRange=2026-10-01..2026-10-28 filters=[{dimension:page,operator:equals,expression:https://cookbook.example/blog/weeknight-dinners}]',
  fix: '需要诊断：对照 get_serp_results 前 10 名的标题',
  acceptance: ['再过 14 天，同一页面的点击高于改动前 14 天'],
  ...over,
});

/** A fake gh that records the labels it is asked to set. */
function fakeGh() {
  const labels = new Map();
  const gh = (args) => {
    if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/acme/cookbook/issues/40\n';
    if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ number: Number(args[2]), state: 'OPEN', title: 't', labels: (labels.get(args[2]) ?? []).map((name) => ({ name })) });
    if (args[0] === 'issue' && args[1] === 'edit') {
      const add = args.flatMap((a, i) => (a === '--add-label' ? [args[i + 1]] : []));
      labels.set(args[2], [...(labels.get(args[2]) ?? []), ...add]);
    }
    return '';
  };
  return { gh, labels };
}

const TYPES = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索流量\n  - `technical`：技术\n  - `pages`：页面\n');

test('a finding the effect report raises passes the findings validation and becomes an issue under the change\'s own direction', () => {
  assert.equal(rejection(finding()), null);
  const { gh, labels } = fakeGh();
  const r = apply(gh, TYPES, plan([finding(), finding({ direction: 'technical', kind: 'site-clicks-drop', targets: [] })], []));
  assert.equal(r.created.length, 2);
  assert.equal(r.untyped, false);
  assert.ok(!JSON.stringify([...labels.values()]).includes('results'), 'no type:seo/results');
});

test('there is no results direction for a finding: it would have no type:seo/results to be filed under', () => {
  assert.match(rejection(finding({ direction: 'results' })), /方向/);
});

test('a drop finding that quotes a percentage without its ratio is refused like any other', () => {
  assert.match(rejection(finding({ title: '整站点击比上一个 7 天少了 35%', ratio: undefined })), /分子分母/);
  assert.equal(rejection(finding({ title: '整站点击比上一个 7 天少了 35%', ratio: { numerator: 130, denominator: 200 } })), null);
});

test('results.json is merged like any direction\'s file and its uncollected placeholder drops out', () => {
  const md = readFileSync(join(root, 'skills', 'seo', 'seo-scan', 'references', 'merge-findings.md'), 'utf8');
  const command = md.match(/```\n(node -e '[\s\S]*?')\s+<运行目录>\s+<派出去的方向>\.\.\.\n```/)?.[1];
  assert.ok(command, 'merge-findings.md has no node -e command');
  const dir = mkdtempSync(join(tmpdir(), 'seo-merge-'));
  writeFileSync(join(dir, 'pages.json'), JSON.stringify([finding({ kind: 'low-ctr' })]));
  writeFileSync(join(dir, 'results.json'), JSON.stringify([finding()]));
  writeFileSync(join(dir, 'geo.json'), JSON.stringify([{ direction: 'geo', uncollected: '没有跟踪' }]));
  const r = spawnSync('sh', ['-c', `${command} '${dir}' pages results geo`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const merged = JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8'));
  assert.deepEqual(merged.map((f) => f.kind), ['low-ctr', 'change-no-lift']);
  assert.deepEqual(plan(merged, []).rejected, []);
});

test('a results.json whose only entry is the uncollected placeholder (no Search Console) merges to nothing, not an error', () => {
  const md = readFileSync(join(root, 'skills', 'seo', 'seo-scan', 'references', 'merge-findings.md'), 'utf8');
  const command = md.match(/```\n(node -e '[\s\S]*?')\s+<运行目录>\s+<派出去的方向>\.\.\.\n```/)[1];
  const dir = mkdtempSync(join(tmpdir(), 'seo-merge-'));
  writeFileSync(join(dir, 'results.json'), JSON.stringify([{ direction: 'results', uncollected: 'OpenSEO 项目没有连 Search Console' }]));
  const r = spawnSync('sh', ['-c', `${command} '${dir}' results`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8')), []);
});
