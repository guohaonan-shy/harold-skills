/**
 * UI implementation loop — the two deterministic comparators.
 *
 * These are the red/green judges of the UI implementation loop: the measurement
 * layer (primary) and the pixel layer (fallback). Neither one touches a browser,
 * a file, or a clock — the playwright shell (`ui-measure.mjs`) does all of that
 * and hands these functions plain data, which is why they are the only part of
 * the loop with unit tests.
 *
 * Finding shape is isomorphic to design-lint's: a closed field set, one stable
 * `id` per defect kind, `severity` on the same P0/P1/P2 ladder.
 */

/** Defect kinds. Closed set — a new kind is a deliberate edit here, not a string. */
export const FINDING_IDS = ['missing-anchor', 'position-drift', 'token-mismatch', 'pixel-mismatch'];

/** Severity ladder, most severe first — same rungs design-lint already uses. */
export const SEVERITIES = ['P0', 'P1', 'P2'];

/**
 * Every finding carries exactly these fields, always, in this shape:
 * 维度 = id · 严重度 = severity · 位置 = cell/anchor/property · 缺陷 = expected/actual/delta/detail.
 * Absent values are null, never omitted — a consumer never has to feature-detect.
 */
export const FINDING_FIELDS = [
  'id', 'severity', 'cell', 'anchor', 'property', 'expected', 'actual', 'delta', 'why', 'detail',
];

/**
 * Properties measured in px whose difference is judged against a tolerance.
 * Everything NOT in this set is a token value and must match exactly.
 */
const POSITION_PROPS = new Set([
  'top', 'left', 'right', 'bottom', 'width', 'height', 'x', 'y',
  'gap', 'rowGap', 'columnGap',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
]);

/** Defaults live here and in the reference; a ticket may override per matrix cell. */
export const DEFAULT_TOLERANCE = { position: 1 };

const WHY = {
  'missing-anchor':
    'The canvas has this anchor and the port does not — the two tabs are not showing the same thing, so every other number in this cell is unverified.',
  'position-drift':
    'A measured box differs by more than the position tolerance; geometry drifted during the port.',
  'token-mismatch':
    'A token value (color, size, radius, weight…) is not identical to the canvas — an off-token value is a second style system, not a rounding detail.',
};

function positionTolerance(tolerance, anchor) {
  const byAnchor = tolerance.byAnchor?.[anchor]?.position;
  if (typeof byAnchor === 'number') return byAnchor;
  return typeof tolerance.position === 'number' ? tolerance.position : DEFAULT_TOLERANCE.position;
}

/**
 * Measurement layer (primary).
 *
 * @param canvas  measurements from the design canvas, keyed by anchor
 * @param local   measurements from the ported route, keyed by the SAME anchors
 * @param tolerance  { position?: px, byAnchor?: { <anchor>: { position: px } } }
 * @param context    { cell?: string } — which matrix cell these came from
 * @returns findings, most severe first
 */
export function compareMeasurements(canvas, local, tolerance = {}, context = {}) {
  const cell = context.cell ?? null;
  const findings = [];

  for (const anchor of Object.keys(canvas)) {
    const expectedBox = canvas[anchor];
    const actualBox = local[anchor];

    if (actualBox === undefined || actualBox === null) {
      findings.push({
        id: 'missing-anchor', severity: 'P0', cell, anchor, property: null,
        expected: 'present', actual: 'absent', delta: null,
        why: WHY['missing-anchor'],
        detail: `anchor "${anchor}" is on the canvas but not on the ported route`,
      });
      continue;
    }

    const tol = positionTolerance(tolerance, anchor);
    for (const property of Object.keys(expectedBox)) {
      const expected = expectedBox[property];
      const actual = actualBox[property];

      if (POSITION_PROPS.has(property)) {
        const delta = Math.abs(Number(expected) - Number(actual));
        if (delta > tol) {
          findings.push({
            id: 'position-drift', severity: 'P1', cell, anchor, property,
            expected, actual, delta,
            why: WHY['position-drift'],
            detail: `${anchor}.${property}: ${expected} → ${actual} (off by ${delta}px, tolerance ±${tol}px)`,
          });
        }
        continue;
      }

      // Token class: exact match. No tolerance of any kind is consulted here —
      // "one shade off" is a different token, not a rounding error.
      if (expected !== actual) {
        findings.push({
          id: 'token-mismatch', severity: 'P1', cell, anchor, property,
          expected, actual, delta: null,
          why: WHY['token-mismatch'],
          detail: `${anchor}.${property}: ${expected} → ${actual} (must match exactly)`,
        });
      }
    }
  }

  return sortFindings(findings);
}

