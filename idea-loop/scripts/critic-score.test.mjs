import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkRound, validateFindings, scoreBand, worstSeverity, renderRound,
  DIMENSIONS, SEVERITIES, KINDS, KINDS_BY_SEVERITY, FINDING_FIELDS, STOP_THRESHOLD,
} from './critic-score.mjs';

/** A well-formed finding; every test starts from this and bends one thing. */
const finding = (severity, over = {}) => ({
  dimension: 'execution',
  severity,
  kind: KINDS_BY_SEVERITY[severity][0],
  where: 'hero',
  detail: 'placeholder',
  why: 'placeholder',
  ...over,
});

const p = (severity, n, over = {}) => Array.from({ length: n }, () => finding(severity, over));

// ---------- the ticket's black-box criteria ----------

test('two P3 scored 9 is a valid round and stops as pass', () => {
  const r = checkRound(p('P3', 2), 9);
  assert.equal(r.valid, true);
  assert.equal(r.stop, 'pass');
});

test('two P3 scored 10 is invalid — 10 means the critic found nothing to touch', () => {
  const r = checkRound(p('P3', 2), 10);
  assert.equal(r.valid, false);
  assert.deepEqual(r.band, { min: 9, max: 9 });
  assert.equal(r.stop, null);
});

test('one P1 scored 9 is invalid — a reflow-level finding caps the round at 7', () => {
  const r = checkRound(p('P1', 1), 9);
  assert.equal(r.valid, false);
  assert.deepEqual(r.band, { min: 7, max: 7 });
});

test('one P0 scored 5 is a valid round and stops as direction', () => {
  const r = checkRound(p('P0', 1), 5);
  assert.equal(r.valid, true);
  assert.equal(r.stop, 'direction');
});

test('three rounds running with P1 as the worst is a plateau on the third', () => {
  const r = checkRound(p('P1', 1), 7, ['P1', 'P1']);
  assert.equal(r.valid, true);
  assert.equal(r.stop, 'plateau');
});

test('a P2 carrying kind "direction" fails schema validation', () => {
  const bad = [finding('P2', { kind: 'direction' })];
  assert.equal(validateFindings(bad).length, 1);
  const r = checkRound(bad, 8);
  assert.equal(r.valid, false);
  assert.equal(r.stop, null);
  assert.match(r.errors[0], /kind/);
});

// ---------- the rest of the score ladder ----------

test('no findings at all is the only way to score 10', () => {
  const r = checkRound([], 10);
  assert.equal(r.valid, true);
  assert.equal(r.stop, 'pass');
  assert.equal(r.worst, null);
  assert.deepEqual(r.band, { min: 10, max: 10 });
});

test('more than two P3 drops out of the 9 band — the count adjustment inside the band', () => {
  assert.deepEqual(scoreBand(p('P3', 3)), { min: 8, max: 8 });
  assert.equal(checkRound(p('P3', 3), 9).valid, false);
  assert.equal(checkRound(p('P3', 3), 8).valid, true);
});

test('a P2 with no P1 above it is the 8 band', () => {
  assert.deepEqual(scoreBand([finding('P2'), ...p('P3', 5)]), { min: 8, max: 8 });
});

test('one P1 alongside a single P2 is still 7, two P2 pushes it to 6', () => {
  assert.deepEqual(scoreBand([finding('P1'), finding('P2')]), { min: 7, max: 7 });
  assert.deepEqual(scoreBand([finding('P1'), ...p('P2', 2)]), { min: 6, max: 6 });
});

test('two P1 is the 6 band', () => {
  assert.deepEqual(scoreBand(p('P1', 2)), { min: 6, max: 6 });
});

test('one P0 is the only band with room to move inside it', () => {
  assert.deepEqual(scoreBand(p('P0', 1)), { min: 4, max: 5 });
  assert.equal(checkRound(p('P0', 1), 4).valid, true);
  assert.equal(checkRound(p('P0', 1), 6).valid, false);
});

test('several P0 is a brief problem, not an execution one', () => {
  assert.deepEqual(scoreBand(p('P0', 2)), { min: 1, max: 3 });
  assert.equal(checkRound(p('P0', 2), 4).valid, false);
  assert.equal(checkRound(p('P0', 3), 2).valid, true);
});

test('the worst finding sets the ceiling regardless of what sits under it', () => {
  assert.equal(worstSeverity([finding('P3'), finding('P1'), finding('P2')]), 'P1');
});

// ---------- stop judgement ----------

test('pass needs the threshold, and the threshold is the one written in the rubric', () => {
  assert.equal(STOP_THRESHOLD, 9);
  assert.equal(checkRound([finding('P2')], 8).stop, 'continue');
});

test('one round of memory cannot see a plateau — it takes three', () => {
  assert.equal(checkRound(p('P1', 1), 7, 'P1').stop, 'continue');
  assert.equal(checkRound(p('P1', 1), 7, []).stop, 'continue');
});

test('a plateau at a different severity than this round is not a plateau', () => {
  assert.equal(checkRound(p('P2', 1), 8, ['P1', 'P1']).stop, 'continue');
});

