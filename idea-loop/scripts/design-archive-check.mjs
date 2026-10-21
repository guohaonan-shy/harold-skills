#!/usr/bin/env node
/**
 * Design archive validation — the six rules, run over a parsed archive.
 *
 * `docs/design/prod/` is only trustworthy if the graph in it holds together: every state can be
 * reached (or says why not), every reference points at something, every journey follows real edges,
 * every recorded decision carries its reasons. Nothing else catches these — a broken link or a
 * state nobody can enter looks fine in any single file — so they are checked mechanically, with the
 * file and field named, and the archive script (which is the only way to write `prod/`) refuses to
 * write when the result would not pass.
 *
 * Rules (skills/engineering/dreaming/references/design-archive.md §6):
 *   1 every state is reachable from an entry node over non-blocked edges, or has a blocked incoming edge
 *   2 a state that starts async work writes loading / failure / empty — each an existing state or 「不适用」
 *   3 every wikilink resolves; an edge's component is a component, its motion a motion; docs/ basenames are unique
 *   4 consecutive states of a journey are joined by an edge; with several, `via` names one
 *   5 state files carry no 「决定」; every decision has 为什么 / 否掉过 / 来源; every candidate 并进 / 为什么 / 证据
 *   6 literal motion values carry `deviates`; `usedBy` matches the references actually found
 * Rule 0 is the structure the rules stand on: files that cannot be read as objects, required fields.
 *
 * With `--delta <spec-slug>` the requirement's `tmp/<slug>/delta/` is laid over `prod/` first
 * (replace by id, drop what removed.md lists) and the rules judge the result.
 * `docs/design/` entries other than tmp/, prod/ and index.md are the old per-spec layout: one note
 * each, never a violation, never read.
 *
 * Usage:  node design-archive-check.mjs <repo-root> [--delta <spec-slug>] [--no-used-by] [--json]
 *         --no-used-by skips the `usedBy` half of rule 6, for judging a delta/ before the archive
 *         script has regenerated `usedBy` (an agent never writes it by hand).
 * Exit:   0 = no violations, 1 = violations, 2 = usage / cannot read the repository
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  computeUsedBy,
  headings,
  hasBlocked,
  incomingEdges,
  isEntry,
  loadArchive,
  objectsOfKind,
  outgoingEdges,
  pageOfState,
  parseCandidates,
  parseDecisions,
  section,
  wikilinkTarget,
} from './design-archive.mjs';

export const RULES = {
  0: '结构',
  1: '可达',
  2: 'async',
  3: '引用',
  4: '用户路径',
  5: '决定与候选',
  6: '动效',
};

const filled = (v) => typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const TOKEN_REF = /^\{[^{}]+\}$/;
const DECISION_HEADING = /^决定(\s*\d+)?(\s*[：:].*)?$/;

/**
 * @param {object} archive  from loadArchive
 * @param {{ usedBy?: boolean }} [opts]  usedBy:false leaves the `usedBy` field alone — the consistency
 *   half of rule 6, and rule 3's check that its links resolve (a removed page leaves stale ones behind).
 *   For the archive script, which validates a delta before it regenerates usedBy; the regenerated
 *   archive is then checked with the default (usedBy:true)
 * @returns {{ rule: number, file: string, field: string|null, message: string }[]}
 */
