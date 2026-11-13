// 调度与 issue 会话按「一个 issue 一个会话」走（triage 会话、todo 会话），一个 issue 一份 spec、一条分支：三份 SKILL.md 与相关说明里能机械判定的那几条。
// 判会话怎么走得对不靠这里（没有 eval），这里只守：停点句没被动、字数、引用的脚本命令真存在、关键结构写了、旧模型的说法没回来。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = (name) => readFileSync(join(root, 'skills/engineering', name, 'SKILL.md'), 'utf8');
const front = (md) => md.match(/^---\n([\s\S]*?)\n---\n/)[1];
const body = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');
const NAMES = ['issue-dispatch', 'issue-session', 'issue-triage'];
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

test('issue-dispatch：派 todo 和 triage，一个 issue 一个会话，对账、两个上限、候选、每轮最多 3 个、汇报；怎么跑、怎么数、怎么交出交给 runtime', () => {
  const md = skill('issue-dispatch');
  assert.match(front(md), /todo/);
  assert.match(front(md), /一个 issue 一个会话/);
  assert.match(md, /`todo` 和 `triage` 的 issue/);
  assert.match(md, /issues candidates/);
  assert.match(md, /issues reconcile/);
  assert.match(md, /issues queues <docs>/);
  assert.match(md, /status:<状态>/);
  assert.match(md, /没有同号会话的记进汇报/);
  assert.match(md, /合计最多交出 3 个/);
  assert.match(md, /idea-loop:runtime/);
  for (const part of ['怎么一轮一轮跑', '怎么数开着的会话', '怎么交出 issue']) assert.ok(md.includes(part), `缺交给 runtime 的「${part}」`);
  // the how is no longer in the body: no sidebar section, card or in-session loop
  assert.doesNotMatch(md, /section|卡片|CronCreate|会话内循环|(?<![\w-])loop(?![\w-])/, 'dispatch 正文还写着 section、卡片或会话内循环的做法');
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

test('issue-session：triage 会话读证据评论、调 to-spec 起草并照 draft-spec；todo 会话没有分支就自己起草 spec，冒出要人定的翻回 triage', () => {
  const md = skill('issue-session');
  assert.match(md, /证据评论/);
  assert.match(md, /用 Skill 工具调 `idea-loop:to-spec` 起草，再照 \[references\/draft-spec\.md\]/);
  assert.match(md, /用 Skill 工具调 `idea-loop:to-spec` 起草，上下文是 issue 全文和评论，再照 \[references\/draft-spec\.md\]/);
  assert.match(md, /issues set <docs> triage \$ARGUMENTS --comment=/);
});

test('draft-spec：自己校验、跟人定要 grill 的、起草时发现已做掉的就 canceled 并删草稿；没有「验证为不存在」的落地 PR', () => {
  const md = readFileSync(join(root, 'skills/engineering/issue-session/references/draft-spec.md'), 'utf8');
  assert.match(md, /## 自己校验/);
  assert.match(md, /## 跟人定要 grill 的/);
  assert.match(md, /issues set <docs> canceled <号> --comment=/);
  assert.match(md, /删掉这份 spec 的草稿/);
  assert.doesNotMatch(md, /gh pr create|gh pr merge/, '不存在的 issue 在分拣里就关了，不再有它的落地 PR');
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

test('issue-session：停点规则原样保留，不再收夜里发来的规则回放消息', () => {
  const md = skill('issue-session');
  assert.ok(md.includes('要人拍板的就停下等人'));
  assert.ok(md.includes('人说合并时由 pr-review'));
  assert.ok(!md.includes('规则回放的结果'));
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
  for (const k of ['issue-session', 'issue-triage', 'issue-dispatch']) {
    const row = md.split('\n').find((l) => l.startsWith(`| \`idea-loop:${k}\``) || l.startsWith(`| \`/idea-loop:${k}\``));
    assert.ok(row, `README 缺 ${k} 一行`);
    assert.doesNotMatch(row, /child session(s)? per spec|integration branch|once per sub-issue|root issue|sub-issue|unconsolidated|\bgroup\b/, `${k} 行还留着一组 / 根 / 子会话结构`);
    for (const s of OLD_STATES) assert.ok(!row.includes(s), `${k} 行还写着旧状态「${s}」`);
  }
});

test('issue-triage：三种调用、同时最多 5 个 issue-triager、15 个一批、表好了通知、「不做」写进 records', () => {
  const md = skill('issue-triage');
  assert.match(front(md), /每周分拣/);
  assert.match(front(md), /P0/);
  assert.doesNotMatch(front(md), /disable-model-invocation/, '可被模型调用');
  for (const k of ['不带参数', '`全部`', '`P0 <号>`']) assert.ok(md.includes(k), `缺调用 ${k}`);
  assert.match(md, /idea-loop:issue-triager/);
  assert.match(md, /issues backlog <docs> 15/);
  assert.match(md, /issues note/);
  assert.match(md, /同时最多 5 个/);
  assert.match(md, /『推送』/);
  assert.match(md, /docs\/records\/out-of-scope\/<slug>\.md/);
  for (const k of ['todo + P1 或 P2', 'triage + P1 或 P2', 'canceled', '留在 backlog']) assert.ok(md.includes(k), `缺去向 ${k}`);
  assert.match(md, /跳过 triage/);
});

test('issue-triager：sonnet、medium、只读不翻状态，五步、复现手段表、输出放 .tmp/triage、交回一行 JSON', () => {
  const md = readFileSync(join(root, 'agents/issue-triager.md'), 'utf8');
  assert.match(front(md), /^model: sonnet$/m);
  assert.match(front(md), /^effort: medium$/m);
  for (const k of ['查重', '「不做」清单', '是否已实现', '复现', '打分类']) assert.ok(md.includes(k), `缺步骤 ${k}`);
  for (const k of ['一个会红的测试', '一张截图加标注', '一条查询或一段日志']) assert.ok(md.includes(k), `缺复现手段 ${k}`);
  assert.match(md, /\.tmp\/triage\/<号>\//);
  assert.match(md, /issues note/);
  assert.match(md, /交回一行 JSON/);
  assert.match(md, /不翻状态/);
});

test('issue-triager 不设 tools 白名单（继承会话全部工具，浏览器与 Linear MCP 才拿得到），skill 都写「用 Skill 工具调」，评论链接取自 issues note 的输出', () => {
  const md = readFileSync(join(root, 'agents/issue-triager.md'), 'utf8');
  assert.doesNotMatch(front(md), /^tools:/m);
  for (const k of ['idea-loop:browser', 'idea-loop:evidence']) assert.match(md, new RegExp(`用 Skill 工具调 \`${k}\``), `${k} 没写「用 Skill 工具调」`);
  assert.match(md, /已评论 <链接>/);
});

// 插件里（除 docs/raw 与 evals 的历史记录）不再有 issue-verify 与 issues open；开 issue 都指向 idea-loop:issues 的「开一个 issue」
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (['node_modules', 'evals', 'raw'].includes(f)) continue;
      walk(p, out);
    } else if (/\.(md|mjs|json)$/.test(f) && !/\.test\.mjs$/.test(f)) out.push(p);
  }
  return out;
}

test('插件里没有 issue-verify，也没有 issues open', () => {
  for (const f of walk(root)) {
    const md = readFileSync(f, 'utf8');
    assert.doesNotMatch(md, /issue-verify/, `${f} 还提到 issue-verify`);
    assert.doesNotMatch(md, /issues(\.mjs)? open\b/, `${f} 还提到 issues open`);
  }
});

test('implement、pr-review、retro、dreaming、issue-session 的开 issue 都指向 idea-loop:issues 的「开一个 issue」', () => {
  const files = [
    'skills/engineering/implement/SKILL.md',
    'skills/engineering/pr-review/SKILL.md',
    'skills/productivity/retro/SKILL.md',
    'skills/productivity/dreaming/references/retro-candidates.md',
    'skills/engineering/issue-session/SKILL.md',
  ];
  for (const f of files) {
    const md = readFileSync(join(root, f), 'utf8');
    assert.match(md, /`idea-loop:issues`[^\n]{0,12}「开一个 issue」/, `${f} 的开 issue 没指向「开一个 issue」`);
  }
});
