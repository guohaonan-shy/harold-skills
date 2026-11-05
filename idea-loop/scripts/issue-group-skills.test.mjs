// 调度与 issue 会话按「一个 issue 一个会话」走（triage 会话、todo 会话），一个 issue 一份 spec、一条分支：三份 SKILL.md 与相关说明里能机械判定的那几条。
// 判会话怎么走得对不靠这里（没有 eval），这里只守：停点句没被动、字数、引用的脚本命令真存在、关键结构写了、旧模型的说法没回来。
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
const OLD_STATES = ['待验证', '验证中', '审核中', '待设计', '设计中', '待实现', '实现中', '搁置'];

test('三份 SKILL.md 主体都在 5000 字以内', () => {
  for (const n of NAMES) assert.ok([...body(skill(n))].length < 5000, `${n} 主体 ${[...body(skill(n))].length} 字`);
});

test('文中写到的 issues 命令都是脚本认得的，已删的命令一条也不写', () => {
  const src = readFileSync(join(root, 'scripts/issues.mjs'), 'utf8');
  const known = new Set(src.match(/const COMMANDS = \[([^\]]*)\]/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)));
  for (const gone of ['advance', 'resume', 'handoff', 'unhandoff', 'drop', 'queue', 'group', 'split', 'block']) assert.ok(!known.has(gone), `脚本不该再认得 ${gone}`);
  for (const n of NAMES) {
    for (const m of skill(n).matchAll(/`issues ([a-z]+)\b/g)) assert.ok(known.has(m[1]), `${n} 写了不存在的命令 issues ${m[1]}`);
  }
});

test('三份 skill 里没有旧中文状态名、根 / 子 issue、整合、一组、advance / group、spec-status', () => {
  for (const n of NAMES) {
    const md = skill(n);
    for (const s of OLD_STATES) assert.ok(!md.includes(s), `${n} 还写着旧状态「${s}」`);
    assert.doesNotMatch(md, /根 issue|子 issue|根号|一组|整合|不再被整合|没被整合/, `${n} 还带着根 / 子 issue 或整合的说法`);
    assert.doesNotMatch(md, /\badvance\b|\bgroup <docs>|issues group|spec-status/, `${n} 还写着 advance / group / spec-status`);
  }
});

test('issue-dispatch：只派 todo，一个 issue 一张卡片，section 与没有会话的判定都按新状态', () => {
  const md = skill('issue-dispatch');
  assert.match(front(md), /todo/);
  assert.match(front(md), /一个 issue 一张/);
  assert.match(md, /只派 `todo`/);
  assert.match(md, /issues candidates/);
  assert.match(md, /issues reconcile/);
  assert.match(md, /triage、in-progress、in-review/);
  assert.match(md, /seo in-progress/);
  assert.match(md, /status:<状态>/);
  assert.match(md, /没有同号会话的记进汇报/);
  assert.match(md, /每个 issue 出一张卡片/);
});

test('issue-dispatch：汇报里的子会话只剩设计阶段的会话，不提实现会话', () => {
  const md = skill('issue-dispatch');
  assert.doesNotMatch(md, /实现阶段按 spec 开的实现会话|实现会话/);
  assert.match(md, /子会话/);
});

test('issue-session：triage 会话与 todo 会话两条路，认领成 triage / in-progress', () => {
  const md = skill('issue-session');
  assert.match(md, /\| triage 会话 \|/);
  assert.match(md, /\| todo 会话 \|/);
  assert.match(md, /issues set <docs> triage \$ARGUMENTS/);
  assert.match(md, /issues set <docs> in-progress \$ARGUMENTS/);
  assert.match(md, /issues set <docs> todo \$ARGUMENTS --comment=/);
  assert.match(md, /issues show <docs> \$ARGUMENTS/);
  assert.match(md, /<仓库名>#<号> <标题>/);
  assert.match(md, /issue\/<号>-<slug>/);
});

test('issue-session：triage 会话调一次 issue-verify；todo 会话没有分支就自己起草 spec，冒出要人定的翻回 triage', () => {
  const md = skill('issue-session');
  assert.match(md, /调\*{0,2} ?`idea-loop:issue-verify`[^。\n]*只调一次/);
  assert.match(md, /用 Skill 工具调 `idea-loop:to-spec` 起草/);
  assert.match(md, /issues set <docs> triage \$ARGUMENTS --comment=/);
});

test('issue-session：先放着 = set backlog 带评论，下一个会话读评论接上分支', () => {
  const md = skill('issue-session');
  assert.match(md, /## 先放着/);
  assert.match(md, /issues set <docs> backlog \$ARGUMENTS --comment=<停在哪个阶段、分支名>/);
  assert.match(md, /读这条评论接上分支/);
});

test('issue-session：多仓库时在每个要改的仓库里开同名分支的 worktree，路径记进 spec', () => {
  const md = skill('issue-session');
  assert.match(md, /git -C <那个仓库的本地路径> worktree add/);
  assert.match(md, /「仓库」一节/);
  assert.match(md, /记进 spec 的「实现决策」/);
});

test('issue-session：本会话里切票、实现、review，指向 implement 与 pr-review，全部 PR 合并后 done', () => {
  const md = skill('issue-session');
  for (const s of ['idea-loop:to-ticket', 'idea-loop:implement', 'idea-loop:pr-review']) assert.ok(md.includes(s), `缺 ${s}`);
  assert.match(md, /用 Skill 工具调 `idea-loop:implement`/);
  assert.match(md, /用 Skill 工具调 `idea-loop:pr-review`/);
  assert.match(md, /全部 PR 合并后 issue 应已是 done/);
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
  assert.ok(md.includes('人说合并时由 pr-review'));
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

test('setup 的 issue 追踪模板：一个 issue 一个会话', () => {
  const md = readFileSync(join(root, 'skills/engineering/setup/references/issue-tracker.md'), 'utf8');
  assert.match(md, /一个 issue 一个会话/);
  assert.doesNotMatch(md, /一组/);
});

test('README：流程总览没有版本分支的例外，三个 skill 的行没有一组 / 根 / 子会话结构', () => {
  const md = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(md, /one PR takes them all to main/);
  assert.doesNotMatch(md, /implementation child session/);
  for (const k of ['issue-session', 'issue-verify', 'issue-dispatch']) {
    const row = md.split('\n').find((l) => l.startsWith(`| \`idea-loop:${k}\``) || l.startsWith(`| \`/idea-loop:${k}\``));
    assert.ok(row, `README 缺 ${k} 一行`);
    assert.doesNotMatch(row, /child session(s)? per spec|integration branch|once per sub-issue|root issue|sub-issue|unconsolidated|\bgroup\b/, `${k} 行还留着一组 / 根 / 子会话结构`);
    for (const s of OLD_STATES) assert.ok(!row.includes(s), `${k} 行还写着旧状态「${s}」`);
  }
});

test('issue-verify：只在 triage 会话里用，一份 spec，认领与分支已做过不重复，收尾不走 advance', () => {
  const md = skill('issue-verify');
  assert.match(front(md), /triage 会话/);
  assert.match(md, /一份 spec/);
  assert.match(md, /不重复认领/);
  assert.match(md, /issue\/<号>-<slug>/);
  assert.match(md, /idea-loop:issues/);
  assert.match(md, /spec.mjs/);
  assert.match(md, /issues set <docs> canceled <号> --comment=/);
  assert.doesNotMatch(md, /逐个调你|每次只处理一个子 issue|根的会话/);
});
