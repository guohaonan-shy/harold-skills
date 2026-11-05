/**
 * Tripwire — issues on Linear are read and written through the Linear MCP, and the skills say so in one place.
 * `references/linear.md` names the MCP tools and `issues check --from`; setup asks which platform the issues are
 * on and has a Linear template; session, dispatch and triage point at linear.md instead of repeating tool
 * parameters; retro opens plugin issues through `issues new --repo`. Whether a session follows the wording is
 * left to the dogfood on a real Linear team.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformOf } from './issues.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const eng = (...p) => read('skills', 'engineering', ...p);
const linear = eng('issues', 'references', 'linear.md');

test('linear.md names every MCP tool it relies on, with no connection prefix, and gates flips with check --from', () => {
  for (const tool of ['get_issue', 'list_issues', 'save_issue', 'save_comment', 'list_comments', 'list_issue_statuses', 'list_issue_labels', 'list_teams', 'get_team']) {
    assert.ok(linear.includes(`\`${tool}\``), `linear.md does not name ${tool}`);
  }
  assert.doesNotMatch(linear, /mcp__|[0-9a-f]{8}-[0-9a-f]{4}-/, 'tool names carry no prefix');
  assert.match(linear, /issues check <docs> <要翻成的状态> <号> --from=/);
  assert.match(linear, /issues body/);
  assert.match(linear, /不手翻 in-review、done/);
  for (const row of ['P0 | 1', 'P1 | 2', 'P2 | 3']) assert.ok(linear.includes(row), `priority map ${row}`);
  assert.match(linear, /ISSUE_TRACKER\.md/);
});

test('issues SKILL: GitHub by script, Linear by MCP; the old 「脚本还不接」 is gone', () => {
  const md = eng('issues', 'SKILL.md');
  assert.match(md, /Linear 用 MCP/);
  assert.match(md, /`issues check`/);
  assert.doesNotMatch(md, /脚本还不接/);
  assert.doesNotMatch(linear, /脚本还不接/);
});

test('setup asks which platform the issues are on, surveys it, and has a Linear template and branch', () => {
  const questions = eng('setup', 'references', 'questions.md');
  assert.match(questions, /issue 在哪个平台/);
  assert.match(questions, /Linear/);
  assert.match(eng('setup', 'references', 'survey.md'), /issue 在哪个平台/);
  const tpl = eng('setup', 'references', 'issue-tracker-linear.md');
  assert.equal(platformOf(tpl), 'linear', 'the template names Linear in its first heading');
  assert.match(tpl, /^triage：用 \/ 跳过$/m);
  assert.match(tpl, /^## 仓库$/m);
  assert.match(tpl, /Linear: <号>/);
  assert.match(tpl, /Urgent/);
  const md = eng('setup', 'SKILL.md');
  assert.match(md, /issue-tracker-linear\.md/);
  assert.match(md, /linear-setup\.md/);
  assert.match(md, /跳过下面的 `issues labels` 与 `migrate`/);
  assert.match(md, /issue-tracker\.md\]/, 'the file table still lists the GitHub template');
  const steps = eng('setup', 'references', 'linear-setup.md');
  assert.match(steps, /claude mcp add --transport http --scope user linear https:\/\/mcp\.linear\.app\/mcp/);
  assert.match(steps, /Connectors/);
  for (const tool of ['list_teams', 'list_issue_statuses', 'get_team', 'list_issue_labels']) assert.ok(steps.includes(tool), tool);
  assert.match(steps, /人确认再写/);
});

test('session, dispatch and triage (skill and agent) each point at the issues skill\'s Linear way; none repeats tool parameters', () => {
  for (const [name, md] of [
    ['issue-session', eng('issue-session', 'SKILL.md')],
    ['issue-dispatch', eng('issue-dispatch', 'SKILL.md')],
    ['issue-triage', eng('issue-triage', 'SKILL.md')],
    ['issue-triager', read('agents', 'issue-triager.md')],
  ]) {
    assert.match(md, /`idea-loop:issues` 的 Linear 做法/, `${name} does not point at the issues skill's Linear way`);
    assert.doesNotMatch(md, /references\/linear\.md/, `${name} reads another skill's private reference`);
    assert.doesNotMatch(md, /includeRelations|addLabels|removeLabels|orderBy/, `${name} repeats tool parameters`);
  }
  assert.match(eng('issue-dispatch', 'SKILL.md'), /Linear 项目跳过 `issues labels` 与 `issues reconcile`/);
  assert.match(eng('issue-session', 'SKILL.md'), /issues check <docs> <状态> <号> --from=<现在>/);
});

test('retro opens plugin issues through issues new --repo, not gh issue create', () => {
  const md = read('skills', 'productivity', 'retro', 'SKILL.md');
  assert.match(md, /issues new … --repo=/);
  assert.doesNotMatch(md, /gh issue create -R/);
});

test('README says Linear is supported through the MCP', () => {
  const md = read('README.md');
  assert.match(md, /Linear MCP/);
  assert.match(md, /Issues on Linear/);
});