test('direction outranks plateau — three P0 rounds still means reopen the direction', () => {
  assert.equal(checkRound(p('P0', 1), 5, ['P0', 'P0']).stop, 'direction');
});

test('an invalid round yields no stop judgement — the score it rests on is not trusted', () => {
  assert.equal(checkRound(p('P3', 2), 10).stop, null);
});

// ---------- the closed sets ----------

test('the closed sets are exactly the ones the rubric names', () => {
  assert.deepEqual(DIMENSIONS, ['philosophy', 'hierarchy', 'execution', 'specificity', 'restraint']);
  assert.deepEqual(SEVERITIES, ['P0', 'P1', 'P2', 'P3']);
  assert.deepEqual(KINDS, ['direction', 'pattern', 'craft']);
  assert.deepEqual(KINDS_BY_SEVERITY, {
    P0: ['direction'], P1: ['pattern', 'craft'], P2: ['craft'], P3: ['craft'],
  });
});

test('P1 accepts either kind, and nothing else does', () => {
  assert.deepEqual(validateFindings([finding('P1', { kind: 'pattern' })]), []);
  assert.deepEqual(validateFindings([finding('P1', { kind: 'craft' })]), []);
  assert.equal(validateFindings([finding('P0', { kind: 'craft' })]).length, 1);
  assert.equal(validateFindings([finding('P3', { kind: 'pattern' })]).length, 1);
});

test('an unknown dimension or severity or kind is a schema error, not a shrug', () => {
  assert.match(validateFindings([finding('P2', { dimension: 'vibes' })])[0], /dimension/);
  assert.match(validateFindings([{ ...finding('P2'), severity: 'P4' }])[0], /severity/);
  assert.match(validateFindings([finding('P2', { kind: 'taste' })])[0], /kind/);
});

test('a missing field and an extra field are both schema errors — the field set is closed', () => {
  const { why, ...missing } = finding('P2');
  assert.match(validateFindings([missing])[0], /why/);
  assert.match(validateFindings([{ ...finding('P2'), score: 3 }])[0], /score/);
  assert.deepEqual(FINDING_FIELDS, ['dimension', 'severity', 'kind', 'where', 'detail', 'why']);
});

test('absent values are null, never omitted — same contract the comparators use', () => {
  assert.deepEqual(validateFindings([finding('P2', { where: null })]), []);
  assert.match(validateFindings([finding('P2', { where: 42 })])[0], /where/);
});

test('every finding is reported, not just the first', () => {
  assert.equal(validateFindings([finding('P2', { kind: 'direction' }), finding('P0', { kind: 'craft' })]).length, 2);
});

test('a non-array, or a non-object inside it, is a schema error rather than a crash', () => {
  assert.equal(validateFindings(null).length, 1);
  assert.equal(validateFindings(['P2']).length, 1);
});

test('a score outside 1–10 or not an integer is invalid on its own', () => {
  assert.equal(checkRound([], 11).valid, false);
  assert.equal(checkRound([], 9.5).valid, false);
  assert.equal(checkRound([], '10').valid, false);
});

// ---------- the human-kept exclusion set ----------
//
// A finding that touches something the human chose is held back by the designer, put to the
// human, and — if the human says keep — excluded from the score on every later round. The
// critic stays blind; the exclusion lives in the round file, never in the finding shape.

const kept = (index, reason = '人保留（2026-10-19）：关闭按钮在右上') => ({ index, reason });

test('an empty exclusion set changes nothing — the result is byte-for-byte what it was without one', () => {
  const findings = [finding('P1'), finding('P3')];
  const without = checkRound(findings, 7, ['P1']);
  assert.deepEqual(checkRound(findings, 7, ['P1'], []), without);
  assert.equal(JSON.stringify(checkRound(findings, 7, ['P1'], [])), JSON.stringify(without));
  assert.equal(renderRound(checkRound(findings, 7, ['P1'], []), 'r.json'), renderRound(without, 'r.json'));
  assert.equal('excluded' in without, false);
  assert.equal('effectiveScore' in without, false);
});

test('the pre-existing result shape is pinned literally so "unchanged" cannot drift with the code', () => {
  assert.deepEqual(checkRound(p('P3', 2), 9), {
    valid: true, errors: [], worst: 'P3', counts: { P0: 0, P1: 0, P2: 0, P3: 2 }, band: { min: 9, max: 9 }, stop: 'pass',
  });
  assert.equal(
    renderRound(checkRound(p('P3', 2), 9), 'r.json'),
    'critic-round: 有效 ✓ (r.json)\n  最差：P3　计数：P3×2　允许区间：9–9\n  停止判定：pass',
  );
});

test('an excluded finding does not count: the P1 that the human kept no longer caps the round at 7', () => {
  const findings = [finding('P1', { where: 'close button' }), finding('P3')];
  const r = checkRound(findings, 7, [], [kept(0)]);
  assert.equal(r.valid, true);
  assert.equal(r.worst, 'P3');
  assert.deepEqual(r.counts, { P0: 0, P1: 0, P2: 0, P3: 1 });
  assert.deepEqual(r.band, { min: 9, max: 9 });
});

