---
type: adr
status: 生效
tags: [design-workflow, idea-loop, plugin-migration]
summary: design 工作流迁入 harold-skills，接上 idea-loop 一直空着的设计冻结字段
related: ["[[2026-08-28-grill-design-idea-loop]]", "[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0001 — 把 design 工作流迁入 harold-skills 并接入 idea-loop 生命周期

> 由 spec `design-plugin-idea-loop-integration` 蒸馏而来，该 spec 已删除。
> **本 ADR 的 §2.1、§2.2、§2.5、§2.6 已被 [[0002-design-loop-v2-imagine-refine]] 取代**，
> 其余小节仍然生效 —— 按 wiki 契约，取代是 section 级的，整份仍是 `生效`。

## 1 背景

design 这条工作流当时散落在四处：`design-lib` 仓库的 `plugins/design`（0.2.0，最新）、`TOFEL-demo` 里落后的 `design-workflow`（0.0.9）拷贝、`refero-design` skill，以及作为参考的 `open-design` 仓库。

而 `idea-loop` 这边，`to-ticket` 落盘的每张 ticket 头部都有一行**「设计冻结」字段，等着一个从来没接上的产物**。结果是碰 UI 的 ticket 卡在这道闸门前，却没有任何实际路径把设计做完、把产物填进去。

## 2 决策

### 2.1 ⚠️ 已被取代 → [[0002-design-loop-v2-imagine-refine]] §2.2

原决策：把 `design-lib/plugins/design`（0.2.0，已确认是 0.0.9 拷贝的严格超集，唯一无损的迁移源）整体迁成 harold-skills 顶层一个**独立 plugin**，与 `idea-loop` 平级不做目录合并，两者通过带 `plugin:skill` 前缀的跨 plugin Skill 调用互相寻址。

### 2.2 ⚠️ 已被取代 → [[0002-design-loop-v2-imagine-refine]] §2.1

原决策：design 不是独立的 frontier，是产品功能 frontier 里挂着的**子树** —— `grill` 的设计子树长出来后一次性 handoff 给总入口，跑完整条流水线，产物回访谈里由人判定满不满意。

### 2.3 DESIGN.md 换成固定八节格式

`DESIGN.md` 采用 `google-labs-code/design.md` 规范：frontmatter 必填 `name`，固定章节顺序 Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts，未知/自定义标题保留不报错。

原有的 T1/T2/T3 三层法**映射到这份规范之上而不是被推翻**：T1 落在各节的 token + prose，T3 落在原生的 Do's and Don'ts，T2 落在追加的自定义 `## Case Law` 节（按日期追加、只增不改，绝不重写人写定的 T1/T3）。

### 2.4 design-lint 的规则集边界：只留跨项目通用的 AI-tell

从 `design-lint.mjs` 删除三条项目专属的 P0 硬编码规则（`retired-ink` / `warm-action-tint` / `instrument-serif`）—— 它们是某一个项目自己 `DESIGN.md` 的决定，不该焊进通用脚本。只保留跨项目通用的 AI-tell 检查。

项目专属的品牌红线改由**已经存在的 DESIGN.md governance 机制**承接：agent 在构建全程守红线、人工签字逐条对账偏离项。**不新增任何结构化解析引擎**，T3 bans 保持自由文本形态。

### 2.5 ⚠️ 已被取代 → [[0002-design-loop-v2-imagine-refine]] §2.4

原决策：`to-ticket` 的「设计冻结」字段从 spec §4 誊写。

### 2.6 ⚠️ 已被取代 → [[0002-design-loop-v2-imagine-refine]] §2.3 与 §2.4

原决策：`design-ui` 与 `design-motion` 维持两个独立 skill，动效作为只在静态签字之后才进入的 Stage 2，其四道 gate 保持不变。

### 2.7 研究后端与 references 重组

`refero-design` 的三层研究（styles / screens / flows）接成构建段的研究后端。`open-design` **不建立任何机器可读的路径依赖**，只作为一次性灵感来源，把它 craft 部分里品牌无关的规则蒸馏出来，与 refero 相关内容、既有已泛化的 references 一起，重整成职责单一的独立 reference 文件，各 skill 用 prose 显式点名要读哪几个。

### 2.8 不做的

不实现「生成 UI 对着设计系统做程序化 adherence 校验」（上游未定型）；不给 T3 bans 做正则解析引擎；不动 `TOFEL-demo` 的既有装机；不新增设计产物到 React 的额外翻译层；不把「设计产物是否满意」这道人工判定自动化掉 —— subagent / Workflow 没有跟真人对话等回答的通道，这道关口设计上就该留在人面前。

## 3 结果

**做了。** 随 PR #10（`design: remove impeccable dependency, bundle headless playwright, fix altitude loophole`）合并落地。

核实（2026-09-16 对 `origin/main`）：`idea-loop/references/design/design-md-format.md` 在树上；`design-lint.mjs` 里那三条项目专属规则**已删除（0 处定义）**，且 `design-lint.test.mjs` 用负向断言守着它们不再触发。

被 ADR-0002 取代的四节，其原本要解决的问题没有消失，而是**在 v2 里被重新安置** —— 不是丢弃。

## 4 关联

- 素材：[[2026-08-28-grill-design-idea-loop]]
- 取代本 ADR 四节的后继决策：[[0002-design-loop-v2-imagine-refine]]