/** Deterministic order: severity, then anchor, then property. */
export function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
    if (bySeverity !== 0) return bySeverity;
    const byAnchor = String(a.anchor ?? '').localeCompare(String(b.anchor ?? ''));
    if (byAnchor !== 0) return byAnchor;
    return String(a.property ?? '').localeCompare(String(b.property ?? ''));
  });
}

// ---------- pixel layer (fallback) ----------

/**
 * Antialiasing tolerance — the only tolerance the pixel layer knows about.
 *
 * It is NOT the position tolerance and the two must never be read from the same
 * number: ±1px says "this box may sit one pixel off"; this says "these two pixels
 * are the same color as far as a rasterizer is concerned". A renderer that shades
 * a glyph edge differently is not a layout defect.
 *
 * The metric is the normalized perceived color distance in YIQ space (Kotsarenko &
 * Ramos, "Measuring perceived color difference"), the same one pixelmatch uses, and
 * 0.1 is pixelmatch's own default threshold.
 */
export const DEFAULT_ANTIALIAS_TOLERANCE = 0.1;

/** Max possible YIQ distance (pure white vs pure black), used to normalize. */
const MAX_YIQ_DISTANCE = 35215;

/** Composite RGBA onto white — screenshots are opaque, but never trust that blindly. */
function flatten(data, i) {
  const a = data[i + 3] / 255;
  return [
    255 + (data[i] - 255) * a,
    255 + (data[i + 1] - 255) * a,
    255 + (data[i + 2] - 255) * a,
  ];
}

function yiqDistance(p, q) {
  const y = (r, g, b) => r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
  const i = (r, g, b) => r * 0.59597799 - g * 0.27417610 - b * 0.32180189;
  const q2 = (r, g, b) => r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
  const dy = y(...p) - y(...q);
  const di = i(...p) - i(...q);
  const dq = q2(...p) - q2(...q);
  return 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq;
}

/**
 * Pixel layer (fallback) — catches what nobody thought to put an anchor on.
 *
 * @param canvas  { width, height, data } RGBA of the design canvas
 * @param local   { width, height, data } RGBA of the ported route, SAME size
 * @param options { antialias?: 0..1 } perceived-color distance below which two
 *                pixels count as the same color
 * @returns mismatch percentage, 0–100
 */
export function comparePixels(canvas, local, options = {}) {
  if (canvas.width !== local.width || canvas.height !== local.height) {
    throw new Error(
      `pixel layer needs two screenshots of the same size: ${canvas.width}×${canvas.height} vs ${local.width}×${local.height}`,
    );
  }
  const tolerance = typeof options.antialias === 'number' ? options.antialias : DEFAULT_ANTIALIAS_TOLERANCE;
  const cutoff = tolerance * tolerance * MAX_YIQ_DISTANCE;

  const total = canvas.width * canvas.height;
  let differing = 0;
  for (let i = 0; i < total * 4; i += 4) {
    if (yiqDistance(flatten(canvas.data, i), flatten(local.data, i)) > cutoff) differing += 1;
  }
  return (differing / total) * 100;
}

/** Default per-cell pixel budget, in percent. A ticket may override it per cell. */
export const DEFAULT_PIXEL_THRESHOLD = 1;

/**
 * Turn a mismatch percentage into a finding of the same shape as everything else.
 *
 * P2 on purpose: the pixel layer is the fallback. It knows something differs but
 * not what, so it must never outrank a measurement-layer finding that names the
 * anchor and the property.
 */
export function pixelFinding(percent, context = {}) {
  const threshold = typeof context.threshold === 'number' ? context.threshold : DEFAULT_PIXEL_THRESHOLD;
  if (percent <= threshold) return null;
  return {
    id: 'pixel-mismatch', severity: 'P2', cell: context.cell ?? null, anchor: null, property: null,
    expected: `≤ ${threshold}%`, actual: `${percent.toFixed(2)}%`, delta: percent - threshold,
    why: 'Pixels differ beyond the per-cell budget somewhere the measurement layer has no anchor on — either add an anchor there or explain the difference.',
    detail: `pixel mismatch ${percent.toFixed(2)}% (budget ${threshold}%)`,
  };
}

/** Human-readable render, same grouping design-lint uses. */
export function renderFindings(findings) {
  if (findings.length === 0) return 'ui-measure: green ✓';
  const lines = [];
  for (const severity of SEVERITIES) {
    const group = findings.filter((f) => f.severity === severity);
    if (!group.length) continue;
    lines.push(`${severity} (${group.length}):`);
    for (const f of group) lines.push(`  [${f.id}] ${f.cell ? `${f.cell} · ` : ''}${f.detail}`);
  }
  return lines.join('\n');
}
