/**
 * Tripwire — an unattended geo scan may spend, inside the share it was given.
 *
 * Spec seo-autopilot, ticket 02, review round 1 S1 (the human's call, 2026-11-16). Before: seo-geo's unattended
 * branch only read results the tracker already had and "never started a paid check", geo-analyst said the same,
 * the SEO module recommended `geo 0` and wrote `geo 0` in its example. What the text now has to carry: on an existing
 * tracker the unattended branch estimates first and starts the paid check only when the estimate is within the run's
 * 「本次额度」 (over it: not run, said in the hand-back); the spend is booked in the scan share; with no tracker it still
 * does not build one (a standing plan is the human's call in the SEO module); the SEO module recommends and shows a non-zero geo.
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
const SETUP = read('skills', 'engineering', 'setup', 'references', 'seo', 'steps.md');
const VISIBILITY = read('skills', 'engineering', 'setup', 'references', 'seo', 'ai-visibility.md');
const FORMAT = read('skills', 'engineering', 'setup', 'references', 'seo', 'seo-md.md');
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
  assert.match(c, /SEO 模块/);
});

test('geo-analyst: the 做 step lets the paid check run within 本次额度, tells it to stop over it, and keeps no tracker = no tracker', () => {
  const step = ANALYST.split('\n').find((l) => l.startsWith('1. **分析**'));
  assert.ok(step, 'geo-analyst: no step 1 「分析」');
  assert.ok(!/不发起新的付费检查/.test(step), 'the old 「no new paid check」 is still there');
  assert.match(step, /估价[^。]*不超过[^。]*本次额度/);
  assert.match(step, /超了不跑[^。]*交回/);
  assert.match(step, /不建跟踪/);
});

test('setup SEO module: step 3 recommends geo like the other directions, step 7 no longer says the scan spends nothing', () => {
  const item = SETUP.split('\n').find((l) => l.startsWith('- **OpenSEO**'));
  assert.ok(item, 'setup SEO module: no OpenSEO item in step 3');
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

/**
 * Review round 2 S1 (the human's call, 2026-11-16: "S1 选 A"). Migrating an old 「单次额度」: every direction's number is
 * copied into 「扫描」 except a `geo` whose old value is 0 (it used to be barred from spending) — that one gets the
 * recommended value (the average of the scan share's other directions), confirmed with the human together with the
 * other values. The three places that state the migration have to say the same thing.
 */
const MIGRATION = {
  'steps.md, step 2': () => SETUP.split('\n').find((l) => l.includes('还是旧的「单次额度」')),
};

test('migration: the migration rule is stated once, in step 2; step 3 and the format file point at it', () => {
  assert.match(SETUP.split('\n').find((l) => l.startsWith('- **OpenSEO**')), /从旧「单次额度」迁来的[^。]*第 2 步/);
  assert.match(FORMAT.split('\n').find((l) => l.startsWith('- 旧的 `单次额度` 键')), /迁法在 SEO 模块的「读现状，备推荐值」/);
});

for (const [where, pick] of Object.entries(MIGRATION)) {
  test(`migration (${where}): an old geo of 0 is not copied; it gets the average of the other directions as its recommendation`, () => {
    const line = pick();
    assert.ok(line, `${where}: the migration sentence is missing`);
    assert.match(line, /geo[^。；]*(是|为) ?0|0[^。；]*geo/, 'does not single out a geo whose old value is 0');
    assert.match(line, /不(照)?(搬|抄)|例外/, 'does not say the 0 is not copied');
    assert.match(line, /平均/, 'does not say the replacement is the average of the other directions');
    assert.match(line, /其余方向|其他方向|别的方向/, 'does not say the average is over the other directions');
  });
}

test('migration: the geo recommendation is confirmed by the human before it is written, like the other two shares', () => {
  const line = MIGRATION['steps.md, step 2']();
  assert.match(line, /经人确认才写/);
  assert.match(line, /其余方向[^。；]*照搬|照搬[^。；]*其余方向|其余[^。；]*照旧/, 'does not keep the other directions copied as before');
});
