import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, MKT, MKT_ENTRY, MKT_ENTRY_FILE, SPEC_SLUG, compliantFiles, marketingFiles, writeRepo } from './design-archive-fixture.mjs';
import { loadArchive } from './design-archive.mjs';
import {
  QueryError,
  enterState,
  query,
  queryDiff,
  queryJourney,
  queryKeyword,
  queryPage,
  queryRefs,
  queryState,
} from './design-archive-query.mjs';

const CLI = fileURLToPath(new URL('./design-archive-query.mjs', import.meta.url));
const P = (rel) => `${BASE}/${rel}`;

const archiveOf = (files = compliantFiles(), opts) => loadArchive(writeRepo(files), opts);

const LONELY = P('pages/cookbook/cookbook--lonely.md');
const lonelyState = (summary) =>
  `---\ntype: design-state\ntags: [cookbook]\nsummary: ${summary}\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n孤岛。\n\n## 应看到什么\n\n- 什么都看不到\n`;

/** The compliant fixture plus a state nothing points to and nothing explains (the "E" of the spec). */
const withLonelyState = () => ({ ...compliantFiles(), [LONELY]: lonelyState('谁也进不来的一屏') });

// ---------- 进入方式 ----------

test('enter: an entry state is its own way in — url and preconditions, no steps', () => {
  const r = enterState(archiveOf(), 'cookbook--list');
  assert.equal(r.reachable, true);
  assert.deepEqual(r.steps, []);
  assert.equal(r.entry.state, 'cookbook--list');
  assert.equal(r.entry.url, '/cookbook');
  assert.deepEqual(r.entry.preconditions, { account: '已登录的测试账号', data: '至少 3 份已保存菜谱' });
  assert.match(r.shouldSee, /已保存的菜谱卡片/);
});

test('enter: A → B → C gives the entry address, preconditions, two steps and what to see at C', () => {
  const r = enterState(archiveOf(), 'cookbook--search-results');
  assert.equal(r.reachable, true);
  assert.equal(r.entry.url, '/cookbook');
  assert.equal(r.entry.preconditions.account, '已登录的测试账号');
  assert.equal(r.steps.length, 2);
  // user edge: component, locate, action
  assert.deepEqual(
    { id: r.steps[0].id, from: r.steps[0].from, to: r.steps[0].to, kind: r.steps[0].kind },
    { id: 'search', from: 'cookbook--list', to: 'cookbook--search-loading', kind: 'user' },
  );
  assert.equal(r.steps[0].component, 'SearchBox');
  assert.deepEqual(r.steps[0].locate, { role: 'searchbox', name: '搜索菜谱' });
  assert.equal(r.steps[0].action, '输入关键词并回车');
  // system edge: trigger and how to make it happen
  assert.equal(r.steps[1].kind, 'system');
  assert.equal(r.steps[1].trigger, '搜索请求完成');
  assert.equal(r.steps[1].how, '放行搜索请求');
  assert.equal(r.steps[1].component, undefined);
  assert.match(r.shouldSee, /每张卡片有保存按钮/);
});

test('enter: the shortest path wins, across pages too', () => {
  // pantry--overview is one hop from the cookbook entry; pantry--empty is two
  const r = enterState(archiveOf(), 'pantry--empty');
  assert.deepEqual(r.steps.map((s) => s.to), ['pantry--overview', 'pantry--empty']);
  assert.equal(r.steps[0].component, 'NavBar');
});

test('enter: a state reachable only through a blocked edge is 进不去, with what is missing and what was tried', () => {
  const r = enterState(archiveOf(), 'cookbook--search-failed');
  assert.equal(r.reachable, false);
  assert.equal(r.verdict, '进不去');
  assert.equal(r.undeclared, false);
  assert.equal(r.blocked.length, 1);
  assert.deepEqual(
    { id: r.blocked[0].id, from: r.blocked[0].from, to: r.blocked[0].to },
    { id: 'fail', from: 'cookbook--search-loading', to: 'cookbook--search-failed' },
  );
  assert.equal(r.blocked[0].missing, '一个能让搜索接口稳定失败的开关');
  assert.deepEqual(r.blocked[0].tried, ['拦截搜索请求返回 500', '用空关键词搜索']);
  assert.equal(r.steps, undefined);
});

test('enter: a state downstream of a blocked one is 进不去 too, and names the blocked edge upstream', () => {
  const files = compliantFiles();
  files[P('pages/cookbook/cookbook--search-failed.md')] = files[P('pages/cookbook/cookbook--search-failed.md')].replace(
    'edges:\n',
    'edges:\n  - id: give-up\n    to: "[[cookbook--lonely]]"\n    kind: user\n    component: "[[RetryButton]]"\n    locate: { role: button, name: 放弃 }\n    action: click\n',
  );
  files[LONELY] = lonelyState('放弃之后');
  const r = enterState(archiveOf(files), 'cookbook--lonely');
  assert.equal(r.reachable, false);
  assert.deepEqual(r.blocked.map((b) => b.id), ['fail']);
});

