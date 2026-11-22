/**
 * Tripwire — `seo-setup` is folded into `setup` as a module (skill-rewrite, ticket 08).
 *
 * - The `seo-setup` skill directory is gone; its steps and references live under setup's `references/seo/`, and the
 *   SKILL.md body of `setup` only asks "SEO module? yes / later" and points at `references/seo/steps.md`.
 * - Nothing in the plugin (skills, agents, READMEs) or the repository AGENTS.md still names `seo-setup`: the skills
 *   that used to say "run seo-setup" now say `/idea-loop:setup` (SEO module). `setup` is human-invoked only, so none of
 *   them tells the model to call it with the Skill tool.
 * - Every link in `setup`'s SKILL.md body and in the steps file resolves, and setup's body stays within 4500 characters.
 *
 * SETUP_MODULE_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change); ROOT_AGENTS_MD
 * at another copy of the repository AGENTS.md. Both are there to see the checks fail on the old text first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SETUP_MODULE_DOCS_ROOT ?? join(here, '..');
const agentsMd = process.env.ROOT_AGENTS_MD ?? join(here, '..', '..', 'AGENTS.md');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.md$/.test(n) ? [p] : [];
  });

const SETUP = body(read('skills', 'engineering', 'setup', 'SKILL.md'));
const seoRefs = path('skills', 'engineering', 'setup', 'references', 'seo');

test('the seo-setup skill is gone and its steps and references moved under setup/references/seo/', () => {
  assert.ok(!existsSync(path('skills', 'seo', 'seo-setup')), 'skills/seo/seo-setup still exists');
  for (const f of ['steps.md', 'seo-md.md', 'project-context.md', 'writing-images.md', 'issue-labels.md', 'pick-project.md', 'ai-visibility.md', 'daily-scan.md']) {
    assert.ok(existsSync(join(seoRefs, f)), `references/seo/${f} exists`);
  }
});

test('setup asks per module, names SEO as the module, points at the steps, and has a completion condition', () => {
  const m = SETUP.match(/^## 模块\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1];
  assert.ok(m, 'setup has a 「模块」 section');
  assert.match(m, /按模块问人要不要接/);
  assert.match(m, /\*\*SEO\*\*/);
  assert.ok(m.includes('references/seo/steps.md'));
  assert.match(m, /^完成条件：/m);
  assert.match(SETUP, /SEO 模块：接了还是「以后再说」/, 'the hand-back reports the module');
});

test('every link in setup\'s body and in the SEO steps file resolves', () => {
  for (const [, link] of SETUP.matchAll(/\]\((references\/[^)#]+)\)/g)) assert.ok(existsSync(path('skills', 'engineering', 'setup', link)), link);
  const steps = read('skills', 'engineering', 'setup', 'references', 'seo', 'steps.md');
  for (const [, link] of steps.matchAll(/\]\(([^)#:]+\.md)\)/g)) assert.ok(existsSync(join(seoRefs, link)), `steps.md links ${link}`);
  assert.ok([...SETUP].length <= 4500, `setup body is ${[...SETUP].length} characters`);
});

test('nothing in the plugin or the repository AGENTS.md names seo-setup any more', () => {
  const hits = [];
  for (const dir of ['skills', 'agents']) {
    for (const f of walk(path(dir))) if (/seo-setup/.test(readFileSync(f, 'utf8'))) hits.push(f.slice(root.length + 1));
  }
  if (/seo-setup/.test(read('README.md'))) hits.push('README.md');
  if (/seo-setup/.test(readFileSync(agentsMd, 'utf8'))) hits.push('AGENTS.md');
  assert.deepEqual(hits, []);
});

test('the skills that used to say "run seo-setup" say `/idea-loop:setup` (SEO module), and none of them calls it with the Skill tool', () => {
  const files = [
    ['seo', 'seo-audit', 'SKILL.md'], ['seo', 'seo-coach', 'SKILL.md'], ['seo', 'seo-scan', 'SKILL.md'],
    ['seo', 'seo-scan', 'references', 'opening.md'], ['seo', 'seo-scan', 'references', 'research-log.md'],
    ['seo', 'keyword-research', 'SKILL.md'], ['seo', 'keyword-clustering', 'SKILL.md'], ['seo', 'competitor-analysis', 'SKILL.md'],
    ['seo', 'seo-geo', 'SKILL.md'], ['seo', 'seo-outreach', 'references', 'prospecting.md'], ['seo', 'seo-outreach', 'SKILL.md'],
  ];
  for (const f of files) {
    const text = read('skills', ...f);
    assert.match(text, /idea-loop:setup|SEO 模块/, `${f.join('/')} points at setup's SEO module`);
    assert.doesNotMatch(text, /Skill 工具调 `idea-loop:setup`/, `${f.join('/')}: setup is human-invoked, the model cannot call it`);
  }
});

test('the repository AGENTS.md no longer lists seo-setup among the human-invoked skills, and names where the daily scan task comes from', () => {
  const doc = readFileSync(agentsMd, 'utf8');
  const item = doc.split('\n').find((l) => /^\s*1\. \*\*调用方式按出口定\*\*/.test(l)) ?? '';
  assert.ok(item, 'item 1 of the idea-loop exceptions is there');
  assert.match(item, /`setup` \/ `agent-builder` 设 `disable-model-invocation: true`/);
  assert.match(item, /`setup` 的 SEO 模块建的每天定时任务/);
});
