/**
 * One round of the design critic loop: checks the critic's output and decides whether to stop.
 *
 * The critic (`idea-loop:ui-master`) is a senior designer from a top studio. It names the biggest
 * gaps between this version and what such a studio would ship, and puts one score on the round:
 * 10 when there is nothing it would touch, 9 and up when the studio would ship it as-is. The score
 * is its judgement; this file does not second-guess it. It only holds the output to a closed shape
 * and turns the round into a stop decision:
 *
 * - 方向 (direction): a gap is about the direction itself, so the next move is not another polish pass;
 * - 通过 (pass): the score reached the threshold;
 * - 瓶颈 (bottleneck): three rounds in a row without beating the best score before them;
 * - 继续 (continue): otherwise.
 *
 * Each gap carries a `kind` the loop routes on: direction → reopen the direction, pattern → judgment
 * first, else a suggested research question, craft → fix in place. Items the human chose to keep are
 * handed to the critic as input ("not a gap"), so they never reach the score in the first place.
 *
 * Pure: no browser, no model, no clock, no filesystem.
 */

/** What a gap asks for. Closed set; each routes to a different place in the loop. */
export const KINDS = ['direction', 'pattern', 'craft'];

/** Every finding carries exactly these fields. */
export const FINDING_FIELDS = ['kind', 'where', 'detail', 'why'];

/** A studio would ship it as-is from here. The critic is told this number. */
export const STOP_THRESHOLD = 9;

/** Rounds in a row without a new best before it is a bottleneck. */
export const PLATEAU = 3;

/** One human-readable error per violation, `[]` when the findings are well-formed. */
export function validateFindings(findings) {
  if (!Array.isArray(findings)) return ['findings must be an array'];
  const errors = [];
  findings.forEach((f, i) => {
    const at = `findings[${i}]`;
    if (f === null || typeof f !== 'object' || Array.isArray(f)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const field of FINDING_FIELDS) if (!(field in f)) errors.push(`${at}: missing field "${field}"`);
    for (const field of Object.keys(f)) if (!FINDING_FIELDS.includes(field)) errors.push(`${at}: unknown field "${field}"`);
    if ('kind' in f && !KINDS.includes(f.kind)) errors.push(`${at}: kind "${f.kind}" is not one of ${KINDS.join(' / ')}`);
    for (const field of ['where', 'detail', 'why']) {
      if (field in f && typeof f[field] !== 'string') errors.push(`${at}: ${field} must be a string`);
    }
  });
  return errors;
}

/** Three rounds in a row, each no better than the best score before it. */
export function isPlateau(scores) {
  if (scores.length < PLATEAU + 1) return false;
  return scores.slice(-PLATEAU).every((s, k, last) => {
    const before = scores.slice(0, scores.length - PLATEAU + k);
    return s <= Math.max(...before);
  });
}

/**
 * Check one round and decide.
 *
 * @param findings  the critic's gaps this round, biggest first
 * @param score     the critic's score, an integer 1–10
 * @param history   the scores of the previous rounds, oldest first
 * @returns { valid, errors, stop } — `stop` is 方向 / 通过 / 瓶颈 / 继续, null on an invalid round
 */
export function checkRound(findings, score, history = []) {
  const errors = validateFindings(findings);
  if (!Number.isInteger(score) || score < 1 || score > 10) errors.push(`score must be an integer 1–10, got ${JSON.stringify(score)}`);
  const past = Array.isArray(history) ? history : [];
  if (past.some((s) => !Number.isInteger(s))) errors.push('history must be the previous rounds\' scores, integers, oldest first');
  if (errors.length) return { valid: false, errors, stop: null };
  if (findings.some((f) => f.kind === 'direction')) return { valid: true, errors: [], stop: '方向' };
  if (score >= STOP_THRESHOLD) return { valid: true, errors: [], stop: '通过' };
  if (isPlateau([...past, score])) return { valid: true, errors: [], stop: '瓶颈' };
  return { valid: true, errors: [], stop: '继续' };
}

export function renderRound(result, file, score) {
  const at = file ? ` (${file})` : '';
  if (!result.valid) return [`critic-round: 本轮无效${at}，重新起一个评委：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
  return [`critic-round: 有效${at}`, `  分数：${score}　停止判定：${result.stop}`].join('\n');
}

// CLI: the refine loop calls this each round with one JSON file { findings, score, history }.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: critic-score.mjs <round.json> [--json]   # { findings, score, history }');
    process.exit(1);
  }
  let round;
  try {
    round = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`critic-score: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const result = checkRound(round?.findings, round?.score, round?.history ?? []);
  console.log(json ? JSON.stringify(result, null, 2) : renderRound(result, file, round?.score));
  process.exit(result.valid ? 0 : 2);
}
