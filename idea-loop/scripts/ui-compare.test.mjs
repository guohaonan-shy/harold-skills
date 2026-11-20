import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMeasurements, comparePixels, pixelFinding, sortFindings, normalizeColors,
  FINDING_IDS, FINDING_FIELDS, SEVERITIES,
} from './ui-compare.mjs';

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

// ---------- color conversion ----------

test('a hex color becomes the 8-bit sRGB the screen shows', () => {
  assert.equal(normalizeColors('#3b82f6'), 'rgb(59, 130, 246)');
  assert.equal(normalizeColors('#FFF'), 'rgb(255, 255, 255)');
  assert.equal(normalizeColors('#0000ff80'), 'rgba(0, 0, 255, 0.5)');
});

test('rgb() and rgba() are rewritten into one canonical spelling, in either syntax', () => {
  assert.equal(normalizeColors('rgb(59, 130, 246)'), 'rgb(59, 130, 246)');
  assert.equal(normalizeColors('rgb(59 130 246)'), 'rgb(59, 130, 246)');
  assert.equal(normalizeColors('rgba(0, 0, 0, 0.1)'), 'rgba(0, 0, 0, 0.1)');
  assert.equal(normalizeColors('rgb(59 130 246 / 50%)'), 'rgba(59, 130, 246, 0.5)');
  assert.equal(normalizeColors('rgba(59, 130, 246, 1)'), 'rgb(59, 130, 246)');
});

test('oklch() is converted to 8-bit sRGB; a color outside the sRGB gamut is cut to 0–255 per channel', () => {
  // The Tailwind v4 blue: measured by painting it in headless Chromium, the pixel is 43,127,255.
  assert.equal(normalizeColors('oklch(0.623 0.214 259.815)'), 'rgb(43, 127, 255)');
  assert.equal(normalizeColors('oklch(1 0 0)'), 'rgb(255, 255, 255)');
  assert.equal(normalizeColors('oklch(0 0 0)'), 'rgb(0, 0, 0)');
  assert.equal(normalizeColors('oklch(62.3% 0.214 259.815deg / 0.5)'), 'rgba(43, 127, 255, 0.5)');
  const out = normalizeColors('oklch(0.7 0.4 150)');
  const channels = out.match(/\d+/g).map(Number);
  assert.equal(channels.length, 3);
  assert.ok(channels.every((c) => c >= 0 && c <= 255), out);
  assert.equal(channels[0], 0); // far outside the gamut: red is cut at the floor
});

test('oklab() and color(srgb …) are converted too', () => {
  assert.equal(normalizeColors('oklab(0.5 0 0)'), 'rgb(99, 99, 99)');
  assert.equal(normalizeColors('oklab(1 0 0 / 0.25)'), 'rgba(255, 255, 255, 0.25)');
  assert.equal(normalizeColors('color(srgb 1 0 0)'), 'rgb(255, 0, 0)');
  assert.equal(normalizeColors('color(srgb 0.5 0.5 0.5 / 0.5)'), 'rgba(128, 128, 128, 0.5)');
});

test('colors inside a compound value (a shadow, a border) are converted where they sit', () => {
  assert.equal(
    normalizeColors('oklch(0.623 0.214 259.815) 0px 4px 6px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px 0px'),
    'rgb(43, 127, 255) 0px 4px 6px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px 0px',
  );
  assert.equal(normalizeColors('1px solid #3b82f6'), '1px solid rgb(59, 130, 246)');
});

test('a spelling it does not recognize comes back exactly as it went in', () => {
  for (const v of ['color(display-p3 1 0 0)', 'currentcolor', 'var(--brand)', 'Inter, sans-serif', 'oklch(from red l c h)', '', 16, null]) {
    assert.equal(normalizeColors(v), v);
  }
});

const BLUE_RGB = 'rgb(59, 130, 246)';
const BLUE_OKLCH = 'oklch(0.6231 0.188 259.8)'; // the same blue, written the way Tailwind v4 writes colors

