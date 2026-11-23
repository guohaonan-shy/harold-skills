/**
 * One round of the design critic: checks the shape of what the critic (`idea-loop:ui-master`) handed back.
 *
 * The critic is an advisor. It lists the gaps it sees, assesses each of the human's lines of reasoning
 * for this round, and puts a 1–10 score on the version. The score is its opinion; whether the loop
 * goes on or stops is the human's call, so this file decides nothing about that. It does two things:
 *
 * - holds the output to a closed shape: every field present, no unknown field, enums in range,
 *   every `state` a name from this version's state list (the report opens that state by name),
 *   and exactly the human's reasoning ids assessed, each once;
 * - points out the `direction` findings, which the human is told about before signing.
 *
 * What the critic hands back:
 *
 *   {
 *     findings:  [{ kind: direction | pattern | craft, state, where, detail, why, reference }],
 *     reasoning: [{ id, verdict: 成立 | 存疑, why }],
 *     score:     1–10,
 *     note:      string | null
 *   }
 *
 * The state list and the reasoning ids to assess come from the session, as a second input
 * (`{ states: [...], thoughts: [...] }`): thoughts the human kept after discussion are left out of it.
 *
 * Pure: no browser, no model, no clock, no filesystem.
 */

/** What a gap asks for. Closed set; each routes to a different place in the loop. */
export const KINDS = ['direction', 'pattern', 'craft'];

/** Every finding carries exactly these fields. */
export const FINDING_FIELDS = ['kind', 'state', 'where', 'detail', 'why', 'reference'];

/** The critic's verdict on one of the human's lines of reasoning. */
export const VERDICTS = ['成立', '存疑'];

/** Every reasoning item carries exactly these fields. */
export const REASONING_FIELDS = ['id', 'verdict', 'why'];

