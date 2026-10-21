/**
 * Reading the design archive: six entries, one module (skills/design/design-archive/references/query.md).
 *
 *   queryPage(archive, name)      a page: regions and components, every state and its edges, the journeys
 *                                 through it, the motions it uses, all decisions and candidates
 *   queryState(archive, name)     a state: how to get into it, what to see there, screenshot paths
 *   queryJourney(archive, name)   a journey: intent + ordered steps, how each is triggered, what to see
 *   queryDiff(root, slug)          what a requirement's delta/ adds, changes (field by field) and removes
 *   queryRefs(archive, name)      who refers to a component (by name or code path), a motion, a section
 *                                 (`<page>#<section>`) or every section of a type (`#<type>`)
 *   queryKeyword(archive, text)   objects whose name / summary / body match, best position first
 *   enterState(archive, id)       the shortest way in (the state entry's `enter`), usable on its own
 *
 * Every entry except `queryDiff` takes an archive from `loadArchive(root, { delta })`, so each can read
 * "the archive as it will be after the change" by laying a requirement's `delta/` over `prod/`.
 * Results are plain JSON-able data (the command line prints them, the MCP wrapper forwards them); a
 * name that matches nothing throws a `QueryError` whose message says what exists instead.
 *
 * The engine is file reading and text matching — no embedding, no model, no clock.
 *
 *   node design-archive-query.mjs <repo-root> <page|state|journey|diff|refs|keyword> <arg> [--delta <spec-slug>]
 */

import { existsSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  computeUsedBy,
  hasBlocked,
  headings,
  incomingEdges,
  isEntry,
  loadArchive,
  objectsOfKind,
  outgoingEdges,
  pageOfState,
  parseCandidates,
  parseDecisions,
  SECTION_TYPES,
  section,
  sectionEntries,
  sectionsOfPage,
  sectionsOfState,
  statesOfPage,
  wikilinkTarget,
} from './design-archive.mjs';

export class QueryError extends Error {
  constructor(message, code = 'not-found') {
    super(message);
    this.name = 'QueryError';
    this.code = code;
  }
}

const KIND_NAME = { page: '页面', state: '状态', component: '组件', motion: '动效', journey: '用户路径' };
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
const sortById = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The object `name` of the wanted kind, or a QueryError that says what it is instead / what exists. */
function need(archive, name, kind) {
  const o = archive.objects.get(name);
  if (o && o.kind === kind) return o;
  if (o) throw new QueryError(`「${name}」是${KIND_NAME[o.kind]}，不是${KIND_NAME[kind]}`);
  const known = objectsOfKind(archive, kind).map((x) => x.id).sort();
  throw new QueryError(
    `找不到${KIND_NAME[kind]}「${name}」${known.length ? `；现有${KIND_NAME[kind]}：${known.join('、')}` : '；档案里还没有这一类对象'}`,
  );
}

// ---------- views of edges and states ----------

/** An edge as the caller sees it: only the fields its kind uses. */
function edgeView(e) {
  return clean({
    id: e.id,
    from: e.from,
    to: e.to,
    kind: e.kind,
    component: e.component,
    locate: e.locate,
    fromSection: e.fromSection,
    toSection: e.toSection,
    when: e.when,
    action: e.action,
    trigger: e.trigger,
    how: e.how,
    motion: e.motion,
    blocked: hasBlocked(e) ? e.blocked : null,
  });
}

const trimmed = (s) => (s == null ? null : s.text.trim());
const shouldSeeOf = (state) => trimmed(section(state.body, '应看到什么'));
const screenOf = (state) => trimmed(section(state.body, '这一屏'));

const MEDIA = /\.(png|jpe?g|gif|webp|svg|webm|mp4)$/i;

/** Screenshot / GIF paths a state's body shows: `![[file]]` embeds and `![alt](path)` images. */
function mediaOf(archive, state) {
  const out = [];
  for (const r of archive.refs) {
    if (r.from === state.id && r.embed && MEDIA.test(r.target)) out.push(archive.files.get(r.target)?.[0] ?? r.target);
  }
  for (const m of state.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:\/\//i.test(m[1]) || !MEDIA.test(m[1])) continue;
    out.push(normalize(join(dirname(state.file), decodeURI(m[1]))).split('\\').join('/'));
  }
  return [...new Set(out)];
}

// ---------- 进入方式 ----------