test('enter: no path and no blocked edge anywhere upstream is 进不去 and says nothing explains it', () => {
  const r = enterState(archiveOf(withLonelyState()), 'cookbook--lonely');
  assert.equal(r.reachable, false);
  assert.equal(r.verdict, '进不去');
  assert.equal(r.undeclared, true);
  assert.deepEqual(r.blocked, []);
});

test('enter: an unknown state, or an object that is not a state, is a not-found error that says what was meant', () => {
  const a = archiveOf();
  assert.throws(() => enterState(a, 'nope'), (e) => e instanceof QueryError && e.code === 'not-found' && /nope/.test(e.message));
  assert.throws(() => enterState(a, 'NavBar'), (e) => e instanceof QueryError && /NavBar.*组件/.test(e.message));
});

// ---------- 页面 ----------

test('page: states with their edges, regions and components, journeys through it, motions, decisions', () => {
  const r = queryPage(archiveOf(), 'cookbook');
  assert.equal(r.page.id, 'cookbook');
  assert.deepEqual(r.page.code, ['src/pages/cookbook.tsx']);
  assert.equal(r.page.summary, '菜谱主页：搜索、保存、进入食材库');

  assert.deepEqual(r.regions, [
    { name: '顶部导航', component: 'NavBar', code: ['src/components/NavBar.tsx'] },
    { name: '搜索', component: 'SearchBox', code: ['src/components/SearchBox.tsx'] },
    { name: '结果卡片', component: 'RecipeCard', code: ['src/components/RecipeCard.tsx'] },
  ]);

  assert.deepEqual(
    r.states.map((s) => s.id),
    ['cookbook--list', 'cookbook--recipe-saved', 'cookbook--search-failed', 'cookbook--search-loading', 'cookbook--search-results'],
  );
  const list = r.states.find((s) => s.id === 'cookbook--list');
  assert.deepEqual(list.outgoing.map((e) => e.id), ['search', 'open-pantry']);
  assert.equal(list.outgoing[1].to, 'pantry--overview'); // a cross-page jump is an edge of this state
  assert.deepEqual(list.entry, { url: '/cookbook', preconditions: { account: '已登录的测试账号', data: '至少 3 份已保存菜谱' } });
  assert.deepEqual(list.incoming.map((e) => `${e.from}:${e.id}`), ['pantry--overview:back']);
  const loading = r.states.find((s) => s.id === 'cookbook--search-loading');
  assert.deepEqual(loading.incoming.map((e) => e.id).sort(), ['retry', 'search']);
  assert.deepEqual(loading.motions, ['spinner-ring']);
  assert.equal(r.states.find((s) => s.id === 'cookbook--recipe-saved').entry, null);

  assert.deepEqual(r.journeys.map((j) => j.id), ['glance-at-pantry', 'save-a-recipe']);
  assert.equal(r.journeys[0].intent, '用户在菜谱页中途看一眼食材库，再回到菜谱页');
  assert.deepEqual(r.journeys[1].states, ['cookbook--list', 'cookbook--search-loading', 'cookbook--search-results', 'cookbook--recipe-saved']);

  assert.deepEqual(r.motions.map((m) => m.id), ['save-pop', 'spinner-ring']);
  assert.deepEqual(r.decisions.filter((d) => d.of.id === 'cookbook').map((d) => d.title), ['结果只显示一屏，不分页']);
  assert.equal(r.decisions[0].why.includes('翻页'), true);
  assert.match(r.decisions[0].rejected, /无限滚动/);
});

test('page: a component two pages share lists both pages as its users, on either page', () => {
  const a = archiveOf();
  for (const page of ['cookbook', 'pantry']) {
    const nav = queryPage(a, page).components.find((c) => c.id === 'NavBar');
    assert.deepEqual(nav.usedBy, ['cookbook', 'pantry'], `seen from ${page}`);
  }
  const pantry = queryPage(a, 'pantry');
  assert.deepEqual(pantry.journeys.map((j) => j.id), ['glance-at-pantry']); // a journey across two pages shows on both
  assert.deepEqual(pantry.states.find((s) => s.id === 'pantry--overview').incoming.map((e) => e.from), ['cookbook--list']);
});

test('page: decisions and candidates of the objects around the page come tagged with whose they are', () => {
  const r = queryPage(archiveOf(), 'cookbook');
  const card = r.decisions.find((d) => d.of.id === 'RecipeCard');
  assert.deepEqual(card.of, { id: 'RecipeCard', kind: 'component' });
  assert.equal(card.title, '卡片标题最多两行');
  assert.equal(card.source, '[[demo-spec]]');
  const cand = r.candidates.find((c) => c.of.id === 'save-pop');
  assert.match(cand.rule, /成功反馈用一次过冲的缩放/);
  assert.match(cand.merge, /Motion/);
  assert.match(cand.evidence, /save-pop/);
});

test('page: asking for something that is not a page names what it is, or what pages exist', () => {
  const a = archiveOf();
  assert.throws(() => queryPage(a, 'cookbook--list'), (e) => e instanceof QueryError && /是状态，不是页面/.test(e.message));
  assert.throws(() => queryPage(a, 'nope'), (e) => e instanceof QueryError && /找不到页面「nope」.*cookbook、pantry/.test(e.message));
});

