/**
 * Tripwire — the explorer reads the spec's 「测试决策」 and 「实现决策」, uses the latter only as a starting point for
 * locating code, and says why the other sections are not read.
 *
 * Spec explorer-reads-impl-decisions, ticket 01 (issue #161). Before: explorer.md's 「你收到」 said the spec was read
 * for 「测试决策」 only, while the implementer was already allowed to read any section — so a module the spec's
 * 「实现决策」 names was searched for again by every parallel implementer, and the notes never covered it.
 * These checks pin the sentences that carry the change; the explorer's frontmatter and its 「写什么」 / 「交回」
 * rules are deliberately left alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const explorer = readFileSync(join(pluginRoot, 'agents', 'explorer.md'), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

// 「你收到」 is the list between the opening paragraph and the first `## ` heading.
const body = explorer.replace(/^---\n[\s\S]*?\n---\n/, '');
const received = body.slice(body.indexOf('你收到'), body.indexOf('\n## '));
const specLine = received.split('\n').find((l) => l.includes('spec 路径'));

test('「你收到」 has a spec line', () => {
  assert.ok(specLine, '「你收到」里缺 spec 路径那一条');
});

test('the spec line no longer says the spec is read for 「测试决策」 only', () => {
  assert.doesNotMatch(received, /只读[「『“"]?测试决策/, '仍写「只读测试决策」');
});

test('the spec line has both 「测试决策」 and 「实现决策」', () => {
  assert.match(specLine, /测试决策/, '缺「测试决策」');
  assert.match(specLine, /实现决策/, '缺「实现决策」');
});

test('「实现决策」 is used as a starting point (起点) for finding locations, not as conclusions to copy', () => {
  assert.match(specLine, /起点/, '缺「起点」这一用法');
  assert.match(specLine, /找位置|grep/, '要写明起点是用来找位置（grep）的');
  assert.match(specLine, /不复述/, '要写明笔记里不复述「实现决策」的决定');
});

test('the spec line says the other sections are not read, with the reason', () => {
  assert.match(specLine, /其余[^。；]*不读/, '缺「其余节不读」');
  assert.match(specLine, /只含指针/, '缺理由：笔记只含指针');
  assert.match(specLine, /产生不了位置指针/, '缺理由：其余节产生不了位置指针');
});

test('the 「读什么」 row for each ticket\'s current state also looks at what the spec 「实现决策」 names', () => {
  const row = section(explorer, '读什么').split('\n').find((l) => l.includes('现状在代码里对应哪几处'));
  assert.ok(row, '「读什么」缺「现状」那一行');
  assert.match(row, /实现决策[」』”"]?点名的模块与接口/, '那一行的去处要含「实现决策」点名的模块与接口');
});

test('the pointer-only rule is unchanged', () => {
  const write = section(explorer, '写什么');
  assert.match(write, /每一条都是指针/);
  assert.match(write, /不写「提交时应该先校验再保存」/);
});