/**
 * How to get into a state: the shortest path from any entry node, skipping `blocked` edges.
 *
 * Reachable → `{ state, reachable: true, entry: { state, url, preconditions }, steps: [edge…], shouldSee }`.
 * Not → `{ state, reachable: false, verdict: '进不去', blocked: [edge + missing + tried…], undeclared }`:
 * every `blocked` edge on a way in (the state's own in-edges and those upstream, up to where the
 * graph is reachable again), and `undeclared: true` when there is none — nothing explains why.
 * Ties go to the entry with the smaller id, then to the edge written first.
 */
export function enterState(archive, id) {
  const target = need(archive, id, 'state');
  const states = archive.objects;
  const usable = archive.edges.filter((e) => e.to && states.has(e.to) && states.get(e.from)?.kind === 'state');

  // multi-source BFS over edges that are not blocked
  const entries = objectsOfKind(archive, 'state').filter(isEntry).map((s) => s.id).sort();
  const via = new Map(entries.map((s) => [s, null])); // state → edge that first reached it
  const origin = new Map(entries.map((s) => [s, s]));
  const queue = [...entries];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const e of usable) {
      if (e.from !== at || hasBlocked(e) || via.has(e.to)) continue;
      via.set(e.to, e);
      origin.set(e.to, origin.get(at));
      queue.push(e.to);
    }
  }

  const shouldSee = shouldSeeOf(target);
  if (via.has(id)) {
    const steps = [];
    for (let at = id; via.get(at); at = via.get(at).from) steps.unshift(edgeView(via.get(at)));
    const first = states.get(origin.get(id));
    return {
      state: id,
      reachable: true,
      entry: clean({ state: first.id, url: first.fm.entry.url, preconditions: first.fm.entry.preconditions }),
      steps,
      shouldSee,
    };
  }

  // walk upstream from the target through any edge; blocked ones are the answer, and a state the
  // entries can reach needs no further digging (whatever feeds it is not why the target is out of reach)
  const blocked = [];
  const seen = new Set([id]);
  for (const at of seen) {
    for (const e of usable.filter((x) => x.to === at)) {
      if (hasBlocked(e)) {
        const b = typeof e.blocked === 'object' ? e.blocked : {};
        blocked.push({ ...edgeView({ ...e, blocked: null }), missing: b.missing ?? null, tried: asList(b.tried) });
      }
      if (!via.has(e.from)) seen.add(e.from);
    }
  }
  return { state: id, reachable: false, verdict: '进不去', blocked, undeclared: blocked.length === 0, shouldSee };
}

// ---------- 分段 ----------

const posixPath = (p) => p.split('\\').join('/');

/**
 * Where a section's slice is: `<entry state id>@<section id>.png` in the `assets/` next to the entry
 * state's file. Reading with a requirement's delta laid over, a slice only `prod/` has is still the
 * slice (the delta re-shoots only the sections that changed). `exists` says whether the file is there;
 * when it is not, `path` is where it goes.
 */
function sliceOf(archive, entry, sectionId) {
  const home = posixPath(normalize(join(dirname(entry.file), 'assets', `${entry.id}@${sectionId}.png`)));
  const candidates = [home];
  if (entry.source === 'delta' && archive.delta) candidates.push(home.replace(`docs/design/tmp/${archive.delta.slug}/delta/`, 'docs/design/prod/'));
  const found = candidates.find((c) => existsSync(join(archive.root, c)));
  return { path: found ?? home, exists: found !== undefined };
}

/** One section of a page as the queries show it. `id` is the full `<page>#<section>`. */
function sectionView(archive, pageId, entry, x) {
  const ref = `${pageId}#${x.id}`;
  const slice = sliceOf(archive, entry, x.id);
  return {
    id: ref,
    page: pageId,
    type: x.type,
    qualifier: x.qualifier,
    locate: x.locate,
    locateBy: x.by?.kind ?? null,
    declaredBy: entry.id,
    outgoing: archive.edges.filter((e) => e.fromSection === ref).map(edgeView),
    incoming: archive.edges.filter((e) => e.toSection === ref).map(edgeView),
    states: sortById(statesOfPage(archive, pageId).filter((s) => s.fm.section === ref)).map((s) => s.id),
    screenshot: slice.path,
    screenshotExists: slice.exists,
  };
}