// ---------- 单个状态 ----------

test('state: how to get in, what to see, and the screenshots the body shows', () => {
  const files = compliantFiles();
  const file = P('pages/cookbook/cookbook--search-results.md');
  files[file] = files[file].replace('结果卡片列表。', '结果卡片列表。\n\n![[results.png]]\n\n![回车保存](assets/saved.gif)');
  files[P('pages/cookbook/assets/results.png')] = 'png';
  files[P('pages/cookbook/assets/saved.gif')] = 'gif';
  const r = queryState(archiveOf(files), 'cookbook--search-results');
  assert.equal(r.state.id, 'cookbook--search-results');
  assert.equal(r.state.page, 'cookbook');
  assert.equal(r.enter.reachable, true);
  assert.equal(r.enter.steps.length, 2);
  assert.match(r.shouldSee, /每张卡片有保存按钮/);
  assert.match(r.screen, /结果卡片列表/);
  assert.deepEqual(r.screenshots, [P('pages/cookbook/assets/results.png'), P('pages/cookbook/assets/saved.gif')]);
});

test('state: no screenshots written means an empty list, and an unreachable state still answers', () => {
  const r = queryState(archiveOf(), 'cookbook--search-failed');
  assert.deepEqual(r.screenshots, []);
  assert.equal(r.enter.verdict, '进不去');
  assert.match(r.shouldSee, /搜索失败/);
});

// ---------- 单条用户路径 ----------

test('journey: intent, then every step in order with how it is triggered and what to see', () => {
  const r = queryJourney(archiveOf(), 'save-a-recipe');
  assert.equal(r.journey.id, 'save-a-recipe');
  assert.equal(r.journey.intent, '用户搜到一份菜谱并保存下来');
  assert.deepEqual(r.steps.map((s) => s.state), [
    'cookbook--list',
    'cookbook--search-loading',
    'cookbook--search-results',
    'cookbook--recipe-saved',
  ]);
  assert.deepEqual(r.steps.map((s) => s.n), [1, 2, 3, 4]);

  // the first step has no trigger: a journey says where it starts, not how to get there
  assert.equal(r.steps[0].trigger, null);
  assert.match(r.steps[0].shouldSee, /搜索框/);

  // a user edge: component + locate + action
  assert.equal(r.steps[1].trigger.id, 'search');
  assert.equal(r.steps[1].trigger.component, 'SearchBox');
  assert.deepEqual(r.steps[1].trigger.locate, { role: 'searchbox', name: '搜索菜谱' });
  // a system edge: trigger + how
  assert.equal(r.steps[2].trigger.kind, 'system');
  assert.equal(r.steps[2].trigger.trigger, '搜索请求完成');
  assert.equal(r.steps[2].trigger.how, '放行搜索请求');
  // two edges between results and saved: the `via` on the previous step picks one
  assert.equal(r.steps[3].trigger.id, 'save');
  assert.equal(r.steps[3].trigger.motion, 'save-pop');
  assert.match(r.steps[3].shouldSee, /已保存/);
  assert.equal(r.steps[3].ambiguous, undefined);

  // where the first state is entered from is the state's own question, answered the same way
  assert.equal(r.start.reachable, true);
  assert.equal(r.start.entry.url, '/cookbook');
});

test('journey: a path across pages carries the page of each step', () => {
  const r = queryJourney(archiveOf(), 'glance-at-pantry');
  assert.deepEqual(r.steps.map((s) => s.page), ['cookbook', 'pantry', 'cookbook']);
  assert.equal(r.steps[1].trigger.component, 'NavBar');
  assert.equal(r.steps[2].trigger.id, 'back');
});

test('journey: two edges and no via is flagged rather than guessed; a missing edge says so', () => {
  const files = compliantFiles();
  const file = P('journeys/save-a-recipe.md');
  files[file] = files[file].replace('{ state: "[[cookbook--search-results]]", via: save }', '"[[cookbook--search-results]]"');
  const loose = queryJourney(archiveOf(files), 'save-a-recipe');
  assert.deepEqual(loose.steps[3].ambiguous, ['save', 'save-key']);
  assert.equal(loose.steps[3].trigger.id, 'save');

  files[file] = files[file].replace('"[[cookbook--recipe-saved]]"', '"[[pantry--empty]]"');
  const broken = queryJourney(archiveOf(files), 'save-a-recipe');
  assert.equal(broken.steps[3].trigger, null);
  assert.equal(broken.steps[3].noEdge, true);
});

test('journey: not found says what journeys exist', () => {
  assert.throws(() => queryJourney(archiveOf(), 'nope'), (e) => e instanceof QueryError && /找不到用户路径「nope」.*glance-at-pantry、save-a-recipe/.test(e.message));
});

// ---------- 反查 ----------

