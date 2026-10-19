/**
 * A small, fictional design archive for tests — a recipe app with two pages.
 *
 * The same fixture backs the archive's parser and validator tests and (later) the query module's, so
 * the shape is spelled out here once:
 *
 *   cookbook   page   states: list (entry) → search-loading → search-results → recipe-saved
 *                               search-loading → search-failed   (system edge, blocked: no way to force it)
 *                               search-failed → search-loading   (retry)
 *   pantry     page   states: overview → empty
 *   cookbook--list ↔ pantry--overview are linked by NavBar edges (a cross-page jump both ways)
 *   NavBar and RecipeCard are used by both pages; the other components by cookbook only
 *   journeys: save-a-recipe (one page, a `via` because results → saved has two edges) and
 *             glance-at-pantry (list → pantry → list, spans two pages)
 *
 * Not a test file: it has no assertions. Import `compliantFiles()` and bend one thing.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const doc = (fm, body) => `---\n${fm.trim()}\n---\n\n${body.trim()}\n`;

const DECISIONS_AND_CANDIDATES = (decisions, candidates) =>
  `## 决定\n\n${decisions}\n\n## 设计法候选\n\n${candidates}`;

const STATE_BODY = (screen, expect) => `## 这一屏\n\n${screen}\n\n## 应看到什么\n\n${expect}`;

export const SPEC_SLUG = 'demo-spec';
export const BASE = 'docs/design/prod';

export function compliantFiles() {
  const f = {};

  // ---------- docs around the archive ----------
  f['docs/index.md'] = '# 文档\n';
  f[`docs/spec/${SPEC_SLUG}/${SPEC_SLUG}.md`] = doc(
    `type: spec\nstatus: 在飞\ntags: [demo]\nsummary: 演示用 spec\nrelated: []`,
    '# 演示 spec',
  );
  f[`docs/spec/${SPEC_SLUG}/tickets/01-first.md`] = '# 01 第一张\n';
  f['docs/spec/other-spec/tickets/01-first.md'] = '# 01 同名工单，豁免\n';

  f[`${BASE}/index.md`] = doc(
    `type: design-index\ntags: [design]\nsummary: 设计档案索引\nviewport: 1440x900\ntheme: light\nlocale: zh-CN`,
    '# 设计档案\n',
  );

  // ---------- pages ----------
  f[`${BASE}/pages/cookbook/cookbook.md`] = doc(
    `type: design-page
tags: [cookbook]
summary: 菜谱主页：搜索、保存、进入食材库
code: [src/pages/cookbook.tsx]
regions:
  - { name: 顶部导航, component: "[[NavBar]]" }
  - { name: 搜索, component: "[[SearchBox]]" }
  - { name: 结果卡片, component: "[[RecipeCard]]" }`,
    `# 菜谱主页\n\n页面描述。\n\n${DECISIONS_AND_CANDIDATES(
      `### 决定 1：结果只显示一屏，不分页\n结果多于一屏时提示缩小关键词，不加载更多。\n- 为什么：用户搜索通常有明确目标，翻页带来的滚动位置丢失比多输一个词更贵。\n- 否掉过：无限滚动——返回时位置难以恢复。\n- 来源：[[${SPEC_SLUG}]]`,
      '无',
    )}`,
  );
  f[`${BASE}/pages/pantry/pantry.md`] = doc(
    `type: design-page
tags: [pantry]
summary: 食材库：现有食材一览
code: [src/pages/pantry.tsx]
regions:
  - { name: 顶部导航, component: "[[NavBar]]" }
  - { name: 食材卡片, component: "[[RecipeCard]]" }`,
    `# 食材库\n\n页面描述。\n\n${DECISIONS_AND_CANDIDATES('无', '无')}`,
  );

  // ---------- states: cookbook ----------
  f[`${BASE}/pages/cookbook/cookbook--list.md`] = doc(
    `type: design-state
tags: [cookbook]
summary: 菜谱主页的默认一屏
page: "[[cookbook]]"
entry:
  url: /cookbook
  preconditions: { account: 已登录的测试账号, data: 至少 3 份已保存菜谱 }
components: ["[[RecipeCard]]"]
edges:
  - id: search
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[SearchBox]]"
    locate: { role: searchbox, name: 搜索菜谱 }
    action: 输入关键词并回车
  - id: open-pantry
    to: "[[pantry--overview]]"
    kind: user
    component: "[[NavBar]]"
    locate: { role: link, name: 食材库 }
    action: click
async:
  loading: "[[cookbook--search-loading]]"
  failure: "[[cookbook--search-failed]]"
  empty: 不适用`,
    `# cookbook--list\n\n${STATE_BODY('菜谱列表加上搜索框。', '- 列表里能看到已保存的菜谱卡片\n- 顶部有搜索框')}`,
  );
  f[`${BASE}/pages/cookbook/cookbook--search-loading.md`] = doc(
    `type: design-state
tags: [cookbook]
summary: 搜索请求进行中
page: "[[cookbook]]"
motions: ["[[spinner-ring]]"]
edges:
  - id: done
    to: "[[cookbook--search-results]]"
    kind: system
    trigger: 搜索请求完成
    how: 放行搜索请求
  - id: fail
    to: "[[cookbook--search-failed]]"
    kind: system
    trigger: 搜索请求失败
    how: 拦截搜索请求并返回 500
    blocked: { missing: 一个能让搜索接口稳定失败的开关, tried: [拦截搜索请求返回 500, 用空关键词搜索] }`,
    `# cookbook--search-loading\n\n${STATE_BODY('结果区域换成转圈。', '- 结果区域出现转圈')}`,
  );
  f[`${BASE}/pages/cookbook/cookbook--search-results.md`] = doc(
    `type: design-state
tags: [cookbook]
summary: 搜索结果
page: "[[cookbook]]"
components: ["[[RecipeCard]]"]
edges:
  - id: save
    to: "[[cookbook--recipe-saved]]"
    kind: user
    component: "[[SaveButton]]"
    locate: { role: button, name: 保存 }
    action: click
    motion: "[[save-pop]]"
  - id: save-key
    to: "[[cookbook--recipe-saved]]"
    kind: user
    component: "[[SaveButton]]"
    locate: { role: button, name: 保存 }
    action: 聚焦后按回车`,
    `# cookbook--search-results\n\n${STATE_BODY('结果卡片列表。', '- 每张卡片有保存按钮')}`,
  );
  f[`${BASE}/pages/cookbook/cookbook--search-failed.md`] = doc(
    `type: design-state
tags: [cookbook]
summary: 搜索失败
page: "[[cookbook]]"
edges:
  - id: retry
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[RetryButton]]"
    locate: { role: button, name: 重试 }
    action: click`,
    `# cookbook--search-failed\n\n${STATE_BODY('结果区域换成失败提示。', '- 看到「搜索失败」和重试按钮')}`,
  );
  f[`${BASE}/pages/cookbook/cookbook--recipe-saved.md`] = doc(
    `type: design-state
tags: [cookbook]
summary: 菜谱已保存
page: "[[cookbook]]"
edges: []`,
    `# cookbook--recipe-saved\n\n${STATE_BODY('保存按钮变为已保存。', '- 按钮显示已保存')}`,
  );

  // ---------- states: pantry ----------
  f[`${BASE}/pages/pantry/pantry--overview.md`] = doc(
    `type: design-state
tags: [pantry]
summary: 食材库一览
page: "[[pantry]]"
components: ["[[RecipeCard]]"]
edges:
  - id: back
    to: "[[cookbook--list]]"
    kind: user
    component: "[[NavBar]]"
    locate: { role: link, name: 菜谱 }
    action: click
  - id: empty-shelf
    to: "[[pantry--empty]]"
    kind: system
    trigger: 食材全部用完
    how: 删除全部食材记录`,
    `# pantry--overview\n\n${STATE_BODY('食材卡片网格。', '- 看到食材卡片')}`,
  );
  f[`${BASE}/pages/pantry/pantry--empty.md`] = doc(
    `type: design-state
tags: [pantry]
summary: 食材库为空
page: "[[pantry]]"
edges: []`,
    `# pantry--empty\n\n${STATE_BODY('空状态插画。', '- 看到「还没有食材」')}`,
  );

  // ---------- components ----------
  const component = (name, summary, usedBy, tokens = '', decisions = '无') =>
    doc(
      `type: design-component
tags: [component]
summary: ${summary}
code: [src/components/${name}.tsx]${tokens}
usedBy: [${usedBy.map((u) => `"[[${u}]]"`).join(', ')}]`,
      `# ${name}\n\n${DECISIONS_AND_CANDIDATES(decisions, '无')}`,
    );
  f[`${BASE}/components/RecipeCard/RecipeCard.md`] = component(
    'RecipeCard',
    '菜谱 / 食材卡片',
    ['cookbook', 'pantry'],
    '\ntokens: [card-surface]',
    `### 决定 1：卡片标题最多两行\n第三行起截断。\n- 为什么：两行内能认出菜名，超出的是做法描述，不属于卡片。\n- 否掉过：无\n- 来源：[[${SPEC_SLUG}]]`,
  );
  f[`${BASE}/components/SearchBox/SearchBox.md`] = component('SearchBox', '搜索框', ['cookbook']);
  f[`${BASE}/components/SaveButton/SaveButton.md`] = component('SaveButton', '保存按钮', ['cookbook']);
  f[`${BASE}/components/RetryButton/RetryButton.md`] = component('RetryButton', '重试按钮', ['cookbook']);
  f[`${BASE}/components/NavBar/NavBar.md`] = component('NavBar', '顶部导航', ['cookbook', 'pantry']);

  // ---------- motions ----------
  f[`${BASE}/motions/spinner-ring.md`] = doc(
    `type: design-motion
tags: [motion]
summary: 加载转圈
duration: "{motion.duration.base}"
easing: "{motion.easing.standard}"
properties: [transform]
iterations: infinite
reducedMotion: 改为静态圆环
usedBy: ["[[cookbook]]"]`,
    `# spinner-ring\n\n${DECISIONS_AND_CANDIDATES('无', '无')}`,
  );
  f[`${BASE}/motions/save-pop.md`] = doc(
    `type: design-motion
tags: [motion]
summary: 保存成功时图标弹一下
duration: 180ms
easing: cubic-bezier(0.34, 1.56, 0.64, 1)
deviates: 弹性曲线要有过冲，站内默认曲线没有过冲
properties: [transform]
iterations: 1
reducedMotion: 直接切换图标，不弹
usedBy: ["[[cookbook]]"]`,
    `# save-pop\n\n${DECISIONS_AND_CANDIDATES(
      '无',
      `- **成功反馈用一次过冲的缩放，不循环**\n  - 并进：Motion（新增一条原则）\n  - 为什么：循环的反馈读起来像还在进行中。\n  - 证据：[[save-pop]]`,
    )}`,
  );

  // ---------- journeys ----------
  f[`${BASE}/journeys/save-a-recipe.md`] = doc(
    `type: design-journey
tags: [journey]
summary: 搜到菜谱并保存
intent: 用户搜到一份菜谱并保存下来
path:
  - "[[cookbook--list]]"
  - "[[cookbook--search-loading]]"
  - { state: "[[cookbook--search-results]]", via: save }
  - "[[cookbook--recipe-saved]]"`,
    `# save-a-recipe\n\n${DECISIONS_AND_CANDIDATES('无', '无')}`,
  );
  f[`${BASE}/journeys/glance-at-pantry.md`] = doc(
    `type: design-journey
tags: [journey]
summary: 看一眼食材库再回来
intent: 用户在菜谱页中途看一眼食材库，再回到菜谱页
path:
  - "[[cookbook--list]]"
  - "[[pantry--overview]]"
  - "[[cookbook--list]]"`,
    `# glance-at-pantry\n\n${DECISIONS_AND_CANDIDATES('无', '无')}`,
  );

  return f;
}

/** Write a {relativePath: content} map under a fresh temp dir; returns the root. */
export function writeRepo(files, root = mkdtempSync(join(tmpdir(), 'design-archive-'))) {
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}
