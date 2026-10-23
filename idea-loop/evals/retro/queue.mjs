/**
 * The nightly replay queue, as pure functions. The runner (retro-replay.mjs, `--queue`) does the file and
 * process work; what it has to decide is here, so it can be tested without a clock, a disk or `claude -p`.
 *
 * Queue: `~/.idea-loop/replay-queue/`, one JSON file per PR waiting for its replays.
 *
 *   { "repo": "owner/name", "pr": 12, "worktree": "/abs/path/of/the/pr/worktree",
 *     "cases": ["case-name", ...], "base": "<commit the pre-change plugin is taken from>", "queued_at": "<ISO time>",
 *     "session": "<id of the issue session waiting for the result; optional>" }
 *
 * The cases are looked up in the worktree (`<worktree>/idea-loop/evals/retro/cases/`), the plugin under test is
 * the worktree's `idea-loop/`, and the result goes into `<worktree>/.tmp/review-loop/<pr>.md`.
 *
 * This module imports nothing from the plugin's other scripts: setup copies it to a fixed place under
 * `~/.idea-loop/bin/` together with the runner, and it must work from there.
 */

import { join } from 'node:path';

/** The runner only starts replays between these local-clock hours: from NIGHT_START:00 up to, not including, NIGHT_END:00. */
export const NIGHT_START = 0;
export const NIGHT_END = 7;

const pad = (n) => String(n).padStart(2, '0');
export const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Is `now` inside 00:00–07:00 on the machine's own clock? */
export function inNightWindow(now) {
  const h = now.getHours();
  return h >= NIGHT_START && h < NIGHT_END;
}

const QUEUE_FILE = /^[\w.-]+__[\w.-]+-\d+\.json$/;

/**
 * Whether to start replays, given the time and the file names found in the queue directory.
 * The time comes first: outside the window nothing runs and the queue is left as it is, however full or empty.
 * @returns {{action: 'wait'|'empty'|'run', reason: string, files?: string[]}}
 */
export function decideQueueRun({ now, files }) {
  if (!inNightWindow(now)) {
    return { action: 'wait', reason: `现在是 ${clock(now)}，不在 ${pad(NIGHT_START)}:00–${pad(NIGHT_END)}:00 的时间窗里，不跑，队列原样留着，等下一晚` };
  }
  const queued = files.filter((f) => QUEUE_FILE.test(f)).sort();
  if (!queued.length) return { action: 'empty', reason: '队列是空的，没有要回放的，立即退出' };
  return { action: 'run', reason: `队列里有 ${queued.length} 个 PR 在等回放`, files: queued };
}

const CASE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+){0,5}$/;

/** @returns {{field: string, message: string}[]} empty when the queue entry is complete */
export function validateQueueEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [{ field: 'entry', message: '队列文件不是一个对象' }];
  const problems = [];
  const need = (field, message) => problems.push({ field, message });
  if (typeof e.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(e.repo)) need('repo', '仓库要写成 owner/name');
  if (!Number.isSafeInteger(e.pr) || e.pr < 1) need('pr', 'PR 号要是正整数');
  if (typeof e.worktree !== 'string' || !e.worktree.startsWith('/')) need('worktree', 'worktree 路径要是绝对路径');
  if (!Array.isArray(e.cases) || !e.cases.length) need('cases', '用例列表不能空');
  else if (!e.cases.every((c) => typeof c === 'string' && CASE_NAME.test(c))) need('cases', '用例名要是小写字母、数字加连字符');
  if (e.session !== undefined && (typeof e.session !== 'string' || !e.session.trim() || /\s/.test(e.session))) need('session', 'session 要是 issue 会话的 id（一个不含空白的字符串）');
  if (e.base !== undefined && (typeof e.base !== 'string' || !e.base.trim())) need('base', 'base 要是一个提交号或分支名');
  return problems;
}

/** `owner/name` and the PR number, as one file name. */
export const queueFileName = ({ repo, pr }) => `${repo.replace('/', '__')}-${pr}.json`;

/**
 * The queue entry for a PR. When the PR is already queued, its cases are added to, and the time it started
 * waiting and the base it was queued against stay as they were.
 */
export function makeQueueEntry({ repo, pr, worktree, cases, base, queuedAt, session, existing }) {
  const merged = [...new Set([...(existing?.cases ?? []), ...cases])];
  const out = { repo, pr, worktree, cases: merged, queued_at: existing?.queued_at ?? queuedAt };
  const b = existing?.base ?? base;
  if (b) out.base = b;
  const sess = session ?? existing?.session;
  if (sess) out.session = sess;
  return out;
}

export const reviewLoopPath = (worktree, pr) => join(worktree, '.tmp', 'review-loop', `${pr}.md`);

/** How many cases passed, and whether the night's result needs the human. */
export function summarizeResults(results) {
  const passed = results.filter((r) => r.outcome === 'pass').length;
  const cost = results.reduce((a, r) => a + (r.cost ?? 0), 0);
  return { total: results.length, passed, notPassed: results.length - passed, allPassed: results.length > 0 && passed === results.length, cost: Math.round(cost * 100) / 100 };
}

const LABEL = { pass: '过', fail: '不过', 'case-missed': '用例没抓住问题', inconclusive: '没有结论', 'no-result': '没跑出结果', 'bad-case': '用例有问题，没能跑' };
const YESNO = { yes: '是', no: '否' };
const usd = (n) => (n == null ? '?' : `$${n.toFixed(2)}`);

