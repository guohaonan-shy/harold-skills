/**
 * Proposal-table shape check — the deterministic gate at the end of `dreaming`'s proposal pass.
 *
 * A dreaming run is two passes with a human between them. The first writes every finding into one
 * proposal table and stops; the second executes only the rows the human approved. So the table is
 * the run's only output, and a malformed one is dangerous in a specific way: a row whose
 * disposition is not in the closed set is a row the execution pass cannot mechanically carry out.
 *
 * This file judges shape, never content — no model, no taste, no network. It checks: the row types
 * (the `##` sections) are a closed set; each row type has a closed set of dispositions; a defect
 * row opens by saying it is a rule-versus-code one; every candidate row carries a picture of the UI
 * it is about; a candidate headed for DESIGN.md and every DESIGN.md row carry the old and new text
 * side by side; every DESIGN.md row names the standard it rests on; and whether the table is empty.
 *
 * Pure: the CLI at the bottom is the only thing that reads a file.
 */

import { readFileSync } from 'node:fs';

export const COLUMNS = ['对象', '发现', '证据', '建议处置', '选项'];

/**
 * Row types, one `##` section each. Closed set. Each value is the closed set of 建议处置 for that
 * row type.
 */
export const ROW_TYPES = {
  文档: ['写 ADR 删 spec', '写 ADR 未采纳删 spec', '报警', '订正', '标注被取代', '删漏网工单', '标 parked', '去审核', '去设计', '问人', '迁移布局', '删除'],
  候选: ['改写已有规则', '追加新规则', '已覆盖不加', '留在原处', '起草通用原则 issue', '起草缺陷 issue', '驳回'],
  'DESIGN.md 条目': ['改法', '移出', '删除', '改写为全局规则', '合并为一条', '新建 DESIGN.md', '处理 lint 警告', '交人裁决'],
  缺陷: ['开 issue', '已有 #N'],
};

/**
 * Parse ATX headings and pipe tables, skipping fenced code blocks.
 * @returns [{ title, line, rows: [{ line, cells }], header, prose: [string] }]
 */
function sections(markdown) {
  const out = [];
  let cur = null;
  let fence = null;
  String(markdown).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      if (fence === null) fence = fenceMark[1][0];
      else if (fenceMark[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      cur = h[1].length >= 2 ? { title: h[2].trim(), line: i + 1, header: null, rows: [], prose: [] } : null;
      if (cur) out.push(cur);
      return;
    }
    if (!cur || line.trim() === '') return;
    if (/^\s*\|/.test(line)) {
      const cells = splitRow(line);
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return; // the |---|---| separator
      if (!cur.header) cur.header = { line: i + 1, cells };
      else cur.rows.push({ line: i + 1, cells });
      return;
    }
    cur.prose.push(line.trim());
  });
  return out;
}

