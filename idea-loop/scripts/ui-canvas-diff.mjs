/**
 * Two versions of one design canvas, compared — the deterministic half.
 *
 * `ui-measure.mjs` opens the two versions in a browser, measures every anchor and
 * cuts a screenshot out of each; everything it then has to decide is here, on plain
 * data, so it can be unit-tested without a browser:
 *
 *  - `regionBox`      where to cut the anchor's area out of a screenshot
 *  - `diffAnchors`    which anchors changed between the two versions, and how
 *  - `parseChangeSet` the shape of the change set a designer hands in with a version
 *  - `classifyChanges` which of the changes the change set declared, and which it did not
 *
 * The shape of the change set is fixed here (and written up in the ui-measure
 * skill): one entry per decision the human made last round —
 *   { decision: "<round>.<n>", states: [state names], anchors: [anchor names] }
 */

import { compareMeasurements } from './ui-compare.mjs';

const present = (r) => r && r.width > 0 && r.height > 0;

/**
 * The box (whole CSS pixels, page coordinates) an anchor's screenshot is cut from.
 *
 * Both versions are cut from the SAME box so the two crops have the same size —
 * the pixel comparator refuses two sizes. The box covers the anchor in both
 * versions (an anchor that grew is judged over its larger area) and is cut down to
 * what both pages actually have. Returns null when nothing is left to look at
 * (hidden on both sides, or entirely outside one of the pages).
 *
 * @param a, b         { top, left, width, height } of the anchor on each side, or undefined
 * @param pageA, pageB { width, height } of each page
 */
export function regionBox(a, b, pageA, pageB) {
  const rects = [a, b].filter(present);
  if (rects.length === 0) return null;
  const x = Math.floor(Math.min(...rects.map((r) => r.left)));
  const y = Math.floor(Math.min(...rects.map((r) => r.top)));
  const right = Math.min(Math.ceil(Math.max(...rects.map((r) => r.left + r.width))), Math.min(pageA.width, pageB.width));
  const bottom = Math.min(Math.ceil(Math.max(...rects.map((r) => r.top + r.height))), Math.min(pageA.height, pageB.height));
  const width = right - Math.max(x, 0);
  const height = bottom - Math.max(y, 0);
  if (width <= 0 || height <= 0) return null;
  return { x: Math.max(x, 0), y: Math.max(y, 0), width, height };
}

/**
 * Which anchors differ between two versions of one state.
 *
 * Shared anchors are compared with the same measurement-layer rules as everything
 * else (position within ±tolerance is the same; a token value is the same only if
 * identical). An anchor in one version only is "added" / "removed".
 *
 * @param before, after  measurements keyed by anchor
 * @param tolerance      { position?, byAnchor? } as for compareMeasurements
 * @returns [{ anchor, kind: 'changed'|'added'|'removed', changes: [{ property, before, after, delta }] }]
 */
export function diffAnchors(before, after, tolerance = {}) {
  const out = [];
  const shared = Object.keys(before).filter((a) => after[a] != null);
  const findings = compareMeasurements(
    Object.fromEntries(shared.map((a) => [a, before[a]])),
    Object.fromEntries(shared.map((a) => [a, after[a]])),
    tolerance,
  );
  const byAnchor = new Map();
  for (const f of findings) {
    if (!byAnchor.has(f.anchor)) byAnchor.set(f.anchor, []);
    byAnchor.get(f.anchor).push({ property: f.property, before: f.expected, after: f.actual, delta: f.delta });
  }
  for (const [anchor, changes] of byAnchor) out.push({ anchor, kind: 'changed', changes });
  for (const anchor of Object.keys(before)) if (after[anchor] == null) out.push({ anchor, kind: 'removed', changes: [] });
  for (const anchor of Object.keys(after)) if (before[anchor] == null) out.push({ anchor, kind: 'added', changes: [] });
  return out.sort((a, b) => a.anchor.localeCompare(b.anchor));
}

const isNameList = (v) => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s !== '');

