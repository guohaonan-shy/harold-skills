---
type: adr
status: 生效
tags: [dreaming, design-archive, design-md]
summary: dreaming 每周对账设计档案与 DESIGN.md：源码波加实时波、全站初扫、候选蒸馏，产品坏了开 issue 而不改档案
related: ["[[0002-design-loop-v2-imagine-refine]]", "[[2026-10-19-design-md-standard]]"]
---

# ADR-0011 — dreaming 每周对账设计档案与 DESIGN.md

> 由 spec `dreaming-design-reconcile` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

issue #50（从 #28 拆出）。设计档案只在合并前写入一次，之后有三种情况会让它悄悄变错：绕过流程的改动、依赖或后端变化、产品本身坏了（这种不该把档案改成坏掉的样子）。没有档案的项目要等每个页面被某个需求碰一次才有档案。`DESIGN.md` 的「设计法候选」没人处理，`DESIGN.md` 对不对得上代码没有定期核对。dreaming 原先「每周」是空的：触发一节同时写着挂定时与不挂，执行结果怎么落进仓库没写。

## 2 决策（how）

在原有知识库对账之后加四件事，全部走**同一张提议表**，提议段只读，人逐行批了才执行：

- **档案对账两波**（借 pstack 的 maintain-verification-skill）：源码波不开浏览器，查对象挂的代码路径、无人引用的组件与动效、代码里有路由而档案没有的页面；实时波必跑，逐个状态沿图重新驱动。每个状态判成：一致 / 档案过期 / 进入方式过期 / 产品坏了 / 进不去。**分不清档案过期与产品坏了时按产品坏了报**，宁可多报，也不把回归写进档案。一致的不重拍，这是控制 Git LFS 增长的主要手段。
- **全站初扫**：`prod/` 为空时从路由表出发建第一份，进不去的写明缺什么前置条件、试过什么；产物整页一行，人按页面批。
- **候选蒸馏**：处理档案对象里的「设计法候选」，另加组件重复做法、动效高引用两类；先整改已有内容，缺口才追加。阈值不定数字，列出次数和引用方由人判，因为档案刚建时数字都很小。写 `DESIGN.md` 永远停在人身上。
- **`DESIGN.md` 对账**：拿现有内容量代码，同时按写入标准查不该在文件里的内容；项目没有 `DESIGN.md` 时兜底新建。
- **产品坏了、法对代码错**都起草成目标仓库的 GitHub issue，作为提议表的一行，人批了才开；同一问题已有开着的 issue 就写「已有 #N」，不重复。
- **产物先进 dreaming 自己的 `tmp/<目录>/delta/`**，人批了才经归档脚本并进 `prod/`，dreaming 不直接写 `prod/`；没批的随目录删。执行结果是一个只改知识库的 PR。
- **提议表的形状由校验脚本守**（行类型、处置闭集、档案行两张图且第二张在 `tmp/` 里、「产品坏了」行不许带替换处置）；提议表为空时只推一句，不做审核页。
- 手动调用可只跑一部分；人口述的单条视觉规则可手动调一次 dreaming 只蒸馏这一条。

## 3 结果（result）

- `idea-loop/skills/productivity/dreaming/SKILL.md`（主体 3580 字符）加 `references/`：`archive-reconcile.md`、`initial-scan.md`、`candidate-distillation.md`（含单条蒸馏）、`design-md-reconcile.md`、`proposal-table.md`、`incremental-scope.md`。
- 校验脚本 `idea-loop/scripts/proposal-table-check.mjs` 及其测试；行类型含 `档案对象`、`档案状态`、`初扫页面`、`候选`、`DESIGN.md 条目`、`缺陷`。
- 每周定时由 `/idea-loop:setup` 建，步骤在 `skills/engineering/setup/references/weekly-dreaming.md`。

## 4 与其他决策的关系（本条里已被后来决定取代的部分）

- 「知识库对账留在 SKILL.md 正文里」被 ADR-0010 取代：现由 `idea-loop:adr-reconciler` 做，dreaming 只编排；档案对账由 `idea-loop:ui-reviewer` 对账模式做，候选与 `DESIGN.md` 对账由 `idea-loop:design-steward` 做。
- 「执行 PR 合并时过合并前钩子」被 ADR-0010 取代：钩子已删。
- 「保持不许模型调用、定时提示词让模型去插件缓存找 SKILL.md 读」已被取代：dreaming 现可被模型调用（人在普通对话里要对账时也会起它；`AGENTS.md` 把它列为刻意例外），定时任务的 prompt 按 `idea-loop:runtime` 的写法调起它。
- `DESIGN.md` 对账所依据的「写入 reference」现在是 skill `idea-loop:design-modeling`，见 ADR-0013。
