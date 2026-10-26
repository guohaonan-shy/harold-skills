/**
 * Proposal-table shape check — the deterministic gate at the end of `dreaming`'s proposal pass.
 *
 * A dreaming run is two passes with a human between them. The first writes every finding into one
 * proposal table and stops; the second executes only the rows the human approved. So the table is
 * the run's only output, and a malformed one is dangerous in a specific way: a row whose
 * disposition is not in the closed set is a row the execution pass cannot mechanically carry out,
 * and an archive row without both pictures is a row the human cannot judge at a glance.
 *
 * This file judges shape, never content — no model, no taste, no network. It checks: the row types
 * (the `##` sections) are a closed set; each row type has a closed set of dispositions; archive
 * rows carry two pictures, the second under `tmp/`; a "product broken" row never carries a
 * replace-the-archive disposition; every candidate row carries a picture of the UI it is about; a
 * candidate headed for DESIGN.md and every DESIGN.md row carry the old and new text side by side;
 * every DESIGN.md row names the standard it rests on; and whether the table is empty.
 *
 * Pure: the CLI at the bottom is the only thing that reads a file.
 */

import { readFileSync } from 'node:fs';

export const COLUMNS = ['对象', '发现', '证据', '建议处置', '选项'];


/** design-modeling 的节名：DESIGN.md 条目的「依据」要点名其中一节。 */
const STANDARD_SECTIONS = ['是什么', '结构', '五条写法规则', '维护原则', 'Front matter', '各章写什么', '准入分层表', '明确不进 DESIGN.md 的内容', '一次写入怎么走', '新建', '蒸馏', '对账', '设计法候选的形态', '谁写、谁读'];
/**
 * Row types, one `##` section each. Closed set. `dispositions` is the closed set of 建议处置 for
 * that row type; the archive ones are fixed here so the archive tickets build on a settled shape.
 */
export const ROW_TYPES = {
  文档: ['写 ADR 删 spec', '写 ADR 未采纳删 spec', '报警', '订正', '标注被取代', '删漏网工单', '标搁置', '去审核', '去设计', '问人', '迁移布局', '删除'],
  档案对象: ['改代码路径', '删对象', '补扫页面', '标进入方式过期'],
  档案状态: ['替换档案', '改进入方式', '补进不去说明'],
  初扫页面: ['新增页面'],
  候选: ['改写已有规则', '追加新规则', '已覆盖不加', '留在原处', '起草通用原则 issue', '起草缺陷 issue', '驳回'],
  漏归档: ['补归档', '丢弃'],
  'retro 候选': ['开 issue：机械检查', '开 issue：改 skill', '留在池里', '驳回'],
  'DESIGN.md 条目': ['改法', '移出', '删除', '改写为全局规则', '合并为一条', '新建 DESIGN.md', '处理 lint 警告', '交人裁决'],
  缺陷: ['开 issue', '已有 #N'],
};
// retro 候选: a rule candidate in the retro pool (docs/records/retro-candidates/) that has come up at
// least 3 times. Dreaming reads the pool itself (no agent); the row's 证据 carries the verbatim words of
// each occurrence, so it is checked only for being non-empty (the generic empty-cell rule).
// 漏归档: a merged need whose docs/design/tmp/<spec-slug>/ still holds design output on the base
// branch (it skipped pr-review's merge step). Dreaming finds it mechanically; no agent.

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

/** The verdict a 发现 cell opens with (`档案过期：…`), or null. */
function verdictOf(finding) {
  const m = finding.match(/^(档案过期|进入方式过期|进不去|产品坏了|法对代码错)\s*[：:]/);
  return m ? m[1] : null;
}

/** What each archive-state verdict is allowed to propose. 产品坏了 is deliberately absent. */
const VERDICT_DISPOSITION = { 档案过期: '替换档案', 进入方式过期: '改进入方式', 进不去: '补进不去说明' };

/**
 * A product that is broken is not an archive that is out of date. Writing the broken picture over
 * the archive would freeze a regression into the source of truth, so a 产品坏了 row proposing to
 * replace the archive is refused by name, wherever it sits.
 */
function productBrokenReplace(cells) {
  if (verdictOf(cells[1]) !== '产品坏了') return null;
  if (leadingDisposition(cells[3]) !== '替换档案') return null;
  return '是「产品坏了」却建议「替换档案」——不许：产品坏了不改档案，起草一条 issue 交人，别把坏掉的样子写进档案';
}

/** Verdict ↔ section rules. Null when the row's 发现 opens correctly for where it sits. */
function verdictProblem(type, cells) {
  const verdict = verdictOf(cells[1]);
  if (type === '档案状态') {
    if (verdict === null) return `的「发现」要以判定开头（${Object.keys(VERDICT_DISPOSITION).join(' / ')}），再加冒号`;
    if (verdict === '产品坏了') return '的判定是「产品坏了」，不进「档案状态」——单列到「缺陷」一节，档案不改';
    if (verdict === '法对代码错') return '的判定「法对代码错」不属于档案状态——它去「缺陷」一节';
    const want = VERDICT_DISPOSITION[verdict];
    if (cells[3] !== '' && leadingDisposition(cells[3]) !== want) {
      return `的判定是「${verdict}」，建议处置应为「${want}」，不是「${leadingDisposition(cells[3])}」`;
    }
  }
  if (type === '缺陷' && verdict !== '产品坏了' && verdict !== '法对代码错') {
    return '的「发现」要以「产品坏了：」或「法对代码错：」开头，说明是哪一类缺陷';
  }
  return null;
}