/** Validate a change set; throws a message that names the offending entry. */
export function parseChangeSet(raw) {
  if (!Array.isArray(raw)) throw new Error('changeSet 必须是数组（第一轮没有改动就写 []）');
  return raw.map((entry, i) => {
    const at = `changeSet[${i}]`;
    if (!entry || typeof entry !== 'object') throw new Error(`${at} 必须是对象`);
    if (typeof entry.decision !== 'string' || !/^\d+\.\d+$/.test(entry.decision)) {
      throw new Error(`${at}.decision 必须是 <轮次>.<序号>，例如 "2.1"，拿到 ${JSON.stringify(entry.decision)}`);
    }
    if (!isNameList(entry.states)) throw new Error(`${at}.states 必须是非空的状态名数组`);
    if (!isNameList(entry.anchors)) throw new Error(`${at}.anchors 必须是非空的锚点名数组`);
    return { decision: entry.decision, states: [...entry.states], anchors: [...entry.anchors] };
  });
}

/**
 * Split changes by whether the change set declared them.
 *
 * @param changes         [{ cell, state, anchor, kind, changes, pixelPercent }]
 * @param changeSet       parsed change set
 * @param comparedStates  the states some matrix cell actually compared
 * @returns {
 *   declared:          changes some entry covers, each with `decisions`
 *   undeclared:        changes no entry covers — "没声明却变了的地方"
 *   declaredUnchanged: [{ decision, state, anchor }] declared for a compared state, but nothing changed there
 *   unchecked:         [{ decision, state }] declared for a state no cell compared — unknown, not "unchanged"
 * }
 */
export function classifyChanges(changes, changeSet, comparedStates) {
  const declared = [];
  const undeclared = [];
  for (const c of changes) {
    const decisions = changeSet
      .filter((e) => e.states.includes(c.state) && e.anchors.includes(c.anchor))
      .map((e) => e.decision);
    if (decisions.length) declared.push({ ...c, decisions });
    else undeclared.push(c);
  }

  const changed = new Set(changes.map((c) => `${c.state}\u0000${c.anchor}`));
  const compared = new Set(comparedStates);
  const declaredUnchanged = [];
  const unchecked = [];
  for (const e of changeSet) {
    for (const state of e.states) {
      if (!compared.has(state)) { unchecked.push({ decision: e.decision, state }); continue; }
      for (const anchor of e.anchors) {
        if (!changed.has(`${state}\u0000${anchor}`)) declaredUnchanged.push({ decision: e.decision, state, anchor });
      }
    }
  }
  return { declared, undeclared, declaredUnchanged, unchecked };
}

/** `<cell>--<anchor>--<side>.png`, safe as a file name. */
export function shotFileName(cell, anchor, side) {
  const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe(cell)}--${safe(anchor)}--${side}.png`;
}

/**
 * Does the run need a human's look (exit 2)?
 * With a change set: only changes it did not declare. Without one: any change.
 */
export function hasAttention(report, hasChangeSet) {
  return hasChangeSet ? report.undeclared.length > 0 : report.changed.length > 0;
}

function describe(c) {
  const where = `${c.cell} · ${c.anchor}`;
  const what = c.kind === 'added' ? '新版新增的锚点'
    : c.kind === 'removed' ? '新版没有了这个锚点'
      : [
        ...c.changes.map((x) => `${x.property}: ${x.before} → ${x.after}`),
        ...(c.pixelPercent != null && c.pixelPercent > 0 ? [`区域像素差 ${c.pixelPercent.toFixed(2)}%`] : []),
      ].join('；');
  return `  ${where}  ${what}${c.decisions ? `  （改动集 ${c.decisions.join('、')}）` : ''}`;
}

/** Human-readable render. The undeclared block comes first. */
export function renderCanvasDiff(report, hasChangeSet) {
  if (report.changed.length === 0 && report.declaredUnchanged.length === 0 && report.unchecked.length === 0) {
    return 'ui-measure: 两版没有变化 ✓';
  }
  const lines = [];
  if (hasChangeSet) {
    lines.push(`没声明却变了的地方（${report.undeclared.length}）：`, ...report.undeclared.map(describe));
    if (report.declared.length) lines.push(`改动集里声明过的（${report.declared.length}）：`, ...report.declared.map(describe));
    if (report.declaredUnchanged.length) {
      lines.push(`改动集声明了、却没变的（${report.declaredUnchanged.length}）：`,
        ...report.declaredUnchanged.map((d) => `  ${d.decision}  ${d.state} · ${d.anchor}`));
    }
    if (report.unchecked.length) {
      lines.push(`改动集声明了、但矩阵里没有这个状态的格，没比（${report.unchecked.length}）：`,
        ...report.unchecked.map((d) => `  ${d.decision}  ${d.state}`));
    }
  } else {
    lines.push(`变了的锚点（${report.changed.length}）：`, ...report.changed.map(describe));
  }
  return lines.join('\n');
}
