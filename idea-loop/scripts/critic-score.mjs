/**
 * Critic self-consistency check — the deterministic half of the design critic loop.
 *
 * The critic is a model. It reads `skills/design/uiux-refine/references/design/critic-rubric.md`, writes findings,
 * and puts a number on the round. This file does NOT score anything: it holds the critic
 * to what it just wrote. A score that does not follow from the findings is an invalid
 * round — rerun the critic, do not negotiate the number.
 *
 * It also owns the finding shape, which is a closed set: five dimensions, four severities,
 * three kinds, and a restricted kind×severity product. A finding outside that set is a
 * schema error, so a critic cannot invent an axis mid-loop and have it silently counted.
 *
 * Finding shape is isomorphic to the comparators' in `ui-compare.mjs` — same reading:
 * 维度 = dimension · 严重度 = severity · 位置 = where · 缺陷 = detail/why. The extra field
 * is `kind`, which the mechanical comparators have no use for and the critic loop routes on
 * (direction → reopen the direction, pattern → judgment first, else a suggested research question, craft → fix in place).
 * Absent values are null, never omitted — a consumer never has to feature-detect.
 *
 * One more input, optional: the exclusion set. A finding that asks to move something the human
 * chose is held back by the designer and put to the human; if the human says keep, the finding
 * is listed in `excluded` and no longer counts toward the round. The critic stays blind to all
 * of this — it is held to its own findings first, and only then are the kept ones taken out.
 * The set is by index into `findings` plus the human's words; the finding shape does not grow
 * a field for it. Empty or absent, every output is exactly what it was before the set existed.
 *
 * Pure: no browser, no model, no clock, no filesystem. Nothing here needs a mock.
 */

/** The five critique dimensions — design-core.md §6. Closed set. */
export const DIMENSIONS = ['philosophy', 'hierarchy', 'execution', 'specificity', 'restraint'];

/** Severity ladder, most severe first — the rungs the rubric anchors to an AD's action. */
export const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

/** What the finding asks for. Closed set; each routes to a different place in the loop. */
export const KINDS = ['direction', 'pattern', 'craft'];

/** The legal kind×severity product. A P0 is never a craft note; a P2 is never a direction. */
export const KINDS_BY_SEVERITY = {
  P0: ['direction'],
  P1: ['pattern', 'craft'],
  P2: ['craft'],
  P3: ['craft'],
};

/** Every finding carries exactly these fields, always, in this order. */
export const FINDING_FIELDS = ['dimension', 'severity', 'kind', 'where', 'detail', 'why'];

/** The stop threshold, stated in the rubric the critic reads — it is not hidden from it. */
export const STOP_THRESHOLD = 9;

/** Fields that may be null when they do not apply; everything else must be a string. */
const NULLABLE = new Set(['where']);

// ---------- schema ----------

/**
 * Guard the closed set.
 *
 * @param findings  what the critic produced this round
 * @returns one human-readable error per violation, `[]` when the whole array is well-formed
 */
export function validateFindings(findings) {
  if (!Array.isArray(findings)) return ['findings must be an array'];

  const errors = [];
  findings.forEach((f, i) => {
    const at = `findings[${i}]`;
    if (f === null || typeof f !== 'object' || Array.isArray(f)) {
      errors.push(`${at}: must be an object`);
      return;
    }

    for (const field of FINDING_FIELDS) {
      if (!(field in f)) errors.push(`${at}: missing field "${field}"`);
    }
    for (const field of Object.keys(f)) {
      if (!FINDING_FIELDS.includes(field)) errors.push(`${at}: unknown field "${field}"`);
    }

    if ('dimension' in f && !DIMENSIONS.includes(f.dimension)) {
      errors.push(`${at}: dimension "${f.dimension}" is not one of ${DIMENSIONS.join(' / ')}`);
    }
    if ('severity' in f && !SEVERITIES.includes(f.severity)) {
      errors.push(`${at}: severity "${f.severity}" is not one of ${SEVERITIES.join(' / ')}`);
    }
    if ('kind' in f && !KINDS.includes(f.kind)) {
      errors.push(`${at}: kind "${f.kind}" is not one of ${KINDS.join(' / ')}`);
    } else if ('kind' in f && SEVERITIES.includes(f.severity)) {
      const allowed = KINDS_BY_SEVERITY[f.severity];
      if (!allowed.includes(f.kind)) {
        errors.push(`${at}: kind "${f.kind}" is not legal on ${f.severity} (allowed: ${allowed.join(' / ')})`);
      }
    }

    for (const field of ['where', 'detail', 'why']) {
      if (!(field in f)) continue;
      const value = f[field];
      if (typeof value === 'string') continue;
      if (value === null && NULLABLE.has(field)) continue;
      errors.push(`${at}: ${field} must be a ${NULLABLE.has(field) ? 'string or null' : 'string'}`);
    }
  });
  return errors;
}

