import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, SPEC_SLUG, compliantFiles, writeRepo } from './design-archive-fixture.mjs';
import { check } from './design-archive-check.mjs';
import { computeUsedBy, loadArchive, objectsOfKind, outgoingEdges, statesOfPage } from './design-archive.mjs';

const CLI = fileURLToPath(new URL('./design-archive-check.mjs', import.meta.url));

const P = (rel) => `${BASE}/${rel}`;
const LIST = P('pages/cookbook/cookbook--list.md');
const LOADING = P('pages/cookbook/cookbook--search-loading.md');
const RESULTS = P('pages/cookbook/cookbook--search-results.md');
const FAILED = P('pages/cookbook/cookbook--search-failed.md');
const OVERVIEW = P('pages/pantry/pantry--overview.md');
const RECIPE_CARD = P('components/RecipeCard/RecipeCard.md');
const SPINNER = P('motions/spinner-ring.md');
const SAVE_POP = P('motions/save-pop.md');
const SAVE_JOURNEY = P('journeys/save-a-recipe.md');
const COOKBOOK = P('pages/cookbook/cookbook.md');

/** The compliant fixture with edits applied: { path: (text) => newText | null (delete) }. */
function bend(edits = {}, extra = {}) {
  const files = compliantFiles();
  for (const [path, fn] of Object.entries(edits)) {
    assert.ok(path in files, `fixture has no ${path}`);
    const next = fn(files[path]);
    assert.notEqual(next, files[path], `edit on ${path} changed nothing`);
    files[path] = next;
  }
  return Object.assign(files, extra);
}
const run = (files, opts) => check(writeRepo(files), opts);
const rules = (r) => r.violations.map((x) => x.rule);
const named = (r, rule, ...needles) =>
  r.violations.filter((x) => x.rule === rule && needles.every((n) => `${x.file} ${x.field ?? ''} ${x.message}`.includes(n)));
const sub = (from, to) => (t) => t.replace(from, to);

test('the compliant fixture has no violations and no notes', () => {
  const r = run(compliantFiles());
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.notes, []);
});

// ---------- the parsed archive (what 02 and later build on) ----------

test('loadArchive returns every object, edge and reference', () => {
  const a = loadArchive(writeRepo(compliantFiles()));
  assert.deepEqual(a.problems, []);
  const ids = (kind) => objectsOfKind(a, kind).map((o) => o.id).sort();
  assert.deepEqual(ids('page'), ['cookbook', 'pantry']);
  assert.deepEqual(ids('state'), [
    'cookbook--list', 'cookbook--recipe-saved', 'cookbook--search-failed', 'cookbook--search-loading', 'cookbook--search-results',
    'pantry--empty', 'pantry--overview',
  ]);
  assert.deepEqual(ids('component'), ['NavBar', 'RecipeCard', 'RetryButton', 'SaveButton', 'SearchBox']);
  assert.deepEqual(ids('motion'), ['save-pop', 'spinner-ring']);
  assert.deepEqual(ids('journey'), ['glance-at-pantry', 'save-a-recipe']);
  assert.equal(a.objects.size, 18);
  assert.equal(a.edges.length, 9);
  assert.deepEqual(statesOfPage(a, 'pantry').map((s) => s.id).sort(), ['pantry--empty', 'pantry--overview']);

  const fail = outgoingEdges(a, 'cookbook--search-loading').find((e) => e.id === 'fail');
  assert.equal(fail.to, 'cookbook--search-failed');
  assert.equal(fail.kind, 'system');
  assert.equal(fail.how, '拦截搜索请求并返回 500');
  assert.deepEqual(fail.blocked.tried, ['拦截搜索请求返回 500', '用空关键词搜索']);
  const search = outgoingEdges(a, 'cookbook--list').find((e) => e.id === 'search');
  assert.deepEqual([search.component, search.locate, search.action], ['SearchBox', { role: 'searchbox', name: '搜索菜谱' }, '输入关键词并回车']);

  assert.ok(a.refs.some((r) => r.from === 'cookbook' && r.where === 'regions[0].component' && r.target === 'NavBar'));
  assert.ok(a.refs.some((r) => r.from === 'RecipeCard' && r.where.startsWith('正文') && r.target === SPEC_SLUG));
  assert.deepEqual(a.index, { type: 'design-index', tags: ['design'], summary: '设计档案索引', viewport: '1440x900', theme: 'light', locale: 'zh-CN' });
});