test('refs: by component name — the states, edges, journeys and pages that refer to it', () => {
  const r = queryRefs(archiveOf(), 'NavBar');
  assert.deepEqual(r.target, { id: 'NavBar', kind: 'component', code: ['src/components/NavBar.tsx'] });
  assert.equal(r.matchedBy, 'name');
  assert.deepEqual(r.edges.map((e) => `${e.from}:${e.id}`), ['cookbook--list:open-pantry', 'pantry--overview:back']);
  assert.deepEqual(r.states.map((s) => s.id), ['cookbook--list', 'pantry--overview']);
  assert.deepEqual(r.journeys.map((j) => j.id), ['glance-at-pantry']);
  assert.deepEqual(r.pages, ['cookbook', 'pantry']);
});

test('refs: by the component code path finds the same thing', () => {
  const a = archiveOf();
  const byPath = queryRefs(a, 'src/components/NavBar.tsx');
  assert.equal(byPath.matchedBy, 'code');
  assert.deepEqual({ ...byPath, matchedBy: null }, { ...queryRefs(a, 'NavBar'), matchedBy: null });
  assert.deepEqual(queryRefs(a, './src/components/NavBar.tsx').target.id, 'NavBar');
});

test('refs: a state that lists the component (not only an edge) counts, and so do the journeys through it', () => {
  const r = queryRefs(archiveOf(), 'RecipeCard');
  assert.deepEqual(r.states.map((s) => [s.id, s.via]), [
    ['cookbook--list', ['components']],
    ['cookbook--search-results', ['components']],
    ['pantry--overview', ['components']],
  ]);
  assert.deepEqual(r.edges, []);
  // both journeys start at cookbook--list, which shows the card
  assert.deepEqual(r.journeys.map((j) => j.id), ['glance-at-pantry', 'save-a-recipe']);
  assert.deepEqual(r.pages, ['cookbook', 'pantry']);
});

test('refs: by motion name — edges and states using it, and the journey that goes through the edge', () => {
  const pop = queryRefs(archiveOf(), 'save-pop');
  assert.equal(pop.target.kind, 'motion');
  assert.deepEqual(pop.edges.map((e) => `${e.from}:${e.id}`), ['cookbook--search-results:save']);
  assert.deepEqual(pop.states.map((s) => [s.id, s.via]), [['cookbook--search-results', ['edges']]]);
  assert.deepEqual(pop.journeys.map((j) => j.id), ['save-a-recipe']);
  assert.deepEqual(pop.pages, ['cookbook']);

  const ring = queryRefs(archiveOf(), 'spinner-ring');
  assert.deepEqual(ring.states.map((s) => [s.id, s.via]), [['cookbook--search-loading', ['motions']]]);
  assert.deepEqual(ring.edges, []);
});

test('refs: a name that is no component or motion, and a code path nothing owns, are not found', () => {
  const a = archiveOf();
  assert.throws(() => queryRefs(a, 'nope'), (e) => e instanceof QueryError && /找不到.*「nope」/.test(e.message));
  assert.throws(() => queryRefs(a, 'src/nothing.tsx'), (e) => e instanceof QueryError && /找不到.*「src\/nothing.tsx」/.test(e.message));
  assert.throws(() => queryRefs(a, 'cookbook'), (e) => e instanceof QueryError && /是页面.*组件、动效/.test(e.message));
});

// ---------- 关键词 ----------

test('keyword: a word from a description finds the object; name beats summary beats body', () => {
  const a = archiveOf();
  const byWord = queryKeyword(a, '转圈');
  assert.ok(byWord.matches.some((m) => m.id === 'spinner-ring' && m.hit === 'summary'));
  assert.ok(byWord.matches.some((m) => m.id === 'cookbook--search-loading' && m.hit === 'body'));

  // "导航": NavBar's summary; the pages mention it in a region name, which is body-tier
  const nav = queryKeyword(a, '导航');
  assert.equal(nav.matches[0].id, 'NavBar');
  assert.equal(nav.matches[0].hit, 'summary');

  // "save": SaveButton / save-pop have it in the name — those come first
  const save = queryKeyword(a, 'save');
  assert.deepEqual(save.matches.filter((m) => m.hit === 'name').map((m) => m.id).sort(), [
    'SaveButton',
    'cookbook--recipe-saved',
    'save-a-recipe',
    'save-pop',
  ]);
  assert.equal(save.matches[0].hit, 'name');
  const tiers = save.matches.map((m) => ({ name: 3, summary: 2, body: 1 })[m.hit]);
  assert.deepEqual(tiers, [...tiers].sort((x, y) => y - x));
});

test('keyword: matching ignores case, a hit shows a snippet, and several words need not all be present', () => {
  const a = archiveOf();
  assert.equal(queryKeyword(a, 'NAVBAR').matches[0].id, 'NavBar');
  const r = queryKeyword(a, '食材库 菜谱');
  assert.ok(r.terms.length === 2);
  assert.ok(r.matches.every((m) => m.terms.length >= 1));
  const both = r.matches.filter((m) => m.terms.length === 2).map((m) => m.id);
  const one = r.matches.filter((m) => m.terms.length === 1).map((m) => m.id);
  assert.ok(both.length && one.length);
  // among equal positions, the object matching more words comes first
  const firstSummary = r.matches.filter((m) => m.hit === 'summary');
  assert.deepEqual(firstSummary.map((m) => m.terms.length), [...firstSummary.map((m) => m.terms.length)].sort((x, y) => y - x));
  assert.match(queryKeyword(a, '重试').matches.find((m) => m.id === 'RetryButton').snippet, /重试/);
});