/** The sections of a page, in page order (empty when its entry state declares none). */
function sectionViews(archive, pageId) {
  const entry = sectionEntries(archive, pageId)[0];
  if (!entry) return [];
  return sectionsOfState(entry)
    .filter((x) => x.id !== null)
    .map((x) => sectionView(archive, pageId, entry, x));
}

const allSectionViews = (archive) =>
  sortById(objectsOfKind(archive, 'page')).flatMap((p) => sectionViews(archive, p.id));

// ---------- 页面 ----------

const idsOf = (list) => asList(list).map((x) => wikilinkTarget(x) ?? String(x));

/** A journey's `path` as [{ state, via }] — each item is `"[[state]]"` or `{ state, via }`. */
function journeyPath(journey) {
  return asList(journey.fm.path).map((item) => {
    if (item && typeof item === 'object') return { state: wikilinkTarget(item.state) ?? String(item.state), via: item.via ?? null };
    return { state: wikilinkTarget(item) ?? String(item), via: null };
  });
}

/** An object's 「决定」 and 「设计法候选」 entries, each tagged with whose they are. */
function decisionsAndCandidates(o) {
  const of = { id: o.id, kind: o.kind };
  const decisions = parseDecisions(section(o.body, '决定')).entries.map((d) => ({
    of,
    n: d.n,
    title: d.title,
    why: d.why,
    rejected: d.rejected,
    source: d.source,
  }));
  const candidates = parseCandidates(section(o.body, '设计法候选')).entries.map((c) => ({
    of,
    rule: c.rule,
    merge: c.merge,
    why: c.why,
    evidence: c.evidence,
  }));
  return { decisions, candidates };
}

const summaryOf = (o) => o.fm.summary ?? null;

/**
 * A page: its object, regions (area → component), the components and motions it uses (with every
 * page that uses each), every state with the edges leaving and entering it, the journeys that pass
 * through it, and the decisions and candidates of the page and of what it uses, each tagged `of`.
 */
export function queryPage(archive, name) {
  const page = need(archive, name, 'page');
  const used = computeUsedBy(archive);
  const around = (kind, map) =>
    sortById(
      [...map]
        .filter(([, pages]) => pages.includes(page.id))
        .map(([id, pages]) => archive.objects.get(id) ?? { id, kind, fm: {}, body: '', missing: true })
        .map((o) => ({ id: o.id, kind, summary: summaryOf(o), code: o.fm.code ?? null, usedBy: map.get(o.id), object: o })),
    );
  const components = around('component', used.components);
  const motions = around('motion', used.motions);

  const journeys = sortById(
    objectsOfKind(archive, 'journey').filter((j) =>
      journeyPath(j).some((p) => {
        const s = archive.objects.get(p.state);
        return s && pageOfState(s) === page.id;
      }),
    ),
  );

  const surround = [page, ...components.map((c) => c.object), ...motions.map((m) => m.object), ...journeys].filter((o) => !o.missing);
  const dc = surround.map(decisionsAndCandidates);

  const strip = ({ object: _object, kind: _kind, ...rest }) => rest;
  return {
    page: clean({ id: page.id, file: page.file, summary: summaryOf(page), code: page.fm.code ?? null }),
    regions: asList(page.fm.regions).map((r) => ({
      name: r?.name ?? null,
      component: wikilinkTarget(r?.component),
      code: archive.objects.get(wikilinkTarget(r?.component))?.fm.code ?? null,
    })),
    components: components.map((c) => clean(strip(c))),
    motions: motions.map((m) => clean(strip(m))),
    states: sortById(statesOfPage(archive, page.id)).map((s) => ({
      id: s.id,
      summary: summaryOf(s),
      entry: isEntry(s) ? { url: s.fm.entry.url, preconditions: s.fm.entry.preconditions ?? null } : null,
      components: idsOf(s.fm.components),
      motions: idsOf(s.fm.motions),
      outgoing: outgoingEdges(archive, s.id).map(edgeView),
      incoming: incomingEdges(archive, s.id).map(edgeView),
      ...(s.fm.section ? { section: String(s.fm.section) } : {}),
    })),
    sections: sectionViews(archive, page.id),
    journeys: journeys.map((j) => ({ id: j.id, intent: j.fm.intent ?? null, states: journeyPath(j).map((p) => p.state) })),
    decisions: dc.flatMap((x) => x.decisions),
    candidates: dc.flatMap((x) => x.candidates),
  };
}

// ---------- 单个状态 ----------