function describeCase(r) {
  const lines = [`- \`${r.case}\`：${LABEL[r.outcome] ?? r.outcome}`, `  - ${r.reason}`];
  for (const v of r.verdicts ?? []) lines.push(`  - ${v.side === 'before' ? '改前' : '改后'}：${YESNO[v.answer] ?? v.answer}　出处：${v.cite}`);
  if (r.runDir) lines.push(`  - 产物（改前、改后各一份）：\`${r.runDir}/{before,after}/artifact.md\`；花费 ${usd(r.cost)}`);
  lines.push(`  - 不同意判定？在用例旁的 \`annotations.md\` 里记「- 推翻 <run-id> 改前=是|否 ｜ 理由」，再跑 \`--settle ${r.case} --run <run 目录>\``);
  return lines;
}

/**
 * One review-loop entry for a night's replay of one PR. A replay entry is a record the runner wrote:
 * when every case passed it says so under 做了什么 (nothing is waiting for the human); otherwise it carries a
 * 要你决定 and no 做了什么, so `review-loop.mjs check` lists it until the human has ruled and it was acted on.
 */
export function buildReplayEntry({ round, ranAt, results }) {
  const s = summarizeResults(results);
  const when = `${ranAt.getFullYear()}-${pad(ranAt.getMonth() + 1)}-${pad(ranAt.getDate())} ${clock(ranAt)}`;
  const head = `## 规则回放 第 ${round} 次 · ${s.total} 个用例，${s.passed} 个过${s.notPassed ? `，${s.notPassed} 个没过` : ''}`;
  const lines = [`<!-- idea-loop-entry ${JSON.stringify({ kind: 'replay', round })} -->`, head, '', `夜间队列在 ${when} 跑完，花费 ${usd(s.cost)}。判定会话答的是「改前否、改后是」才算过。`, ''];
  for (const r of results) lines.push(...describeCase(r));
  lines.push('');
  if (s.allPassed) {
    lines.push('### 做了什么', '- 全部用例都过，没有要处理的；队列文件已删。');
  } else {
    const bad = results.filter((r) => r.outcome !== 'pass').map((r) => `\`${r.case}\``).join('、');
    lines.push(
      `**要你决定**：${bad} 没过，队列里这个 PR 的回放已经跑完并删掉，不会自动重跑。`,
      '- A：判定对，规则改动没达到目的 —— 回到规则，接着改，再排一次回放。',
      '- B：判定错了 —— 在用例旁的 `annotations.md` 里推翻，再跑 `--settle`。',
      '- C：用例本身有问题（没抓住问题、写不清）—— 先修用例再排。',
    );
  }
  return `${lines.join('\n')}\n`;
}

/** The round a new replay entry gets: replay entries are numbered among themselves, review rounds are untouched. */
function nextReplayRound(text) {
  let max = 0;
  for (const m of String(text).matchAll(/^<!-- idea-loop-entry (\{.*?\}) -->$/gm)) {
    try {
      const rec = JSON.parse(m[1]);
      if (rec.kind === 'replay' && Number.isSafeInteger(rec.round)) max = Math.max(max, rec.round);
    } catch {
      /* a malformed marker is review-loop.mjs's to report, not ours */
    }
  }
  return max + 1;
}

/** The loop file's new text: everything that was there, then this replay as one more entry. */
export function appendReplayResults(loopText, { pr, ranAt, results }) {
  const round = nextReplayRound(loopText);
  const base = loopText && loopText.trim() ? `${loopText.replace(/\s*$/, '')}\n\n` : `# PR #${pr} 的 review loop\n\n`;
  return { text: base + buildReplayEntry({ round, ranAt, results }), round };
}

/** The one-line push after a PR's replay finished. */
export function pushMessage({ repo, pr, results }) {
  const s = summarizeResults(results);
  return s.allPassed
    ? `${repo} #${pr} 的规则回放：${s.total} 个用例全过`
    : `${repo} #${pr} 的规则回放：${s.total} 个用例，${s.passed} 个过，${s.notPassed} 个不过，等你看结果`;
}

// ---------- handing the result back to the issue session ----------

/** A result line starts with this; what follows is one JSON object. The scheduled task reads these lines and forwards them. */
export const RESULT_PREFIX = '回放结果 ';

/** What the issue session is told: the push line first, then where the result is and what to do with it. */
export function sessionMessage({ repo, pr, results, worktree }) {
  const s = summarizeResults(results);
  return [
    pushMessage({ repo, pr, results }),
    `结果在 ${reviewLoopPath(worktree, pr)}（\`规则回放\` 那一条）。`,
    s.allPassed
      ? '全过：没有要处理的，接着走（PR 可以进 review）。'
      : '有用例没过：先停下，把没过的用例和判定摆给人，等人在三个处理里选一个；人没批示之前 PR 不进 review。',
  ].join('\n');
}

/**
 * The line the runner prints when a PR's replay is done and its result is in the review loop file. `session` is null
 * when the queue file named no session: that PR's result goes out as the notification, which the runner sends itself.
 */
export function resultLine({ session, repo, pr, results, worktree }) {
  const s = summarizeResults(results);
  return `${RESULT_PREFIX}${JSON.stringify({
    session: session ?? null, repo, pr, allPassed: s.allPassed, loop: reviewLoopPath(worktree, pr), message: sessionMessage({ repo, pr, results, worktree }),
  })}`;
}

/** The object in a result line, or null when the line is not one. */
export function parseResultLine(line) {
  if (typeof line !== 'string' || !line.startsWith(RESULT_PREFIX)) return null;
  try {
    return JSON.parse(line.slice(RESULT_PREFIX.length));
  } catch {
    return null;
  }
}
