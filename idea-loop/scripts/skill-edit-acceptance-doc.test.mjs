/**
 * Tripwire — a ticket that changes skills, agent definitions or skill reference files carries three fixed acceptance
 * cells, its executor CALLS `writing-for-agents` and hands back one 杠杆 line per changed file, and the orchestrator
 * runs `ticket-ledger.mjs skill-edit` on the hand-back before it lands the ticket.
 *
 * Spec skill-edit-acceptance, ticket 02 (issue #311). Before: to-ticket added no cell for such tickets; the
 * implementer's step 5 sent the executor to `writing-for-agents` through CODING_STANDARDS.md's links (two hops, and
 * a hand-back that only said 「读」 was accepted); the orchestrator's landed check never looked at that line.
 * These checks pin the sentences that carry the change; the script's own behaviour is tested in ticket-ledger.test.mjs.
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

test('to-ticket copies the three cells into the end of the acceptance list, word for word', () => {
  const block = section(toTicket, '改 skill 类文件的工单');
  for (const cell of [
    '- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。',
    '- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。',
    '- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。',
  ]) assert.ok(block.includes(cell), `三格里缺这一格：${cell.slice(0, 30)}…`);
});

test('implementer step 5 names writing-for-agents directly for skill, agent definition and skill reference tickets', () => {
  const step = section(implementer, '开工前').split('\n').find((l) => l.startsWith('5. '));
  assert.ok(step, '「开工前」缺第 5 步');
  assert.match(step, /skill、agent 定义、skill 参考文件/, '第 5 步要点名这三类文件');
  assert.match(step, /用 Skill 工具调 `idea-loop:writing-for-agents`/, '第 5 步要直接用 Skill 工具调 writing-for-agents');
  assert.match(step, /读完再动手/, '要读完再动手');
  assert.match(step, /不再[^。]*转一跳/, '要说明不再经 CODING_STANDARDS.md 的链接转一跳');
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

test('implement 核对与落地: the landed check runs ticket-ledger.mjs skill-edit on the saved hand-back', () => {
  const block = section(implement, '核对与落地');
  const landed = block.split('\n').find((l) => l.startsWith('| `landed`'));
  assert.ok(landed, '核对表缺 landed 那一行');
  assert.match(landed, /ticket-ledger\.mjs skill-edit/, 'landed 的核对要跑 skill-edit 子命令');
  assert.match(landed, /\.tmp\/implement\/<spec-slug>\//, '交回原文要存进 .tmp/implement/<spec-slug>/ 下的文件');
});

test('README rows for to-ticket and implement mention the cells and the skill-edit check; the version is 0.1.15', () => {
  const readme = read('README.md');
  const ticketRow = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:to-ticket`'));
  assert.ok(ticketRow, 'README 缺 to-ticket 那一行');
  assert.match(ticketRow, /three fixed acceptance cells/, 'to-ticket 行要写改 skill 类文件的工单带三格');
  const implementRow = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:implement`'));
  assert.ok(implementRow, 'README 缺 implement 那一行');
  assert.match(implementRow, /ticket-ledger\.mjs skill-edit/, 'implement 行要写 landed 核对跑 skill-edit');
  assert.match(implementRow, /杠杆|lever/, 'implement 行要写交回里的杠杆行');
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  assert.equal(plugin.version, '0.1.15');
});
