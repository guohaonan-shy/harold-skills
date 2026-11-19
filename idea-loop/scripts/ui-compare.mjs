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
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
]);

/**
 * How a layout was written, not where it ended up: `margin-top` on the lower block, `margin-bottom` on the
 * upper one and `space-y` / `gap` on the parent all put the box at the same top. The result is the box's
 * top/left/width/height, which is already compared; these are never compared themselves (not as a
 * position, and not as a token either). Padding stays: it sets how far the element's own background reaches.
 */
const LAYOUT_ONLY_PROPS = new Set([
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'rowGap', 'columnGap',
]);

// ---------- color conversion ----------

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** A color as it sits inside a (possibly compound) value: a hex, or one function call without nesting. */
const COLOR_IN_VALUE = /#[0-9a-f]+\b|\b(?:rgba?|oklch|oklab|color)\([^()]*\)/gi;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** One component → number. `%` is `percentScale` × the percentage; `none` is 0; anything else unparsable is NaN. */
function component(token, percentScale = 1) {
  if (token === undefined) return NaN;
  const t = token.toLowerCase();
  if (t === 'none') return 0;
  if (t.endsWith('%')) return NUMBER.test(t.slice(0, -1)) ? (Number.parseFloat(t) / 100) * percentScale : NaN;
  return NUMBER.test(t) ? Number.parseFloat(t) : NaN;
}