export function checkArchive(archive, { usedBy = true } = {}) {
  const out = [];
  const v = (rule, file, field, message) => out.push({ rule, file, field, message });
  const objs = [...archive.objects.values()];

  // ---------- 0: structure ----------
  for (const p of archive.problems) v(0, p.file, null, p.message);
  for (const o of objs) structure(o, v);

  // ---------- 1: reachability ----------
  const states = objectsOfKind(archive, 'state');
  const reached = new Set();
  const queue = states.filter(isEntry).map((s) => s.id);
  queue.forEach((id) => reached.add(id));
  while (queue.length) {
    const id = queue.shift();
    for (const e of outgoingEdges(archive, id)) {
      if (hasBlocked(e) || !e.to || reached.has(e.to)) continue;
      if (archive.objects.get(e.to)?.kind !== 'state') continue;
      reached.add(e.to);
      queue.push(e.to);
    }
  }
  for (const s of states) {
    if (reached.has(s.id) || incomingEdges(archive, s.id).some(hasBlocked)) continue;
    v(1, s.file, null, `状态 ${s.id} 既不能从任何入口节点沿非 blocked 的边到达，入边里也没有写 blocked——进入方式没人记（漏写前置条件，或缺入口）`);
  }

  // ---------- 2: async ----------
  for (const s of states) {
    if (s.fm.async === undefined) continue;
    const a = s.fm.async;
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      v(2, s.file, 'async', 'async 必须是 loading / failure / empty 三项的映射');
      continue;
    }
    for (const key of ['loading', 'failure', 'empty']) {
      const val = a[key];
      if (!filled(val)) {
        v(2, s.file, `async.${key}`, `async 缺 ${key}：写一个状态的引用，或「不适用」`);
        continue;
      }
      if (val === '不适用') continue;
      const t = wikilinkTarget(val);
      if (t === null) v(2, s.file, `async.${key}`, `「${val}」既不是状态的引用也不是「不适用」`);
      else if (archive.objects.get(t)?.kind !== 'state') v(2, s.file, `async.${key}`, `[[${t}]] 不是档案里的状态`);
    }
  }

  // ---------- 3: references ----------
  const kindOf = (id) => archive.objects.get(id)?.kind ?? null;
  for (const r of archive.refs) {
    if (r.where.startsWith('async.')) continue; // rule 2 judges these
    if (archive.files.has(r.target)) continue;
    if (!usedBy && /^usedBy(\[|$)/.test(r.where)) continue; // about to be regenerated
    v(3, r.file, r.where, `[[${r.target}]] 解析不到：docs/ 下没有这个文件`);
  }
  const expect = (o, field, value, want) => {
    for (const [i, item] of asList(value).entries()) {
      const path = Array.isArray(value) ? `${field}[${i}]` : field;
      if (item == null) continue;
      const t = wikilinkTarget(item);
      if (t === null) {
        v(3, o.file, path, `「${String(item)}」要写成指向${want}的 wikilink（"[[名字]]"）`);
        continue;
      }
      if (!archive.files.has(t)) continue; // already reported as unresolved
      const k = kindOf(t);
      if (k !== want) v(3, o.file, path, `[[${t}]] ${k ? `是${k}` : '不是档案对象'}，这里要${want}`);
    }
  };
  for (const o of objs) {
    if (o.kind === 'state') {
      expect(o, 'page', o.fm.page, 'page');
      expect(o, 'components', o.fm.components, 'component');
      expect(o, 'motions', o.fm.motions, 'motion');
    }
    if (o.kind === 'page') {
      asList(o.fm.regions).forEach((r, i) => expect(o, `regions[${i}].component`, r?.component, 'component'));
    }
    if (usedBy && (o.kind === 'component' || o.kind === 'motion')) expect(o, 'usedBy', o.fm.usedBy, 'page');
    if (o.kind === 'journey') {
      asList(o.fm.path).forEach((item, i) => expect(o, `path[${i}]`, item && typeof item === 'object' ? item.state : item, 'state'));
    }
  }
  for (const e of archive.edges) {
    const o = archive.objects.get(e.from);
    const at = `edges[${e.index}]`;
    const raw = (o.fm.edges ?? [])[e.index] ?? {};
    expect(o, `${at}.to`, raw.to, 'state');
    expect(o, `${at}.component`, raw.component, 'component');
    expect(o, `${at}.motion`, raw.motion, 'motion');
  }
  for (const o of objs) {
    const paths = archive.files.get(o.id) ?? [];
    if (paths.length > 1) v(3, o.file, null, `basename「${o.id}」在 docs/ 下重复：${paths.join('、')}（wiki-link 按 basename 解析，必须全局唯一）`);
  }

  // ---------- 4: journeys ----------
  for (const j of objectsOfKind(archive, 'journey')) {
    const steps = asList(j.fm.path).map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? { state: wikilinkTarget(item.state), via: item.via == null ? null : String(item.via) }
        : { state: wikilinkTarget(item), via: null },
    );
    for (let i = 0; i + 1 < steps.length; i++) {
      const a = steps[i];
      const b = steps[i + 1];
      if (!a.state || !b.state || kindOf(a.state) !== 'state' || kindOf(b.state) !== 'state') continue;
      const joining = outgoingEdges(archive, a.state).filter((e) => e.to === b.state);
      const field = `path[${i}]`;
      if (joining.length === 0) v(4, j.file, field, `${a.state} 到 ${b.state} 之间没有边`);
      else if (joining.length > 1 && a.via === null) {
        v(4, j.file, field, `${a.state} 到 ${b.state} 之间有 ${joining.length} 条边（${joining.map((e) => e.id).join('、')}），这一项要写成 state + via`);
      } else if (a.via !== null && !joining.some((e) => e.id === a.via)) {
        v(4, j.file, field, `via「${a.via}」不是 ${a.state} 到 ${b.state} 的边${joining.length ? `（有：${joining.map((e) => e.id).join('、')}）` : ''}`);
      }
    }
  }

  // ---------- 5: decisions and candidates ----------
  for (const o of objs) {
    if (o.kind === 'state') {
      const bad = headings(o.body).filter((h) => DECISION_HEADING.test(h.title));
      if (bad.length) v(5, o.file, `正文第 ${bad[0].line} 行`, `状态文件不写「决定」（「${bad[0].title}」${bad.length > 1 ? `等 ${bad.length} 处` : ''}）：决定跟着页面、组件、动效或用户路径走`);
      continue;
    }
    const dec = section(o.body, '决定');
    const cand = section(o.body, '设计法候选');
    if (!dec) v(5, o.file, null, '缺「## 决定」一节（没有决定就写「无」）');
    if (!cand) v(5, o.file, null, '缺「## 设计法候选」一节（没有候选就写「无」）');
    if (dec) {
      const d = parseDecisions(dec);
      d.problems.forEach((p) => v(5, o.file, `正文第 ${dec.line} 行起的「决定」`, p));
      if (!d.none && !d.entries.length && !d.problems.length) v(5, o.file, `正文第 ${dec.line} 行`, '「决定」一节是空的：没有决定写「无」，空着分不清是没有还是漏了');
      for (const e of d.entries) {
        for (const [label, val] of [['为什么', e.why], ['否掉过', e.rejected], ['来源', e.source]]) {
          if (!filled(val)) v(5, o.file, `决定 ${e.n}（正文第 ${e.line} 行）`, `决定 ${e.n} 缺「${label}」${label === '否掉过' ? '（确实没有备选写「无」）' : ''}`);
        }
      }
    }
    if (cand) {
      const c = parseCandidates(cand);
      c.problems.forEach((p) => v(5, o.file, `正文第 ${cand.line} 行起的「设计法候选」`, p));
      for (const e of c.entries) {
        for (const [label, val] of [['并进', e.merge], ['为什么', e.why], ['证据', e.evidence]]) {
          if (!filled(val)) v(5, o.file, `候选「${e.rule.slice(0, 24)}」（正文第 ${e.line} 行）`, `候选缺「${label}」`);
        }
      }
    }
  }

  // ---------- 6: motions and usedBy ----------
  for (const m of objectsOfKind(archive, 'motion')) {
    const literals = ['duration', 'easing'].filter((k) => filled(m.fm[k]) && !(typeof m.fm[k] === 'string' && TOKEN_REF.test(m.fm[k].trim())));
    if (literals.length && !filled(m.fm.deviates)) {
      v(6, m.file, 'deviates', `${literals.join('、')} 写的是字面值（${literals.map((k) => m.fm[k]).join('、')}），要用 {token} 引用，或者写 deviates 说明为什么偏离`);
    }
  }
  if (usedBy) {
    const used = computeUsedBy(archive);
    for (const [kind, map] of [['component', used.components], ['motion', used.motions]]) {
      for (const o of objectsOfKind(archive, kind)) {
        if (o.fm.usedBy === undefined || o.fm.usedBy === null) {
          v(6, o.file, 'usedBy', 'usedBy 缺失——未生成（由归档脚本反向生成，不手写）');
          continue;
        }
        if (!Array.isArray(o.fm.usedBy)) {
          v(6, o.file, 'usedBy', 'usedBy 必须是页面引用的列表');
          continue;
        }
        const have = new Set(o.fm.usedBy.map((x) => wikilinkTarget(x) ?? String(x)));
        const want = new Set(map.get(o.id) ?? []);
        const missing = [...want].filter((x) => !have.has(x));
        const extra = [...have].filter((x) => !want.has(x));
        if (missing.length || extra.length) {
          const parts = [];
          if (missing.length) parts.push(`少了 ${missing.map((x) => `[[${x}]]`).join('、')}`);
          if (extra.length) parts.push(`多了 ${extra.map((x) => `[[${x}]]`).join('、')}`);
          v(6, o.file, 'usedBy', `usedBy 与实际引用不一致：${parts.join('；')}`);
        }
      }
    }
  }

  return out;
}