test('computeUsedBy lists the pages that use each component and motion', () => {
  const used = computeUsedBy(loadArchive(writeRepo(compliantFiles())));
  assert.deepEqual(used.components.get('RecipeCard'), ['cookbook', 'pantry']);
  assert.deepEqual(used.components.get('NavBar'), ['cookbook', 'pantry']);
  assert.deepEqual(used.components.get('RetryButton'), ['cookbook']); // only through an edge
  assert.deepEqual(used.motions.get('spinner-ring'), ['cookbook']); // through a state
  assert.deepEqual(used.motions.get('save-pop'), ['cookbook']); // through an edge
});

// ---------- structure ----------

test('a file that is not an archive object is reported, not skipped', () => {
  const r = run(bend({ [SPINNER]: sub('type: design-motion', 'type: design-moton') }));
  assert.equal(named(r, 0, 'spinner-ring.md', 'type').length, 1);
});

test('a malformed edge is named with its position', () => {
  const r = run(bend({ [LIST]: sub('    kind: user\n    component: "[[SearchBox]]"', '    kind: usr\n    component: "[[SearchBox]]"') }));
  assert.equal(named(r, 0, 'cookbook--list.md', 'edges[0].kind').length, 1);
});

// ---------- rule 1: reachability ----------

test('rule 1: a state nobody can enter and that says nothing about why is named', () => {
  const lonely = `---\ntype: design-state\ntags: [pantry]\nsummary: 没人能进来\npage: "[[pantry]]"\nedges: []\n---\n\n## 这一屏\n\n空。\n\n## 应看到什么\n\n- 空\n`;
  const r = run(bend({}, { [P('pages/pantry/pantry--lonely.md')]: lonely }));
  assert.deepEqual(rules(r), [1]);
  assert.match(r.violations[0].file, /pantry--lonely\.md$/);
});

test('rule 1: a state reachable only through a blocked edge passes; its successors still need a route', () => {
  assert.deepEqual(run(compliantFiles()).violations, []); // search-failed: blocked in, retry out
  const tail = `---\ntype: design-state\ntags: [cookbook]\nsummary: 失败后的下一步\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n空。\n\n## 应看到什么\n\n- 空\n`;
  const r = run(bend({ [FAILED]: sub('action: click', 'action: click\n  - id: give-up\n    to: "[[cookbook--after-failure]]"\n    kind: user\n    component: "[[RetryButton]]"\n    locate: { role: button, name: 放弃 }\n    action: click') }, { [P('pages/cookbook/cookbook--after-failure.md')]: tail }));
  assert.deepEqual(rules(r), [1]); // reached only from a state that nobody can enter
  assert.match(r.violations[0].message, /cookbook--after-failure/);
});