/** Split one table line into trimmed cells; `\|` is a literal pipe inside a cell. */
function splitRow(line) {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

/**
 * The leading disposition of a 建议处置 cell: everything before an optional trailing note in
 * parentheses, so `订正（路径改名）` reads as `订正`.
 */
function leadingDisposition(cell) {
  return cell.replace(/\s*[（(].*$/, '').trim();
}

/** A problem string when `cell` is not a legal disposition for `type`, otherwise null. */
function dispositionProblem(type, cell) {
  if (cell === '') return null; // already reported as an empty cell
  const lead = leadingDisposition(cell);
  const legal = ROW_TYPES[type];
  const ok = legal.some((d) => (d === '已有 #N' ? /^已有 #\d+$/.test(lead) : d === lead));
  if (ok) return null;
  return `的建议处置「${lead}」不在这一类的闭集里——只能是：${legal.join(' / ')}`;
}

/** Defect rows say which kind they are by how 发现 opens; only rule-versus-code defects exist. */
function defectProblem(type, cells) {
  if (type === '缺陷' && !/^法对代码错\s*[：:]/.test(cells[1])) {
    return '的「发现」要以「法对代码错：」开头——缺陷这一节只收 DESIGN.md 里的法与代码对不上';
  }
  return null;
}

/** The candidate dispositions that end in DESIGN.md text — the ones whose wording a human approves. */
const WRITES_DESIGN_MD = ['改写已有规则', '追加新规则'];

/**
 * DESIGN.md rows are judged by reading the change itself, so the change has to be in the cell:
 *  - a candidate row shows the UI the rule is about (`![…](…)`), or says why it has none (`无图：…`) —
 *    a rule the human cannot see on screen sends them back to the frozen record;
 *  - a candidate headed for DESIGN.md says where it lands (`并进：<章>`) and shows 旧：… 新：…;
 *  - every DESIGN.md row names what it rests on (`依据：` plus a section of the writing reference
 *    `§N`, the official spec, or a lint rule) — "should change" with no named standard is taste;
 *  - every DESIGN.md row except a new file shows 旧：…, and 新：… or `→ 删` (a 交人裁决 row's new
 *    texts live in its 选项, one per choice).
 */
function designMdProblems(type, cells) {
  const evidence = cells[2];
  const lead = leadingDisposition(cells[3]);
  const problems = [];
  if (type === '候选') {
    if (imagePaths(evidence).length === 0 && !/无图\s*[：:]/.test(evidence)) {
      problems.push('的证据里没有图——放这条规则说的那块界面的截图（取自设计档案或实现），实在没有界面写「无图：原因」');
    }
    if (WRITES_DESIGN_MD.includes(lead)) {
      if (!/并进\s*[：:]/.test(evidence)) problems.push(`的处置是「${lead}」，证据里要写「并进：」进 DESIGN.md 的哪一章哪一条`);
      if (!(/旧\s*[：:]/.test(evidence) && /新\s*[：:]/.test(evidence))) problems.push(`的处置是「${lead}」，证据里要放旧文与新文并排（「旧：…→ 新：…」，追加写「旧：无」）`);
    }
  }
  if (type === 'DESIGN.md 条目') {
    const basis = evidence.match(/依据\s*[：:](.*)$/s);
    if (!basis || !/§\s*\d|lint|规范/i.test(basis[1])) {
      problems.push('的证据里要写「依据：」并点名那条标准——写入 reference 的 §N（如「§3 规则 5」「§8 带日期的先例」）、官方 design.md 规范的哪一条，或 lint 规则名');
    }
    if (lead !== '新建 DESIGN.md') {
      if (!/旧\s*[：:]/.test(evidence)) problems.push('的证据里要有改前的原文（「旧：「…」」）');
      else if (lead !== '交人裁决' && !/新\s*[：:]|→\s*删/.test(evidence)) problems.push('的证据里要有改后的样子（「→ 新：「…」」，删掉写「→ 删」）');
    }
  }
  return problems;
}

/** Image paths in a cell, in order — markdown image syntax only. */
function imagePaths(cell) {
  return [...cell.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)].map((m) => m[1]);
}

/**
 * Check one proposal table's shape.
 * @returns { valid, empty, errors, counts }  `counts` maps each row type found to its row count.
 */
export function checkProposalTable(markdown) {
  const errors = [];
  const counts = {};
  const secs = sections(markdown);

  if (secs.length === 0) {
    errors.push(`提议表一节都没有——空表也要写出跑过的那几节并标「无」，没有任何一节分不清是没事还是没跑成。行类型：${Object.keys(ROW_TYPES).join(' / ')}`);
  }

  for (const s of secs) {
    if (!(s.title in ROW_TYPES)) {
      errors.push(`第 ${s.line} 行「${s.title}」不是行类型——行类型只有：${Object.keys(ROW_TYPES).join(' / ')}`);
      continue;
    }
    if (s.title in counts) {
      errors.push(`第 ${s.line} 行「${s.title}」重复出现——同一类的行放进同一节`);
      continue;
    }
    counts[s.title] = s.rows.length;

    if (s.header && s.header.cells.join('|') !== COLUMNS.join('|')) {
      errors.push(`「${s.title}」第 ${s.header.line} 行表头不对：应为 ${COLUMNS.join(' / ')}`);
    }
    for (const row of s.rows) {
      const where = `「${s.title}」第 ${row.line} 行`;
      if (row.cells.length !== COLUMNS.length) {
        errors.push(`${where}有 ${row.cells.length} 列，应为 ${COLUMNS.length} 列（${COLUMNS.join(' / ')}）`);
        continue;
      }
      COLUMNS.forEach((name, i) => {
        if (row.cells[i] === '') errors.push(`${where}的「${name}」是空的`);
      });
      const bad = defectProblem(s.title, row.cells) ?? dispositionProblem(s.title, row.cells[3]);
      if (bad) errors.push(`${where}${bad}`);
      errors.push(...designMdProblems(s.title, row.cells).map((p) => `${where}${p}`));
    }
  }

  const valid = errors.length === 0;
  // Empty means "nothing for a human to approve": a well-formed table with zero rows. Notes such as
  // 「未查：…」 are prose, not rows, so they do not make a table non-empty.
  const empty = valid && Object.values(counts).every((n) => n === 0);
  return { valid, empty, errors, counts };
}

/** Human-readable render, same grouping the other scripts use. */
export function renderReport(result, file) {
  if (!result.valid) {
    return [`proposal-table: 校验失败${file ? ` (${file})` : ''} —— 先补齐再交给人：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
  }
  if (result.empty) return `proposal-table: 空表 ✓${file ? ` (${file})` : ''} —— 本周无事：只推一句话，不发 Artifact`;
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  return `proposal-table: green ✓${file ? ` (${file})` : ''} —— ${total} 行：${Object.entries(result.counts).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`).join('、')}`;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: proposal-table-check.mjs <proposal-table.md> [--json]');
    process.exit(1);
  }
  let md;
  try {
    md = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`proposal-table-check: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const result = checkProposalTable(md);
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderReport(result, file));
  process.exit(result.valid ? 0 : 2);
}
