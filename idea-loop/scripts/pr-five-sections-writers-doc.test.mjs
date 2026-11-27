/**
 * Tripwire — the writers of the PR description follow the five sections (spec pr-five-sections, ticket 03).
 *
 * The PR description has five sections: 问题, 概要, 证据, 合并风险, 要你做的事 (plus 上线自查的网址 for SEO).
 * 「参考」, 「夜里替你定的」 and 「等你定的」 are gone. Before: implement filled the `reference` section at the start of
 * a run and updated its execution record at every stop, the night mode wrote the two night sections, the morning
 * summary counted the 「夜里替你定的」 lines in the PR description. These checks pin that none of those four files
 * names the removed sections any more, that the implementer does the same operation on both branches for every
 * problem and hands the result back, and that home's fixed text writes a question as problem · options · recommendation.
 * Whether a model follows them is not decided here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');

const removedNames = /夜里替你定的|等你定的|night-decided|night-waiting|`reference`|`summary`|`changes`|`verification`|`rollback`/;

test('implement (SKILL.md and its references), the implementer definition, night mode and the morning summary no longer name the removed PR description sections', () => {
  const files = {
    'implement/SKILL.md': read('skills', 'engineering', 'implement', 'SKILL.md'),
    'implement/references/start-of-run.md': read('skills', 'engineering', 'implement', 'references', 'start-of-run.md'),
    'implement/references/stop-and-resume.md': read('skills', 'engineering', 'implement', 'references', 'stop-and-resume.md'),
    'agents/implementer.md': read('agents', 'implementer.md'),
    'issue-session/references/night-mode.md': read('skills', 'engineering', 'issue-session', 'references', 'night-mode.md'),
    'issue-dispatch/references/morning-summary.md': read('skills', 'engineering', 'issue-dispatch', 'references', 'morning-summary.md'),
  };
  for (const [name, text] of Object.entries(files)) {
    assert.doesNotMatch(text, removedNames, `${name} still names a removed PR description section`);
  }
});

test('the start of a run no longer fills a PR description section, and a stop only pushes: the work table and execution record stay in the review loop file', () => {
  const start = read('skills', 'engineering', 'implement', 'references', 'start-of-run.md');
  const section = start.slice(start.indexOf('## 开工：先开 PR'), start.indexOf('## 会话断了'));
  assert.doesNotMatch(section, /dyna pr body set/, 'the start of a run does not write the PR description');
  const stop = read('skills', 'engineering', 'implement', 'references', 'stop-and-resume.md');
  assert.match(stop, /^3\. 推送。$/m);
  assert.match(stop, /工单表和执行记录只留在这个文件里，不写进 PR 描述/);
});

test('the implementer does the same operation on the base branch and on its own branch for every problem, and hands both results back', () => {
  const def = body(read('agents', 'implementer.md'));
  const line = def.split('\n').find((l) => l.includes('在基准分支和本分支各做一遍同一个操作')) ?? '';
  assert.ok(line, 'the definition has no line about the two-sided operation');
  assert.match(line, /问题陈述/, 'it says which problems: the ones in the spec');
  assert.match(line, /写进交回的 `verified`/, 'it says where the two results go');
  assert.match(def, /基准分支 \/ 本分支各做一遍 \| 之前：<看到什么>；之后：<看到什么>/, 'the hand-back template has the line');
  assert.match(def, /PR 的基准分支名/, 'the caller gives the base branch');
  const dispatch = read('skills', 'engineering', 'implement', 'SKILL.md');
  assert.match(dispatch, /起点 SHA、集成分支名、PR 的基准分支名/, 'implement hands the base branch to the executor');
});

test('night mode notes what it settles in the review loop file and lists it in the report to the human, and writes a stop into a comment on the issue', () => {
  const night = read('skills', 'engineering', 'issue-session', 'references', 'night-mode.md');
  assert.match(night, /按推荐定的，记进 review loop 文件的批示，也列进下一份交给人的汇报/);
  assert.match(night, /在 issue 上留一条评论（`dyna issues note`）/);
});

test('the morning summary reads the latest round of the review loop file and counts the settled-by-recommendation lines', () => {
  const morning = read('skills', 'engineering', 'issue-dispatch', 'references', 'morning-summary.md');
  assert.match(morning, /review loop 文件[^\n]*最近一轮的 review 结论/);
  assert.match(morning, /批示写着「夜间模式，人不在，按推荐」的条数/);
});

test('home\'s fixed text writes a question as problem (with a view), options (cost, can it be taken back) and recommendation', () => {
  const rules = read('skills', 'engineering', 'setup', 'references', 'home-rules.md');
  const start = rules.indexOf('- **要我定的事写成一道题**');
  assert.ok(start >= 0, 'the question bullet is missing');
  const bullet = rules.slice(start, rules.indexOf('\n\n', start));
  const parts = bullet.split('\n').filter((l) => l.startsWith('  - '));
  assert.equal(parts.length, 4, 'four parts: problem, options, recommendation, and the sub-item for what was decided for the human');
  assert.match(parts[0], /^  - \*\*问题\*\*/);
  assert.match(parts[0], /视图/);
  assert.match(parts[0], /`idea-loop:evidence`/, 'which view to use is decided by evidence');
  assert.match(parts[1], /^  - \*\*选项\*\*/);
  assert.match(parts[1], /代价/);
  assert.match(parts[1], /能否撤回/);
  assert.match(parts[2], /^  - \*\*推荐\*\*/);
  assert.match(parts[3], /^  - \*\*替我定掉、交给我的\*\*/);
  assert.match(bullet, /实现卡住停下的/);
  assert.match(bullet, /review 里要我决定的/);
});
