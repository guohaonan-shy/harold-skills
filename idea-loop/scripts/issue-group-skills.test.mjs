// 调度与 issue 会话按「一组」（根 issue + 子 issue）走，一组一份 spec、一个会话从审核做到合并：三份 SKILL.md 与相关说明里能机械判定的那几条。
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

test('issue-session：整组认领、一组调一次 issue-verify、一份 spec、本会话里切票实现 review 合并、关根', () => {
  const md = skill('issue-session');
  assert.match(md, /issues group/);
  assert.match(md, /issues set <docs> 验证中 <根号>/);
  assert.match(md, /调\*{0,2} ?一次\*{0,2}[^。\n]*issue-verify|issue-verify[^。\n]*一次/);
  assert.match(md, /一份 spec/);
  // 实现在本会话里做
  for (const s of ['idea-loop:to-ticket', 'idea-loop:implement', 'idea-loop:pr-review']) assert.ok(md.includes(s), `缺 ${s}`);
  assert.match(md, /用 Skill 工具调 `idea-loop:implement`/);
  assert.match(md, /用 Skill 工具调 `idea-loop:pr-review`/);
  assert.match(md, /最后一个子 issue 关闭时根|spec 完成时根/);
});

test('issue-session：没有实现子会话、简报、两种合并去向、集成分支与集成 review', () => {
  const md = skill('issue-session');
  assert.doesNotMatch(md, /start_session/, '不开子会话');
  assert.doesNotMatch(md, /子会话/, '不再有子会话（imagine 之类设计会话由人起，不在这份里写）');
  assert.doesNotMatch(md, /简报/);
  assert.doesNotMatch(md, /release\/<plugin>/);
  assert.doesNotMatch(md, /集成分支|集成 review/);
  assert.doesNotMatch(md, /根代表一个(版本|页面)/);
  assert.doesNotMatch(md, /根没有自己的 spec/);
});

test('issue-session：停点规则原样保留，规则回放结果发进本会话', () => {
  const md = skill('issue-session');
  assert.ok(md.includes('要人拍板的就停下等人'));
  assert.ok(md.includes('人说合并时由 pr-review 合并'));
  assert.ok(md.includes('**规则回放的结果**'));
  assert.match(md, /结果发进这个会话/);
});

test('pr-review 合并说明：合并统一在 issue 会话里做，没有实现子会话和通知根的会话', () => {
  for (const f of ['merge.md', 'deliver.md']) {
    const md = readFileSync(join(root, 'skills/engineering/pr-review/references', f), 'utf8');
    assert.doesNotMatch(md, /子会话/, `${f} 不再提实现子会话`);
    assert.doesNotMatch(md, /根的会话/, `${f} 不再通知根的会话`);
  }
  const merge = readFileSync(join(root, 'skills/engineering/pr-review/references/merge.md'), 'utf8');
  assert.match(merge, /合并统一在[^。\n]*issue 会话/);
});

test('issue-dispatch：汇报里的子会话只剩设计阶段的会话，不提实现会话', () => {
  const md = skill('issue-dispatch');
  assert.doesNotMatch(md, /实现阶段按 spec 开的实现会话|实现会话/);
  assert.match(md, /子会话/);
});

test('setup 的 issue 追踪模板：一组一个会话', () => {
  const md = readFileSync(join(root, 'skills/engineering/setup/references/issue-tracker.md'), 'utf8');
  assert.match(md, /一组[^。\n]*一个会话/);
  assert.doesNotMatch(md, /一个 issue 一个会话/);
});

test('README：流程总览没有版本分支的例外，合并缺口段只认 issue 会话', () => {
  const md = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(md, /every stage lands on the main branch through its own PR/);
  assert.doesNotMatch(md, /implementation child session/);
  for (const k of ['issue-session', 'issue-verify', 'issue-dispatch']) {
    const row = md.split('\n').find((l) => l.startsWith(`| \`idea-loop:${k}\``) || l.startsWith(`| \`/idea-loop:${k}\``));
    assert.ok(row, `README 缺 ${k} 一行`);
    assert.doesNotMatch(row, /child session(s)? per spec|integration branch|once per sub-issue/, `${k} 行还留着子会话结构`);
  }
});

test('issue-verify：在根的会话里对一组调一次，一份 spec 覆盖全部子 issue，不重复认领', () => {
  const md = skill('issue-verify');
  assert.match(md, /根的会话/);
  assert.match(md, /一次/);
  assert.match(md, /一份 spec/);
  assert.match(md, /不重复认领/);
  assert.doesNotMatch(md, /逐个调你|每次只处理一个子 issue/);
});