/** The top level of the critic's output. */
export const ROUND_FIELDS = ['findings', 'reasoning', 'score', 'note'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Reasoning ids may be written as 1 or "1"; they are compared as text. */
const idKey = (id) => (typeof id === 'string' || Number.isInteger(id) ? String(id) : null);

/** What the session must supply with every round: the state names and the reasoning ids to assess. */
export function validateContext(context) {
  const errors = [];
  if (!isObject(context)) return ['context must be an object { states, thoughts }'];
  if (!Array.isArray(context.states) || !context.states.every(isText)) errors.push('context.states must be an array of state names');
  if (!Array.isArray(context.thoughts) || !context.thoughts.every((t) => idKey(t) !== null)) {
    errors.push('context.thoughts must be an array of reasoning ids (strings or integers)');
  }
  return errors;
}

/** One human-readable error per violation, `[]` when the findings are well-formed. */
export function validateFindings(findings, states) {
  if (!Array.isArray(findings)) return ['findings must be an array'];
  const errors = [];
  findings.forEach((f, i) => {
    const at = `findings[${i}]`;
    if (!isObject(f)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const field of FINDING_FIELDS) if (!(field in f)) errors.push(`${at}: missing field "${field}"`);
    for (const field of Object.keys(f)) if (!FINDING_FIELDS.includes(field)) errors.push(`${at}: unknown field "${field}"`);
    if ('kind' in f && !KINDS.includes(f.kind)) errors.push(`${at}: kind "${f.kind}" is not one of ${KINDS.join(' / ')}`);
    for (const field of ['state', 'where', 'detail', 'why', 'reference']) {
      if (field in f && !isText(f[field])) errors.push(`${at}: ${field} must be a non-empty string`);
    }
    if (isText(f.state) && !states.includes(f.state)) {
      errors.push(`${at}: state "${f.state}" is not in this version's state list (${states.join(' / ')})`);
    }
  });
  return errors;
}

/** The reasoning items must cover exactly the ids the human wrote this round, each once. */
export function validateReasoning(reasoning, thoughts) {
  if (!Array.isArray(reasoning)) return ['reasoning must be an array'];
  const errors = [];
  const wanted = thoughts.map(String);
  const seen = [];
  reasoning.forEach((r, i) => {
    const at = `reasoning[${i}]`;
    if (!isObject(r)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const field of REASONING_FIELDS) if (!(field in r)) errors.push(`${at}: missing field "${field}"`);
    for (const field of Object.keys(r)) if (!REASONING_FIELDS.includes(field)) errors.push(`${at}: unknown field "${field}"`);
    if ('verdict' in r && !VERDICTS.includes(r.verdict)) errors.push(`${at}: verdict "${r.verdict}" is not one of ${VERDICTS.join(' / ')}`);
    if ('why' in r && !isText(r.why)) errors.push(`${at}: why must be a non-empty string`);
    if ('id' in r) {
      const key = idKey(r.id);
      if (key === null) errors.push(`${at}: id must be a string or an integer`);
      else if (!wanted.includes(key)) errors.push(`${at}: id "${key}" is not one of this round's reasoning (${wanted.join(' / ') || 'none'})`);
      else if (seen.includes(key)) errors.push(`${at}: id "${key}" is assessed twice`);
      else seen.push(key);
    }
  });
  for (const id of wanted) if (!seen.includes(id)) errors.push(`reasoning: id "${id}" has no assessment`);
  return errors;
}

/**
 * Check one round.
 *
 * @param round    the critic's JSON, parsed
 * @param context  { states, thoughts } from the session: state names of this version, reasoning ids to assess
 * @returns { valid, errors, score, direction } — `direction` lists the direction findings
 *          (`n` is the finding's 1-based place in `findings`), `[]` when there are none
 */
export function checkRound(round, context) {
  const contextErrors = validateContext(context);
  if (contextErrors.length) throw new Error(contextErrors.join('; '));
  const errors = [];
  if (!isObject(round)) return { valid: false, errors: ['the critic output must be a JSON object'], score: null, direction: [] };
  for (const field of ROUND_FIELDS) if (!(field in round)) errors.push(`missing field "${field}"`);
  for (const field of Object.keys(round)) if (!ROUND_FIELDS.includes(field)) errors.push(`unknown field "${field}"`);
  errors.push(...validateFindings(round.findings, context.states));
  errors.push(...validateReasoning(round.reasoning, context.thoughts));
  if (!Number.isInteger(round.score) || round.score < 1 || round.score > 10) {
    errors.push(`score must be an integer 1–10, got ${JSON.stringify(round.score)}`);
  }
  if ('note' in round && round.note !== null && typeof round.note !== 'string') errors.push('note must be a string or null');
  if (errors.length) return { valid: false, errors, score: null, direction: [] };
  const direction = round.findings
    .map((f, i) => ({ n: i + 1, state: f.state, where: f.where, detail: f.detail }))
    .filter((_, i) => round.findings[i].kind === 'direction');
  return { valid: true, errors: [], score: round.score, direction };
}

export function renderRound(result, file) {
  const at = file ? ` (${file})` : '';
  if (!result.valid) return [`critic-round: 不合格，作废这一轮、重新评${at}：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
  const direction = result.direction.length
    ? `${result.direction.length} 条：${result.direction.map((d) => `#${d.n} ${d.state} · ${d.where}`).join('；')}`
    : '无';
  return [`critic-round: 合格${at}`, `  分数：${result.score}　方向性意见：${direction}`].join('\n');
}

// CLI: the refine session calls this with the critic's JSON file and the context file { states, thoughts }.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const at = args.indexOf('--context');
  const contextFile = at >= 0 ? args[at + 1] : undefined;
  const [file] = args.filter((a, i) => !a.startsWith('--') && i !== at + 1);
  if (!file || !contextFile) {
    console.error('usage: critic-score.mjs <critic.json> --context <context.json> [--json]   # context: { states, thoughts }');
    process.exit(1);
  }
  const read = (path) => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.error(`critic-score: cannot read ${path}: ${e.message}`);
      process.exit(1);
    }
  };
  const round = read(file);
  const context = read(contextFile);
  const contextErrors = validateContext(context);
  if (contextErrors.length) {
    console.error(`critic-score: bad context ${contextFile}: ${contextErrors.join('; ')}`);
    process.exit(1);
  }
  const result = checkRound(round, context);
  console.log(json ? JSON.stringify(result, null, 2) : renderRound(result, file));
  process.exit(result.valid ? 0 : 2);
}
