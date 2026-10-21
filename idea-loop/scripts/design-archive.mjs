/**
 * The design archive, parsed — the reusable layer under validation, queries, MCP and archiving.
 *
 * `docs/design/prod/` is a graph (skills/engineering/dreaming/references/design-archive.md): page states are the nodes, the
 * `edges` written in each state file are the edges, and pages / components / motions / journeys are
 * objects the nodes and edges point at. This module reads a repository root and returns every object,
 * edge and reference in one structure; the validator (design-archive-check.mjs) is a layer on it, and
 * the query module, the MCP wrapper and the archive script reuse the same functions rather than
 * re-reading files.
 *
 * `loadArchive(root, { delta })` with a spec slug overlays `docs/design/tmp/<slug>/delta/` on `prod/`:
 * objects in `delta/` replace the `prod/` object with the same id (they hold the full file),
 * ids listed in `delta/removed.md` are dropped. What comes back is the archive "as it will be after
 * the change", with `result.delta` recording which ids were added / changed / removed.
 *
 * Pure apart from reading files: no clock, no network, no model.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { splitFrontmatter } from './mini-yaml.mjs';

export const TYPE_KIND = {
  'design-page': 'page',
  'design-state': 'state',
  'design-component': 'component',
  'design-motion': 'motion',
  'design-journey': 'journey',
};
export const KINDS = Object.values(TYPE_KIND);
/** Directory under prod/ (and delta/) that holds each kind. States live with their page. */
export const KIND_DIR = { page: 'pages', state: 'pages', component: 'components', motion: 'motions', journey: 'journeys' };
const OBJECT_DIRS = ['pages', 'components', 'motions', 'journeys'];

const posix = (p) => p.split(sep).join('/');

// ---------- wikilinks ----------

/** `"[[a]]"`, `[[a|alias]]`, `[[a#heading]]` → `a`. Null when the whole value is not one link. */
export function wikilinkTarget(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^\[\[([^\[\]]+)\]\]$/);
  return m ? targetOf(m[1]) : null;
}

function targetOf(inner) {
  return inner.split('|')[0].split('#')[0].trim();
}