test('keyword: a long Chinese phrase with no spaces still finds what shares a word with it', () => {
  const r = queryKeyword(archiveOf(), '搜索失败的提示');
  assert.ok(r.matches.some((m) => m.id === 'cookbook--search-failed'));
  assert.deepEqual(r.terms, ['搜索失败的提示']);
});

test('keyword: nothing matching is an empty list, not an error', () => {
  assert.deepEqual(queryKeyword(archiveOf(), 'zzzqqq').matches, []);
  assert.throws(() => queryKeyword(archiveOf(), '   '), (e) => e instanceof QueryError && e.code === 'usage');
});

// ---------- 需求差异 ----------

const DELTA = `docs/design/tmp/${SPEC_SLUG}/delta`;
const D = (rel) => `${DELTA}/${rel}`;
const RESULTS = P('pages/cookbook/cookbook--search-results.md');
const OVERVIEW = P('pages/pantry/pantry--overview.md');

const stateFile = (summary, expect) =>
  `---\ntype: design-state\ntags: [cookbook]\nsummary: ${summary}\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n${summary}。\n\n## 应看到什么\n\n${expect}\n`;

/**
 * A requirement that adds two states (share-sheet, share-done), changes one edge (results → saved
 * is now announced with a toast and a longer "what to see"), and removes one state (pantry--empty,
 * with overview giving up the edge that led to it).
 */
function deltaFiles() {
  const base = compliantFiles();
  return {
    ...base,
    [D('pages/cookbook/cookbook--share-sheet.md')]: stateFile('分享面板', '- 看到分享面板'),
    [D('pages/cookbook/cookbook--share-done.md')]: stateFile('分享完成', '- 看到「已复制链接」'),
    [D('pages/cookbook/cookbook--search-results.md')]: base[RESULTS]
      .replace(/(  - id: save\n[\s\S]*?)action: click\n    motion: "\[\[save-pop\]\]"/, '$1action: 点击或按回车\n    motion: "[[save-pop]]"')
      .replace('- 每张卡片有保存按钮', '- 每张卡片有保存按钮\n- 保存后出现提示条'),
    [D('pages/pantry/pantry--overview.md')]: base[OVERVIEW].replace(/  - id: empty-shelf[\s\S]*?删除全部食材记录/, ''),
    [D('removed.md')]: '# 删除\n\n- [[pantry--empty]] —— 空状态并入 overview\n',
  };
}

test('diff: added, changed and removed objects are listed separately', () => {
  const r = queryDiff(writeRepo(deltaFiles()), SPEC_SLUG);
  assert.equal(r.spec, SPEC_SLUG);
  assert.deepEqual(r.added.map((o) => o.id), ['cookbook--share-done', 'cookbook--share-sheet']);
  assert.deepEqual(r.added[1], {
    id: 'cookbook--share-sheet',
    kind: 'state',
    summary: '分享面板',
    file: D('pages/cookbook/cookbook--share-sheet.md'),
  });
  assert.deepEqual(r.changed.map((o) => o.id), ['cookbook--search-results', 'pantry--overview']);
  assert.deepEqual(r.removed, [{ id: 'pantry--empty', kind: 'state', summary: '食材库为空', file: P('pages/pantry/pantry--empty.md') }]);
});

test('diff: a changed edge is a field-level difference, keyed by the edge id', () => {
  const r = queryDiff(writeRepo(deltaFiles()), SPEC_SLUG);
  const results = r.changed.find((o) => o.id === 'cookbook--search-results');
  assert.deepEqual(results.fields, [{ field: 'edges[save].action', before: 'click', after: '点击或按回车' }]);
  // an edge that is gone, from the other changed state
  const overview = r.changed.find((o) => o.id === 'pantry--overview');
  assert.equal(overview.fields.length, 1);
  assert.equal(overview.fields[0].field, 'edges[empty-shelf]');
  assert.equal(overview.fields[0].before.to, 'pantry--empty');
  assert.equal(overview.fields[0].after, undefined);
});

test('diff: a changed body is compared section by section', () => {
  const results = queryDiff(writeRepo(deltaFiles()), SPEC_SLUG).changed.find((o) => o.id === 'cookbook--search-results');
  assert.deepEqual(results.sections.map((s) => [s.title, s.change]), [['应看到什么', 'changed']]);
  assert.match(results.sections[0].before, /^- 每张卡片有保存按钮$/);
  assert.match(results.sections[0].after, /保存后出现提示条/);
});

