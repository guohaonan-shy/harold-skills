/**
 * Tripwire — the `issues` skill is the one place the issue entity is written down: seven states, who flips
 * them, the body format, backlog / blocked by, the script commands, and one reference per platform. The
 * `spec-status` skill is gone. The tracker template setup writes and the repo's own ISSUE_TRACKER.md both
 * carry the seven states, the triage choice and the 「仓库」 section.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRepos, skipsTriage, STATES } from './issues.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'engineering', 'issues');
const read = (...p) => readFileSync(join(...p), 'utf8');
const skill = read(skillDir, 'SKILL.md');
const body = skill.split(/^---\s*$/m).slice(2).join('---');

test('skill issues exists and spec-status does not', () => {
  assert.ok(existsSync(join(skillDir, 'SKILL.md')));
  assert.ok(!existsSync(join(pluginRoot, 'skills', 'engineering', 'spec-status')));
});

test('description only routes: one line, no state list or command', () => {
  const description = skill.match(/^description: (.+)$/m)[1];
  assert.ok(description.length < 100, description);
  assert.doesNotMatch(description, /backlog|triage|issues\.mjs/);
});

test('the body names every state, the four required body sections, backlog / blocked by and the commands', () => {
  for (const s of STATES) assert.match(body, new RegExp(`\\| ${s} \\|`), `state ${s}`);
  for (const h of ['## 问题', '## 证据', '## 影响范围', '## 从哪发现']) assert.ok(body.includes(h), h);
  assert.match(body, /先放着/);
  assert.match(body, /blocked by/);
  assert.match(body, /--comment=/);
  for (const c of ['labels', 'type', 'show', 'check', 'set', 'candidates', 'reconcile', 'queues', 'migrate', 'new', 'body', 'priority', 'backlog', 'note']) {
    assert.match(body, new RegExp(`^issues ${c} `, 'm'), `command ${c}`);
  }
  assert.doesNotMatch(body, /^issues open /m, 'issues open is gone');
  assert.match(body, /`issues new`/, '「开一个 issue」 goes through issues new');
  assert.doesNotMatch(body, /gh issue create/);
  assert.doesNotMatch(body, /\b(advance|resume|handoff|unhandoff)\b/);
});

test('each platform reference states status, type, module and how a PR attaches to the issue', () => {
  const github = read(skillDir, 'references', 'github.md');
  const linear = read(skillDir, 'references', 'linear.md');
  for (const text of [github, linear]) {
    for (const word of ['状态', '类型', '模块', '挂着的 PR']) assert.ok(text.includes(word), word);
  }
  assert.match(github, /Refs <owner>\/<repo>#<号>/);
  assert.match(linear, /\[<号>\]/);
  assert.match(linear, /Linear: <号>/);
  assert.match(body, /references\/github\.md/);
  assert.match(body, /references\/linear\.md/);
});

for (const [name, file] of [
  ['setup template', join(pluginRoot, 'skills', 'engineering', 'setup', 'references', 'issue-tracker.md')],
  ['repo ISSUE_TRACKER.md', join(pluginRoot, '..', 'ISSUE_TRACKER.md')],
]) {
  test(`${name} lists the seven states, the triage choice and the 仓库 section`, () => {
    const md = read(file);
    for (const s of STATES) assert.match(md, new RegExp(`\\| ${s} \\|`), `state ${s}`);
    assert.match(md, /^triage：/m);
    assert.match(md, /^## 仓库$/m);
    for (const old of ['待验证', '验证中', '审核中', '待设计', '设计中', '待实现', '实现中', '搁置']) assert.ok(!md.includes(old), `old state ${old}`);
  });
}

test('the repo ISSUE_TRACKER.md has a choice for triage and a first repository the scripts can read', () => {
  const md = read(join(pluginRoot, '..', 'ISSUE_TRACKER.md'));
  assert.equal(skipsTriage(md), false);
  assert.ok(md.match(/^triage：(用|跳过)\s*$/m));
  assert.equal(parseRepos(md, 'owner')[0], 'guohaonan-shy/harold-skills');
});

test('the issues SKILL.md body stays under 5000 characters; category and spec details live in its own references', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
  assert.match(body, /references\/category-and-spec\.md/);
  assert.ok(existsSync(join(skillDir, 'references', 'category-and-spec.md')));
});