test('the same color written as rgb on the canvas and oklch on the port is not a finding', () => {
  const canvas = { cta: { ...anchor(), color: BLUE_RGB, boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px' } };
  const local = { cta: { ...anchor(), color: BLUE_OKLCH, boxShadow: 'oklch(0 0 0 / 0.1) 0px 1px 2px 0px' } };
  assert.deepEqual(compareMeasurements(canvas, local), []);
});

test('after conversion a color one level off in one channel is still a token finding, carrying both spellings and both conversions', () => {
  const off = 'rgb(59, 130, 247)';
  const findings = compareMeasurements({ cta: { ...anchor(), color: off } }, { cta: { ...anchor(), color: BLUE_OKLCH } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'token-mismatch');
  assert.equal(findings[0].expected, off);
  assert.equal(findings[0].actual, BLUE_OKLCH);
  assert.match(findings[0].detail, /rgb\(59, 130, 247\)/);
  assert.match(findings[0].detail, /oklch\(0\.6231 0\.188 259\.8\)/);
  assert.match(findings[0].detail, /rgb\(59, 130, 246\)/); // what the oklch spelling converts to
});

test('a color the converter does not know is still compared as the original string', () => {
  const canvas = { cta: { ...anchor(), color: 'color(display-p3 1 0 0)' } };
  assert.deepEqual(compareMeasurements(canvas, { cta: { ...anchor(), color: 'color(display-p3 1 0 0)' } }), []);
  assert.equal(compareMeasurements(canvas, { cta: { ...anchor(), color: 'color(display-p3 1 0 0.1)' } })[0].id, 'token-mismatch');
});

// ---------- margin and gap are how a layout was written, not where it ended up ----------

test('margin and gap are not compared: the same box position written two ways is not a finding', () => {
  const canvas = { block: { ...anchor({ top: 120 }), marginTop: 16, marginBottom: 0, gap: 0, rowGap: 0, columnGap: 0 } };
  const local = { block: { ...anchor({ top: 120 }), marginTop: 0, marginBottom: 16, gap: 8, rowGap: 8, columnGap: 8, marginLeft: 4, marginRight: 4 } };
  assert.deepEqual(compareMeasurements(canvas, local), []);
});

test('the box itself still drifts, and padding is still compared', () => {
  const canvas = { block: { ...anchor({ top: 120 }), marginTop: 16, paddingTop: 8 } };
  const local = { block: { ...anchor({ top: 130 }), marginTop: 0, paddingTop: 12 } };
  const findings = compareMeasurements(canvas, local);
  assert.deepEqual(findings.map((f) => `${f.id}:${f.property}`), ['position-drift:paddingTop', 'position-drift:top']);
});

// ---------- pixel layer: sub-pixel shifts ----------

/** A 100×40 page: white, with a black block spanning the full height from x = `from` to `to`. */
const bar = (from, to) => {
  const width = 100;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = x >= from && x < to ? 0 : 255;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
};

test('a sharp edge moved by one pixel is the same picture (the stand-in for a sub-pixel shift)', () => {
  assert.equal(comparePixels(bar(20, 50), bar(21, 51)) <= 1, true);
});

test('a sharp edge moved by two pixels is still a mismatch beyond the 1% budget', () => {
  assert.equal(comparePixels(bar(20, 50), bar(22, 52)) > 1, true);
});

test('the neighbourhood is judged both ways: a lone dark pixel on white is not the same as plain white', () => {
  // White lies inside the dark pixel's neighbourhood range, but the dark pixel is not inside white's.
  const a = solid(5, 5, [255, 255, 255]);
  const b = solid(5, 5, [255, 255, 255]);
  b.data.set([0, 0, 0, 255], (2 * 5 + 2) * 4);
  assert.equal(comparePixels(a, b) > 0, true);
});