test('diff: a field added, a field dropped and a new section each show up; unchanged objects stay out', () => {
  const files = deltaFiles();
  files[D('components/NavBar/NavBar.md')] = files[P('components/NavBar/NavBar.md')]
    .replace('summary: 顶部导航', 'summary: 顶部导航\nnotes: 新加的字段')
    .replace('## 设计法候选', '## 补充\n\n多出来的一节\n\n## 设计法候选');
  const r = queryDiff(writeRepo(files), SPEC_SLUG);
  const nav = r.changed.find((o) => o.id === 'NavBar');
  assert.deepEqual(nav.fields, [{ field: 'notes', before: undefined, after: '新加的字段' }]);
  assert.deepEqual(nav.sections.map((s) => [s.title, s.change]), [['补充', 'added']]);
  assert.ok(!r.changed.some((o) => o.id === 'RecipeCard'));
});

test('diff: a delta/ copy identical to prod/ is not a change', () => {
  const files = deltaFiles();
  files[D('components/NavBar/NavBar.md')] = files[P('components/NavBar/NavBar.md')];
  const r = queryDiff(writeRepo(files), SPEC_SLUG);
  assert.ok(!r.changed.some((o) => o.id === 'NavBar'));
});

test('diff: a spec with no delta/ is not found; a delta/ listing an id prod/ never had is kept apart', () => {
  assert.throws(() => queryDiff(writeRepo(compliantFiles()), 'nope'), (e) => e instanceof QueryError && /没有.*nope|找不到.*nope/.test(e.message));
  const files = deltaFiles();
  files[D('removed.md')] += '- [[ghost]]\n';
  const r = queryDiff(writeRepo(files), SPEC_SLUG);
  assert.deepEqual(r.removed.map((o) => o.id), ['pantry--empty']);
  assert.deepEqual(r.unknownRemoved, ['ghost']);
});

// ---------- 命令行 ----------

const cli = (root, ...args) => spawnSync('node', [CLI, root, ...args], { encoding: 'utf8' });

