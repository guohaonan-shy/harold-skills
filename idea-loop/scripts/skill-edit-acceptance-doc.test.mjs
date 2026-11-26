/**
 * Tripwire — a ticket that changes skills, agent definitions or skill reference files carries three fixed acceptance
 * cells, its executor CALLS `writing-for-agents` and hands back one 杠杆 line per changed file, and the orchestrator
 * runs `dyna spec skill-edit` on the hand-back before it lands the ticket.
 *
 * Spec skill-edit-acceptance, ticket 02 (issue #311). Before: to-ticket added no cell for such tickets; the
 * implementer's step 5 sent the executor to `writing-for-agents` through CODING_STANDARDS.md's links (two hops, and
 * a hand-back that only said 「读」 was accepted); the orchestrator's landed check never looked at that line.
 * These checks pin the sentences that carry the change; the command's own behaviour is tested in dyna/internal/ledger.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const toTicket = read('skills', 'engineering', 'to-ticket', 'SKILL.md');
const implementer = read('agents', 'implementer.md');
const implement = read('skills', 'engineering', 'implement', 'SKILL.md');

test('to-ticket writes the "这类文件" rule once: SKILL.md, skills/ .md, agents/ .md, tickets excluded', () => {
  const block = section(toTicket, '改 skill 类文件的工单');
  assert.match(block, /`SKILL\.md`/, '判据缺：路径以 SKILL.md 结尾');
  assert.match(block, /`skills\/`/, '判据缺：skills/ 目录下的 .md');
  assert.match(block, /`agents\/`/, '判据缺：agents/ 目录下直接的 .md');
  assert.match(block, /`\.claude\/agents\/`/, '判据缺：.claude/agents/ 也算');
  assert.match(block, /`docs\/spec\/\*\/tickets\/`/, '判据缺：工单文件不算');
});

test('to-ticket copies the three cells into the end of the acceptance list, word for word; the third is the spec\'s own 验证 line, not the executor\'s pick', () => {
  const block = section(toTicket, '改 skill 类文件的工单');
  for (const cell of [
    '- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。',
    '- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。',
    '- [ ] 验证，照抄 spec 杠杆诊断里这处的「验证：」：<粘贴那一行>。照执行方定义「改规则的工单：怎么证明 skill 真的变了」做完，交回 `verified` 写这个文件的验证行。',
  ]) assert.ok(block.includes(cell), `三格里缺这一格：${cell.slice(0, 30)}…`);
});

test('to-ticket 第三格 copies the spec\'s 验证 per change: 判不了 stays 判不了, and a change with no 验证 stops the cutting', () => {
  const block = section(toTicket, '改 skill 类文件的工单');
  assert.match(block, /每处改动一格/, '第三格一处改动一格');
  assert.match(block, /spec 写「判不了」的照抄「判不了」/, '判不了照抄，执行方不改');
  assert.match(block, /spec 里这处没有「验证：」，停下回 spec 补，不替它选/, '没有验证就停下回 spec');
  assert.doesNotMatch(block, /选了一种证明并做完/, '第三格不再让执行方现选');
});

test('the 验证 row: rule-tickets.md names the five ways and the row; the implementer\'s hand-back carries it and points at rule-tickets.md', () => {
  const doc = read('skills', 'engineering', 'implement', 'references', 'rule-tickets.md');
  assert.match(doc, /验证 \| <文件> \| <方式> \| <用例名 \/ 检查名 \/ 原因> \| <结果>/, 'rule-tickets.md 写验证行的格式');
  for (const way of ['检查', '回放', '目标用例']) assert.ok(doc.includes(`「${way}」`), `rule-tickets.md 缺方式「${way}」`);
  for (const way of ['不改行为', '判不了']) assert.ok(doc.includes(`**${way}**`), `rule-tickets.md 缺方式「${way}」`);
  assert.match(doc, /大用例待跑/, '结果有「过」「大用例待跑」');
  assert.match(doc, /你不能自己把别的方式改成判不了/, '执行方不自己改成判不了');
  const verified = implementer.slice(implementer.indexOf('verified:'), implementer.indexOf('found:'));
  assert.match(verified, /^\s*- 验证 \| <文件> \| <方式> \| <用例名 \/ 检查名 \/ 原因> \| <结果>/m, '`verified` 要有验证行');
  const pointer = implementer.split('\n').find((l) => l.includes('怎么证明 skill 真的变了'));
  assert.match(pointer, /rule-tickets\.md/, '指针指向 rule-tickets.md');
});

test('the implementer\'s 写法规范 step names writing-for-agents directly for skill, agent definition and skill reference tickets', () => {
  const step = section(implementer, '开工前').split('\n').find((l) => l.includes('**写法规范**'));
  assert.ok(step, '「开工前」缺写法规范那一步');
  assert.match(step, /skill、agent 定义、skill 参考文件/, '第 5 步要点名这三类文件');
  assert.match(step, /用 Skill 工具调 `idea-loop:writing-for-agents`/, '第 5 步要直接用 Skill 工具调 writing-for-agents');
  assert.match(step, /读完再动手/, '要读完再动手');
});

test('implementer hand-back: a 杠杆 line per changed file, and the standards line says 调 when it called the skill', () => {
  const format = implementer.slice(implementer.indexOf('verified:'));
  const verified = format.slice(0, format.indexOf('found:'));
  assert.match(verified, /^\s*- 杠杆 \| <[^>]+> \| <[^>]+>/m, '`verified` 要有「杠杆 | <文件> | <杠杆>」这种行');
  assert.match(verified, /writing-for-agents 里的叫法/, '杠杆的叫法用 writing-for-agents 里的词');
  const std = verified.split('\n').find((l) => l.includes('读了哪几份写法规范'));
  assert.ok(std, '`verified` 要保留「读了哪几份写法规范」那一行');
  assert.match(std, /读 \/ 调/, '那一行的方式要在「读」「调」里选');
  assert.match(std, /调了的写「调」/, '调了 skill 的写「调」');
});

test('implement 核对与落地: the landed check runs dyna spec skill-edit on the saved hand-back', () => {
  const block = section(implement, '核对与落地');
  const landed = block.split('\n').find((l) => l.startsWith('| `landed`'));
  assert.ok(landed, '核对表缺 landed 那一行');
  assert.match(landed, /dyna spec skill-edit/, 'landed 的核对要跑 skill-edit 子命令');
  assert.match(landed, /\.tmp\/implement\/<spec-slug>\//, '交回原文要存进 .tmp/implement/<spec-slug>/ 下的文件');
});

test('README rows for to-ticket and implement mention the cells and the skill-edit check; the version is a valid semver', () => {
  const readme = read('README.md');
  const ticketRow = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:to-ticket`'));
  assert.ok(ticketRow, 'README 缺 to-ticket 那一行');
  assert.match(ticketRow, /three fixed acceptance cells/, 'to-ticket 行要写改 skill 类文件的工单带三格');
  const implementRow = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:implement`'));
  assert.ok(implementRow, 'README 缺 implement 那一行');
  assert.match(implementRow, /dyna spec skill-edit/, 'implement 行要写 landed 核对跑 skill-edit');
  assert.match(implementRow, /杠杆|lever/, 'implement 行要写交回里的杠杆行');
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  assert.match(plugin.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/, 'plugin.json 的 version 要是 x.y.z 或 x.y.z-<预发布> 格式');
});
