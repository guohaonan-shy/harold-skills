/**
 * Tripwire — one dispatch per device (spec dispatch-one-per-device, ticket 02).
 *
 * Before: one `dispatch-<repo name>` scheduled task per project, built in that project's main checkout, hourly;
 * the period table and the cap lived in the project's `ISSUE_TRACKER.md`; in-progress counted only the sessions
 * with activity in the last 2 hours; any repo name's session of the same number blocked an issue.
 * Now: one `dispatch-home` task in home (cron `7,37 * * * *`); `DISPATCH.md` in home holds the table
 * (`dyna home dispatch`), `dyna home projects` lists the projects; the number to open is
 * min(per round, the state's cap − the sessions open in that state), across all projects, one candidate
 * table; a same-numbered session only blocks the project whose repo name it carries.
 * These tests read the text only: they catch the old wording coming back and the new rules going missing, not
 * whether a model follows them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');
const section = (md, from) => md.slice(md.indexOf(from), md.indexOf('\n## ', md.indexOf(from)) < 0 ? undefined : md.indexOf('\n## ', md.indexOf(from)));

const dir = ['skills', 'engineering', 'issue-dispatch'];
const dispatchFile = read(...dir, 'SKILL.md');
const dispatch = body(dispatchFile);
const start = read(...dir, 'references', 'start-dispatch.md');
const morning = read(...dir, 'references', 'morning-summary.md');
const desktop = read('runtime', 'claude-desktop.md');
const magi = read('runtime', 'magi.md');
const partOf = (md) => md.slice(md.indexOf('### 调度'), md.indexOf('\n## ', md.indexOf('### 调度')));
const setupSkill = read('skills', 'engineering', 'setup', 'SKILL.md');
const setupDispatch = read('skills', 'engineering', 'setup', 'references', 'dispatch.md');
const tracker = read('skills', 'engineering', 'setup', 'references', 'issue-tracker.md');
const trackerLinear = read('skills', 'engineering', 'setup', 'references', 'issue-tracker-linear.md');
const readme = read('README.md');

const places = {
  'issue-dispatch SKILL.md': dispatchFile,
  'issue-dispatch start-dispatch.md': start,
  'issue-dispatch morning-summary.md': morning,
  'claude-desktop 调度': partOf(desktop),
  'magi 调度': partOf(magi),
  'setup 调度 (SKILL.md)': section(setupSkill, '## 调度'),
  'setup dispatch.md': setupDispatch,
  'issue-tracker.md': tracker,
  'issue-tracker-linear.md': trackerLinear,
};

test('none of the dispatch text still has the per-project task, the main-checkout premise, the project cap table or the 2-hour rule', () => {
  const OLD = [
    ['工作目录是主 checkout', /工作目录是主 checkout/],
    ['issue 跟踪说明的「调度」表', /issue 跟踪说明的「调度」表|`ISSUE_TRACKER.md`「调度」表|「调度」表/],
    ['最近 2 小时有活动', /最近 2 小时有活动|最近 2 小时内|2 小时没活动/],
    ['每小时', /每小时/],
    ['issues queues 的 limit', /issues queues <docs>.{0,20}`limit`|`limit`（上限）/],
  ];
  for (const [where, text] of Object.entries(places)) {
    for (const [name, re] of OLD) assert.ok(!re.test(text), `${where} still says 「${name}」`);
  }
});

test('dispatch-<仓库名> only appears as the old task to disable', () => {
  for (const [where, text] of Object.entries(places)) {
    const lines = text.split('\n').filter((l) => l.includes('dispatch-<仓库名>'));
    for (const l of lines) assert.match(l, /停用/, `${where}: 「dispatch-<仓库名>」 outside the disable sentence: ${l.slice(0, 80)}`);
  }
});

test('the two issue-tracker templates have no 调度 section; the skill says an old one is merged into DISPATCH.md when the dispatch is started', () => {
  assert.ok(!/^## 调度/m.test(tracker), 'issue-tracker.md has no 调度 section');
  assert.ok(!/^## 调度/m.test(trackerLinear), 'issue-tracker-linear.md has no 调度 section');
  assert.match(start, /`ISSUE_TRACKER\.md`.{0,30}「调度」一节/);
  assert.match(start, /改前改后/);
  assert.match(start, /人同意后才写入/);
  assert.match(start, /删掉那个项目 `ISSUE_TRACKER\.md` 里的「调度」一节/);
});

test('issue-dispatch: reads the table and the project list from dyna, in home, read-only, one task dispatch-home with cron 7,37 * * * *', () => {
  for (const word of ['`dyna home dispatch`', '`dyna home projects`', '`DISPATCH.md`', '`dispatch-home`', '7,37 * * * *', '你开在 home（`~/home`）里，只读']) {
    assert.ok(dispatchFile.includes(word), `issue-dispatch must mention ${word}`);
  }
  assert.match(dispatch, /只在起调度时提交 `DISPATCH.md`/);
  assert.match(dispatch, /只快进更新（拉不下来就跳过这个项目）和建 worktree/);
  assert.match(dispatch, /不切分支、不改文件/);
});

test('issue-dispatch: how many to open is min(per round, the state\'s cap − open in that state); no cap means per round; ≤ 0 opens none', () => {
  const step = dispatch.split('\n').find((l) => /^4\.\s+\*\*按整台设备交出\*\*/.test(l));
  assert.ok(step, 'step 「按整台设备交出」');
  assert.match(step, /这一轮能开几个 = min\(`perRound`, 这一状态的上限 − 这一状态开着的个数\)/);
  assert.match(step, /上限是 `null`（不设）就是 `perRound`/);
  assert.match(step, /≤ 0 不开/);
});

