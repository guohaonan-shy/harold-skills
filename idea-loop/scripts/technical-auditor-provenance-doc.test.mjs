/**
 * Tripwire — technical-auditor runs the meta-provenance script after seo-baseline.mjs, and a deliberate
 * title / description change goes only into the research log, never into the findings.
 *
 * Before: step 3 put every `key-page-meta-changed` finding into the list, so a change a merged SEO PR
 * made on purpose was opened as an issue and closed as a false alarm by an issue session.
 *
 * TECHNICAL_AUDITOR points the test at another copy of the agent definition (e.g. the text before the
 * change), to see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const agent = readFileSync(process.env.TECHNICAL_AUDITOR ?? join(pluginRoot, 'agents', 'technical-auditor.md'), 'utf8');
const step3 = agent.split(/^\d+\. \*\*/m).find((s) => s.startsWith('重点页面的回退')) ?? '';

test('step 3 runs seo-meta-provenance.mjs after seo-baseline.mjs, on the baseline output and the two audit times', () => {
  const baseline = step3.indexOf('seo-baseline.mjs');
  const provenance = step3.indexOf('seo-meta-provenance.mjs');
  assert.ok(baseline >= 0, 'step 3 lost seo-baseline.mjs');
  assert.ok(provenance > baseline, 'seo-meta-provenance.mjs must come after seo-baseline.mjs');
  assert.match(step3, /completedAt/);
});

test('a deliberate change goes into the research log only, not into the findings', () => {
  assert.match(step3, /有意改动只进研究日志、不出发现/);
  assert.match(step3, /technical-intentional\.txt/);
});

test('the research-log template and the findings contract carry the line the agent writes', () => {
  const log = read('skills', 'seo', 'seo-scan', 'references', 'research-log.md');
  assert.match(log, /technical-intentional\.txt/);
  assert.match(log, /有意改动：<页面> → #<PR>/);
  assert.match(log.split('\n').slice(0, 3).join('\n'), /前两行的格式不能改/);
  assert.match(log, /^seo-scan <YYYY-MM-DD HH:MM>，方向：<方向\.\.\.>\n采集：/m);
  const findings = read('skills', 'seo', 'seo-scan', 'references', 'findings.md');
  assert.match(findings, /technical 的「有意改动」/);
});
