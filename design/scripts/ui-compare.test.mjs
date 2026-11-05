import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMeasurements, comparePixels, pixelFinding, sortFindings, FINDING_IDS, FINDING_FIELDS, SEVERITIES } from './ui-compare.mjs';

const anchor = (over = {}) => ({ top: 100, left: 40, width: 320, height: 48, ...over });

test('position within tolerance is not a finding', () => {
  const canvas = { hero: anchor() };
  const local = { hero: anchor({ top: 101 }) };
  assert.deepEqual(compareMeasurements(canvas, local), []);
});

test('position beyond tolerance is one position finding', () => {
  const canvas = { hero: anchor() };
  const local = { hero: anchor({ top: 102 }) };
  const findings = compareMeasurements(canvas, local);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'position-drift');
  assert.equal(findings[0].anchor, 'hero');
  assert.equal(findings[0].property, 'top');
  assert.equal(findings[0].delta, 2);
});

test('a token value one step off is a token finding, not swallowed by the position tolerance', () => {
  const canvas = { cta: { ...anchor(), color: 'rgb(10, 10, 10)' } };
  const local = { cta: { ...anchor(), color: 'rgb(11, 11, 11)' } };
  const findings = compareMeasurements(canvas, local);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'token-mismatch');
  assert.equal(findings[0].property, 'color');
  assert.equal(findings[0].expected, 'rgb(10, 10, 10)');
  assert.equal(findings[0].actual, 'rgb(11, 11, 11)');
});

test('numeric token values get no tolerance either', () => {
  const canvas = { cta: { ...anchor(), fontSize: 16, borderRadius: 8 } };
  const local = { cta: { ...anchor(), fontSize: 17, borderRadius: 8 } };
  const findings = compareMeasurements(canvas, local);
  assert.deepEqual(findings.map((f) => f.property), ['fontSize']);
  assert.equal(findings[0].id, 'token-mismatch');
});

test('an anchor on the canvas but not on the port is the most severe finding there is', () => {
  const canvas = { hero: anchor(), cta: anchor({ top: 400 }) };
  const local = { hero: anchor() };
  const findings = compareMeasurements(canvas, local);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'missing-anchor');
  assert.equal(findings[0].anchor, 'cta');
  assert.equal(findings[0].severity, 'P0');
  // P0 is the top of the ladder — nothing this function emits outranks it.
  assert.equal(findings[0].severity, SEVERITIES[0]);
});

test('findings come back most severe first', () => {
  const canvas = { a: { ...anchor(), color: 'rgb(0, 0, 0)' }, z: anchor() };
  const local = { a: { ...anchor({ top: 120 }), color: 'rgb(1, 1, 1)' } };
  const findings = compareMeasurements(canvas, local);
  assert.deepEqual(findings.map((f) => f.severity), ['P0', 'P1', 'P1']);
});

test('every finding carries exactly the closed field set', () => {
  const canvas = { hero: { ...anchor(), color: 'rgb(0, 0, 0)' }, gone: anchor() };
  const local = { hero: { ...anchor({ left: 99 }), color: 'rgb(2, 2, 2)' } };
  for (const f of compareMeasurements(canvas, local, {}, { cell: 'mobile/dark/empty' })) {
    assert.deepEqual(Object.keys(f).sort(), FINDING_FIELDS.slice().sort());
    assert.ok(FINDING_IDS.includes(f.id));
    assert.ok(SEVERITIES.includes(f.severity));
    assert.equal(f.cell, 'mobile/dark/empty');
  }
});

test('a matrix cell may loosen the position tolerance for one anchor only', () => {
  const canvas = { hero: anchor(), cta: anchor() };
  const local = { hero: anchor({ top: 103 }), cta: anchor({ top: 103 }) };
  const tolerance = { position: 1, byAnchor: { hero: { position: 4 } } };
  const findings = compareMeasurements(canvas, local, tolerance);
  assert.deepEqual(findings.map((f) => f.anchor), ['cta']);
});

test('an extra anchor on the ported side is not a finding', () => {
  const canvas = { hero: anchor() };
  const local = { hero: anchor(), wrapper: anchor({ top: 0 }) };
  assert.deepEqual(compareMeasurements(canvas, local), []);
});

// ---------- pixel layer ----------

const solid = (w, h, [r, g, b]) => ({
  width: w, height: h,
  data: Uint8ClampedArray.from(
    Array.from({ length: w * h }, () => [r, g, b, 255]).flat(),
  ),
});

test('two identical screenshots mismatch by 0%', () => {
  assert.equal(comparePixels(solid(4, 4, [120, 30, 200]), solid(4, 4, [120, 30, 200])), 0);
});

test('an all-white screenshot against an all-black one mismatches by 100%', () => {
  assert.equal(comparePixels(solid(4, 4, [255, 255, 255]), solid(4, 4, [0, 0, 0])), 100);
});

test('the percentage is the share of differing pixels', () => {
  const a = solid(2, 2, [0, 0, 0]);
  const b = solid(2, 2, [0, 0, 0]);
  b.data.set([255, 255, 255, 255], 0); // one of four pixels
  assert.equal(comparePixels(a, b), 25);
});

test('screenshots of different sizes are a caller error, not a 100% result', () => {
  assert.throws(() => comparePixels(solid(4, 4, [0, 0, 0]), solid(4, 5, [0, 0, 0])), /same size/i);
});

test('the antialias tolerance absorbs a hair-thin color difference', () => {
  const a = solid(2, 2, [0, 0, 0]);
  const b = solid(2, 2, [0, 0, 0]);
  b.data.set([4, 4, 4, 255], 0);
  assert.equal(comparePixels(a, b, { antialias: 0 }) > 0, true);
  assert.equal(comparePixels(a, b), 0); // default antialias tolerance swallows it
});

test('the antialias tolerance and the position tolerance are different knobs', () => {
  // Feeding the pixel layer a position tolerance changes nothing…
  const a = solid(2, 2, [0, 0, 0]);
  const b = solid(2, 2, [255, 255, 255]);
  assert.equal(comparePixels(b, a, { position: 999 }), 100);
  // …and feeding the measurement layer an antialias tolerance changes nothing either.
  const findings = compareMeasurements({ hero: anchor() }, { hero: anchor({ top: 140 }) }, { antialias: 999 });
  assert.deepEqual(findings.map((f) => f.id), ['position-drift']);
});

test('the pixel layer only files a finding when it breaks the per-cell threshold', () => {
  assert.equal(pixelFinding(0.4, { cell: 'desktop/light/default' }), null);
  const f = pixelFinding(3.5, { cell: 'desktop/light/default' });
  assert.equal(f.id, 'pixel-mismatch');
  assert.equal(f.anchor, null);
  assert.equal(f.cell, 'desktop/light/default');
  assert.deepEqual(Object.keys(f).sort(), FINDING_FIELDS.slice().sort());
});

test('the pixel layer files below the measurement layer — it is the fallback, not the judge', () => {
  const pixel = pixelFinding(9, { cell: 'c' });
  const measured = compareMeasurements({ hero: anchor() }, { hero: anchor({ top: 200 }) }, {}, { cell: 'c' });
  assert.deepEqual(
    sortFindings([pixel, ...measured]).map((f) => f.id),
    ['position-drift', 'pixel-mismatch'],
  );
});
