/**
 * Tripwire — an unattended geo scan may spend, inside the share it was given.
 *
 * Spec seo-autopilot, ticket 02, review round 1 S1 (the human's call, 2026-11-16). Before: seo-geo's unattended
 * branch only read results the tracker already had and "never started a paid check", geo-analyst said the same,
 * seo-setup recommended `geo 0` and wrote `geo 0` in its example. What the text now has to carry: on an existing
 * tracker the unattended branch estimates first and starts the paid check only when the estimate is within the run's
 * 「本次额度」 (over it: not run, said in the hand-back); the spend is booked in the scan share; with no tracker it still
 * does not build one (a standing plan is the human's call in seo-setup); seo-setup recommends and shows a non-zero geo.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');

const GEO = body(read('skills', 'seo', 'seo-geo', 'SKILL.md'));
const ANALYST = body(read('agents', 'geo-analyst.md'));
const SETUP = body(read('skills', 'seo', 'seo-setup', 'SKILL.md'));
const VISIBILITY = read('skills', 'seo', 'seo-setup', 'references', 'ai-visibility.md');
const FORMAT = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
const README = read('README.md');
const SEO_README = read('skills', 'seo', 'README.md');

/** The unattended cell of the 两支 table row that starts with `| <label> |`. */
function unattendedCell(label) {
  const row = GEO.split('\n').find((l) => l.startsWith(`| ${label} |`));
  assert.ok(row, `seo-geo: no 「${label}」 row in the 两支 table`);
  return row.split('|').map((c) => c.trim()).filter(Boolean)[2];
}

test('seo-geo: unattended with a tracker, the paid check is estimated first and runs only within 本次额度', () => {
  const c = unattendedCell('花钱');
  assert.match(c, /run_ai_visibility_check/);
  assert.match(c, /估价/);
  assert.match(c, /不超过[^|]*本次额度/);
  assert.match(c, /超了不跑[^|]*交回/, 'over the share: not run, and the hand-back says so');
  assert.ok(!/不发起任何付费检查/.test(c), 'the old 「never starts a paid check」 is still there');
});

test('seo-geo: the unattended spend is booked in the scan share, and no tracker still means no new tracker', () => {
  assert.match(GEO, /花费[^\n]*「?扫描」?份|「?扫描」?份[^\n]*花费/);
  const c = unattendedCell('没有跟踪');
  assert.match(c, /不(替人)?建跟踪/);
  assert.match(c, /seo-setup/);
});

test('geo-analyst: the 做 step lets the paid check run within 本次额度, tells it to stop over it, and keeps no tracker = no tracker', () => {
  const step = ANALYST.split('\n').find((l) => l.startsWith('1. **分析**'));
  assert.ok(step, 'geo-analyst: no step 1 「分析」');
  assert.ok(!/不发起新的付费检查/.test(step), 'the old 「no new paid check」 is still there');
  assert.match(step, /估价[^。]*不超过[^。]*本次额度/);
  assert.match(step, /超了不跑[^。]*交回/);
  assert.match(step, /不建跟踪/);
});

test('seo-setup: step 3 recommends geo like the other directions, step 7 no longer says the scan spends nothing', () => {
  const item = SETUP.split('\n').find((l) => l.startsWith('- **OpenSEO**'));
  assert.ok(item, 'seo-setup: no OpenSEO item in step 3');
  assert.ok(!/`geo` 推荐 0/.test(item), 'step 3 still recommends geo 0');
  assert.match(item, /geo[^。；]*平分|平分[^。；]*geo/);
  const s7 = SETUP.slice(SETUP.indexOf('## 7. AI 可见性跟踪'));
  assert.ok(!/不花钱/.test(s7), 'step 7 still says the scan spends nothing');
  assert.match(s7, /估价[^。]*不超过[^。]*额度/);
  assert.match(s7, /不替人建/);
  assert.ok(!/不花钱/.test(VISIBILITY), 'ai-visibility.md still says the scan spends nothing');
});

test('seo-md.md: the example gives geo a non-zero allocation', () => {
  const example = FORMAT.slice(FORMAT.indexOf('```markdown'), FORMAT.indexOf('```', FORMAT.indexOf('```markdown') + 3));
  const m = example.match(/geo (\d+)/);
  assert.ok(m, 'the example has no geo allocation');
  assert.ok(Number(m[1]) > 0, 'the example still shows geo 0');
});

test('both READMEs: geo-analyst may start a paid check on an existing tracker, within its share', () => {
  assert.match(README, /`geo-analyst` may start a paid[\s\S]{0,200}within its share/);
  assert.match(SEO_README, /geo[^|\n]*估价[^|\n]*额度|估价[^|\n]*额度[^|\n]*geo/);
});