/** Every `[[...]]` in a text, skipping fenced code and inline code. */
export function wikilinksIn(text) {
  const out = [];
  let fence = null;
  String(text)
    .split('\n')
    .forEach((line, i) => {
      const mark = line.match(/^\s*(`{3,}|~{3,})/);
      if (mark) {
        if (fence === null) fence = mark[1][0];
        else if (mark[1][0] === fence) fence = null;
        return;
      }
      if (fence !== null) return;
      const plain = line.replace(/`[^`]*`/g, '');
      for (const m of plain.matchAll(/!?\[\[([^\[\]]+)\]\]/g)) {
        out.push({ target: targetOf(m[1]), raw: m[0], line: i + 1 });
      }
    });
  return out;
}

/** Every string wikilink inside a frontmatter value, with its field path (`edges[0].to`). */
export function refsIn(value, path = '') {
  if (typeof value === 'string') {
    const t = wikilinkTarget(value);
    return t === null ? [] : [{ path, target: t }];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => refsIn(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => refsIn(v, path ? `${path}.${k}` : k));
  }
  return [];
}

// ---------- body sections ----------

/** ATX headings outside fenced code: [{ level, title, line }]. */
export function headings(markdown) {
  const out = [];
  let fence = null;
  String(markdown)
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trimEnd();
      const mark = line.match(/^\s*(`{3,}|~{3,})/);
      if (mark) {
        if (fence === null) fence = mark[1][0];
        else if (mark[1][0] === fence) fence = null;
        return;
      }
      if (fence !== null) return;
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) out.push({ level: m[1].length, title: m[2].trim(), line: i + 1 });
    });
  return out;
}

/**
 * The section under the first heading titled `title`: text up to the next heading of the same or a
 * higher level. Null when there is no such heading.
 * @returns {{ level, title, line, text } | null}
 */
export function section(markdown, title) {
  const lines = String(markdown).split('\n');
  const hs = headings(markdown);
  const at = hs.findIndex((h) => h.title === title);
  if (at < 0) return null;
  const h = hs[at];
  const next = hs.slice(at + 1).find((x) => x.level <= h.level);
  const end = next ? next.line - 1 : lines.length;
  return { level: h.level, title: h.title, line: h.line, text: lines.slice(h.line, end).join('\n') };
}

const isNone = (text) => /^无[。.]?$/.test(text.trim());

/**
 * A 「决定」 section → entries. Each is `### 决定 N：标题` with 为什么 / 否掉过 / 来源 items.
 * `problems` are shape errors (a heading that is not 决定 N, a duplicated N); a missing item is
 * recorded on the entry (`why: null`) so the caller decides what to name.
 * @returns {{ none: boolean, entries: object[], problems: string[] }}
 */
export function parseDecisions(sec) {
  const out = { none: false, entries: [], problems: [] };
  if (!sec) return out;
  const hs = headings(sec.text).filter((h) => h.level === sec.level + 1);
  const lines = sec.text.split('\n');
  const preamble = lines.slice(0, hs.length ? hs[0].line - 1 : lines.length).join('\n');
  if (isNone(preamble)) out.none = true;
  const seen = new Set();
  hs.forEach((h, idx) => {
    const m = h.title.match(/^决定\s*(\d+)\s*[：:]\s*(.+)$/);
    const end = idx + 1 < hs.length ? hs[idx + 1].line - 1 : lines.length;
    const body = lines.slice(h.line, end).join('\n');
    if (!m) {
      out.problems.push(`「${h.title}」不是「决定 N：标题」的形状`);
      return;
    }
    const n = Number(m[1]);
    if (seen.has(n)) out.problems.push(`决定 ${n} 的编号重复`);
    seen.add(n);
    const items = labelled(body, ['为什么', '否掉过', '来源']);
    out.entries.push({ n, title: m[2].trim(), line: sec.line + h.line, why: items.为什么, rejected: items.否掉过, source: items.来源 });
  });
  return out;
}

/**
 * A 「设计法候选」 section → entries. Each is a top-level bullet (the rule, one sentence) with
 * 并进 / 为什么 / 证据 items underneath. 「无」 alone means there are none.
 * @returns {{ none: boolean, entries: object[], problems: string[] }}
 */
export function parseCandidates(sec) {
  const out = { none: false, entries: [], problems: [] };
  if (!sec) return out;
  const lines = sec.text.split('\n');
  if (isNone(sec.text)) {
    out.none = true;
    return out;
  }
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const items = labelled(cur.lines.join('\n'), ['并进', '为什么', '证据']);
    out.entries.push({ rule: cur.rule, line: cur.line, merge: items.并进, why: items.为什么, evidence: items.证据 });
  };
  lines.forEach((l, i) => {
    const top = l.match(/^[-*]\s+(.+)$/);
    if (top) {
      flush();
      cur = { rule: top[1].replace(/^\*\*(.*)\*\*$/, '$1').trim(), line: sec.line + 1 + i, lines: [] };
    } else if (cur) cur.lines.push(l);
  });
  flush();
  if (!out.entries.length && sec.text.trim()) out.problems.push('既不是「无」，也没有一条候选');
  return out;
}

/** `- 标签：内容` items (and their indented continuation lines) → { 标签: text | null }. */
function labelled(text, labels) {
  const out = Object.fromEntries(labels.map((l) => [l, null]));
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*[-*]\s*(\S+?)\s*[：:]\s*(.*)$/);
    if (m && labels.includes(m[1])) {
      cur = m[1];
      out[cur] = m[2].trim();
    } else if (cur && /^\s+\S/.test(line) && !/^\s*[-*]\s/.test(line)) {
      out[cur] = `${out[cur]} ${line.trim()}`.trim();
    } else if (cur && /^\s*[-*]\s/.test(line)) {
      // a differently-labelled or nested bullet: the previous item ends here
      cur = null;
    }
  }
  return out;
}

// ---------- reading a tree ----------

/** Every file under `dir` (sorted, depth-first), skipping what `skip(path, name)` rejects. */
export function walk(dir, skip = () => false) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (skip(p, name)) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}

/** Object files under a prod/-shaped tree (prod/ itself or a delta/). Skips assets/ and index.md. */
function objectFiles(treeRoot) {
  const out = [];
  for (const d of OBJECT_DIRS) {
    out.push(...walk(join(treeRoot, d), (_p, name) => name === 'assets').filter((p) => p.endsWith('.md')));
  }
  return out;
}

function readObject(root, abs, source, problems) {
  const file = posix(relative(root, abs));
  const id = abs.slice(abs.lastIndexOf(sep) + 1).replace(/\.md$/, '');
  const text = readFileSync(abs, 'utf8');
  const { fm, body, error } = splitFrontmatter(text);
  if (error) {
    problems.push({ file, message: `frontmatter 读不出来：${error}` });
    return null;
  }
  if (!fm) {
    problems.push({ file, message: '没有 frontmatter' });
    return null;
  }
  const kind = TYPE_KIND[fm.type];
  if (!kind) {
    problems.push({ file, message: `type 不是档案对象的类型（${fm.type ?? '缺失'}）；应是 ${Object.keys(TYPE_KIND).join(' / ')}` });
    return null;
  }
  return { id, kind, type: fm.type, file, source, fm, body };
}

/** `removed.md`: one object id per bullet line, `- [[id]]` or `- id`, anything after is a note. */
export function parseRemoved(text = '') {
  const ids = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (!m) continue;
    const link = m[1].match(/\[\[([^\[\]]+)\]\]/);
    const id = link ? targetOf(link[1]) : m[1].replace(/`/g, '').trim().split(/[\s：:—–-]+/)[0];
    if (id) ids.push(id);
  }
  return ids;
}

/** The state's page id: its `page` field, else the part of the id before `--`. */
export function pageOfState(state) {
  return wikilinkTarget(state.fm.page) ?? (state.id.includes('--') ? state.id.split('--')[0] : null);
}

function normalizeEdges(state) {
  const raw = Array.isArray(state.fm.edges) ? state.fm.edges : [];
  return raw.map((e, index) => {
    const edge = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
    return {
      from: state.id,
      file: state.file,
      index,
      id: edge.id == null ? null : String(edge.id),
      to: wikilinkTarget(edge.to),
      toRaw: edge.to ?? null,
      kind: edge.kind ?? null,
      component: edge.component == null ? null : wikilinkTarget(edge.component) ?? String(edge.component),
      motion: edge.motion == null ? null : wikilinkTarget(edge.motion) ?? String(edge.motion),
      locate: edge.locate ?? null,
      action: edge.action ?? null,
      trigger: edge.trigger ?? null,
      how: edge.how ?? null,
      blocked: edge.blocked ?? null,
      malformed: e !== edge,
    };
  });
}

/**
 * Read a repository root.
 *
 * @param {string} root  repository root (the directory that holds `docs/`)
 * @param {{ delta?: string }} [opts]  spec slug whose `tmp/<slug>/delta/` is laid over `prod/`
 * @returns {{
 *   root: string,
 *   objects: Map<string, object>,       id → { id, kind, type, file, source: 'prod'|'delta', fm, body }
 *   edges: object[],                    every state's edges, normalised, in file order
 *   refs: object[],                     every wikilink in an object: { from, file, where, target, embed? }
 *   files: Map<string, string[]>,       basename → paths in docs/ (md without extension, assets with it)
 *   duplicates: Map<string, string[]>,  object ids that more than one file claims
 *   index: object|null,                 prod/index.md frontmatter (viewport / theme / locale)
 *   problems: { file, message }[],      files that could not be read as objects
 *   legacy: string[],                   docs/design/ entries other than tmp, prod, index.md
 *   delta: { slug, added, changed, removed } | null,
 * }}
 */
export function loadArchive(root, { delta = null } = {}) {
  const docs = join(root, 'docs');
  const designDir = join(docs, 'design');
  const prodDir = join(designDir, 'prod');
  const problems = [];
  const objects = new Map();
  const claims = new Map(); // id → [files]
  const claim = (id, file) => claims.set(id, [...(claims.get(id) ?? []), file]);

  for (const abs of objectFiles(prodDir)) {
    const o = readObject(root, abs, 'prod', problems);
    if (!o) continue;
    claim(o.id, o.file);
    if (!objects.has(o.id)) objects.set(o.id, o);
  }

  // every file under docs/ except the scratch area and the legacy per-spec design records
  const legacy = existsSync(designDir)
    ? readdirSync(designDir)
        .filter((n) => statSync(join(designDir, n)).isDirectory() && n !== 'tmp' && n !== 'prod')
        .sort()
    : [];
  const skipDocs = (p, name) => {
    const rel = posix(relative(designDir, p));
    if (rel === 'tmp' || rel.startsWith('tmp/')) return true;
    if (legacy.includes(rel.split('/')[0])) return true;
    // ticket files repeat names across specs by design (wiki-conventions §4)
    return /(^|\/)spec\/[^/]+\/tickets$/.test(posix(relative(docs, p))) && name === 'tickets';
  };
  const files = new Map();
  for (const abs of walk(docs, skipDocs)) {
    const name = abs.slice(abs.lastIndexOf(sep) + 1);
    if (name === 'index.md') continue;
    const key = name.endsWith('.md') ? name.slice(0, -3) : name;
    files.set(key, [...(files.get(key) ?? []), posix(relative(root, abs))]);
  }

  let deltaInfo = null;
  if (delta) {
    const deltaDir = join(designDir, 'tmp', delta, 'delta');
    if (!existsSync(deltaDir)) throw new Error(`没有 ${posix(relative(root, deltaDir))}：这个需求没有设计差异`);
    deltaInfo = { slug: delta, added: [], changed: [], removed: [] };
    for (const abs of objectFiles(deltaDir)) {
      const o = readObject(root, abs, 'delta', problems);
      if (!o) continue;
      const prior = objects.get(o.id);
      (prior ? deltaInfo.changed : deltaInfo.added).push(o.id);
      if (prior) swapFile(files, o.id, prior.file, o.file);
      else files.set(o.id, [...(files.get(o.id) ?? []), o.file]);
      claims.set(o.id, [o.file]);
      objects.set(o.id, o);
    }
    deltaInfo.added.sort();
    deltaInfo.changed.sort();
    const removedFile = join(deltaDir, 'removed.md');
    if (existsSync(removedFile)) {
      for (const id of parseRemoved(readFileSync(removedFile, 'utf8'))) {
        const o = objects.get(id);
        deltaInfo.removed.push(id);
        if (!o) continue;
        objects.delete(id);
        claims.delete(id);
        swapFile(files, id, o.file, null);
      }
    }
  }

  const duplicates = new Map([...claims].filter(([, fs]) => fs.length > 1));

  const edges = [];
  const refs = [];
  for (const o of objects.values()) {
    if (o.kind === 'state') edges.push(...normalizeEdges(o));
    for (const r of refsIn(o.fm)) refs.push({ from: o.id, file: o.file, where: r.path, target: r.target });
    for (const l of wikilinksIn(o.body)) refs.push({ from: o.id, file: o.file, where: `正文第 ${l.line} 行`, target: l.target, embed: l.raw.startsWith('!') });
  }

  const indexFile = join(prodDir, 'index.md');
  const index = existsSync(indexFile) ? splitFrontmatter(readFileSync(indexFile, 'utf8')).fm : null;

  return { root, objects, edges, refs, files, duplicates, index, problems, legacy, delta: deltaInfo };
}

function swapFile(files, id, oldFile, newFile) {
  const rest = (files.get(id) ?? []).filter((f) => f !== oldFile);
  if (newFile) rest.push(newFile);
  if (rest.length) files.set(id, rest);
  else files.delete(id);
}

// ---------- reading the graph ----------

export const objectsOfKind = (archive, kind) => [...archive.objects.values()].filter((o) => o.kind === kind);
export const statesOfPage = (archive, pageId) => objectsOfKind(archive, 'state').filter((s) => pageOfState(s) === pageId);
export const outgoingEdges = (archive, stateId) => archive.edges.filter((e) => e.from === stateId);
export const incomingEdges = (archive, stateId) => archive.edges.filter((e) => e.to === stateId);
export const isEntry = (state) => !!state.fm.entry && typeof state.fm.entry === 'object';
export const hasBlocked = (edge) => edge.blocked !== null && edge.blocked !== undefined && edge.blocked !== false;

/** Whether a wikilink target (a bare id, or an asset file name) resolves inside docs/. */
export function resolves(archive, target) {
  return archive.files.has(target);
}

/**
 * Which pages use each component and motion — the value `usedBy` has to hold.
 * A page uses a component when one of its regions names it, or one of its states lists it in
 * `components`, or one of its edges goes through it; a motion likewise through a state's `motions`
 * or an edge's `motion`. Pages are ids, sorted.
 * @returns {{ components: Map<string, string[]>, motions: Map<string, string[]> }}
 */
export function computeUsedBy(archive) {
  const components = new Map();
  const motions = new Map();
  const add = (m, key, page) => {
    if (!key || !page) return;
    if (!m.has(key)) m.set(key, new Set());
    m.get(key).add(page);
  };
  const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  for (const page of objectsOfKind(archive, 'page')) {
    for (const region of asList(page.fm.regions)) add(components, wikilinkTarget(region?.component), page.id);
  }
  for (const s of objectsOfKind(archive, 'state')) {
    const page = pageOfState(s);
    for (const c of asList(s.fm.components)) add(components, wikilinkTarget(c), page);
    for (const m of asList(s.fm.motions)) add(motions, wikilinkTarget(m), page);
  }
  for (const e of archive.edges) {
    const page = pageOfState(archive.objects.get(e.from));
    add(components, e.component, page);
    add(motions, e.motion, page);
  }
  const sorted = (m) => new Map([...m].map(([k, v]) => [k, [...v].sort()]));
  return { components: sorted(components), motions: sorted(motions) };
}
