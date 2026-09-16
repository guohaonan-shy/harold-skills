import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRound, validateFindings, scoreBand, worstSeverity,
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