/** Rule 0 for one object: the fields the other rules and the queries lean on. */
function structure(o, v) {
  const f = o.fm;
  if (!filled(f.summary)) v(0, o.file, 'summary', '缺 summary（wiki 约定的 type / tags / summary）');
  if (f.tags === undefined) v(0, o.file, 'tags', '缺 tags');
  if (o.kind === 'page') {
    if (!filled(f.code)) v(0, o.file, 'code', '页面缺 code（页面入口代码路径）');
    if (!Array.isArray(f.regions)) v(0, o.file, 'regions', '页面缺 regions（区域 → 组件的列表）');
    else f.regions.forEach((r, i) => {
      if (!r || !filled(r.name) || !filled(r.component)) v(0, o.file, `regions[${i}]`, '每个区域要有 name 和 component');
    });
  }
  if (o.kind === 'component' && !filled(f.code)) v(0, o.file, 'code', '组件缺 code（代码路径）');
  if (o.kind === 'motion') {
    for (const k of ['duration', 'easing']) if (!filled(f[k])) v(0, o.file, k, `动效缺 ${k}`);
  }
  if (o.kind === 'journey') {
    if (!filled(f.intent)) v(0, o.file, 'intent', '用户路径缺 intent（一句话意图）');
    if (!Array.isArray(f.path) || !f.path.length) v(0, o.file, 'path', '用户路径缺 path（有序状态列表）');
  }
  if (o.kind !== 'state') return;
  if (!filled(f.page)) v(0, o.file, 'page', '状态缺 page');
  if (f.entry !== undefined && (!f.entry || typeof f.entry !== 'object' || !filled(f.entry.url))) {
    v(0, o.file, 'entry', '入口节点的 entry 要有 url（和 preconditions）');
  }
  if (f.edges !== undefined && !Array.isArray(f.edges)) v(0, o.file, 'edges', 'edges 必须是列表');
  const seen = new Set();
  asList(f.edges).forEach((e, i) => {
    const at = `edges[${i}]`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return v(0, o.file, at, '每条边是一个映射');
    if (!filled(e.id)) v(0, o.file, at, '边缺 id（在本状态内唯一）');
    else if (seen.has(String(e.id))) v(0, o.file, at, `边 id「${e.id}」在本状态内重复`);
    else seen.add(String(e.id));
    if (!filled(e.to)) v(0, o.file, `${at}.to`, '边缺 to（目标状态）');
    if (e.kind !== 'user' && e.kind !== 'system') return v(0, o.file, `${at}.kind`, `边的 kind 只能是 user 或 system（现在是 ${e.kind ?? '缺失'}）`);
    if (e.blocked != null && e.blocked !== false) {
      const b = e.blocked;
      if (typeof b !== 'object' || !filled(b.missing) || !Array.isArray(b.tried) || !b.tried.length) {
        v(0, o.file, `${at}.blocked`, 'blocked 要写 missing（缺什么）和 tried（试过什么，列表）');
      }
      return;
    }
    const need = e.kind === 'user' ? ['component', 'locate', 'action'] : ['trigger', 'how'];
    for (const k of need) if (!filled(e[k])) v(0, o.file, `${at}.${k}`, `${e.kind} 边缺 ${k}`);
    if (e.kind === 'user' && filled(e.locate) && !(e.locate && filled(e.locate.role) && filled(e.locate.name))) {
      v(0, o.file, `${at}.locate`, 'locate 要写 role 和 name（用 ARIA 角色和名字定位）');
    }
  });
}