test('the critic is still held to what it wrote: the score must fit ALL its findings, kept or not', () => {
  const findings = [finding('P1'), finding('P3')];
  const r = checkRound(findings, 9, [], [kept(0)]);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /band 7–7/);
  assert.equal(r.stop, null);
});

test("the effective score is the critic's score moved just far enough into the band of what still counts", () => {
  const r = checkRound([finding('P1'), finding('P3')], 7, [], [kept(0)]);
  assert.equal(r.criticScore, 7);
  assert.equal(r.effectiveScore, 9);
  assert.equal(r.stop, 'pass');
});

test('excluding nothing that matters leaves the effective score where the critic put it', () => {
  const r = checkRound([finding('P1'), finding('P3')], 7, [], [kept(1)]);
  assert.equal(r.effectiveScore, 7);
  assert.equal(r.stop, 'continue');
});

test("excluded findings are listed one by one with the whole finding and the human's words — never dropped silently", () => {
  const findings = [finding('P2', { where: 'close button', detail: 'sits too far from the title' }), finding('P3', { where: 'footer' })];
  const r = checkRound(findings, 8, [], [kept(0, '人保留（2026-10-19）：关闭按钮在右上')]);
  assert.equal(r.excluded.length, 1);
  assert.deepEqual(r.excluded[0], {
    index: 0,
    reason: '人保留（2026-10-19）：关闭按钮在右上',
    finding: findings[0],
  });
  const text = renderRound(r, 'r.json');
  assert.match(text, /已被人保留，不计分（1 条）/);
  assert.match(text, /findings\[0\].*P2.*close button.*人保留（2026-10-19）：关闭按钮在右上/);
});

test('a kept P0 no longer sends the loop back to direction', () => {
  const r = checkRound([finding('P0'), finding('P3')], 5, [], [kept(0)]);
  assert.equal(r.valid, true);
  assert.equal(r.stop, 'pass');
});

test('excluding every finding is the 10 band — nothing left to touch', () => {
  const r = checkRound([finding('P2')], 8, [], [kept(0)]);
  assert.equal(r.worst, null);
  assert.equal(r.effectiveScore, 10);
  assert.equal(r.stop, 'pass');
});

test('an exclusion that points at a finding that is not there is an error, not a shrug', () => {
  for (const bad of [kept(2), kept(-1), kept(1.5), { index: '0', reason: 'x' }, { reason: 'x' }]) {
    const r = checkRound([finding('P2'), finding('P3')], 8, [], [bad]);
    assert.equal(r.valid, false, JSON.stringify(bad));
    assert.match(r.errors[0], /excluded\[0\]/);
    assert.equal(r.stop, null);
  }
});

test('an exclusion with no reason, a duplicate index, or a non-array set is an error', () => {
  const two = [finding('P2'), finding('P3')];
  assert.match(checkRound(two, 8, [], [{ index: 0, reason: '' }]).errors[0], /reason/);
  assert.match(checkRound(two, 8, [], [{ index: 0 }]).errors[0], /reason/);
  assert.match(checkRound(two, 8, [], [kept(0), kept(0)]).errors[0], /twice/);
  assert.equal(checkRound(two, 8, [], 'finding 0').valid, false);
  assert.equal(checkRound(two, 8, [], [null]).valid, false);
});

test('an unknown field on an exclusion is an error — the shape is closed like the findings are', () => {
  const r = checkRound([finding('P2')], 8, [], [{ index: 0, reason: 'x', why: 'y' }]);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /unknown field "why"/);
});

test('a malformed finding is reported before any exclusion is looked at', () => {
  const r = checkRound([finding('P2', { kind: 'direction' })], 8, [], [kept(9)]);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /kind/);
});

// ---------- the CLI: the round file carries the exclusion set ----------

function runCli(round) {
  const dir = mkdtempSync(join(tmpdir(), 'critic-score-'));
  const file = join(dir, 'round-1.json');
  writeFileSync(file, JSON.stringify(round));
  const out = spawnSync(process.execPath, [new URL('./critic-score.mjs', import.meta.url).pathname, file, '--json'], { encoding: 'utf8' });
  return { status: out.status, result: JSON.parse(out.stdout) };
}

test('CLI: a round file with no "excluded" key behaves as before', () => {
  const { status, result } = runCli({ findings: p('P3', 2), score: 9, history: [] });
  assert.equal(status, 0);
  assert.equal('excluded' in result, false);
});

test('CLI: "excluded" in the round file is honoured and an out-of-range index exits 2', () => {
  const ok = runCli({ findings: [finding('P1'), finding('P3')], score: 7, history: [], excluded: [kept(0)] });
  assert.equal(ok.status, 0);
  assert.equal(ok.result.excluded.length, 1);
  assert.equal(ok.result.effectiveScore, 9);
  const bad = runCli({ findings: [finding('P1')], score: 7, history: [], excluded: [kept(3)] });
  assert.equal(bad.status, 2);
  assert.equal(bad.result.valid, false);
});
