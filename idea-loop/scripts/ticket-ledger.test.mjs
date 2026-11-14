import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSkillEdit, isSkillEditFile, parseHandback, parseLog, skillEditFiles, ticketOf } from './ticket-ledger.mjs';

test('ticketOf: Ticket line in the same paragraph as the attribution', () => {
  const msg = 'feat: a thing\n\nbody\n\nTicket: 01-pr-review-rule-dispositions\nCo-Authored-By: Claude <noreply@anthropic.com>\n';
  assert.equal(ticketOf(msg), '01-pr-review-rule-dispositions');
});

test('ticketOf: attribution appended as its own paragraph after a blank line still counts', () => {
  const msg = 'fix: a thing\n\nbody\n\nTicket: 03-implement-pause-rules\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n';
  assert.equal(ticketOf(msg), '03-implement-pause-rules');
});

test('ticketOf: no Ticket line, a wip commit, or the word inside prose → null', () => {
  assert.equal(ticketOf('wip(02): stopped at the API test\n'), null);
  assert.equal(ticketOf('docs: mention the Ticket: 01-x line in prose\n'), null);
  assert.equal(ticketOf('docs(tickets): 01 — review 第 1 轮 S2\n'), null);
  assert.equal(ticketOf(''), null);
});

test('parseLog: keeps commits that name a ticket, in order, with their sha', () => {
  const raw = [
    'aaa111\x1ffeat: one\n\nTicket: 01-alpha\nCo-Authored-By: X\n\x1e',
    '\nbbb222\x1fdocs(tickets): 01 — review\n\nCo-Authored-By: X\n\x1e',
    '\nccc333\x1ffix: two\n\nTicket: 02-beta\n\nCo-Authored-By: X\n\x1e',
  ].join('');
  assert.deepEqual(parseLog(raw), [
    { sha: 'aaa111', ticket: '01-alpha' },
    { sha: 'ccc333', ticket: '02-beta' },
  ]);
});

test('parseLog: empty log → empty list', () => {
  assert.deepEqual(parseLog(''), []);
});

// ---- skill-edit: a ticket that changes skills, agent definitions or skill references must hand back
// ---- a `调 writing-for-agents` line and one 杠杆 line per changed file.

// The files commit 2be5d8e changed (a ticket that rewrote pr-review's SKILL.md).
const FILES_2BE5D8E = [
  'docs/spec/test-layering-ci-full/tickets/01-test-layering-ci-full.md',
  'idea-loop/scripts/pr-review-slim-doc.test.mjs',
  'idea-loop/skills/engineering/pr-review/SKILL.md',
];

// The hand-back around the one line quoted from that executor's real return (spec skill-edit-acceptance, 「问题陈述」2).
const HANDBACK_2BE5D8E = [
  'status: landed',
  'ticket: 01-test-layering-ci-full',
  'verified:',
  '  - 字数测试改成棘轮 | 单元 | 绿',
  '  - 跑了哪些测试 | 单元 | idea-loop/scripts/pr-review-slim-doc.test.mjs，全量交给 CI',
  '  - 读了哪几份写法规范 | 读 | 工单里 writing-for-agents 的规则原文（已在工单 C1 一格引用）',
  'found:',
  '  - 无',
].join('\n');

const HANDBACK_FIXED = HANDBACK_2BE5D8E.replace(
  '  - 读了哪几份写法规范 | 读 | 工单里 writing-for-agents 的规则原文（已在工单 C1 一格引用）',
  [
    '  - 读了哪几份写法规范 | 调 | writing-for-agents',
    '  - 杠杆 | idea-loop/skills/engineering/pr-review/SKILL.md | 剪枝：恢复被字数压掉的范围外原句，不为守上限删句',
  ].join('\n'),
);

test('isSkillEditFile: SKILL.md, any .md under a skills/ directory, a .md directly under agents/ (also .claude/agents/)', () => {
  for (const p of [
    'idea-loop/skills/engineering/pr-review/SKILL.md',
    'SKILL.md',
    'idea-loop/skills/engineering/implement/references/stop-and-resume.md',
    'skills/foo/references/deep/cases.md',
    'idea-loop/agents/implementer.md',
    '.claude/agents/reviewer.md',
  ]) assert.equal(isSkillEditFile(p), true, p);
});

test('isSkillEditFile: ticket files, scripts, AGENTS.md, nested agents/ files, non-md do not count', () => {
  for (const p of [
    'docs/spec/test-layering-ci-full/tickets/01-test-layering-ci-full.md',
    'docs/spec/skill-edit-acceptance/tickets/SKILL.md',
    'idea-loop/scripts/ticket-ledger.mjs',
    'idea-loop/skills/engineering/pr-review/scripts/x.mjs',
    'AGENTS.md',
    'idea-loop/AGENTS.md',
    'idea-loop/README.md',
    'idea-loop/agents/notes/implementer.md',
    'idea-loop/agents/implementer.mjs',
    'docs/skills-overview.md',
  ]) assert.equal(isSkillEditFile(p), false, p);
});

