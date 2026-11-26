/**
 * Tripwire — step 6 of setup's SEO module ("加 SEO 的 issue 分类") goes by platform.
 *
 * - The first heading of the project directory's `ISSUE_TRACKER.md` picks the way: `# Issue tracker：GitHub` runs
 *   `dyna issues labels` (unchanged), `# Issue tracker：Linear` uses the Linear MCP (`list_issue_labels` with
 *   `includeGroups: true`, `create_issue_label`), reuses what already exists, has a way out when the session has no
 *   tool that creates labels, and never names `dyna issues labels` (the command refuses Linear projects).
 * - The completion condition is written once per platform; the GitHub one keeps its meaning.
 * - `issue-labels.md` says what the six lines become on Linear: a `seo` label group with five child labels.
 *
 * SETUP_MODULE_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see the
 * checks fail on the old text first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SETUP_MODULE_DOCS_ROOT ?? join(here, '..');
const seoRefs = join(root, 'skills', 'engineering', 'setup', 'references', 'seo');
const read = (f) => readFileSync(join(seoRefs, f), 'utf8');

const STEPS = read('steps.md');
const STEP6 = STEPS.match(/^## 6\. [\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? '';
const [BEFORE_DONE, DONE = ''] = STEP6.split(/^完成条件[：:]?/m);
const GITHUB_BRANCH = BEFORE_DONE.match(/^- \*\*GitHub 项目[\s\S]*?(?=^- \*\*Linear 项目|(?![\s\S]))/m)?.[0] ?? '';
const LINEAR_BRANCH = BEFORE_DONE.match(/^- \*\*Linear 项目[\s\S]*?(?=^- \*\*GitHub 项目|(?![\s\S]))/m)?.[0] ?? '';
const doneLine = (platform) =>
  DONE.split('\n')
    .filter((l) => new RegExp(`^\\s*[-*]\\s*(?:\\*\\*)?${platform}(?:\\*\\*)?[：:]`).test(l))
    .join('\n');

test('step 6 splits by the first heading of ISSUE_TRACKER.md into a GitHub branch and a Linear branch', () => {
  assert.ok(STEP6, 'steps.md has a step 6');
  assert.match(BEFORE_DONE, /ISSUE_TRACKER\.md.{0,12}第一个标题/);
  assert.ok(GITHUB_BRANCH, 'a GitHub branch');
  assert.ok(LINEAR_BRANCH, 'a Linear branch');
  assert.match(GITHUB_BRANCH, /# Issue tracker：GitHub/);
  assert.match(LINEAR_BRANCH, /# Issue tracker：Linear/);
});

test('the six lines for the 分类 label section are added on both platforms, before the branches split', () => {
  const lead = BEFORE_DONE.slice(0, BEFORE_DONE.indexOf('- **'));
  assert.match(lead, /分类 label/);
  assert.match(lead, /\]\(issue-labels\.md\)/);
});

test('the GitHub branch still runs `dyna issues labels` and builds the six type:seo labels', () => {
  assert.match(GITHUB_BRANCH, /dyna issues labels <项目目录>\/docs/);
  assert.match(GITHUB_BRANCH, /`type:seo`/);
  assert.match(GITHUB_BRANCH, /`type:seo\/<方向>`/);
  assert.match(GITHUB_BRANCH, /多余 label 只转告人/);
});

test('the Linear branch uses the Linear MCP, reuses same-named labels, never names `dyna issues labels`, and has a way out without a label-creating tool', () => {
  assert.ok(LINEAR_BRANCH, 'a Linear branch');
  assert.doesNotMatch(LINEAR_BRANCH, /dyna issues labels/);
  assert.match(LINEAR_BRANCH, /ISSUE_TRACKER\.md.{0,6}「团队」/, 'the team comes from the 团队 section');
  assert.match(LINEAR_BRANCH, /『调用 MCP』/);
  assert.match(LINEAR_BRANCH, /`list_issue_labels`/);
  assert.match(LINEAR_BRANCH, /`includeGroups: true`/);
  assert.match(LINEAR_BRANCH, /`create_issue_label`/);
  assert.match(LINEAR_BRANCH, /`seo`.{0,3}label 组/);
  for (const d of ['technical', 'pages', 'keywords', 'backlinks', 'geo']) assert.ok(LINEAR_BRANCH.includes(`\`${d}\``), `names ${d}`);
  assert.match(LINEAR_BRANCH, /同名.{0,8}复用/);
  assert.match(LINEAR_BRANCH, /普通 label/, 'a plain label named seo is left alone');
  assert.match(LINEAR_BRANCH, /未做（原因）/);
  assert.match(LINEAR_BRANCH, /没有建 label 的工具/);
  assert.match(LINEAR_BRANCH, /「模块」行/);
});

test('the completion condition is written per platform; the GitHub one keeps its meaning, the Linear one reads the labels back', () => {
  const gh = doneLine('GitHub');
  const li = doneLine('Linear');
  assert.ok(gh, 'a GitHub completion condition');
  assert.ok(li, 'a Linear completion condition');
  assert.match(gh, /六行/);
  assert.match(gh, /`dyna issues labels` 已建出六个 `type:seo` 系列 label/);
  assert.match(li, /六行/);
  assert.match(li, /`list_issue_labels`/);
  assert.match(li, /`seo` 组和五个子 label/);
  assert.match(li, /哪个没建、为什么/);
  assert.doesNotMatch(li, /dyna issues labels/);
});

test('issue-labels.md says what the six lines become on Linear: a seo label group with five child labels', () => {
  const doc = read('issue-labels.md');
  const linear = doc.split('\n').filter((l) => /Linear/.test(l)).join('\n');
  assert.ok(linear, 'issue-labels.md mentions Linear');
  assert.match(linear, /`seo`.{0,12}label 组/);
  assert.match(linear, /五个方向.{0,8}子 label/);
  assert.match(linear, /父类/);
});