/** A state: its way in (`enter`), what to see there, the screen's description and screenshot paths. */
export function queryState(archive, name) {
  const state = need(archive, name, 'state');
  const { shouldSee, ...enter } = enterState(archive, name);
  return {
    state: clean({ id: state.id, page: pageOfState(state), file: state.file, summary: summaryOf(state), section: state.fm.section == null ? null : String(state.fm.section) }),
    enter,
    shouldSee,
    screen: screenOf(state),
    screenshots: mediaOf(archive, state),
  };
}

// ---------- 单条用户路径 ----------

/**
 * Walk a journey's path: for each step after the first, the edge that gets from the previous state
 * to this one. `via` on the previous item picks one when several run between the two; without it the
 * first is taken and the rest are listed in `ambiguous`. No edge at all → `noEdge`.
 */
function journeySteps(archive, journey) {
  const path = journeyPath(journey);
  return path.map((item, i) => {
    const state = archive.objects.get(item.state);
    const step = { n: i + 1, state: item.state, object: state && state.kind === 'state' ? state : null, edge: null };
    if (i === 0) return step;
    const prev = path[i - 1];
    const between = archive.edges.filter((e) => e.from === prev.state && e.to === item.state);
    const chosen = prev.via ? between.find((e) => e.id === prev.via) : between[0];
    if (!chosen) return { ...step, noEdge: true };
    return { ...step, edge: chosen, ...(!prev.via && between.length > 1 ? { ambiguous: between.map((e) => e.id) } : {}) };
  });
}

/** A journey: its intent, how its first state is entered (`start`), and every step in order. */
export function queryJourney(archive, name) {
  const journey = need(archive, name, 'journey');
  const steps = journeySteps(archive, journey);
  const first = steps[0]?.object;
  return {
    journey: clean({ id: journey.id, file: journey.file, intent: journey.fm.intent ?? null, summary: summaryOf(journey) }),
    start: first ? enterState(archive, first.id) : null,
    steps: steps.map((s) => ({
      n: s.n,
      state: s.state,
      page: s.object ? pageOfState(s.object) : null,
      ...(s.object ? {} : { missing: true }),
      trigger: s.edge ? edgeView(s.edge) : null,
      ...(s.ambiguous ? { ambiguous: s.ambiguous } : {}),
      ...(s.noEdge ? { noEdge: true } : {}),
      shouldSee: s.object ? shouldSeeOf(s.object) : null,
    })),
  };
}

// ---------- 反查 ----------

const normalizeCode = (p) => String(p).trim().replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * Who refers to a component (given by name or by code path) or to a motion: the edges that go through
 * it, the states that list it or have such an edge (`via`: components / motions / edges), the journeys
 * whose steps use it, and every page that uses it.
 */
