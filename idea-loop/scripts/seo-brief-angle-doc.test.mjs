/**
 * Pins the sentences that make "seo-brief and the issue session's SEO branch agree on who settles the angle"
 * true in the docs: while drafting a SEO issue's spec the angle is settled by recommendation and the basis reads
 * 「AI 照推荐定」; a human asking for a brief directly still decides it. The two places are step 4 (角度候选) and
 * step 7 (the 「需要 grill：选题角度和论点」 line), and the intro and the template heading must not contradict them.
 * Also seo-setup's body stays under 5000 characters, with what moved out reachable by a pointer.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail
 * there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');

const BRIEF = body(read('skills', 'seo', 'seo-brief', 'SKILL.md'));
const SETUP = body(read('skills', 'seo', 'seo-setup', 'SKILL.md'));

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

const SEO_BRANCH = /issue-session[^\n]*SEO 分支|SEO 分支[^\n]*issue-session/;

test('seo-brief step 4: drafting a SEO issue settles the angle by recommendation; a human asking for a brief decides it', () => {
  const s = section(BRIEF, '4\\. 判意图、类型、能补什么');
  const line = s.split('\n').find((l) => l.startsWith('- **角度候选**'));
  assert.ok(line, 'the 角度候选 line is there');
  assert.match(line, SEO_BRANCH, 'it points at the issue session\'s SEO branch');
  assert.match(line, /照推荐定/);
  assert.match(line, /AI 照推荐定/, 'the basis is written as 「AI 照推荐定」');
  assert.match(line, /人直接要[^\n]*照旧留给人定/, 'a human asking directly keeps deciding');
});

test('seo-brief step 7: the 「需要 grill：选题角度和论点」 line is answered by the SEO branch, not left for the human', () => {
  const s = section(BRIEF, '7\\. 写进去');
  const para = s.split('\n').find((l) => /需要 grill：选题角度和论点/.test(l));
  assert.ok(para, 'the 需要 grill line is still mentioned');
  assert.match(para, SEO_BRANCH);
  assert.match(para, /照推荐定/);
  assert.match(para, /AI 照推荐定/);
  assert.match(para, /人直接要[^\n]*照旧/);
});

test('seo-brief: the intro and the template heading do not say the angle is always left to the human', () => {
  const intro = BRIEF.split('\n## ')[0];
  assert.doesNotMatch(intro, /它不替人定选题角度和论点：给出候选和推荐，由人在 grill 里定。/);
  assert.match(intro, /SEO issue 起草 spec/);
  assert.ok(!/#### 角度候选（需要人定）/.test(BRIEF), 'the template heading no longer says 需要人定 unconditionally');
});

test('seo-setup: the body stays under 5000 characters, and what moved out is reachable by a pointer', () => {
  assert.ok([...SETUP].length < 5000, `${[...SETUP].length} characters`);
  for (const ref of ['issue-labels.md', 'ai-visibility.md']) {
    assert.ok(SETUP.includes(`references/${ref}`), `SKILL.md points at references/${ref}`);
    assert.ok(existsSync(path('skills', 'seo', 'seo-setup', 'references', ref)), `references/${ref} exists`);
  }
  const labels = read('skills', 'seo', 'seo-setup', 'references', 'issue-labels.md');
  for (const d of ['technical', 'pages', 'keywords', 'backlinks', 'geo']) assert.match(labels, new RegExp(`\`${d}\``));
  const tracker = read('skills', 'seo', 'seo-setup', 'references', 'ai-visibility.md');
  for (const t of ['get_ai_visibility_tracker', 'estimate_ai_visibility_cost', 'save_ai_visibility_tracker', 'set_ai_visibility_schedule', 'appendResearchLog']) {
    assert.ok(tracker.includes(t), `ai-visibility.md keeps ${t}`);
  }
});
