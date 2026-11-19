/**
 * Tripwire — the dispatcher hands out one kind of issue per period and opens the session itself.
 *
 * Spec dispatch-day-night-modes, ticket 03. Before: every round handed out todo and triage together
 * (two caps, `cap` 10 and `triageCap` 3, todo first), a session was only a card the human clicked, the
 * rounds were an in-session loop that expired after 7 days. Now: an hourly scheduled task; `issues queues`
 * says what this time of day is for (`dispatch`, `limit`); a triage period counts the triage sessions, a todo
 * period counts the in-progress sessions with activity in the last 2 hours; sessions are opened and handed to
 * the desktop app directly; the first round after the night writes a summary; the setup prints the allow
 * rule the unattended move needs. These tests read the text only: they catch the old wording coming back
 * and the new rules going missing, not whether a model follows them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

const dispatchFile = read('skills', 'engineering', 'issue-dispatch', 'SKILL.md');
const dispatch = body(dispatchFile);
const triage = read('skills', 'engineering', 'issue-triage', 'SKILL.md');
const session = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const setupDispatch = read('skills', 'engineering', 'setup', 'references', 'dispatch.md');
const setup = read('skills', 'engineering', 'setup', 'SKILL.md');
const desktop = read('skills', 'productivity', 'runtime', 'references', 'claude-desktop.md');
const magi = read('skills', 'productivity', 'runtime', 'references', 'magi.md');
const readme = read('README.md');

const partOf = (md) => md.slice(md.indexOf('### 调度'), md.indexOf('\n## ', md.indexOf('### 调度')));
const desktopDispatch = partOf(desktop);
const magiDispatch = partOf(magi);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const OLD = [
  ['出卡片', /出卡片|出一张会话卡片|出会话卡片/],
  ['还没点的卡片', /还没点的卡片|没点的.*卡片/],
  ['会话内循环', /会话内循环|常驻调度会话/],
  ['7 天到期', /7 天到期/],
  ['cap 10', /`cap`|\bcap\b（10）|`triageCap`|triageCap/],
  ['todo 先交', /todo 先(交|开)/],
  ['间隔参数', /issue-dispatch <间隔>|issue-dispatch 30m/],
];

test('the dispatch text has none of the old card / loop / two-cap wording', () => {
  const places = { 'issue-dispatch': dispatchFile, 'claude-desktop 调度': desktopDispatch, 'magi 调度': magiDispatch, 'setup dispatch.md': setupDispatch };
  for (const [where, text] of Object.entries(places)) {
    for (const [name, re] of OLD) assert.ok(!re.test(text), `${where} still says 「${name}」`);
  }
});

test('nothing else in the plugin or the repo still says the dispatcher gives out cards', () => {
  const files = [
    ...walk(join(pluginRoot, 'skills')).filter((f) => f.endsWith('.md')),
    ...walk(join(pluginRoot, 'agents')),
    join(pluginRoot, 'README.md'),
    join(pluginRoot, '..', 'ISSUE_TRACKER.md'),
  ];
  const hits = files.filter((f) => /调度卡片|调度会给它出会话卡片|给每个 todo 的 issue 出一张会话卡片|dispatcher card|session card/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, [], 'no doc says the dispatcher gives out cards');
  assert.ok(!files.some((f) => readFileSync(f, 'utf8').includes('独立队列')), '「独立队列」 stays gone');
});

test('issue-dispatch takes no interval and stays under 5000 characters', () => {
  assert.ok(!/argument-hint/.test(dispatchFile.split('\n---\n')[0]), 'no interval argument');
  assert.ok([...dispatch].length < 5000, 'body under 5000 characters');
  assert.match(dispatchFile.split('\n---\n')[0], /每小时一轮/);
});

test('issue-dispatch: a round asks issues queues for the period, and each period hands out its own kind with its own free-slot rule', () => {
  assert.match(dispatch, /issues queues <docs>/);
  assert.match(dispatch, /`dispatch`（`triage`、`todo` 或 `null`）和 `limit`/, 'the round reads dispatch and limit from queues');
  const step = dispatch.split('\n').find((l) => /^5\.\s+\*\*按 `dispatch` 派\*\*/.test(l));
  assert.ok(step, 'there is a step 「按 dispatch 派」');
  const bullets = dispatch.slice(dispatch.indexOf(step)).split('\n').filter((l) => /^\s+- `(triage|todo|null)`/.test(l));
  assert.equal(bullets.length, 3, 'one bullet each for triage, todo and null');
  const [t, d, n] = bullets;
  assert.match(t, /空位 = `limit` − triage 分组里的会话数/);
  assert.match(t, /issues candidates <docs> --state=triage/);
  assert.match(d, /空位 = `limit` − in-progress 分组里最近 2 小时有活动的会话数/);
  assert.match(d, /in-review 的会话也不算|in-review 的会话不算/);
  assert.match(d, /2 小时没活动的会话也不算[^。]*不动它、不关它/);
  assert.match(n, /不派.*只对账/);
  assert.match(dispatch, /先跳过第 3 步记下的同号会话/, 'skip sessions that already exist before taking candidates');
  assert.match(dispatch, /一轮合计最多交出 3 个/);
});