/** A hue → degrees. Bare numbers are degrees. */
function hue(token) {
  if (token === undefined) return NaN;
  const t = token.toLowerCase();
  if (t === 'none') return 0;
  const unit = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
  const m = /^(.+?)(deg|grad|rad|turn)?$/.exec(t);
  if (!m || !NUMBER.test(m[1])) return NaN;
  return Number.parseFloat(m[1]) * (m[2] ? unit[m[2]] : 1);
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Linear-light sRGB (0–1, may lie outside) → gamma-encoded sRGB cut to the gamut, 0–1. */
function encodeSrgb(linear) {
  const v = clamp01(linear);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** OKLab (Björn Ottosson's matrices) → [r, g, b] 0–1, each cut to the sRGB gamut. */
function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(encodeSrgb);
}

/** One color written one way → { r, g, b, a } with r/g/b whole numbers 0–255 and a whole 0–255; null if not understood. */
function parseColor(text) {
  if (HEX_COLOR.test(text)) {
    let h = text.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const [r, g, b, a = 255] = h.match(/../g).map((x) => Number.parseInt(x, 16));
    return { r, g, b, a };
  }
  const m = /^(rgba?|oklch|oklab|color)\(([^()]*)\)$/i.exec(text);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const [main, ...rest] = m[2].split('/');
  if (rest.length > 1) return null;
  const tokens = main.trim().split(/[\s,]+/).filter(Boolean);
  let alphaToken = rest[0]?.trim();
  let channels;
  if (name === 'color') {
    if (tokens.shift()?.toLowerCase() !== 'srgb' || tokens.length !== 3) return null;
    channels = tokens.map((t) => component(t));
  } else if (name === 'rgb' || name === 'rgba') {
    if (tokens.length === 4 && alphaToken === undefined) alphaToken = tokens.pop();
    if (tokens.length !== 3) return null;
    channels = tokens.map((t) => component(t, 255) / 255);
  } else {
    if (tokens.length !== 3) return null;
    const L = component(tokens[0], 1);
    const second = component(tokens[1], 0.4); // oklch: chroma; oklab: a (100% = 0.4 in both)
    if (name === 'oklch') {
      const rad = (hue(tokens[2]) * Math.PI) / 180;
      channels = oklabToSrgb(L, second * Math.cos(rad), second * Math.sin(rad));
    } else {
      channels = oklabToSrgb(L, second, component(tokens[2], 0.4));
    }
  }
  const alpha = alphaToken === undefined ? 1 : component(alphaToken, 1);
  if (channels.some(Number.isNaN) || Number.isNaN(alpha)) return null;
  const [r, g, b] = channels.map((c) => Math.round(clamp01(c) * 255));
  return { r, g, b, a: Math.round(clamp01(alpha) * 255) };
}

/** The shortest decimal (up to 3 places) that is the same 8-bit alpha: 26 → "0.1", 128 → "0.5". */
function alphaText(a8) {
  for (let digits = 0; digits <= 3; digits += 1) {
    const text = (a8 / 255).toFixed(digits);
    if (Math.round(Number(text) * 255) === a8) return String(Number(text));
  }
  return String(a8 / 255);
}

/**
 * Every color in a value, rewritten as 8-bit sRGB plus opacity: `rgb(r, g, b)` or `rgba(r, g, b, a)`.
 *
 * The browser hands back a color in the colour space the author wrote it in (`oklch(…)` stays `oklch(…)`,
 * a hex becomes `rgb(…)`), so the same colour reads as two different strings. This is the one function
 * that makes them comparable — it runs here, not in the page, so the answer does not depend on which
 * browser measured it. A colour outside the sRGB gamut is cut to 0–255 per channel, as the screen draws it.
 *
 * Colors nested in a compound value (`boxShadow`, `border`) are rewritten where they sit; anything it does
 * not recognise — another colour space, `var()`, a keyword, a number — comes back exactly as it went in.
 */
export function normalizeColors(value) {
  if (typeof value !== 'string') return value;
  return value.replace(COLOR_IN_VALUE, (text) => {
    const c = parseColor(text);
    if (!c) return text;
    return c.a === 255 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${alphaText(c.a)})`;
  });
}

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
      if (LAYOUT_ONLY_PROPS.has(property)) continue;
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
      // "one shade off" is a different token, not a rounding error. Colors are first
      // brought to 8-bit sRGB (see normalizeColors) so two spellings of one color are one token.
      const expectedSrgb = normalizeColors(expected);
      const actualSrgb = normalizeColors(actual);
      if (expectedSrgb !== actualSrgb) {
        const converted = expectedSrgb !== expected || actualSrgb !== actual;
        findings.push({
          id: 'token-mismatch', severity: 'P1', cell, anchor, property,
          expected, actual, delta: null,
          why: WHY['token-mismatch'],
          detail: `${anchor}.${property}: ${expected} → ${actual} (must match exactly${converted ? `; as 8-bit sRGB: ${expectedSrgb} → ${actualSrgb}` : ''})`,
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
 * @returns mismatch percentage, 0–100. A pixel that is not close to the other
 *          image's pixel at the same position still counts as the same when it
 *          passes the 3×3 neighbourhood check both ways (see inNeighbourhood).
 */
export function comparePixels(canvas, local, options = {}) {
  if (canvas.width !== local.width || canvas.height !== local.height) {
    throw new Error(
      `pixel layer needs two screenshots of the same size: ${canvas.width}×${canvas.height} vs ${local.width}×${local.height}`,
    );
  }
  const tolerance = typeof options.antialias === 'number' ? options.antialias : DEFAULT_ANTIALIAS_TOLERANCE;
  const cutoff = tolerance * tolerance * MAX_YIQ_DISTANCE;

  const { width, height } = canvas;
  const total = width * height;
  let differing = 0;
  for (let i = 0; i < total * 4; i += 4) {
    if (yiqDistance(flatten(canvas.data, i), flatten(local.data, i)) <= cutoff) continue;
    // Not close at the same position: a glyph that sits a fraction of a pixel off lights its edge
    // pixels differently, and that is not a layout defect. Look one pixel around (below).
    const at = i / 4;
    if (inNeighbourhood(canvas, local, at % width, Math.floor(at / width))) continue;
    differing += 1;
  }
  return (differing / total) * 100;
}

/**
 * The per-channel range (min, max) of the 3×3 block of pixels around (x, y), cut at the picture's edge.
 * Radius 1 is in screenshot pixels, not CSS px, and is fixed: it is not a tolerance anyone sets, and it is
 * not the ±1px position tolerance (that one is for measured boxes, in CSS px).
 */
function neighbourhoodRange(image, x, y) {
  const lo = [255, 255, 255];
  const hi = [0, 0, 0];
  for (let ny = Math.max(0, y - 1); ny <= Math.min(image.height - 1, y + 1); ny += 1) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(image.width - 1, x + 1); nx += 1) {
      const rgb = flatten(image.data, (ny * image.width + nx) * 4);
      for (let c = 0; c < 3; c += 1) {
        if (rgb[c] < lo[c]) lo[c] = rgb[c];
        if (rgb[c] > hi[c]) hi[c] = rgb[c];
      }
    }
  }
  return { lo, hi };
}

const within = (rgb, { lo, hi }) => rgb.every((v, c) => v >= lo[c] && v <= hi[c]);

/**
 * The same pixel judged against its surroundings, pixelmatch's way: each side's pixel has to lie inside the
 * per-channel colour range of the other side's 3×3 neighbourhood — both ways. One way alone would let a
 * lone dark pixel on white pass (white is inside the dark pixel's range; the dark pixel is not inside white's).
 */
function inNeighbourhood(a, b, x, y) {
  const i = (y * a.width + x) * 4;
  return within(flatten(a.data, i), neighbourhoodRange(b, x, y)) && within(flatten(b.data, i), neighbourhoodRange(a, x, y));
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