test('cli: every entry answers in JSON, the same as calling the module', () => {
  const root = writeRepo(deltaFiles());
  const archive = loadArchive(root);
  const cases = [
    ['page', 'cookbook', () => queryPage(archive, 'cookbook')],
    ['state', 'cookbook--search-results', () => queryState(archive, 'cookbook--search-results')],
    ['journey', 'save-a-recipe', () => queryJourney(archive, 'save-a-recipe')],
    ['refs', 'NavBar', () => queryRefs(archive, 'NavBar')],
    ['refs', 'src/components/NavBar.tsx', () => queryRefs(archive, 'src/components/NavBar.tsx')],
    ['keyword', '转圈', () => queryKeyword(archive, '转圈')],
    ['diff', SPEC_SLUG, () => queryDiff(root, SPEC_SLUG)],
  ];
  for (const [entry, arg, direct] of cases) {
    const r = cli(root, entry, arg);
    assert.equal(r.status, 0, `${entry} ${arg}: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), JSON.parse(JSON.stringify(direct())), `${entry} ${arg}`);
  }
});

test('cli: --delta reads the archive as it will be after the requirement', () => {
  const root = writeRepo(deltaFiles());
  assert.equal(cli(root, 'state', 'cookbook--share-sheet').status, 1); // not in prod/
  const after = cli(root, 'state', 'cookbook--share-sheet', '--delta', SPEC_SLUG);
  assert.equal(after.status, 0, after.stderr);
  assert.equal(JSON.parse(after.stdout).state.id, 'cookbook--share-sheet');
  // an option may come first, too
  assert.equal(cli(root, '--delta', SPEC_SLUG, 'page', 'cookbook').status, 0);
});

test('cli: an object that is not there exits non-zero and says what, on stderr', () => {
  const root = writeRepo(compliantFiles());
  for (const [entry, arg, pattern] of [
    ['page', 'nope', /找不到页面「nope」/],
    ['state', 'nope', /找不到状态「nope」/],
    ['journey', 'nope', /找不到用户路径「nope」/],
    ['refs', 'nope', /找不到组件或动效「nope」/],
    ['diff', 'nope', /nope/],
    ['keyword', 'zzzqqq', /没有对象匹配「zzzqqq」/],
  ]) {
    const r = cli(root, entry, arg);
    assert.equal(r.status, 1, `${entry} ${arg}`);
    assert.match(r.stderr, pattern);
    assert.equal(r.stdout, '', `${entry} ${arg} prints no result`);
  }
  assert.equal(cli(root, 'state', 'nope', '--delta', 'nope').status, 1); // no such requirement either
});

test('cli: usage errors and a directory that is not a repository root exit 2', () => {
  const root = writeRepo(compliantFiles());
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2);
  assert.equal(cli(root, 'page').status, 2);
  assert.equal(cli(root, 'galaxy', 'cookbook').status, 2);
  assert.equal(cli(root, 'page', 'cookbook', '--delta').status, 2);
  assert.equal(cli(root, 'diff', SPEC_SLUG, '--delta', SPEC_SLUG).status, 2);
  assert.equal(cli(root, 'keyword', '   ').status, 2);
  const bare = cli(writeRepo({ 'README.md': 'x' }), 'page', 'cookbook');
  assert.equal(bare.status, 2);
  assert.match(bare.stderr, /不是目标仓库的根/);
});

test('every other entry can read the archive after the change', () => {
  const root = writeRepo(deltaFiles());
  const after = loadArchive(root, { delta: SPEC_SLUG });
  assert.equal(queryPage(after, 'cookbook').states.some((s) => s.id === 'cookbook--share-sheet'), true);
  assert.equal(queryPage(loadArchive(root), 'cookbook').states.some((s) => s.id === 'cookbook--share-sheet'), false);
  assert.throws(() => queryState(after, 'pantry--empty'), (e) => e instanceof QueryError);
  assert.equal(queryState(after, 'cookbook--search-results').enter.steps[1].kind, 'system');
});

// ---------- sections of a long entry state ----------

const mktArchive = (files = marketingFiles(), opts) => loadArchive(writeRepo(files), opts);

test('page: the sections of the entry state, each with its edges out and in, its states and the slice path', () => {
  const p = queryPage(mktArchive(), MKT);
  assert.deepEqual(p.sections.map((x) => x.id), ['header', 'hero', 'feature-a', 'feature-b', 'footer'].map((x) => `${MKT}#${x}`));
  const by = Object.fromEntries(p.sections.map((x) => [x.id.split('#')[1], x]));
  assert.deepEqual(
    { type: by.hero.type, qualifier: by.hero.qualifier, locate: by.hero.locate, locateBy: by.hero.locateBy, declaredBy: by.hero.declaredBy },
    { type: 'hero', qualifier: null, locate: { role: 'heading', name: '一个价格，没有隐藏项' }, locateBy: 'heading', declaredBy: MKT_ENTRY },
  );
  assert.equal(by['feature-b'].type, 'feature');
  assert.equal(by['feature-b'].qualifier, 'b');
  assert.equal(by.header.locateBy, 'landmark');
  // out: from the section; in: landing on it, including the same-page anchor (a self-loop)
  assert.deepEqual(by.hero.outgoing.map((e) => e.id), ['start', 'see-features']);
  assert.deepEqual(by['feature-a'].incoming.map((e) => [e.id, e.from, e.to]), [['see-features', MKT_ENTRY, MKT_ENTRY]]);
  assert.deepEqual(by['feature-b'].incoming.map((e) => [e.id, e.from]), [['see-pricing', 'cookbook--list']]);
  assert.deepEqual(by['feature-b'].outgoing.map((e) => e.id), ['expand']);
  assert.deepEqual(by['feature-b'].states, [`${MKT}--feature-b-expanded`]);
  assert.deepEqual(by.hero.states, []);
  // the slice lives next to the entry state, named <state>@<section>.png
  assert.equal(by.hero.screenshot, `${BASE}/pages/${MKT}/assets/${MKT_ENTRY}@hero.png`);
  assert.equal(by.hero.screenshotExists, false);
});

test("page: edges carry fromSection and toSection, so do a state's way in and a journey's steps", () => {
  const a = mktArchive();
  const p = queryPage(a, MKT);
  const entry = p.states.find((s) => s.id === MKT_ENTRY);
  const anchor = entry.outgoing.find((e) => e.id === 'see-features');
  assert.equal(anchor.fromSection, `${MKT}#hero`);
  assert.equal(anchor.toSection, `${MKT}#feature-a`);
  assert.equal(entry.outgoing.find((e) => e.id === 'start').toSection, undefined);
  assert.equal(entry.incoming.find((e) => e.id === 'see-pricing').toSection, `${MKT}#feature-b`);
  // the way into a state shows where to scroll first
  const enter = queryState(a, `${MKT}--feature-b-expanded`).enter;
  assert.deepEqual(enter.steps.map((e) => [e.id, e.fromSection]), [['expand', `${MKT}#feature-b`]]);
  assert.equal(queryState(a, `${MKT}--feature-b-expanded`).state.section, `${MKT}#feature-b`);
  // a journey
  const j = queryJourney(a, 'explore-pricing');
  assert.equal(j.steps[1].trigger.toSection, `${MKT}#feature-b`);
  assert.equal(j.steps[2].trigger.fromSection, `${MKT}#feature-b`);
});

test('page: a page without sections gets an empty list and its edges are unchanged', () => {
  const p = queryPage(archiveOf(), 'cookbook');
  assert.deepEqual(p.sections, []);
  assert.equal(JSON.stringify(p.states).includes('Section'), false);
});

test('page: a slice that exists on disk is reported as existing', () => {
  const files = { ...marketingFiles(), [`${BASE}/pages/${MKT}/assets/${MKT_ENTRY}@hero.png`]: 'x' };
  const hero = queryPage(mktArchive(files), MKT).sections.find((x) => x.id === `${MKT}#hero`);
  assert.equal(hero.screenshotExists, true);
});

test('refs: <page>#<section> returns the edges out of it and into it, the states inside it and the journeys through them', () => {
  const r = queryRefs(mktArchive(), `${MKT}#feature-b`);
  assert.deepEqual(r.target, {
    id: `${MKT}#feature-b`, kind: 'section', page: MKT, type: 'feature', qualifier: 'b', locate: { role: 'heading', name: '食材库同步' }, declaredBy: MKT_ENTRY,
  });
  assert.equal(r.matchedBy, 'section');
  assert.deepEqual(r.outgoing.map((e) => e.id), ['expand']);
  assert.deepEqual(r.incoming.map((e) => e.id), ['see-pricing']);
  assert.deepEqual(r.states.map((x) => x.id), [`${MKT}--feature-b-expanded`]);
  assert.deepEqual(r.journeys.map((j) => j.id), ['explore-pricing']);
  assert.deepEqual(r.pages, [MKT]);
  // a section with only a way out
  const hero = queryRefs(mktArchive(), `${MKT}#hero`);
  assert.deepEqual(hero.outgoing.map((e) => e.id), ['start', 'see-features']);
  assert.deepEqual(hero.incoming, []);
  assert.deepEqual(hero.journeys, []);
});

test('refs: #<type> returns every section of that type on every page, qualified ones included', () => {
  const r = queryRefs(mktArchive(), '#feature');
  assert.deepEqual(r.target, { kind: 'section-type', type: 'feature' });
  assert.equal(r.matchedBy, 'type');
  assert.deepEqual(r.sections.map((x) => [x.page, x.id, x.qualifier]), [[MKT, `${MKT}#feature-a`, 'a'], [MKT, `${MKT}#feature-b`, 'b']]);
  assert.deepEqual(queryRefs(mktArchive(), '#hero').sections.map((x) => x.id), [`${MKT}#hero`]);
});

test('refs: the old arguments (component name, code path, motion) behave as before on an archive with sections', () => {
  const a = mktArchive();
  assert.equal(queryRefs(a, 'SiteNav').matchedBy, 'name');
  assert.equal(queryRefs(a, 'src/components/CtaButton.tsx').target.id, 'CtaButton');
  assert.equal(queryRefs(a, 'save-pop').target.kind, 'motion');
});

test('refs: a section or type that is not there is a QueryError that lists what exists', () => {
  const a = mktArchive();
  assert.throws(() => queryRefs(a, `${MKT}#nowhere`), (e) => e instanceof QueryError && /nowhere/.test(e.message) && /hero/.test(e.message) && /footer/.test(e.message));
  assert.throws(() => queryRefs(a, 'no-page#hero'), (e) => e instanceof QueryError && /no-page/.test(e.message));
  assert.throws(() => queryRefs(a, 'cookbook#hero'), (e) => e instanceof QueryError && /没有声明分段/.test(e.message));
  assert.throws(() => queryRefs(a, '#trust'), (e) => e instanceof QueryError && /trust/.test(e.message) && /hero/.test(e.message));
  assert.throws(() => queryRefs(a, '#closing-band'), (e) => e instanceof QueryError && /类型表/.test(e.message));
});

test('cli: refs with a section id prints the same JSON and exits 1 with the existing sections when it is not there', () => {
  const root = writeRepo(marketingFiles());
  const ok = cli(root, 'refs', `${MKT}#hero`);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), JSON.parse(JSON.stringify(queryRefs(loadArchive(root), `${MKT}#hero`))));
  assert.equal(cli(root, 'refs', '#feature').status, 0);
  const bad = cli(root, 'refs', `${MKT}#nowhere`);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /hero/);
  assert.equal(bad.stdout, '');
  const page = cli(root, 'page', MKT);
  assert.equal(JSON.parse(page.stdout).sections.length, 5);
});

