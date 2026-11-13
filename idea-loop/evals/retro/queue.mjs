/**
 * How a replay's result is written into the PR's review loop file, as pure functions. The runner (retro-replay.mjs,
 * `--run-large`) does the file and process work; what the entry says is decided here, so it can be tested without a disk
 * or `claude -p`.
 *
 * The result goes into `<worktree>/.tmp/review-loop/<pr>.md` as one `replay` entry.
 *
 * (The file keeps the name it had when the replays of large cases waited in a night queue; nothing here queues anything.)
 *
 * This module imports nothing from the plugin's other scripts: setup copies it to a fixed place under
 * `~/.idea-loop/bin/` together with the runner, and it must work from there.
 */

import { join } from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
export const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const reviewLoopPath = (worktree, pr) => join(worktree, '.tmp', 'review-loop', `${pr}.md`);

/** How many cases passed, and whether the result needs the human. */
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
 * One review-loop entry for the replay of one PR. A replay entry is a record the runner wrote:
 * when every case passed it says so under 做了什么 (nothing is waiting for the human); otherwise it carries a
 * 要你决定 and no 做了什么, so `review-loop.mjs check` lists it until the human has ruled and it was acted on.
 */
export function buildReplayEntry({ round, ranAt, results }) {
  const s = summarizeResults(results);
  const when = `${ranAt.getFullYear()}-${pad(ranAt.getMonth() + 1)}-${pad(ranAt.getDate())} ${clock(ranAt)}`;
  const head = `## 规则回放 第 ${round} 次 · ${s.total} 个用例，${s.passed} 个过${s.notPassed ? `，${s.notPassed} 个没过` : ''}`;
  const lines = [
    `<!-- idea-loop-entry ${JSON.stringify({ kind: 'replay', round })} -->`, head, '',
    `当场跑完，${when} 出结果，花费 ${usd(s.cost)}。判定会话答的是「改前否、改后是」才算过。`, '',
  ];
  for (const r of results) lines.push(...describeCase(r));
  lines.push('');
  if (s.allPassed) {
    lines.push('### 做了什么', '- 全部用例都过，没有要处理的。');
  } else {
    const bad = results.filter((r) => r.outcome !== 'pass').map((r) => `\`${r.case}\``).join('、');
    lines.push(
      `**要你决定**：${bad} 没过，不会自动重跑。`,
      '- A：判定对，规则改动没达到目的 —— 回到规则，接着改，再跑一次回放。',
      '- B：判定错了 —— 在用例旁的 `annotations.md` 里推翻，再跑 `--settle`。',
      '- C：用例本身有问题（没抓住问题、写不清）—— 先修用例再跑。',
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
