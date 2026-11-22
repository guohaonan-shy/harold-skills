/**
 * Tripwire — OpenSEO's plan is spent by the week, and the text says so everywhere a reader would act on it.
 *
 * Spec seo-autopilot, ticket 02. Before: `SEO.md`「OpenSEO」kept a 「单次额度」 and `seo-budget.mjs` capped one
 * run at 2,000, so most of a monthly plan that does not carry over was never spent. What the text now has to
 * carry: the two new `SEO.md` items and the old key's migration (setup's SEO module and its format reference), the
 * 「份」 field on a research-log 「花费」 line, seo-scan reading the week's books and pushing what it skipped,
 * and the issue session checking its own share before it researches and writing what it spent back.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it
 * fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');

const FORMAT = read('skills', 'engineering', 'setup', 'references', 'seo', 'seo-md.md');
const SETUP = read('skills', 'engineering', 'setup', 'references', 'seo', 'steps.md');
const SCAN = body(read('skills', 'seo', 'seo-scan', 'SKILL.md'));
const LOG = read('skills', 'seo', 'seo-scan', 'references', 'research-log.md');
const BUDGET = (() => {
  try {
    return read('skills', 'seo', 'seo-scan', 'references', 'budget.md');
  } catch {
    return ''; // the text before the change has no such file: the checks on it fail instead of the whole file
  }
})();
const DRAFT = read('skills', 'engineering', 'issue-session', 'references', 'draft-spec.md');

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

test('seo-md.md: the example writes 套餐额度 and 每周分配, not 单次额度, and the format notes who reads them', () => {
  const example = FORMAT.slice(FORMAT.indexOf('```markdown'), FORMAT.indexOf('```', FORMAT.indexOf('```markdown') + 3));
  assert.match(example, /- 套餐额度：每月 \d+，每月 \d+ 日重置/);
  assert.match(example, /- 每周分配：排名追踪 \d+；扫描 technical \d+，pages \d+，keywords \d+，backlinks \d+，geo \d+，results \d+；起草与验证 \d+/);
  assert.ok(!/- 单次额度：/.test(example), 'the example still teaches the old key');
  const row = FORMAT.split('\n').find((l) => l.startsWith('| OpenSEO |'));
  assert.match(row, /套餐额度/);
  assert.match(row, /每周分配/);
  assert.ok(!/单次额度（方向名/.test(row), 'the table row still describes the old key');
});

test('seo-md.md: a section says what the three shares are and that the old 单次额度 is refused until the SEO module migrates it', () => {
  const s = section(FORMAT, '额度按周算[^\\n]*');
  assert.match(s, /排名追踪/);
  assert.match(s, /起草与验证/);
  assert.match(s, /results[^\n]*名额|名额[^\n]*results/, 'results only takes an allocation here');
  assert.match(s, /单次额度[^\n]*报错[^\n]*\/idea-loop:setup/);
  assert.match(s, /另外买的额度/);
});

test('setup SEO module: step 3 gives recommended values for the two items; the old 2,000 cap is gone', () => {
  const s = section(SETUP, '3\\. 逐节问人');
  const openseo = s.split('\n').find((l) => l.startsWith('- **OpenSEO**'));
  assert.match(openseo, /套餐额度/);
  assert.match(openseo, /每周分配/);
  assert.match(openseo, /重置日/);
  assert.ok(!/2,000/.test(openseo), 'the cap no longer exists');
  assert.match(openseo, /推荐/);
});

test('setup SEO module: an old 单次额度 is migrated into the two new items, before SEO.md is read as a whole, and the human confirms the values', () => {
  const read2 = section(SETUP, '2\\. 读现状，备推荐值');
  assert.match(read2, /单次额度[\s\S]*迁/);
  assert.ok(read2.indexOf('单次额度') < read2.indexOf('dyna seo parse <项目目录>/SEO.md'), 'the old key makes dyna seo parse refuse the file, so it is dealt with first');
  const write = section(SETUP, '4\\. 写 SEO.md');
  assert.match(write, /单次额度[\s\S]*每周分配/);
  assert.match(write, /删掉[^\n]*单次额度|单次额度[^\n]*删/);
});

test('research-log.md: the 花费 line carries a 份 field, and a line without it reads as 扫描', () => {
  assert.match(LOG, /花费：<n \| 未知> credits，余额 <n \| 未知>，份：<排名追踪 \| 扫描 \| 起草与验证>/);
  assert.match(LOG, /没有「份」[^\n]*扫描|缺省[^\n]*扫描/);
});

test('seo-scan: 预算 reads the week from the research log, says what a skipped share does, and pushes it', () => {
  const b = section(SCAN, '预算');
  assert.match(b, /dyna seo allocate[^\n]*--context[^\n]*--today/);
  assert.match(b, /--spent/);
  assert.match(b, /重新读/);
  assert.match(b, /开始余额[^\n]*第一次/);
  assert.match(b, /references\/budget\.md/);
  assert.match(b, /『推送』/);
  assert.ok(!/单次上限/.test(SCAN), 'there is no single-run cap any more');
});

test('seo-scan: the 花费 line it writes carries 份：扫描, the budget reference names the three shares, and the body stays within the 4500-character line', () => {
  assert.match(section(SCAN, '研究日志'), /份/);
  assert.match(BUDGET, /排名追踪/);
  assert.match(BUDGET, /起草与验证/);
  assert.match(BUDGET, /logKnown/);
  assert.match(BUDGET, /logSince/);
  assert.ok([...SCAN].length <= 4500, `${[...SCAN].length} characters`);
});

test('draft-spec: before SEO research the session reads its 起草与验证 share, skips what does not fit, and writes the spend back to the research log', () => {
  const line = DRAFT.split('\n').find((l) => /dyna seo allocate/.test(l));
  assert.ok(line, 'draft-spec does not call dyna seo allocate');
  assert.match(line, /起草与验证/);
  assert.match(line, /left/);
  assert.match(line, /appendResearchLog/);
  assert.match(line, /份：起草与验证/);
  assert.match(line, /『推送』/);
});
