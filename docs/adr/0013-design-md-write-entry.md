---
type: adr
status: 生效
tags: [design, design-md, design-modeling]
summary: DESIGN.md 只写设计系统本身、不收判例与日期；写入口只留 imagine 新建与 dreaming 维护，其余一律写候选
related: ["[[0001-design-workflow-into-harold-skills]]", "[[2026-10-19-design-md-standard]]", "[[2026-10-17-design-md-survey]]"]
---

# ADR-0013 — DESIGN.md 写入口收拢，只写系统不写判例

> 由 spec `design-md-write-entry` 蒸馏而来，该 spec 已删除。
> 本 ADR 取代 [[0001-design-workflow-into-harold-skills]] §2.3 里「T2 落在追加的 `## Case Law` 节、只增不改」一句；那份 ADR 的其余小节仍然生效。

## 1 背景（why）

issue #49（从 #28 拆出）。能写 `DESIGN.md` 的地方有四处，其中 designer 在动效段签字后写「动效先例库」、收尾的 Distill-back 追加带日期的 T2 判例，两处不经过人确认措辞，与设计协议「新模式先写成候选，由人决定」自相矛盾。

写入规则本身也让文件只增不减：规则要求在 `## Case Law` 里按时间追加判例，designer 往动效先例库追加条目。2026-10-19 核对一个真实项目的 `DESIGN.md`：544 行，动效节 7 条具体先例（3 条带日期和来源页面），文件末尾 7 条判例。调研（Google `design.md` 规范加 84 份样本）的结论相反：规范 8 节里没有动效、日期、判例，84 份样本里 0 份带日期先例、0 份判例。

## 2 决策（how）

- **`DESIGN.md` 只写设计系统本身**：8 节加 Responsive Behavior / Motion / Known Gaps 三个扩展章，不写日期、判例、具体动效的枚举、页面或场景里的组件描述；影响渲染的属性必须进 front matter 的 token。ADR-0001 §2.3 的固定八节格式沿用，但其中「T2 落在追加的 `## Case Law` 节、只增不改」被取代：T1 底线、T3 禁令保留，「T2 判例」改叫「T2 默认做法」。
- **整改优先于追加**：新内容先找受影响的已有内容，能改写就改写，缺口才新增。文件大小由缺口数决定，不随改动次数增长。
- **只有两处写**：项目没有 `DESIGN.md` 时由 `uiux-imagine` 在选定语言后写第一份（不论有无线上 UI，2026-10-19 人拍板）；蒸馏、对账、没有时兜底新建由 `dreaming` 写。两处都先读同一份写入标准，都把措辞交人确认，写前备份、写后跑官方 lint。
- **其余想改的一律写「设计法候选」**，由 dreaming 处理：designer 动效签字后的新模式、静态设计签字时可推广的规律、imagine 对已有文件「重探语言」的修订提案、实现时冒出的新 token。候选只有四行（规则、并进哪章、为什么、证据），规则必须是无日期、无页面名、可照做的形态。
- **人口述的规则选 B**：手动调一次 dreaming 只蒸馏这一条；不调就记成候选等每周那次。A（一律等每周）会让想清楚的规则最多等七天。
- **准入分层表**：每条内容从上往下问，第一个命中的是去处——工作流进 skill，通用设计原则进插件的设计 reference，产品设计系统进 `DESIGN.md`，页面或组件的决定进档案对象，现状缺陷迁移进 issue 或 spec。
- 原方案「删掉 `design-modeling` skill、写入标准成一份插件级 reference」后来被改：见下。

## 3 结果（result）

- 写入标准现在是 skill `idea-loop:design-modeling`（`skills/design/design-modeling/SKILL.md` 加 `references/chapters.md`、`new.md`、`distill.md`、`reconcile.md`），含「是什么 / 结构 / 五条写法规则 / 维护原则 / 准入分层表 / 明确不进 DESIGN.md 的内容 / 一次写入怎么走 / 新建 / 蒸馏 / 对账 / 设计法候选的形态 / 谁写、谁读」等节；「谁写、谁读」写明只有 `uiux-imagine`（只新建）与 `dreaming` 两处写。
- `uiux-imagine` 在项目没有 `DESIGN.md` 时调它的「新建」与「一次写入怎么走」写第一份；designer 与 `uiux-refine` 的设计 reference 只写候选（总则 `design-law.md` 的 T2 defaults 与 governance and candidates 两处）；implementer 遇到会复用的新值停下交人判，要进的写成候选。
- 官方格式只认 `@google/design.md` 规范，运行时现读，lint hook `scripts/design-md-hook.mjs` 不变。
- `proposal-table-check.mjs` 要求 `DESIGN.md 条目` 行的「依据」点名 design-modeling 的某一节。

## 4 与其他决策的关系

- 部分取代 ADR-0001 §2.3 的 `## Case Law` 一句（见上）；其余部分沿用。
- spec 原定「删 `design-modeling`、标准做成插件级 reference」，实际树上是 skill：先按 spec 做成插件级 reference（PR #52），0.1.0 重构取消插件级 `references/`（PR #70），写入标准升成独立 skill。「只有两处写」的目标没变，「不再有 design-modeling」不成立。