export function queryRefs(archive, name) {
  const key = normalizeCode(name);
  if (key.startsWith('#')) return refsOfSectionType(archive, key.slice(1));
  if (/^[^#]+#[^#]+$/.test(key)) return refsOfSection(archive, key);
  let target = archive.objects.get(key);
  let matchedBy = 'name';
  if (target && target.kind !== 'component' && target.kind !== 'motion') {
    throw new QueryError(`「${name}」是${KIND_NAME[target.kind]}；反查只接组件、动效（名字）或组件的代码路径`);
  }
  if (!target) {
    matchedBy = 'code';
    target = sortById(objectsOfKind(archive, 'component')).find((c) => asList(c.fm.code).map(normalizeCode).includes(key));
  }
  if (!target) {
    const list = (kind) => objectsOfKind(archive, kind).map((o) => o.id).sort().join('、') || '无';
    throw new QueryError(`找不到组件或动效「${name}」，也没有组件的代码路径是它；现有组件：${list('component')}；现有动效：${list('motion')}`);
  }

  const isComponent = target.kind === 'component';
  const listField = isComponent ? 'components' : 'motions';
  const uses = (e) => (isComponent ? e.component : e.motion) === target.id;
  const lists = (s) => idsOf(s.fm[listField]).includes(target.id);

  const edges = archive.edges.filter(uses);
  const viaOf = new Map();
  const mark = (stateId, via) => viaOf.set(stateId, [...(viaOf.get(stateId) ?? []), via]);
  for (const s of objectsOfKind(archive, 'state')) {
    if (lists(s)) mark(s.id, listField);
    if (edges.some((e) => e.from === s.id)) mark(s.id, 'edges');
  }

  const journeys = sortById(
    objectsOfKind(archive, 'journey').filter((j) =>
      journeySteps(archive, j).some((s) => (s.edge && uses(s.edge)) || (s.object && lists(s.object))),
    ),
  );
  const used = computeUsedBy(archive);
  return {
    target: clean({ id: target.id, kind: target.kind, code: target.fm.code ?? null }),
    matchedBy,
    edges: edges.map(edgeView),
    states: sortById(
      [...viaOf].map(([id, via]) => ({ id, page: pageOfState(archive.objects.get(id)), via })),
    ),
    journeys: journeys.map((j) => ({ id: j.id, intent: j.fm.intent ?? null })),
    pages: (isComponent ? used.components : used.motions).get(target.id) ?? [],
  };
}

const TYPE_LIST = Object.keys(SECTION_TYPES).join('、');

/** `#<type>`: every section of that type on every page. */
function refsOfSectionType(archive, type) {
  if (!Object.hasOwn(SECTION_TYPES, type)) throw new QueryError(`「#${type}」不是分段类型；类型表：${TYPE_LIST}`);
  const all = allSectionViews(archive);
  const sections = all.filter((x) => x.type === type);
  if (!sections.length) {
    throw new QueryError(`档案里没有 ${type} 类的段；${all.length ? `现有分段：${all.map((x) => x.id).join('、')}` : '档案里还没有任何分段'}`);
  }
  return {
    target: { kind: 'section-type', type },
    matchedBy: 'type',
    sections: sections.map((x) => ({ page: x.page, id: x.id, type: x.type, qualifier: x.qualifier, locate: x.locate, declaredBy: x.declaredBy })),
  };
}

/** `<page>#<section>`: what leaves it, lands on it, happens inside it, and the journeys through those. */
function refsOfSection(archive, ref) {
  const [pageId, id] = ref.split('#');
  need(archive, pageId, 'page');
  const here = sectionsOfPage(archive, pageId);
  if (!here.length) throw new QueryError(`页面「${pageId}」没有声明分段（它的入口状态没有 sections）`);
  const view = sectionViews(archive, pageId).find((x) => x.id === ref);
  if (!view) throw new QueryError(`找不到分段「${id}」；${pageId} 现有分段：${here.map((x) => x.id).join('、')}`);

  const key = (e) => `${e.from}/${e.id}`;
  const through = new Set([...view.outgoing, ...view.incoming].map(key));
  const journeys = sortById(
    objectsOfKind(archive, 'journey').filter((j) =>
      journeySteps(archive, j).some((s) => (s.edge && through.has(key(s.edge))) || (s.object && s.object.fm.section === ref)),
    ),
  );
  return {
    target: clean({
      id: view.id, kind: 'section', page: pageId, type: view.type, qualifier: view.qualifier, locate: view.locate, declaredBy: view.declaredBy,
    }),
    matchedBy: 'section',
    outgoing: view.outgoing,
    incoming: view.incoming,
    states: view.states.map((sid) => ({ id: sid, page: pageId, via: ['section'] })),
    journeys: journeys.map((j) => ({ id: j.id, intent: j.fm.intent ?? null })),
    pages: [pageId],
  };
}

// ---------- 关键词 ----------

const TIER = { name: 3, summary: 2, body: 1 };
const HIT_BY_TIER = { 3: 'name', 2: 'summary', 1: 'body' };
const SKIP_FIELDS = new Set(['type', 'tags', 'summary', 'intent', 'usedBy']);

/** Every string value in a frontmatter object (skipping pure wikilinks and the descriptive fields). */
function frontmatterText(fm) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') {
      if (wikilinkTarget(v) === null) out.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const [k, v] of Object.entries(fm)) if (!SKIP_FIELDS.has(k)) walk(v);
  return out.join('\n');
}

const CJK_RUN = /[㐀-鿿]{3,}/g;
const STOP = /[的了是在和与及或把被就都也还]/;

/** Overlapping pairs of CJK characters from every long CJK run, minus pairs holding a function word. */
function bigrams(terms) {
  const out = new Set();
  for (const t of terms) {
    for (const run of t.match(CJK_RUN) ?? []) {
      for (let i = 0; i + 2 <= run.length; i++) if (!STOP.test(run.slice(i, i + 2))) out.add(run.slice(i, i + 2));
    }
  }
  return [...out];
}