/**
 * Two rows whose evidence has to carry a specific answer, not just look plausible:
 *  - 删对象 — deleting an archive object while a node, edge or journey still points at it breaks the
 *    graph, so the row names its referrers (`引用：…`, or `引用：无` — silence is not an answer);
 *  - 进不去 — a state nobody could enter is only useful if it says what was missing and what was
 *    tried, the two things the archive's own rule asks for (`缺…` and `试过…`).
 */
function evidenceProblems(type, cells) {
  const evidence = cells[2];
  if (type === '档案对象' && leadingDisposition(cells[3]) === '删对象' && !/引用\s*[：:]/.test(evidence)) {
    return ['的处置是「删对象」，证据里要写「引用：」列出还引用它的节点与边——没有就写「引用：无」'];
  }
  if (type === '档案状态' && verdictOf(cells[1]) === '进不去' && !(/缺/.test(evidence) && /试过/.test(evidence))) {
    return ['的判定是「进不去」，证据里要写清缺什么前置条件、试过哪些路线（「缺…」「试过…」）'];
  }
  return [];
}

/** The candidate dispositions that end in DESIGN.md text — the ones whose wording a human approves. */
const WRITES_DESIGN_MD = ['改写已有规则', '追加新规则'];

/**
 * DESIGN.md rows are judged by reading the change itself, so the change has to be in the cell:
 *  - a candidate row shows the UI the rule is about (`![…](…)`), or says why it has none (`无图：…`) —
 *    a rule the human cannot see on screen sends them back to the frozen record;
 *  - a candidate headed for DESIGN.md says where it lands (`并进：<章>`) and shows 旧：… 新：…;
 *  - every DESIGN.md row names what it rests on (`依据：` plus a section of design-modeling by name,
 *    the official spec, or a lint rule) — "should change" with no named standard is taste;
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
    if (!basis || !(STANDARD_SECTIONS.some((name) => basis[1].includes(`「${name}」`)) || /lint|规范/i.test(basis[1]))) {
      problems.push('的证据里要写「依据：」并点名那条标准——design-modeling 的哪一节（如「五条写法规则」第 5 条、「明确不进 DESIGN.md 的内容」里的带日期的先例）、官方 design.md 规范的哪一条，或 lint 规则名');
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
 * Archive rows are the ones a human judges by looking: the archive's picture next to the fresh
 * one. So an archive-state row, and a defect row about a broken state, carry exactly the archive's
 * own picture (under `prod/`) and then the new one (under `tmp/`, never a second `prod/` picture —
 * that would be the archive compared with itself). A state that could not be entered has nothing
 * to photograph and is the one exception.
 */
function pictureProblems(type, cells) {
  const verdict = verdictOf(cells[1]);
  const needs = (type === '档案状态' && verdict !== '进不去') || (type === '缺陷' && verdict === '产品坏了');
  if (!needs) return [];
  const pics = imagePaths(cells[2]);
  if (pics.length < 2) {
    return [`的证据只有 ${pics.length} 张图，档案行要两张图并排：先是 prod/ 里档案的样子，再是 tmp/ 里这次新拍的`];
  }
  const problems = [];
  if (!/(^|\/)prod\//.test(pics[0])) problems.push(`的第一张图「${pics[0]}」不在 prod/ 下——第一张是档案里原本的样子`);
  if (!/(^|\/)tmp\//.test(pics[1])) problems.push(`的第二张图「${pics[1]}」不在 tmp/ 下——第二张是这次新拍的，放在 dreaming 自己的 tmp/ 目录里`);
  return problems;
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
      const broken = productBrokenReplace(row.cells);
      const bad = broken ?? verdictProblem(s.title, row.cells) ?? dispositionProblem(s.title, row.cells[3]);
      if (bad) errors.push(`${where}${bad}`);
      errors.push(...pictureProblems(s.title, row.cells).map((p) => `${where}${p}`));
      errors.push(...evidenceProblems(s.title, row.cells).map((p) => `${where}${p}`));
      errors.push(...designMdProblems(s.title, row.cells).map((p) => `${where}${p}`));
      if (s.title === '初扫页面' && !/(^|[\s/(`])tmp\//.test(row.cells[2])) {
        errors.push(`${where}的证据要指向 tmp/ 下这次建出来的页面草稿——初扫的产物先放 tmp/，人批了才经归档脚本进 prod/`);
      }
    }
  }

  const valid = errors.length === 0;
  // Empty means "nothing for a human to approve": a well-formed table with zero rows. Notes such as
  // 「未扫：…」 are prose, not rows, so they do not make a table non-empty.
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