test('issue-dispatch: a todo period writes 夜间模式 into the prompt; a failed hand-over waits for the next round', () => {
  assert.match(dispatch, /派 `todo` 的时段，句尾加「夜间模式。」/);
  assert.match(dispatch, /交出失败的写进汇报，下一轮再试/);
  assert.match(dispatch, /人在调度会话里说话的那一轮也照下面做/);
});

test('issue-dispatch: the morning summary reads the record file, one line per issue, and pushes one sentence', () => {
  const step = dispatch.split('\n').find((l) => /^6\.\s+\*\*早上汇总\*\*/.test(l));
  assert.ok(step, 'there is a step 「早上汇总」');
  for (const word of ['~/.idea-loop/dispatch/<仓库名>.json', '`period` 是 `todo`', 'PR 链接', 'review 结论', '夜里替你定的', '最后活动时间', '<!-- idea-loop -->', '『推送』']) {
    assert.ok(step.includes(word), `the morning summary must mention ${word}`);
  }
  assert.match(step, /开了几个、几个等审、几个卡住/);
});

test('issue-dispatch: the dispatcher only moves the sessions it opened', () => {
  assert.ok(!/你不移动、不收尾别的会话/.test(dispatch), 'the old 「不移动」 premise is gone');
  assert.match(dispatch, /只在开会话这一步移动它开出的会话/);
});

test('claude-desktop: an hourly scheduled task runs the rounds', () => {
  const part = desktopDispatch.split('\n').find((l) => /^- \*\*怎么一轮一轮跑\*\*/.test(l));
  assert.ok(part, 'claude-desktop has 「怎么一轮一轮跑」');
  for (const word of ['dispatch-<仓库名>', '/idea-loop:issue-dispatch', '主 checkout', 'update_scheduled_task', '每小时一次', '立刻做第一轮']) {
    assert.ok(part.includes(word), `the rounds part must mention ${word}`);
  }
});

test('claude-desktop: counting follows the period (triage section; in-progress with activity in the last 2 hours; in-review not)', () => {
  const part = desktopDispatch.split('\n').find((l) => /^- \*\*怎么数开着的会话\*\*/.test(l));
  assert.ok(part);
  for (const word of ['`dispatch`', '`limit`', '`lastActivityAt`', '最近 2 小时', 'in-review 不数', '只数标题匹配']) assert.ok(part.includes(word), `counting must mention ${word}`);
});

test('claude-desktop: a session is opened in four steps, the second is the hand-off script, a failed hand-over waits for the next round', () => {
  const at = desktopDispatch.indexOf('- **怎么交出 issue**');
  assert.ok(at >= 0);
  const text = desktopDispatch.slice(at);
  const steps = text.split('\n').filter((l) => /^\s+\d\.\s+\*\*/.test(l));
  assert.equal(steps.length, 4);
  assert.match(steps[0], /建 worktree/);
  assert.match(steps[1], /开会话并交到桌面端/);
  assert.match(steps[1], /desktop-handoff\.mjs/);
  assert.match(steps[1], /--worktree <那个 worktree> --issue <号> --repo <仓库名> --period <dispatch>/);
  assert.match(steps[1], /在沙箱外跑/);
  assert.match(steps[1], /交出失败/);
  assert.match(steps[1], /下一轮再试/);
  assert.match(steps[2], /归位/);
  assert.match(steps[2], /mcp__ccd_sidebar__move_sessions/);
  assert.match(steps[2], /唯一一次移动别的会话/);
  assert.match(steps[3], /发任务/);
  assert.match(steps[3], /send_message/);
  assert.ok(text.indexOf('归位') < text.indexOf('发任务'), 'the task is sent after the session is on the desktop');
  assert.match(text, /已知限制：交到桌面端时[^。]*前台[^。]*抢人的窗口/);
});