test('issue-dispatch: candidates of all projects are one table in the current order; a project that cannot run is skipped and named in the report', () => {
  const step = dispatch.split('\n').find((l) => /^4\.\s+\*\*按整台设备交出\*\*/.test(l));
  assert.match(step, /所有项目的候选合成一张表/);
  assert.match(step, /指派给本人的在前，P0 → P1 → P2 → 没有优先级/);
  assert.match(step, /在这一状态停留久的在前/);
  const skip = dispatch.split('\n').find((l) => /\*\*跑不了的跳过\*\*/.test(l));
  assert.ok(skip, 'a step 「跑不了的跳过」');
  for (const word of ['`inHome` 是 `false`', '`cloneDir` 不存在', '不在默认分支', '只快进更新不成', '记一行（项目名、原因）进汇报']) {
    assert.ok(skip.includes(word), `the skip step must mention ${word}`);
  }
  assert.match(dispatch, /跑不了而跳过的和原因/, 'the report names the skipped projects');
  assert.match(dispatch, /名字在 `skip` 里的不碰/);
});

test('issue-dispatch: sessions are counted per state across the device; a same-numbered session only counts for the repo name it carries', () => {
  const step = dispatch.split('\n').find((l) => /^2\.\s+\*\*数开着的会话\*\*/.test(l));
  assert.ok(step, 'step 「数开着的会话」');
  assert.match(step, /标题是「<仓库名>#<号> …」/);
  assert.match(step, /任何仓库名都算，整台设备一个数/);
  assert.match(step, /按仓库名分开记，\*\*同号只认本项目仓库名\*\*/);
  assert.match(dispatch, /去掉本项目的同号会话/);
});

test('issue-dispatch: one report and one push of totals; the morning summary reads the dispatch-home last success and is split by project', () => {
  assert.match(dispatch, /汇报合成一份/);
  assert.match(dispatch, /只发一句合计/);
  assert.match(dispatch, /`dispatch-home` 上次成功运行的时刻/);
  assert.match(morning, /按项目分节/);
  assert.match(morning, /`dyna home dispatch --at=<上一轮的时刻>` 的 `period.start`/);
  assert.ok(!/issues queues/.test(morning), 'the morning summary no longer asks queues for the period');
});

test('starting the dispatch: the task in home with title and cron, DISPATCH.md default committed, old tasks disabled (not deleted) and listed, then the first round', () => {
  for (const word of ['`dispatch-home`', '`issue 调度`', '`7,37 * * * *`', '`~/home`', '`DISPATCH.md`', '`dyna home commit', '停用', '只停用，不删', '汇报里列出停了哪几个', '第一轮']) {
    assert.ok(start.includes(word), `start-dispatch.md must mention ${word}`);
  }
  for (const word of ['09:00–19:00 | triage | 3', '22:00–08:00 | todo | 1', 'triage | 6', 'in-progress | 不设', 'in-review | 不设', '不调度的项目：']) {
    assert.ok(start.includes(word), `the default DISPATCH.md must have ${word}`);
  }
  assert.match(dispatch, /references\/start-dispatch\.md/);
});

test('the dispatch session\'s model and effort: the skill front matter pins neither; the start tells the human to pick Sonnet by hand; nothing says the skill pins one', () => {
  const front = dispatchFile.split('\n---\n')[0];
  assert.ok(!/^model:/m.test(front), 'issue-dispatch front matter has no model:');
  assert.ok(!/^effort:/m.test(front), 'issue-dispatch front matter has no effort:');
  assert.match(start, /不在开头钉模型和思考强度/);
  assert.match(start, /在运行环境里把 `dispatch-home` 的模型手动选成 Sonnet/);
  assert.match(partOf(desktop), /建任务的工具没有模型和思考强度的参数/);
  assert.match(partOf(desktop), /选成 Sonnet/);
  for (const [where, text] of Object.entries(places)) {
    assert.ok(!/skill 开头(钉了|的 `model:`)/.test(text) && !/开头钉了 Sonnet/.test(text), `${where} still says the skill pins the model`);
  }
  assert.ok(!/pins Sonnet/.test(readme), 'README no longer says the skill pins Sonnet');
  assert.match(readme.split('\n').find((l) => l.startsWith('| `/idea-loop:issue-dispatch`')), /does not pin a model or effort/);
});

test('the default DISPATCH.md and every place that quotes it: todo at night opens 1 a round, triage by day 3', () => {
  assert.ok(start.includes('09:00–19:00 | triage | 3'));
  assert.ok(start.includes('22:00–08:00 | todo | 1'));
  assert.ok(!start.includes('22:00–08:00 | todo | 3'), 'the old night default 3 is gone');
  const row = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:issue-dispatch`'));
  assert.match(row, /`todo` 1 a round/);
  assert.ok(!/3 a round, triage capped/.test(row), 'README no longer quotes the single 3-a-round default');
});

test('claude-desktop: one dispatch-home task in home, every 30 minutes; sessions are counted per state across the device, a same number only blocks its own repo; the hand-over works in the issue\'s project clone', () => {
  const d = partOf(desktop);
  const run = d.split('\n').find((l) => /^- \*\*怎么一轮一轮跑\*\*/.test(l));
  for (const word of ['`dispatch-home`', '`7,37 * * * *`', '每 30 分钟', '在 home 里建', '`enabled: false`', '停用']) assert.ok(run.includes(word), `claude-desktop rounds must mention ${word}`);
  const count = d.split('\n').find((l) => /^- \*\*怎么数开着的会话\*\*/.test(l));
  for (const word of ['`dyna home dispatch`', '任何仓库名都算', '整台设备一个数', '同号只认本项目仓库名', '不看活动时间']) assert.ok(count.includes(word), `claude-desktop counting must mention ${word}`);
  assert.match(desktop, /设备级的（`dispatch-home`、`dreaming-home`）在 home 里建/);
  assert.match(desktop, /名字取 `dyna home dispatch` 返回的 `sections`/);
  assert.match(d, /`<clone>` 是 issue 所在项目的本地 clone/);
  assert.ok(!d.includes('<主 checkout>'), 'the hand-over commands use the project clone');
});

test('magi: one dispatch-home task with its working directory in home, the same table and algorithm; sessions are still started in the issue\'s worktree', () => {
  const d = partOf(magi);
  const run = d.split('\n').find((l) => /^- \*\*怎么一轮一轮跑\*\*/.test(l));
  for (const word of ['`dispatch-home`', '`7,37 * * * *`', '每 30 分钟', '工作目录（`--cwd`）是 home', '`magi cron edit <id> --disable`']) assert.ok(run.includes(word), `magi rounds must mention ${word}`);
  const count = d.split('\n').find((l) => /^- \*\*怎么数开着的会话\*\*/.test(l));
  for (const word of ['`dyna home projects`', '任何仓库名都算', '整台设备一个数', '同号只认本项目仓库名']) assert.ok(count.includes(word), `magi counting must mention ${word}`);
  assert.match(d, /这一轮能开几个照 `idea-loop:issue-dispatch` 的「每一轮」第 4 步算/);
  assert.match(d, /magi sessions start --cwd <那个 worktree>/);
  assert.match(magi, /设备级的任务（`dispatch-home`、`dreaming-home`）填 home/);
});

test('setup: the dispatch step checks for dispatch-home and reports or asks; the report line says dispatch-home', () => {
  // #420 folded the four task sections into one 「定时任务」 table; the hand-back details moved into references/handback.md
  assert.match(section(setupSkill, '## 定时任务'), /`dispatch-home`/);
  assert.match(read('skills', 'engineering', 'setup', 'references', 'handback.md'), /调度（设备级的 `dispatch-home`）/);
  assert.match(setupDispatch, /已有任务里有 `dispatch-home`：报给人/);
  assert.match(setupDispatch, /选项「建（推荐）」「不建，我自己手敲」/);
});

test('README: the dispatch and setup rows say dispatch-home, DISPATCH.md and the 30-minute rounds', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:issue-dispatch`'));
  for (const word of ['`dispatch-home`', '`DISPATCH.md`', '`7,37 * * * *`', '`dyna home dispatch`', '`dyna home projects`', 'min(']) assert.ok(row.includes(word), `README dispatch row must mention ${word}`);
  const setup = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:setup` | Setup'));
  assert.match(setup, /reports whether this device has `dispatch-home`/);
  assert.ok(!/hourly `dispatch-/.test(setup), 'the setup row no longer creates an hourly per-project task');
});

