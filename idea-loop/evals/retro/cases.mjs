/**
 * Replay cases: reading them and checking their format.
 *
 * `cases/<case>/case.json` records one decision point of a past session:
 *
 *   commit      the repository state the decision happened in (the runner copies the project from here)
 *   home_commit optional: a commit of the home repository (where the knowledge base lives since 0.2.0: `projects/<名字>/docs/`,
 *               the bootstrap files). With it the runner cuts a temporary home from that commit and points IDEA_LOOP_HOME at it for
 *               both the pre-change and the post-change run (each gets its own copy of it), and the home repository's location comes
 *               from the runner's `--home-repo <dir>`. Without it the case is an old one: `commit` is from before the knowledge base
 *               moved into home, so the runner builds a temporary home out of that commit's `docs/` and bootstrap files and only the
 *               post-change run is given it (the pre-change plugin reads the same files from the code repository; its run gets an
 *               empty home so nothing of this machine's own home reaches it). Same format as `commit`.
 *   prompt      the sentence that, back then, made the skill produce the thing. The run is given exactly this and nothing
 *               else, so it must not say that this is a test: no 回放 / eval / judge / rubric / benchmark / 评测 / 评委 / 判定
 *   stop_at     where the skill hands the thing to the human. Only the judging session is told (to look at that moment in
 *               the product); the run is never told where to stop: an agent that hands its work to the human ends its turn
 *   question    one yes/no question, written from what the human said back then; a judging session
 *               answers it about the pre-change run and the post-change run
 *   quote       the human's original words the question was written from. A case has either this or `goal_from`, never both and never neither
 *   goal_from   a goal case's source, in place of `quote`: where in a spec the question was written from, as the spec's path and the
 *               number of one of its User Stories or expected behaviours ("docs/spec/<slug>/<slug>.md 期望行为 1"). For a new ability
 *               that has no history and no original words yet; the spec's expectation stands where the human's words would. Either-or
 *               with `quote` (二选一); the rest of the case, the runner and the judging are the same, and the outcome rule is too:
 *               pre-change "no" and post-change "yes" is the only pass, while a pre-change "yes" is "不过：改前就做得到"
 *   size        small | large (the rule is in size_basis; the runner checks it against the event stream)
 *   size_basis  which criterion decides the size
 *   guard       optional, true: the case watches that a rule does not reach too far (a thing the human decides stays with the human), so
 *               the old behaviour already answers "yes" and the new one has to still answer "yes". The runner then passes the case
 *               on the post-change answer alone; without it, a pre-change "yes" is "用例没抓住问题"
 *   source      optional: where in which session the decision came from
 *
 * `cases/<case>/annotations.md` is where the human overrides a judgement (see replay.mjs).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));

const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+){0,5}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

/** Words that tell a run it is being tested. A case prompt that contains one (in any case, as part of a longer word too) is malformed. */
export const REVEALING_WORDS = ['回放', 'eval', 'judge', 'rubric', 'benchmark', '评测', '评委', '判定'];
const REVEALING = new RegExp(REVEALING_WORDS.join('|'), 'ig');

/** The revealing words in a text, each once, as they are written there. */
export const revealingWordsIn = (text) => [...new Set(String(text ?? '').match(REVEALING) ?? [])];

/** @returns {{field: string, message: string}[]} empty when the case is complete */
export function validateCase(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [{ field: 'case', message: 'case.json 不是一个对象' }];
  const problems = [];
  const need = (field, message) => problems.push({ field, message });

  if (!filled(c.commit)) need('commit', '缺提交号：决策发生时的仓库状态');
  else if (!COMMIT.test(c.commit.trim())) need('commit', `提交号 "${c.commit}" 不是 7–40 位十六进制的提交 id`);

  if (c.home_commit !== undefined && (!filled(c.home_commit) || !COMMIT.test(c.home_commit.trim()))) {
    need('home_commit', `home_commit ${JSON.stringify(c.home_commit)} 不是 7–40 位十六进制的提交 id（它是 home 仓库里的提交；老用例不用写这个字段）`);
  }

  if (c.guard !== undefined && typeof c.guard !== 'boolean') need('guard', `guard 要写 true 或 false（现在是 ${JSON.stringify(c.guard)}）；不是守边界的用例就别写这个字段`);

  if (!filled(c.prompt)) need('prompt', '缺 prompt：当时让 skill 产出东西的那句话');
  else {
    const hit = revealingWordsIn(c.prompt);
    if (hit.length) need('prompt', `prompt 里出现了会让被测的 agent 看出自己在被测的词（${hit.map((w) => `「${w}」`).join('')}）：改写成人当时会说的话，别的说明不要加`);
  }
  if (!filled(c.stop_at)) need('stop_at', '缺「停在哪」：skill 把东西交给人的那一刻');

  if (!filled(c.question)) need('question', '缺是/否题');
  else if (!/[？?]\s*$/.test(c.question.trim())) need('question', '是/否题要写成一个问句（以问号结尾）');

  // where the question came from: the human's words back then (quote) or a spec expectation (goal_from), one of the two
  const hasQuote = filled(c.quote);
  const hasGoal = filled(c.goal_from);
  if (hasQuote && hasGoal) need('goal_from', 'quote 和 goal_from 冲突：只填一个。题是从人当时的原话写出的填 quote，是从 spec 里一条期望写出的填 goal_from');
  else if (!hasQuote && !hasGoal) need('quote', '缺题的来源，二选一：quote（人当时的原话）或 goal_from（出自哪份 spec 的哪条 User Story / 期望行为）');

  if (c.size !== 'small' && c.size !== 'large') need('size', `缺大小，或写的不是 small / large（现在是 ${JSON.stringify(c.size)}）`);
  if (!filled(c.size_basis)) need('size_basis', '缺大小的依据：凭哪一条判的');
  return problems;
}

/** All case folders under `<root>/cases`, with name, sorted. Does not validate. */
export function loadCases(root = HERE) {
  const dir = join(root, 'cases');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, ...JSON.parse(readFileSync(join(dir, d.name, 'case.json'), 'utf8')) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Check every case folder. @returns {{case: string, field: string, message: string}[]} */
export function checkCasesDir(root = HERE) {
  const dir = join(root, 'cases');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const add = (field, message) => out.push({ case: d.name, field, message });
    if (!NAME.test(d.name)) add('name', '用例目录名要是小写字母、数字加连字符');
    const file = join(dir, d.name, 'case.json');
    if (!existsSync(file)) {
      add('case.json', '缺 case.json');
    } else {
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        add('case.json', `case.json 不是合法 JSON：${e.message}`);
      }
      if (parsed !== undefined) for (const p of validateCase(parsed)) add(p.field, p.message);
    }
    if (!existsSync(join(dir, d.name, 'annotations.md'))) add('annotations.md', '缺 annotations.md：人推翻判定时记在这里');
  }
  return out;
}
