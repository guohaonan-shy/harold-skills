/**
 * Direction-note shape check — the deterministic gate at the end of `uiux-imagine`.
 *
 * The divergent half of the design loop produces exactly one artifact that survives it: the
 * direction note. Everything else it renders (style tiles, gray boxes, the contact sheet) exists
 * only to provoke a reaction in the room and is thrown away. So the note carries the whole run,
 * and a note missing a section is a run that quietly dropped part of its job — most often
 * 「待打磨清单」(the execution-level notes discipline 1 parked) or 「验收矩阵」(what convergence
 * has to cover), because those two are the ones written for the NEXT skill rather than for the
 * human in the room.
 *
 * This file does not judge the note's content — no model, no taste, no scoring. It judges its
 * shape: the seven fixed sections, at one heading level, in order, each with something in it, and
 * a complete composition list for every chosen variant inside 「变种裁决」.
 * That is the falsifiable half of "缺任一节 → 收工校验失败".
 *
 * The level is not pinned to `##` on purpose: the note usually sits at `##` in its own file under
 * <worktree>/.tmp/uiux-imagine/<spec-slug>/, but a note quoted one level deeper elsewhere checks the same.
 *
 * Pure: no browser, no model, no clock. The CLI at the bottom is the only thing that reads a file.
 */

import { readFileSync } from 'node:fs';

/** The seven sections, in the order they must appear. Closed set. */
export const SECTIONS = ['意图', '高度记录', '结构', '变种裁决', '待打磨清单', '约束与素材', '验收矩阵'];

/**
 * The composition list every SELECTED variant carries inside 「变种裁决」. Closed set.
 *
 * The note is a letter and refine never sees the renders, so whatever the chosen variant looked
 * like has to be spelled out item by item — a run once lost a speech bubble's tail and its side
 * because the letter only said "a floating card next to the button". 「待打磨」 is a legal value:
 * it says the item was not decided here and is parked for convergence, which is different from
 * silently not writing it.
 */
export const COMPOSITION = ['容器形状', '指向', '锚点与位置', '尺寸与字号', '颜色', '出现与消失'];

/**
 * Parse ATX headings, skipping fenced code blocks — a note that shows its own template in a
 * ```md fence would otherwise report every section twice.
 *
 * @returns [{ level, title, line }] in document order
 */
function headings(markdown) {
  const out = [];
  let fence = null;
  const lines = String(markdown).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      if (fence === null) fence = fenceMark[1][0];
      else if (fenceMark[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, title: m[2].trim(), line: i + 1 });
  });
  return out;
}

/** Whether anything but blank lines sits between this heading and the next same-or-shallower one. */
function hasBody(markdown, all, index) {
  const lines = String(markdown).split(/\r?\n/);
  const here = all[index];
  const next = all.slice(index + 1).find((h) => h.level <= here.level);
  const body = lines.slice(here.line, next ? next.line - 1 : lines.length);
  return body.some((l) => l.trim() !== '');
}

/**
 * Check one direction note's shape.
 *
 * @param markdown  the note, standalone or lifted out of the spec
 * @returns { valid, errors, missing, level }
 *          `missing` lists sections that are absent outright; a present-but-empty section is an
 *          error too, but it is reported as empty rather than missing so the human knows the
 *          heading is already there. `level` is the heading level the seven were found at, or
 *          null when they were not found as a coherent set.
 */