// ---------- the human-kept exclusion set ----------

/** Every exclusion carries exactly these fields: which finding, and the human's words for it. */
export const EXCLUSION_FIELDS = ['index', 'reason'];

/**
 * Guard the exclusion set against the findings it points into.
 *
 * @returns one human-readable error per violation, `[]` when the set is well-formed
 */
export function validateExclusions(findings, excluded) {
  if (!Array.isArray(excluded)) return ['excluded must be an array'];
  const errors = [];
  const seen = new Set();
  excluded.forEach((e, i) => {
    const at = `excluded[${i}]`;
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    for (const field of Object.keys(e)) {
      if (!EXCLUSION_FIELDS.includes(field)) errors.push(`${at}: unknown field "${field}"`);
    }
    if (typeof e.reason !== 'string' || e.reason.trim() === '') {
      errors.push(`${at}: reason must be a non-empty string — the human's words (人保留（日期）…) are what gets listed`);
    }
    if (!Number.isInteger(e.index) || e.index < 0 || e.index >= findings.length) {
      errors.push(`${at}: index ${JSON.stringify(e.index)} does not point at a finding (this round has ${findings.length}, indices 0–${findings.length - 1})`);
    } else if (seen.has(e.index)) {
      errors.push(`${at}: finding ${e.index} is excluded twice`);
    } else {
      seen.add(e.index);
    }
  });
  return errors;
}

// ---------- score bands ----------

/** Worst severity present, or null when the round found nothing. */
export function worstSeverity(findings) {
  for (const severity of SEVERITIES) {
    if (findings.some((f) => f.severity === severity)) return severity;
  }
  return null;
}

function counts(findings) {
  const out = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) if (f.severity in out) out[f.severity] += 1;
  return out;
}

/**
 * The band the findings allow. The worst finding sets the ceiling; count moves within it.
 *
 * Mirrors the score-band table in `skills/design/uiux-refine/references/design/critic-rubric.md` row for row — when
 * one changes, both change.
 *
 * @returns { min, max } inclusive
 */
export function scoreBand(findings) {
  const n = counts(findings);

  if (n.P0 >= 2) return { min: 1, max: 3 };           // several P0 — a brief problem
  if (n.P0 === 1) return { min: 4, max: 5 };          // one P0 — drift or slop, reopen
  if (n.P1 >= 2 || (n.P1 === 1 && n.P2 >= 2)) return { min: 6, max: 6 };
  if (n.P1 === 1) return { min: 7, max: 7 };
  if (n.P2 >= 1) return { min: 8, max: 8 };
  if (n.P3 > 2) return { min: 8, max: 8 };            // the count adjustment out of the 9 band
  if (n.P3 >= 1) return { min: 9, max: 9 };
  return { min: 10, max: 10 };
}

// ---------- the round ----------

/**
 * Check one critic round against itself.
 *
 * @param findings  the critic's findings this round
 * @param score     the number the critic put on the round, 1–10
 * @param history   the worst severity of each PREVIOUS round, oldest first. A bare string is
 *                  read as a one-round history. Plateau is a three-round property, so one
 *                  round of memory can never see one — that is why this takes a list and not
 *                  just "last round's worst".
 * @param excluded  findings the human has chosen to keep, as `[{ index, reason }]` — index into
 *                  `findings`, reason the human's words. They do not count toward the round and
 *                  come back listed in the result. A reference to a finding that is not there is
 *                  an error. `history` should carry the worst severity of what COUNTED in each
 *                  previous round, so a kept finding does not feed a false 瓶颈 (bottleneck).
 * @returns { valid, errors, worst, counts, band, stop }
 *          `stop` is one of 继续 / 通过 / 瓶颈 / 方向, and is null on an invalid
 *          round: the judgement would rest on a score that does not follow from the findings.
 *          With a non-empty `excluded`, worst / counts / band describe what still counts, and
 *          `criticScore`, `effectiveScore` and the listed `excluded` are added; with none, the
 *          result is exactly the shape it had before the set existed.
 */