test('the plugin asks for the dyna that has home projects and home dispatch', () => {
  const range = read('dyna-version');
  assert.match(range, />=0\.0\.([6-9]|\d{2,}) </);
});

// Review round 1 (S1 S2 C1 C2): each rule below failed on the text of 185c3980.

test('S1: DISPATCH.md and the old 调度 section are committed into home with full paths, so starting from a project directory still commits', () => {
  assert.ok(!/dyna home commit "dispatch: DISPATCH\.md" DISPATCH\.md/.test(start), 'a bare file name is resolved against the current directory');
  assert.match(start, /dyna home commit "dispatch: DISPATCH\.md" ~\/home\/DISPATCH\.md/);
  assert.match(start, /~\/home\/projects\/<名字>\/ISSUE_TRACKER\.md/);
});

test('S2: 仓库名 is the part of `owner/repo` after the slash, used for the title, the same-number test and --repo', () => {
  const premise = dispatch.split('\n').find((l) => /^- 项目取自 `dyna home projects`/.test(l));
  assert.ok(premise, 'the projects line');
  assert.match(premise, /`repo` 是 `owner\/repo`，取斜杠后那段当 `<仓库名>`/);
  assert.ok(!/不含 owner/.test(dispatch), 'the old claim that repo has no owner is gone');
  assert.match(premise, /会话标题/);
  assert.match(premise, /`--repo`/);
  assert.match(partOf(magi), /对上 `repo` 斜杠后那段/, 'magi finds the project by the repo name after the slash');
});

test('C1: the dispatch skill states the fast-forward constraint as an effect, not a command line', () => {
  assert.ok(!/pull --ff-only/.test(dispatch), 'no pull command in the skill body');
  assert.match(dispatch, /只快进更新/);
});

test('C2: setup\'s dispatch step points at issue-dispatch\'s 起调度 and does not read its reference file or restate its steps', () => {
  assert.ok(!/start-dispatch/.test(setupDispatch), 'setup does not read the dispatch skill\'s own reference');
  const step = setupDispatch.slice(setupDispatch.indexOf('2. 没有'), setupDispatch.indexOf('3. 运行环境'));
  assert.ok(!/DISPATCH\.md|7,37 \* \* \* \*|dispatch-<仓库名>/.test(step), 'the three steps are not restated');
  assert.match(setupDispatch, /用 Skill 工具调 `idea-loop:issue-dispatch`，照它的「起调度」做/);
  assert.match(setupDispatch, /setup 这一步不做第一轮/);
});
