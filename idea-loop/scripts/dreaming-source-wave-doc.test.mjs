/**
 * Tripwire — the design archive's source wave (the half of the reconcile that needs no browser:
 * code paths, references, routes) belongs to the ui-reviewer's reconcile mode, not to dreaming itself.
 *
 * Spec canvas-truth-dreaming-agents, implementation decision 6 (changed in PR review round 1, S3):
 * dreaming only collects the `档案对象` rows the reviewer hands back; the whole-site initial scan stays in dreaming.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const reviewer = read('agents', 'ui-reviewer.md');
const dreaming = read('skills', 'productivity', 'dreaming', 'SKILL.md');

test('the reconcile mode of ui-reviewer carries the source wave and returns 档案对象 rows', () => {
  const reconcile = section(reviewer, '对账模式');
  assert.match(reconcile, /源码波/);
  for (const d of ['改代码路径', '删对象', '补扫页面', '标进入方式过期']) {
    assert.ok(reconcile.includes(d), `reconcile mode does not name the 档案对象 disposition ${d}`);
  }
  assert.match(reconcile, /sourceWave/);
});

test('dreaming does not run the source wave itself: its mechanical-check step is the missed-archive check only', () => {
  const flow = section(dreaming, '流程：两段，中间停在人身上');
  const step2 = flow.split('\n').filter((l) => /^2\. /.test(l) || /^ {3}- /.test(l)).join('\n');
  assert.ok(step2.length > 0, 'could not find the mechanical-check step');
  assert.doesNotMatch(step2, /源码波/);
});

test('dreaming hands the source wave to the ui-reviewer row and keeps the whole-site initial scan', () => {
  const flow = section(dreaming, '流程：两段，中间停在人身上');
  const reviewerRow = flow.split('\n').find((l) => l.includes('idea-loop:ui-reviewer')) ?? '';
  assert.match(reviewerRow, /源码波/);
  assert.match(flow, /initial-scan\.md/);
});