function snippet(text, term) {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return text.slice(0, 40);
  return text.slice(Math.max(0, at - 20), at + term.length + 20).replace(/\s+/g, ' ').trim();
}

function searchWith(archive, terms) {
  const found = [];
  for (const o of archive.objects.values()) {
    const text = {
      name: o.id,
      summary: [o.fm.summary, o.fm.intent].filter(Boolean).join('\n'),
      body: `${o.body}\n${frontmatterText(o.fm)}`,
    };
    const hits = [];
    for (const term of terms) {
      const t = term.toLowerCase();
      const field = ['name', 'summary', 'body'].find((f) => String(text[f]).toLowerCase().includes(t));
      if (field) hits.push({ term, field });
    }
    if (!hits.length) continue;
    const best = Math.max(...hits.map((h) => TIER[h.field]));
    const first = hits.find((h) => TIER[h.field] === best);
    found.push({
      id: o.id,
      kind: o.kind,
      file: o.file,
      summary: summaryOf(o),
      hit: HIT_BY_TIER[best],
      terms: hits.map((h) => h.term),
      snippet: first.field === 'name' ? o.id : snippet(text[first.field], first.term),
    });
  }
  const tier = (m) => TIER[m.hit];
  return found.sort((a, b) => tier(b) - tier(a) || b.terms.length - a.terms.length || (a.id < b.id ? -1 : 1));
}

/**
 * Objects whose name, summary (or intent) or body (with the frontmatter's text) contain a word of the
 * query, case-insensitively. Best position first — name, then summary, then body — and within a
 * position the object matching more of the words. A query with no spaces and long Chinese runs that
 * matches nothing as written is retried as overlapping two-character pieces (`expanded: true`).
 */
export function queryKeyword(archive, text) {
  const terms = [...new Set(String(text ?? '').trim().split(/\s+/).filter(Boolean))];
  if (!terms.length) throw new QueryError('关键词是空的', 'usage');
  let matches = searchWith(archive, terms);
  let expanded = false;
  if (!matches.length) {
    const pieces = bigrams(terms);
    if (pieces.length) {
      matches = searchWith(archive, pieces);
      expanded = true;
    }
  }
  return { query: String(text).trim(), terms, expanded, matches };
}

// ---------- 需求差异 ----------

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isKeyedList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => isPlain(x) && typeof x.id === 'string');

/** Wikilink strings become bare ids, the way every other entry reports references. */
function unlink(v) {
  if (typeof v === 'string') return wikilinkTarget(v) ?? v;
  if (Array.isArray(v)) return v.map(unlink);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unlink(x)]));
  return v;
}

/**
 * Field-level differences between two frontmatter values. Objects are compared key by key, lists of
 * items that carry an `id` (a state's edges) item by item as `edges[<id>]`; everything else is one
 * field, before and after.
 */
function diffFields(path, a, b, out = []) {
  if (isDeepStrictEqual(a, b)) return out;
  // a section's locate is one thing: the heading, the landmark or the position it is found by
  const atomic = /^sections\[[^\]]+\]\.locate$/.test(path);
  if (isPlain(a) && isPlain(b) && !atomic) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffFields(path ? `${path}.${k}` : k, a[k], b[k], out);
  } else if (isKeyedList(a) && isKeyedList(b)) {
    const byId = (list) => new Map(list.map((x) => [x.id, x]));
    const [ma, mb] = [byId(a), byId(b)];
    for (const id of new Set([...ma.keys(), ...mb.keys()])) diffFields(`${path}[${id}]`, ma.get(id), mb.get(id), out);
  } else {
    out.push({ field: path, before: unlink(a), after: unlink(b) });
  }
  return out;
}

/** A body as { title → text }: the text before the first `##` heading, then one entry per `##` section. */
function bodySections(body) {
  const lines = String(body).split('\n');
  const marks = headings(body).filter((h) => h.level === 2);
  const out = new Map([['（开头）', lines.slice(0, marks.length ? marks[0].line - 1 : lines.length).join('\n').trim()]]);
  marks.forEach((h, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].line - 1 : lines.length;
    out.set(h.title, lines.slice(h.line, end).join('\n').trim());
  });
  return out;
}

function diffSections(before, after) {
  const [a, b] = [bodySections(before), bodySections(after)];
  const out = [];
  for (const title of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(title) === b.get(title)) continue;
    const change = !a.has(title) ? 'added' : !b.has(title) ? 'removed' : 'changed';
    out.push(clean({ title, change, before: a.get(title), after: b.get(title) }));
  }
  return out;
}