test('rule 1: dropping `blocked` from the only way in does not hide an unreachable state', () => {
  // make search-failed's only incoming edge go away entirely: nothing reaches it and nothing is blocked
  const r = run(bend({ [LOADING]: (t) => t.replace(/  - id: fail[\s\S]*?\]\ \}/, '').replace(/\n---\n\n#/, '\n---\n\n#') }));
  assert.ok(named(r, 1, 'cookbook--search-failed').length >= 1);
});

// ---------- rule 2: async ----------

test('rule 2: async missing one of its three items', () => {
  const r = run(bend({ [LIST]: sub('  failure: "[[cookbook--search-failed]]"\n', '') }));
  assert.deepEqual(rules(r), [2]);
  assert.match(r.violations[0].field, /async\.failure/);
});

test('rule 2: async items must be an existing state or 不适用', () => {
  const missing = run(bend({ [LIST]: sub('loading: "[[cookbook--search-loading]]"', 'loading: "[[cookbook--nowhere]]"') }));
  assert.deepEqual(rules(missing), [2]);
  const prose = run(bend({ [LIST]: sub('empty: 不适用', 'empty: 暂时没有') }));
  assert.deepEqual(rules(prose), [2]);
  const wrongKind = run(bend({ [LIST]: sub('empty: 不适用', 'empty: "[[RecipeCard]]"') }));
  assert.deepEqual(rules(wrongKind), [2]);
});

// ---------- rule 3: references ----------

test('rule 3: an unresolvable wikilink in the body names file and line', () => {
  const r = run(bend({ [COOKBOOK]: sub('页面描述。', '页面描述，见 [[no-such-note]]。') }));
  assert.deepEqual(rules(r), [3]);
  assert.match(r.violations[0].message, /no-such-note/);
});

test('rule 3: an unresolvable wikilink in frontmatter names the field', () => {
  const r = run(bend({ [LIST]: sub('components: ["[[RecipeCard]]"]', 'components: ["[[RecipeCrad]]"]') }));
  assert.equal(named(r, 3, 'cookbook--list.md', 'components[0]', 'RecipeCrad').length, 1);
});

test('rule 3: an edge component must be a component and an edge motion a motion', () => {
  const comp = run(bend({ [LIST]: sub('component: "[[SearchBox]]"', 'component: "[[save-pop]]"') }));
  assert.equal(named(comp, 3, 'cookbook--list.md', 'edges[0].component', '要component').length, 1);
  const motion = run(bend({ [RESULTS]: sub('motion: "[[save-pop]]"', 'motion: "[[SaveButton]]"') }));
  assert.equal(named(motion, 3, 'cookbook--search-results.md', 'edges[0].motion', '要motion').length, 1);
});

test('rule 3: a basename that appears twice under docs/ is reported', () => {
  const r = run(bend({}, { 'docs/reference/RecipeCard.md': '# 另一份同名文件\n' }));
  assert.equal(named(r, 3, 'RecipeCard', '重复').length, 1);
});

test('rule 3: ticket files and index.md may repeat names', () => {
  const r = run(bend({}, { 'docs/spec/third/tickets/01-first.md': '# x\n', 'docs/spec/index.md': '# x\n' }));
  assert.deepEqual(r.violations, []);
});

// ---------- rule 4: journeys ----------

test('rule 4: two states with no edge between them', () => {
  const r = run(bend({ [SAVE_JOURNEY]: sub('  - "[[cookbook--search-loading]]"\n', '') }));
  assert.deepEqual(rules(r), [4]);
  assert.match(r.violations[0].message, /cookbook--list.*cookbook--search-results/);
});

test('rule 4: several edges between two states need a via that names one of them', () => {
  const noVia = run(bend({ [SAVE_JOURNEY]: sub('{ state: "[[cookbook--search-results]]", via: save }', '"[[cookbook--search-results]]"') }));
  assert.deepEqual(rules(noVia), [4]);
  assert.match(noVia.violations[0].message, /save.*save-key/);
  const badVia = run(bend({ [SAVE_JOURNEY]: sub('via: save }', 'via: nope }') }));
  assert.deepEqual(rules(badVia), [4]);
  assert.match(badVia.violations[0].message, /nope/);
});

// ---------- rule 5: decisions and candidates ----------

test('rule 5: a state file with a 决定 section', () => {
  const r = run(bend({ [LIST]: (t) => `${t}\n## 决定\n\n### 决定 1：x\n- 为什么：y\n- 否掉过：无\n- 来源：[[${SPEC_SLUG}]]\n` }));
  assert.deepEqual(rules(r), [5]);
  assert.match(r.violations[0].file, /cookbook--list\.md$/);
});

test('rule 5: a decision missing any of its three items', () => {
  for (const label of ['为什么', '否掉过', '来源']) {
    const r = run(bend({ [RECIPE_CARD]: (t) => t.replace(new RegExp(`^- ${label}：.*\\n?`, 'm'), '') }));
    assert.deepEqual(rules(r), [5], label);
    assert.match(r.violations[0].message, new RegExp(`缺「${label}」`));
  }
});

test('rule 5: 否掉过 may say 无, but not be empty', () => {
  const r = run(bend({ [RECIPE_CARD]: sub('- 否掉过：无', '- 否掉过：') }));
  assert.deepEqual(rules(r), [5]);
});

test('rule 5: a candidate missing 并进 / 为什么 / 证据', () => {
  for (const label of ['并进', '为什么', '证据']) {
    const r = run(bend({ [SAVE_POP]: (t) => t.replace(new RegExp(`^  - ${label}：.*\\n?`, 'm'), '') }));
    assert.deepEqual(rules(r), [5], label);
    assert.match(r.violations[0].message, new RegExp(`缺「${label}」`));
  }
});

test('rule 5: both sections must exist and must not be left empty', () => {
  const noCandidates = run(bend({ [COOKBOOK]: sub('## 设计法候选\n\n无', '') }));
  assert.deepEqual(rules(noCandidates), [5]);
  assert.match(noCandidates.violations[0].message, /设计法候选/);
  const emptyDecisions = run(bend({ [P('pages/pantry/pantry.md')]: sub('## 决定\n\n无', '## 决定\n') }));
  assert.deepEqual(rules(emptyDecisions), [5]);
  const noDecisions = run(bend({ [P('pages/pantry/pantry.md')]: sub('## 决定\n\n无\n\n', '') }));
  assert.deepEqual(rules(noDecisions), [5]);
});

test('rule 5: decision numbers are not reused within a file', () => {
  const dup = `\n### 决定 1：再来一条\n- 为什么：y\n- 否掉过：无\n- 来源：[[${SPEC_SLUG}]]\n`;
  const r = run(bend({ [RECIPE_CARD]: sub('## 设计法候选', `${dup}\n## 设计法候选`) }));
  assert.deepEqual(rules(r), [5]);
  assert.match(r.violations[0].message, /编号重复/);
});

// ---------- rule 6: motions and usedBy ----------

test('rule 6: a literal duration or easing needs deviates', () => {
  const r = run(bend({ [SAVE_POP]: (t) => t.replace(/^deviates:.*\n/m, '') }));
  assert.deepEqual(rules(r), [6]);
  assert.equal(r.violations[0].field, 'deviates');
  // a token reference needs none (spinner-ring is the compliant example)
  assert.deepEqual(run(compliantFiles()).violations, []);
});

test('rule 6: usedBy absent counts as not generated', () => {
  const r = run(bend({ [P('components/SearchBox/SearchBox.md')]: (t) => t.replace(/^usedBy:.*\n/m, '') }));
  assert.deepEqual(rules(r), [6]);
  assert.match(r.violations[0].message, /未生成/);
});

test('rule 6: usedBy must match the references actually found', () => {
  const stale = run(bend({ [P('components/NavBar/NavBar.md')]: sub('usedBy: ["[[cookbook]]", "[[pantry]]"]', 'usedBy: ["[[cookbook]]"]') }));
  assert.deepEqual(rules(stale), [6]);
  assert.match(stale.violations[0].message, /少了 \[\[pantry\]\]/);
  const extra = run(bend({ [SPINNER]: sub('usedBy: ["[[cookbook]]"]', 'usedBy: ["[[cookbook]]", "[[pantry]]"]') }));
  assert.deepEqual(rules(extra), [6]);
  assert.match(extra.violations[0].message, /多了 \[\[pantry\]\]/);
  const skipped = run(bend({ [SPINNER]: sub('usedBy: ["[[cookbook]]"]', 'usedBy: []') }), { usedBy: false });
  assert.deepEqual(skipped.violations, []);
});

test('rule 6: with usedBy off, links in usedBy that no longer resolve (a removed page) are not judged either; with it on they are', () => {
  const stale = { [SPINNER]: sub('usedBy: ["[[cookbook]]"]', 'usedBy: ["[[cookbook]]", "[[gone]]"]') };
  assert.deepEqual(run(bend(stale), { usedBy: false }).violations, []);
  assert.deepEqual([...new Set(rules(run(bend(stale))))].sort(), [3, 6]);
});

// ---------- delta overlay ----------

const DELTA = `docs/design/tmp/${SPEC_SLUG}/delta`;
const D = (rel) => `${DELTA}/${rel}`;

function deltaFiles() {
  const base = compliantFiles();
  const shareSheet = `---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n`;
  const shareButton = `---\ntype: design-component\ntags: [component]\nsummary: 分享按钮\ncode: [src/components/ShareButton.tsx]\nusedBy: ["[[cookbook]]"]\n---\n\n# ShareButton\n\n## 决定\n\n无\n\n## 设计法候选\n\n无\n`;
  return {
    ...base,
    // changed: results gains a share edge
    [D('pages/cookbook/cookbook--search-results.md')]: base[RESULTS].replace(
      'action: 聚焦后按回车',
      'action: 聚焦后按回车\n  - id: share\n    to: "[[cookbook--share-sheet]]"\n    kind: user\n    component: "[[ShareButton]]"\n    locate: { role: button, name: 分享 }\n    action: click',
    ),
    // added
    [D('pages/cookbook/cookbook--share-sheet.md')]: shareSheet,
    [D('components/ShareButton/ShareButton.md')]: shareButton,
    // changed: overview loses the edge to the state that goes away
    [D('pages/pantry/pantry--overview.md')]: base[OVERVIEW].replace(/  - id: empty-shelf[\s\S]*?删除全部食材记录/, '').replace('edges:\n', 'edges:\n'),
    [D('removed.md')]: '# 删除\n\n- [[pantry--empty]] —— 空状态并入 overview\n',
  };
}

test('delta: objects in delta/ replace prod/ ones, removed.md drops the rest, and the result is judged', () => {
  const r = run(deltaFiles(), { delta: SPEC_SLUG });
  assert.deepEqual(r.violations, []);
  const ids = [...r.archive.objects.keys()];
  assert.ok(ids.includes('cookbook--share-sheet') && ids.includes('ShareButton'));
  assert.ok(!ids.includes('pantry--empty'));
  assert.deepEqual(r.archive.delta, {
    slug: SPEC_SLUG,
    added: ['ShareButton', 'cookbook--share-sheet'].sort(),
    changed: ['cookbook--search-results', 'pantry--overview'].sort(),
    removed: ['pantry--empty'],
  });
  assert.equal(r.archive.objects.get('cookbook--search-results').source, 'delta');
  assert.equal(outgoingEdges(r.archive, 'pantry--overview').length, 1);
});

test('delta: without the overlay the prod archive is still the one judged', () => {
  const r = run(deltaFiles());
  assert.deepEqual(r.violations, []);
  assert.ok(r.archive.objects.has('pantry--empty'));
  assert.equal(r.archive.delta, null);
});

test('delta: a removal that leaves a dangling edge is caught', () => {
  const files = deltaFiles();
  delete files[D('pages/pantry/pantry--overview.md')];
  const r = run(files, { delta: SPEC_SLUG });
  assert.ok(named(r, 3, 'pantry--overview.md', 'pantry--empty').length >= 1);
});

test('delta: a changed object that breaks a rule is caught under its delta path', () => {
  const files = deltaFiles();
  files[D('pages/cookbook/cookbook--share-sheet.md')] = files[D('pages/cookbook/cookbook--share-sheet.md')].replace('page: "[[cookbook]]"', 'page: "[[cookbook]]"\nasync:\n  loading: "[[cookbook--share-sheet]]"');
  const r = run(files, { delta: SPEC_SLUG });
  assert.equal(named(r, 2, `${DELTA}/pages/cookbook/cookbook--share-sheet.md`, 'async.failure').length, 1);
});

test('delta: an unknown spec slug is an error, not an empty overlay', () => {
  assert.throws(() => run(compliantFiles(), { delta: 'nope' }), /没有 .*nope/);
});

// ---------- the old per-spec layout ----------

test('legacy layout: one note per old directory, nothing read, no violation', () => {
  const r = run(bend({}, {
    'docs/design/old-spec-a/old-spec-a-design.md': '---\ntype: [broken\n---\n乱七八糟 [[nowhere]]\n',
    'docs/design/old-spec-b/canvas.html': '<html></html>\n',
  }));
  assert.deepEqual(r.violations, []);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /docs\/design\/old-spec-a\/.*旧布局.*建议删/);
});

// ---------- command line ----------

function cli(root, ...args) {
  return spawnSync('node', [CLI, root, ...args], { encoding: 'utf8' });
}

test('cli: exit 0 on a clean archive, 1 on violations naming file and field, 0 with legacy notes', () => {
  const ok = cli(writeRepo(compliantFiles()));
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /通过/);

  const bad = cli(writeRepo(bend({ [LIST]: sub('  failure: "[[cookbook--search-failed]]"\n', '') })));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /规则 2.*cookbook--list\.md · async\.failure/);

  const legacy = cli(writeRepo(bend({}, { 'docs/design/old-spec/old-spec-design.md': '# 旧\n' })));
  assert.equal(legacy.status, 0);
  assert.match(legacy.stdout, /提示：.*旧布局/);
});