test('diff: sections are expanded by section id — moving one locate shows only that field of that section', () => {
  const base = marketingFiles();
  const edited = base[MKT_ENTRY_FILE].replace('{ role: heading, name: 无限菜谱 }', '{ role: heading, name: 无限菜谱收藏 }');
  assert.notEqual(edited, base[MKT_ENTRY_FILE]);
  const files = { ...base, [`docs/design/tmp/${SPEC_SLUG}/delta/pages/${MKT}/${MKT_ENTRY}.md`]: edited };
  const changed = queryDiff(writeRepo(files), SPEC_SLUG).changed;
  assert.deepEqual(changed.map((o) => o.id), [MKT_ENTRY]);
  assert.deepEqual(changed[0].fields, [
    { field: 'sections[feature-a].locate', before: { role: 'heading', name: '无限菜谱' }, after: { role: 'heading', name: '无限菜谱收藏' } },
  ]);
});

test('diff: a section added is reported under its own id, and an edge `from` change under that edge', () => {
  const base = marketingFiles();
  const edited = base[MKT_ENTRY_FILE]
    .replace('  - { id: footer, locate: { role: contentinfo } }', '  - { id: faq, locate: { role: heading, name: 常见问题 } }\n  - { id: footer, locate: { role: contentinfo } }')
    .replace('from: mkt-pricing#footer', 'from: mkt-pricing#faq');
  const files = { ...base, [`docs/design/tmp/${SPEC_SLUG}/delta/pages/${MKT}/${MKT_ENTRY}.md`]: edited };
  const fields = queryDiff(writeRepo(files), SPEC_SLUG).changed[0].fields.map((f) => f.field);
  assert.deepEqual(fields, ['sections[faq]', 'edges[footer-terms].from']);
});