const objectView = (o) => ({ id: o.id, kind: o.kind, summary: summaryOf(o), file: o.file });

/**
 * What a requirement changes: `docs/design/tmp/<slug>/delta/` against `prod/`. Added and removed are
 * objects; changed carry the frontmatter fields that differ (`fields`) and the body sections that do
 * (`sections`). A copy in `delta/` that equals the `prod/` object is not a change. Ids that
 * `removed.md` lists but `prod/` never had are `unknownRemoved`.
 */
export function queryDiff(root, slug) {
  const prod = loadArchive(root);
  let next;
  try {
    next = loadArchive(root, { delta: slug });
  } catch (e) {
    throw new QueryError(`找不到需求「${slug}」的设计差异：${e.message}`);
  }
  const changed = [];
  for (const id of next.delta.changed) {
    const [before, after] = [prod.objects.get(id), next.objects.get(id)];
    const fields = diffFields('', before.fm, after.fm);
    const sections = diffSections(before.body, after.body);
    if (fields.length || sections.length) changed.push({ ...objectView(after), fields, sections });
  }
  return {
    spec: slug,
    added: next.delta.added.map((id) => objectView(next.objects.get(id))),
    changed,
    removed: next.delta.removed.filter((id) => prod.objects.has(id)).map((id) => objectView(prod.objects.get(id))),
    unknownRemoved: next.delta.removed.filter((id) => !prod.objects.has(id)),
  };
}

// ---------- the entries by name, and the command line ----------

export const ENTRIES = {
  page: { run: (archive, arg) => queryPage(archive, arg), arg: '页面名' },
  state: { run: (archive, arg) => queryState(archive, arg), arg: '状态名' },
  journey: { run: (archive, arg) => queryJourney(archive, arg), arg: '用户路径名' },
  refs: { run: (archive, arg) => queryRefs(archive, arg), arg: '组件名、组件代码路径、动效名、<页面>#<段> 或 #<段类型>' },
  keyword: { run: (archive, arg) => queryKeyword(archive, arg), arg: '一段文字' },
  diff: { run: null, arg: 'spec 名', root: true },
};

/**
 * One call for every entry: `query(root, 'page', 'cookbook', { delta })`. `delta` lays that requirement's
 * `delta/` over `prod/` first (not for `diff`, which compares the two itself).
 */
export function query(root, entry, arg, { delta = null } = {}) {
  const e = ENTRIES[entry];
  if (!e) throw new QueryError(`没有「${entry}」这个入口；可用：${Object.keys(ENTRIES).join('、')}`, 'usage');
  if (e.root) {
    if (delta) throw new QueryError('diff 自己比较 delta/ 与 prod/，不接 --delta', 'usage');
    return queryDiff(root, arg);
  }
  let archive;
  try {
    archive = loadArchive(root, { delta });
  } catch (err) {
    throw new QueryError(err.message);
  }
  return e.run(archive, arg);
}

const USAGE = `用法：node design-archive-query.mjs <repo-root> <入口> <参数> [--delta <spec-slug>]
入口：
${Object.entries(ENTRIES).map(([k, v]) => `  ${k.padEnd(8)}${v.arg}`).join('\n')}
输出 JSON；找不到对象退出码 1（原因在 stderr），用法错误或不是仓库根退出码 2。`;

function main(argv) {
  const args = argv.slice(2);
  const di = args.indexOf('--delta');
  const delta = di >= 0 ? args[di + 1] : null;
  const positional = args.filter((a, i) => !(a === '--delta' || args[i - 1] === '--delta'));
  if (positional.length !== 3 || (di >= 0 && !delta) || !ENTRIES[positional[1]]) {
    console.error(USAGE);
    return 2;
  }
  const [rootArg, entry, arg] = positional;
  const root = resolve(rootArg);
  if (!existsSync(join(root, 'docs'))) {
    console.error(`${root} 下没有 docs/：这不是目标仓库的根`);
    return 2;
  }
  try {
    const result = query(root, entry, arg, { delta });
    if (entry === 'keyword' && !result.matches.length) {
      console.error(`没有对象匹配「${result.query}」`);
      return 1;
    }
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    if (!(e instanceof QueryError)) throw e;
    console.error(e.message);
    return e.code === 'usage' ? 2 : 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