test('cli: --delta overlays a requirement; --json reports machine-readable violations', () => {
  const root = writeRepo(deltaFiles());
  assert.equal(cli(root, '--delta', SPEC_SLUG).status, 0);
  const files = deltaFiles();
  delete files[D('pages/pantry/pantry--overview.md')];
  const bad = cli(writeRepo(files), '--delta', SPEC_SLUG, '--json');
  assert.equal(bad.status, 1);
  const j = JSON.parse(bad.stdout);
  assert.equal(j.ok, false);
  assert.ok(j.violations.every((x) => x.rule && x.file && x.message));
});

test('cli: --no-used-by judges a delta whose new components and motions have no usedBy yet', () => {
  const files = deltaFiles();
  files[D('components/ShareButton/ShareButton.md')] = files[D('components/ShareButton/ShareButton.md')].replace(/^usedBy:.*\n/m, '');
  const root = writeRepo(files);
  const strict = cli(root, '--delta', SPEC_SLUG);
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /规则 6.*usedBy.*未生成/);
  const lenient = cli(root, '--delta', SPEC_SLUG, '--no-used-by');
  assert.equal(lenient.status, 0, lenient.stdout);
  // only the usedBy half is skipped: other rules still judge the delta
  const broken = deltaFiles();
  delete broken[D('pages/pantry/pantry--overview.md')];
  assert.equal(cli(writeRepo(broken), '--delta', SPEC_SLUG, '--no-used-by').status, 1);
});

test('cli: usage errors and a directory that is not a repository root exit 2', () => {
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2);
  assert.equal(cli(writeRepo({ 'README.md': 'x' })).status, 2);
  assert.equal(cli(writeRepo(compliantFiles()), '--delta', 'nope').status, 2);
});
