/**
 * The results direction (效果报告): its findings are ordinary findings filed under the direction of the change they
 * are about, so they merge through the same file convention as every other direction's. (That they pass the same
 * validation and become issues with an ordinary `type:seo/<direction>` label, with no `type:seo/results`, is
 * `dyna seo file-issues`' own test, in dyna/internal/seo.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

const mergeCommand = () => {
  const md = readFileSync(join(root, 'skills', 'seo', 'seo-scan', 'references', 'merge-findings.md'), 'utf8');
  const command = md.match(/```\n(node -e '[\s\S]*?')\s+<运行目录>\s+<派出去的方向>\.\.\.\n```/)?.[1];
  assert.ok(command, 'merge-findings.md has no node -e command');
  return command;
};

test('results.json is merged like any direction\'s file and its uncollected placeholder drops out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-merge-'));
  writeFileSync(join(dir, 'pages.json'), JSON.stringify([finding({ kind: 'low-ctr' })]));
  writeFileSync(join(dir, 'results.json'), JSON.stringify([finding()]));
  writeFileSync(join(dir, 'geo.json'), JSON.stringify([{ direction: 'geo', uncollected: '没有跟踪' }]));
  const r = spawnSync('sh', ['-c', `${mergeCommand()} '${dir}' pages results geo`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const merged = JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8'));
  assert.deepEqual(merged.map((f) => f.kind), ['low-ctr', 'change-no-lift']);
});

test('a results.json whose only entry is the uncollected placeholder (no Search Console) merges to nothing, not an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-merge-'));
  writeFileSync(join(dir, 'results.json'), JSON.stringify([{ direction: 'results', uncollected: 'OpenSEO 项目没有连 Search Console' }]));
  const r = spawnSync('sh', ['-c', `${mergeCommand()} '${dir}' results`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8')), []);
});
