// 调度与 issue 会话按「一组」（根 issue + 子 issue）走：三份 SKILL.md 里能机械判定的那几条。
// 判组怎么说得对不靠这里（没有 eval），这里只守：停点句没被动、字数、引用的脚本命令真存在、关键结构写了。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = (name) => readFileSync(join(root, 'skills/engineering', name, 'SKILL.md'), 'utf8');
const front = (md) => md.match(/^---\n([\s\S]*?)\n---\n/)[1];
const body = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');
const NAMES = ['issue-dispatch', 'issue-session', 'issue-verify'];

test('三份 SKILL.md 主体都在 5000 字以内', () => {
  for (const n of NAMES) assert.ok([...body(skill(n))].length < 5000, `${n} 主体 ${[...body(skill(n))].length} 字`);
});

test('文中写到的 issues 命令都是脚本认得的', () => {
  const src = readFileSync(join(root, 'scripts/issues.mjs'), 'utf8');
  const known = new Set(src.match(/const COMMANDS = \[([^\]]*)\]/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)));
  for (const n of NAMES) {
    for (const m of skill(n).matchAll(/`issues ([a-z]+)\b/g)) assert.ok(known.has(m[1]), `${n} 写了不存在的命令 issues ${m[1]}`);
  }
});

test('issue-dispatch：一个根一张卡片，卡片带子 issue 号，子 issue 算在根的会话名下', () => {
  const md = skill('issue-dispatch');
  assert.doesNotMatch(front(md), /一个 issue 一张/);
  assert.match(front(md), /一组/);
  assert.match(md, /issues group/);
  assert.match(md, /子 issue 号/);
  assert.match(md, /根有会话[^。\n]*子 issue[^。\n]*不报/);
});

test('issue-session：整组认领、逐个子 issue 验证、实现开子会话、两种合并去向、关根', () => {
  const md = skill('issue-session');
  assert.match(md, /issues group/);
  assert.match(md, /issues set <docs> 验证中 <根号>/);
  assert.match(md, /每个子 issue[^。\n]*issue-verify|issue-verify[^。\n]*每个子 issue/);
  assert.match(md, /start_session/);
  assert.match(md, /子会话的标题不用「<仓库名>#<号>/);
  assert.match(md, /release\/<plugin>-<版本>/);
  assert.match(md, /最后一个子 issue 关闭时根/);
});

test('issue-session：停点规则原样保留', () => {
  const md = skill('issue-session');
  assert.ok(md.includes('要人拍板的就停下等人'));
  assert.ok(md.includes('人说合并时由 pr-review 合并'));
  assert.ok(md.includes('**规则回放的结果**'));
});

test('issue-verify：在根的会话里被逐个调起，不重复认领', () => {
  const md = skill('issue-verify');
  assert.match(md, /根的会话/);
  assert.match(md, /不重复认领/);
});
