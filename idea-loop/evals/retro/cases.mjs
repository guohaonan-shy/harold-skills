/**
 * Replay cases: reading them and checking their format.
 *
 * `cases/<case>/case.json` records one decision point of a past session:
 *
 *   commit      the repository state the decision happened in (the runner copies the project from here)
 *   prompt      the sentence that, back then, made the skill produce the thing
 *   stop_at     where the skill hands the thing to the human: the run is told to stop there
 *   question    one yes/no question, written from what the human said back then; a judging session
 *               answers it about the pre-change run and the post-change run
 *   quote       the human's original words the question was written from
 *   size        small | large (the rule is in size_basis; the runner checks it against the event stream)
 *   size_basis  which criterion decides the size
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

/** @returns {{field: string, message: string}[]} empty when the case is complete */
export function validateCase(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [{ field: 'case', message: 'case.json 不是一个对象' }];
  const problems = [];
  const need = (field, message) => problems.push({ field, message });

  if (!filled(c.commit)) need('commit', '缺提交号：决策发生时的仓库状态');
  else if (!COMMIT.test(c.commit.trim())) need('commit', `提交号 "${c.commit}" 不是 7–40 位十六进制的提交 id`);

  if (!filled(c.prompt)) need('prompt', '缺 prompt：当时让 skill 产出东西的那句话');
  if (!filled(c.stop_at)) need('stop_at', '缺「停在哪」：skill 把东西交给人的那一刻');

  if (!filled(c.question)) need('question', '缺是/否题');
  else if (!/[？?]\s*$/.test(c.question.trim())) need('question', '是/否题要写成一个问句（以问号结尾）');

  if (!filled(c.quote)) need('quote', '缺人当时的原话：是/否题是从哪句话写出来的');

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