export function checkDirectionNote(markdown) {
  const all = headings(markdown);
  const errors = [];

  const found = all
    .map((h, i) => ({ ...h, index: i }))
    .filter((h) => SECTIONS.includes(h.title));

  if (found.length === 0) {
    return {
      valid: false,
      errors: [`方向说明一节都没有：缺 ${SECTIONS.join(' / ')}`],
      missing: [...SECTIONS],
      level: null,
    };
  }

  const levels = [...new Set(found.map((h) => h.level))];
  const level = levels.sort((a, b) => found.filter((h) => h.level === b).length - found.filter((h) => h.level === a).length)[0];
  if (levels.length > 1) {
    errors.push(`七节必须在同一层级（same level）：${found.map((h) => `${'#'.repeat(h.level)} ${h.title}`).join('、')}`);
  }

  const seen = new Map();
  for (const h of found) {
    if (h.level !== level) continue;
    if (seen.has(h.title)) errors.push(`「${h.title}」重复出现（第 ${seen.get(h.title).line} 行与第 ${h.line} 行）`);
    else seen.set(h.title, h);
  }

  const missing = SECTIONS.filter((s) => !seen.has(s));
  for (const s of missing) errors.push(`缺「${s}」这一节`);

  for (const [title, h] of seen) {
    if (!hasBody(markdown, all, h.index)) errors.push(`「${title}」是空的——有标题没正文不算写过`);
  }

  const verdict = seen.get('变种裁决');
  if (verdict && hasBody(markdown, all, verdict.index)) {
    const lines = String(markdown).split(/\r?\n/);
    const next = all.slice(verdict.index + 1).find((h) => h.level <= verdict.level);
    errors.push(...checkComposition(lines.slice(verdict.line, next ? next.line - 1 : lines.length).join('\n')));
  }

  const order = [...seen.values()].map((h) => h.title);
  const expected = SECTIONS.filter((s) => seen.has(s));
  if (order.join('|') !== expected.join('|')) {
    errors.push(`七节顺序不对：应为 ${SECTIONS.join(' → ')}，实际是 ${order.join(' → ')}`);
  }

  for (const h of all) {
    if (h.level !== level || SECTIONS.includes(h.title)) continue;
    const first = found[0].line;
    const last = found[found.length - 1].line;
    if (h.line > first && h.line < last) errors.push(`「${h.title}」不是七节之一，却夹在七节中间——方向说明只有这七节`);
    else if (h.line > last) errors.push(`「${h.title}」不是七节之一——方向说明只有这七节，渲染物与 contact sheet 不进来`);
  }

  return { valid: errors.length === 0, errors, missing, level };
}

/**
 * Check the 构成 blocks inside the 「变种裁决」 body. A block starts at a bold 「构成」 marker
 * (`**构成**` or `**构成（B）**`) and runs until the next marker, the next top-level list item or
 * heading. Each block must name all six items with something after the colon.
 */
export function checkComposition(verdictBody) {
  const errors = [];
  const lines = String(verdictBody).split(/\r?\n/);
  const marker = /^\s*(?:[-*]\s+)?\*\*构成[^*]*\*\*/;
  const starts = lines.map((l, i) => (marker.test(l) ? i : -1)).filter((i) => i >= 0);
  if (starts.length === 0) {
    errors.push(`「变种裁决」里没有选中变种的构成清单（**构成**：${COMPOSITION.join(' / ')}）——refine 看不到渲染物，选中的样子只能靠它`);
    return errors;
  }
  starts.forEach((start, n) => {
    const end = lines.findIndex((l, i) => i > start && (marker.test(l) || /^(?:[-*]\s|#)/.test(l)));
    const block = lines.slice(start, end === -1 ? lines.length : end);
    const name = lines[start].match(/\*\*(构成[^*]*)\*\*/)[1];
    const missing = COMPOSITION.filter(
      (item) => !block.some((l) => new RegExp(`^\\s*(?:[-*]\\s+)?${item}\\s*[:：]\\s*\\S`).test(l)),
    );
    if (missing.length) errors.push(`第 ${n + 1} 份「${name}」缺：${missing.join(' / ')}（没定的写「待打磨」，不要不写）`);
  });
  return errors;
}

/** Human-readable render, same grouping the other scripts use. */
export function renderReport(result, file) {
  if (result.valid) return `direction-note: green ✓${file ? ` (${file})` : ''}`;
  return [`direction-note: 收工校验失败${file ? ` (${file})` : ''} —— 不要交给 refine，先补齐：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: direction-note-check.mjs <direction-note.md> [--json]');
    process.exit(1);
  }
  let md;
  try {
    md = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`direction-note-check: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const result = checkDirectionNote(md);
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderReport(result, file));
  process.exit(result.valid ? 0 : 2);
}
