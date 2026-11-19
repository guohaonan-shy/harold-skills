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

// The seven states of an issue (`States` in dyna/internal/issues/state.go).
const STATES = ['backlog', 'triage', 'todo', 'in-progress', 'in-review', 'done', 'canceled'];
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

test('the body names every state, the five required body sections, backlog / blocked by and the commands', () => {
  for (const s of STATES) assert.match(body, new RegExp(`\\| ${s} \\|`), `state ${s}`);
  for (const h of ['## 背景', '## 问题', '## 证据', '## 影响范围', '## 从哪发现']) assert.ok(body.includes(h), h);
  assert.match(body, /先放着/);
  assert.match(body, /blocked by/);
  assert.match(body, /--comment=/);
  // the arguments are read from `--help`, not copied into the body (spec idea-loop-cli, ticket 16): the body only points there
  assert.match(body, /dyna issues --help/);
  assert.doesNotMatch(body, /^dyna issues (labels|type|show|check|set|candidates|reconcile|queues|migrate|body|priority|backlog|note) +</m, 'the command table is back');
  assert.doesNotMatch(body, /^issues open /m, 'issues open is gone');
  assert.match(body, /`dyna issues new`/, '「开一个 issue」 goes through issues new');
  assert.doesNotMatch(body, /gh issue create/);
  assert.doesNotMatch(body, /\b(advance|resume|handoff|unhandoff)\b/);
});

test('正文 marks 背景 required and explains it; 开一个 issue says five required sections and 几周后的自己和人', () => {
  const format = body.split(/^## 正文\s*$/m)[1].split(/^## blocked by/m)[0];
  assert.match(format, /^## 背景 +必填：读懂问题要先知道的机制或现状$/m);
  assert.ok(format.indexOf('## 背景') < format.indexOf('## 问题'), '背景 is the first line of the format');
  assert.ok(format.includes('读懂问题要先知道的机制或现状，写给隔了几周回来、已经忘了这一块的人：问题里第一次出现的叫法（规则名、字段、页面、命令）各用一句说清它是什么、管什么；规则或现状互相牵扯的，写出各自原文和出处。确实不需要的写『无』。'));
  const open = body.split(/^## 开一个 issue\s*$/m)[1].split(/^## /m)[0];
  assert.match(open, /校验正文五个必填节/);
  assert.doesNotMatch(open, /四个必填节/);
  assert.match(open, /写给一个没有上下文的人看，包括几周后的自己和人/);
});

test('the rollback issue the merge step opens carries a 背景 (原 issue 改的是什么、上线自查查的是什么)', () => {
  const merge = read(pluginRoot, 'skills', 'engineering', 'pr-review', 'references', 'merge.md');
  assert.match(merge, /背景：原 issue 改的是什么、上线自查查的是什么；问题：/);
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

for (const [name, file, section] of [
  ['setup template', join(pluginRoot, 'skills', 'engineering', 'setup', 'references', 'issue-tracker.md'), /^## 分类 label$/m],
  ['repo ISSUE_TRACKER.md', join(pluginRoot, '..', 'ISSUE_TRACKER.md'), /^## 仓库$/m],
]) {
  test(`${name} lists the seven states, the triage choice and its sections`, () => {
    const md = read(file);
    for (const s of STATES) assert.match(md, new RegExp(`\\| ${s} \\|`), `state ${s}`);
    assert.match(md, /^triage：/m);
    assert.match(md, section);
    for (const old of ['待验证', '验证中', '审核中', '待设计', '设计中', '待实现', '实现中', '搁置']) assert.ok(!md.includes(old), `old state ${old}`);
  });
}

test('the repo ISSUE_TRACKER.md has a choice for triage the command line can read (and does not skip triage)', () => {
  const md = read(join(pluginRoot, '..', 'ISSUE_TRACKER.md'));
  assert.doesNotMatch(md, /^triage：跳过\s*$/m);
  assert.ok(md.match(/^triage：(用|跳过)\s*$/m));
});

test('the issues SKILL.md body stays under 5000 characters; category and spec details live in its own references', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
  assert.match(body, /references\/category-and-spec\.md/);
  assert.ok(existsSync(join(skillDir, 'references', 'category-and-spec.md')));
});