/** Load + check in one call. Returns { violations, notes, archive }. */
export function check(root, { delta = null, usedBy = true } = {}) {
  const archive = loadArchive(root, { delta });
  const violations = checkArchive(archive, { usedBy });
  const notes = archive.legacy.map((n) => `docs/design/${n}/ 是旧布局（按 spec 命名的冻结记录），建议删——不读，不算违规`);
  return { violations, notes, archive };
}

export function formatViolation(x) {
  return `违规 [规则 ${x.rule} ${RULES[x.rule]}] ${x.file}${x.field ? ` · ${x.field}` : ''}：${x.message}`;
}

// ---------- CLI ----------

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  // A requirement's delta/ is written before the archive script regenerates usedBy, so an agent
  // checking its own delta skips that half of rule 6 (the script itself judges the finished prod/).
  const usedBy = !args.includes('--no-used-by');
  const di = args.indexOf('--delta');
  const delta = di >= 0 ? args[di + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--delta');
  if (positional.length !== 1 || (di >= 0 && !delta)) {
    console.error('用法：node design-archive-check.mjs <repo-root> [--delta <spec-slug>] [--no-used-by] [--json]');
    return 2;
  }
  const root = resolve(positional[0]);
  if (!existsSync(join(root, 'docs'))) {
    console.error(`${root} 下没有 docs/：这不是目标仓库的根`);
    return 2;
  }
  let result;
  try {
    result = check(root, { delta, usedBy });
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const { violations, notes, archive } = result;
  if (json) {
    console.log(JSON.stringify({ ok: violations.length === 0, violations, notes, objects: archive.objects.size }, null, 2));
  } else {
    notes.forEach((n) => console.log(`提示：${n}`));
    violations.forEach((x) => console.log(formatViolation(x)));
    console.log(violations.length ? `${violations.length} 条违规` : `通过（${archive.objects.size} 个对象）`);
  }
  return violations.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