test('claude-desktop: the in-session loop section carries no dispatch expiry reminder; the dispatcher uses a scheduled task, as in magi', () => {
  const at = desktop.indexOf('## 会话内循环');
  const part = desktop.slice(at, desktop.indexOf('\n## ', at + 1));
  assert.ok(at >= 0 && part.length > 20, 'claude-desktop has the section');
  for (const [name, re] of [['到期提醒', /到期提醒/], ['调度 loop 已到期', /调度 loop 已到期/], ['一次性提醒', /recurring: false/], ['重新敲 / 间隔参数', /重新敲|issue-dispatch <间隔>/]]) {
    assert.ok(!re.test(part), `the in-session loop section still says 「${name}」`);
  }
  assert.match(part, /调度在桌面端不用它，用「定时任务」/);
  assert.match(magi.slice(magi.indexOf('## 会话内循环')), /调度在 magi 里不用它，用「定时任务」/, 'same line as magi');
});

test('claude-desktop: a worktree for an issue with an existing branch attaches that branch instead of creating one with -b', () => {
  const text = desktopDispatch.slice(desktopDispatch.indexOf('- **怎么交出 issue**'));
  const step = text.slice(text.indexOf('1. **建 worktree**'), text.indexOf('2. **开会话并交到桌面端**'));
  assert.ok(step, 'step 1 found');
  assert.match(step, /有就接上，不新建同名分支/);
  assert.match(step, /refs\/heads\/<分支>/, 'checks the local branch');
  assert.match(step, /refs\/remotes\/origin\/<分支>/, 'checks the remote branch');
  const lines = step.split('\n').filter((l) => /worktree add/.test(l));
  assert.equal(lines.length, 3, 'one command per case: local, remote only, neither');
  // the only command that creates the branch from the base is the one for 「two places both have none」
  const withBase = lines.filter((l) => /origin\/<基准分支>/.test(l));
  assert.equal(withBase.length, 1);
  assert.match(withBase[0], /两处都没有/);
  assert.match(lines[0], /worktree add <路径> <分支>`/, 'a local branch is attached without -b');
  assert.ok(!/-b/.test(lines[0]), 'attaching a local branch never passes -b');
  // a branch left behind after the daytime session's workspace was cleaned must not make the night round fail
  assert.match(step, /分支还在/);
});

test('claude-desktop: the allow rule is printed under 装与设置, and setup prints it', () => {
  const install = desktop.slice(desktop.indexOf('## 装与设置'));
  assert.match(install, /mcp__ccd_sidebar__move_sessions/);
  assert.match(install, /\/idea-loop:setup/);
  assert.match(setupDispatch, /装与设置/);
  assert.match(setupDispatch, /允许规则/);
  assert.match(setup, /要人自己加的允许规则/);
});

test('setup\'s dispatch steps create an hourly task and ask no interval', () => {
  assert.match(setupDispatch, /每小时一次/);
  assert.ok(!/间隔/.test(setupDispatch), 'no interval question');
  assert.match(setupDispatch, /dispatch-<仓库名>/);
});

test('magi: only what to hand out changes — period, limit, free slots — and the way a session is opened stays', () => {
  for (const word of ['`limit`', '`dispatch`', '最近 2 小时有活动', '夜间模式', '每轮最多开 3 个', '先跳过已有同号会话']) assert.ok(magiDispatch.includes(word), `magi dispatch must mention ${word}`);
  assert.match(magiDispatch, /magi sessions start --cwd <那个 worktree> --slug <仓库名>-<号> --cap magi/);
  assert.match(magiDispatch, /git -C <主 checkout> worktree add <主 checkout 的上一级>\/<仓库名>-worktrees\/<号>-<slug> -b issue\/<号>-<slug>/);
});

test('the triage row of issue-triage\'s table says the daytime dispatch opens the session itself; issue-session says a triage session is opened by the human or the dispatcher', () => {
  const row = triage.split('\n').find((l) => /^\s*\|\s*triage \+ P1 或 P2/.test(l));
  assert.ok(row, 'issue-triage has no 「triage + P1 或 P2」 row');
  assert.match(row, /白天的调度会直接给它开 triage 会话/);
  assert.match(session, /\|\s*triage 会话\s*\|\s*人或调度\s*\|/);
});

test('README names the hourly rounds and no card', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:issue-dispatch`'));
  assert.ok(row);
  assert.match(row, /no interval: it runs every hour/);
  assert.match(row, /morning summary/);
  assert.match(row, /最近 2 小时|last 2 hours/);
});