test('skillEditFiles keeps only the files that count, in order', () => {
  assert.deepEqual(skillEditFiles(FILES_2BE5D8E), ['idea-loop/skills/engineering/pr-review/SKILL.md']);
});

test('parseHandback reads the standards line and the lever lines, with or without a leading dash', () => {
  const got = parseHandback([
    '  - 读了哪几份写法规范 | 调 | writing-for-agents, CODING_STANDARDS.md',
    '杠杆 | `idea-loop/agents/implementer.md` | 上下文指针',
    '  - 杠杆 | idea-loop/skills/a/SKILL.md | 渐进披露 | 分支挪进参考',
    '  - 杠杆 | idea-loop/skills/b/SKILL.md |',
  ].join('\n'));
  assert.deepEqual(got.standards, { method: '调', names: 'writing-for-agents, CODING_STANDARDS.md' });
  assert.deepEqual(got.levers, [
    { file: 'idea-loop/agents/implementer.md', lever: '上下文指针' },
    { file: 'idea-loop/skills/a/SKILL.md', lever: '渐进披露 | 分支挪进参考' },
    { file: 'idea-loop/skills/b/SKILL.md', lever: '' },
  ]);
  assert.deepEqual(parseHandback('status: landed'), { standards: null, levers: [] });
});

test('2be5d8e: read-only standards line and no lever row for pr-review SKILL.md → two reasons', () => {
  const reasons = checkSkillEdit({ files: FILES_2BE5D8E, handback: HANDBACK_2BE5D8E });
  assert.equal(reasons.length, 2, reasons.join('\n'));
  assert.match(reasons[0], /调/);
  assert.match(reasons[1], /idea-loop\/skills\/engineering\/pr-review\/SKILL\.md/);
  assert.match(reasons[1], /杠杆/);
});

test('same commit, hand-back says 调 · writing-for-agents and carries the lever row → passes', () => {
  assert.deepEqual(checkSkillEdit({ files: FILES_2BE5D8E, handback: HANDBACK_FIXED }), []);
});

test('a commit that only touches a script and ticket files passes whatever the hand-back says', () => {
  const files = ['idea-loop/scripts/ticket-ledger.mjs', 'docs/spec/x/tickets/02-y.md'];
  assert.deepEqual(checkSkillEdit({ files, handback: '' }), []);
});

test('agent definition, skill reference and .claude/agents files each need their own lever row', () => {
  const files = ['idea-loop/agents/implementer.md', 'idea-loop/skills/engineering/implement/references/x.md', '.claude/agents/r.md'];
  const handback = [
    '读了哪几份写法规范 | 调 | writing-for-agents',
    '杠杆 | idea-loop/agents/implementer.md | 上下文指针',
  ].join('\n');
  const reasons = checkSkillEdit({ files, handback });
  assert.equal(reasons.length, 2, reasons.join('\n'));
  assert.match(reasons.join('\n'), /implement\/references\/x\.md/);
  assert.match(reasons.join('\n'), /\.claude\/agents\/r\.md/);
});

test('a lever row with an empty third column counts as no row', () => {
  const reasons = checkSkillEdit({
    files: ['idea-loop/skills/a/SKILL.md'],
    handback: '读了哪几份写法规范 | 调 | writing-for-agents\n杠杆 | idea-loop/skills/a/SKILL.md |   ',
  });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /idea-loop\/skills\/a\/SKILL\.md/);
});

test('standards line: missing, method without 调, or names without writing-for-agents each fail', () => {
  const files = ['idea-loop/skills/a/SKILL.md'];
  const lever = '杠杆 | idea-loop/skills/a/SKILL.md | 剪枝';
  assert.match(checkSkillEdit({ files, handback: lever }).join('\n'), /读了哪几份写法规范/);
  assert.match(checkSkillEdit({ files, handback: `读了哪几份写法规范 | 读 | writing-for-agents\n${lever}` }).join('\n'), /调/);
  assert.match(checkSkillEdit({ files, handback: `读了哪几份写法规范 | 调 | CODING_STANDARDS.md\n${lever}` }).join('\n'), /writing-for-agents/);
  assert.deepEqual(checkSkillEdit({ files, handback: `读了哪几份写法规范 | 调 | writing-for-agents\n${lever}` }), []);
});

test('a lever row names the file by its path or by a path ending at a directory boundary', () => {
  const files = ['idea-loop/skills/a/SKILL.md'];
  const std = '读了哪几份写法规范 | 调 | writing-for-agents';
  assert.deepEqual(checkSkillEdit({ files, handback: `${std}\n杠杆 | skills/a/SKILL.md | 剪枝` }), []);
  assert.equal(checkSkillEdit({ files, handback: `${std}\n杠杆 | b/SKILL.md | 剪枝` }).length, 1);
  assert.equal(checkSkillEdit({ files, handback: `${std}\n杠杆 | xskills/a/SKILL.md | 剪枝` }).length, 1);
});