export function checkRound(findings, score, history = [], excluded = []) {
  const errors = validateFindings(findings);
  const past = typeof history === 'string' ? [history] : Array.isArray(history) ? history : [];

  if (errors.length) {
    return { valid: false, errors, worst: null, counts: null, band: null, stop: null };
  }
  const exclusionErrors = validateExclusions(findings, excluded);
  if (exclusionErrors.length) {
    return { valid: false, errors: exclusionErrors, worst: null, counts: null, band: null, stop: null };
  }
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return {
      valid: false,
      errors: [`score must be an integer 1–10, got ${JSON.stringify(score)}`],
      worst: worstSeverity(findings),
      counts: counts(findings),
      band: scoreBand(findings),
      stop: null,
    };
  }

  // The critic is held to everything it wrote — kept findings included.
  const criticBand = scoreBand(findings);
  const criticWorst = worstSeverity(findings);
  const valid = score >= criticBand.min && score <= criticBand.max;

  if (!valid) {
    return {
      valid: false,
      errors: [
        `score ${score} is outside the band ${criticBand.min}–${criticBand.max} that ${criticWorst ?? 'no findings'} allows — rerun the critic`,
      ],
      worst: criticWorst,
      counts: counts(findings),
      band: criticBand,
      stop: null,
    };
  }

  if (excluded.length === 0) {
    return { valid: true, errors: [], worst: criticWorst, counts: counts(findings), band: criticBand, stop: stopDecision(criticWorst, score, past) };
  }

  // Only now take the kept ones out. What still counts sets the band, the worst and the stop;
  // the critic's own number is moved the least that puts it inside that band.
  const dropped = new Set(excluded.map((e) => e.index));
  const counted = findings.filter((_, i) => !dropped.has(i));
  const band = scoreBand(counted);
  const worst = worstSeverity(counted);
  const effectiveScore = Math.min(Math.max(score, band.min), band.max);
  return {
    valid: true,
    errors: [],
    worst,
    counts: counts(counted),
    band,
    stop: stopDecision(worst, effectiveScore, past),
    criticScore: score,
    effectiveScore,
    excluded: excluded.map((e) => ({ index: e.index, reason: e.reason, finding: findings[e.index] })),
  };
}

/**
 * Direction beats everything — a P0 means the next round is not another polish pass, so
 * "we have been stuck at P0 for three rounds" and "reopen the direction" are the same call.
 */
function stopDecision(worst, score, past) {
  if (worst === 'P0') return '方向';
  if (score >= STOP_THRESHOLD) return '通过';
  const [a, b] = past.slice(-2);
  if (worst !== null && past.length >= 2 && a === worst && b === worst) return '瓶颈';
  return '继续';
}

/** Human-readable render, same grouping the other scripts use. */
export function renderRound(result, file) {
  const at = file ? ` (${file})` : '';
  if (!result.valid) {
    return [`critic-round: 本轮无效${at} —— 重跑评委，不要把分数谈下来：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
  }
  const n = result.counts;
  const tally = SEVERITIES.filter((s) => n[s]).map((s) => `${s}×${n[s]}`).join(' · ') || '无 finding';
  const lines = [
    `critic-round: 有效 ✓${at}`,
    `  最差：${result.worst ?? '无'}　计数：${tally}　允许区间：${result.band.min}–${result.band.max}`,
    `  停止判定：${result.stop}`,
  ];
  if (result.excluded?.length) {
    lines.splice(2, 0, `  评委分 ${result.criticScore} → 计入后 ${result.effectiveScore}`);
    lines.push(`  已被人保留，不计分（${result.excluded.length} 条）：`);
    for (const e of result.excluded) {
      lines.push(`    - findings[${e.index}] ${e.finding.severity} ${e.finding.where ?? '（无位置）'}：${e.finding.detail}　←　${e.reason}`);
    }
  }
  return lines.join('\n');
}

// CLI — the thin shell the refine loop calls each round. The module above stays pure;
// the filesystem enters only here. Input is one JSON file: { findings, score, history, excluded? }.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: critic-score.mjs <round.json> [--json]   # { findings, score, history, excluded? }');
    process.exit(1);
  }
  let round;
  try {
    round = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`critic-score: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const result = checkRound(round?.findings, round?.score, round?.history ?? [], round?.excluded ?? []);
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderRound(result, file));
  process.exit(result.valid ? 0 : 2);
}
