---
name: dreaming
description: 把知识库、设计档案和 DESIGN.md 跟代码对账，出一张提议表，人批过才执行。
disable-model-invocation: true
---

# Dreaming

知识库会烂。不是有人做错了什么——文档写下时是对的，代码往前走了，没人回头改那一行。实测过的机制：一条 bug 被后续无关改动**悄悄修好，文档没跟上**；一整个已合并 PR 的工作量，在追踪它的文档里仍写着"未实现"。

这个 skill 拿每一份文档的自我陈述，去撞真实的代码和真实的 PR 状态，然后**提议**处置。

> 先用 Skill 工具调 `idea-loop:wiki-conventions` 和 `idea-loop:spec-status`（翻状态只走 `scripts/spec-status.mjs`；`check` 顺带报旧平铺布局和非法状态）。目标项目有 `GLOSSARY.md` 时，再用 Skill 工具调 `idea-loop:glossary`。

## 七条纪律（每一条都来自踩过的坑）

1. **开跑先 `git fetch`，所有核实对 `origin/<基准分支>`**（基准分支见目标仓库 `DEVELOPMENT.md`「分支」节；没有这份文件就停下，让人跑 `/idea-loop:setup`）。 本地工作树会落后（实测落后过 24 个 commit），在落后的树上判"未实现"就是误判。
2. **不能靠 grep `#\d+` 判 PR。** `#2563eb` 是 hex 色值，`#15`–`#27` 是文档内部的任务编号——`gh pr view 15` 会返回一个看起来完全合理的无关 PR。**必须交叉核对 PR 标题与文档主题对不对得上。**
3. **扫描范围含 `CLAUDE.md` 和各插件的 references。** 实测里最陈旧的文档不在 `docs/` 里，而在那份每次会话都注入上下文的文件中（列了一张三个半月前就被 DROP 的表）。
4. **`status: 搁置` 的 spec 跳过年龄判定。** 年龄分不出"被遗忘"和"被故意排期"。`草稿` / `审核中` / `设计中` 的 spec 还没开工，判定只看它停在这个状态多久了（提议人去审、去设计或标 `搁置`），不判实现。
5. **提议 → 人批准 → 机械执行**，三步分离。绝不凭记忆、也不凭文档自己的旧结论标记——每个判定都靠这一次跑出来的证据。存疑就留着不动。
6. **删 spec 前先写 ADR**（契约 §1 的不变量）。
7. **每次删除后跑 link sweep。** 移动不打断 basename 链接，删除会。

## 判定必须可证伪

每条判定给三档之一，并附证据：`已实现`（找到文档承诺的主要代码物，附 1-2 条路径）· `部分实现`（说清有什么、缺什么）· `未实现`（说清搜了哪些关键词和路径）。文档太抽象、没有可查的代码物 → `无法机械判定`，说明原因，**不要为了填表而猜**。做法：从正文抽出它承诺的具体代码物（组件名、API 路径、DB 表/列、prompt 模块、feature flag），实际 Grep/Glob 去查。

## 四条边

| 情况 | 信号 | 处置 |
|---|---|---|
| spec 已实现 | 代码物在树上 / PR merged 且标题对得上 | 写 ADR → 删整个 spec 目录 |
| spec 确认不做 | 人确认（**不是**超时推断） | 写 ADR（❌ 未采纳，带 why-not）→ 删整个 spec 目录 |
| ⚠️ spec 说 X，代码是 Y | 代码物在，但形态对不上 | **报警，绝不自动处理**——文档在撒谎，比过期危险 |
| domain / reference 与现状不符 | 引用的表/字段/接口已改名 | 订正，不删 |
| `GLOSSARY.md` 与现状不符 | `_Avoid_` 里的词出现在新代码或新文档里；词条说的概念在代码里已经没了 | **逐条问人**，同意了才订正或删除；不新增词条——新增只在 `grill` 里 |
| 新 spec 的决策，判了某个已生效 ADR 的某一节 | 写新 ADR 前，先搜 `docs/adr/` 有没有同话题旧决策 | **section 级标注**：旧 ADR 那一节标题后加 `⚠️ 已被取代 → ADR-<new> §<n>`；只有**全部**小节都已被取代，才把 frontmatter `status` 整份翻成 `已被取代（→ ADR-<new>）` |

**漏网的 ticket 也归这里扫。** `docs/spec/<spec-slug>/tickets/` 里仍然存在的 ticket，查它对应的 PR 是否已 MERGED（`gh`，标题要对得上）——已合并却还躺着的，提议删除。`部分实现` 的 spec 按契约拆：已完成的写 ADR，剩下的留一份小 spec；剩余若无限期搁置，标 `搁置`。

## 流程：两段，中间停在人身上

**提议段**（没有任何写入）：

1. `git fetch`，在一个从 `origin/<基准分支>` 新切的 worktree 里工作；`.tmp/dreaming/<YYYY-MM-DD>/` 放这次的中间物。
2. **知识库对账**：列出 `docs/` 全部文件 + `CLAUDE.md` + `GLOSSARY.md`（有就列）+ 插件 references，逐份取证，按上面的纪律、判定、四条边出结论。量大就派 subagent 并行，**每个只读不写**，回结构化表格。
3. **档案对账 / 全站初扫**（设计档案 `docs/design/prod/`）：`prod/` 里有对象，就做档案对账（`references/archive-reconcile.md`：先源码波、再实时波，实时波交给 `idea-loop:ui-reviewer` 的对账模式逐个状态重新驱动，每个状态判成一致 / 档案过期 / 进入方式过期 / 产品坏了 / 进不去，容差以内不重拍）；`prod/` 为空，就做全站初扫（`references/initial-scan.md`：从路由出发按页面建第一份档案草稿，进不去的写明缺什么、试过什么）。两者的产物都先放这次运行自己的 `docs/design/tmp/dreaming-<日期>/`，提议表里写 `档案对象` / `档案状态` / `初扫页面` 三节（产品坏了单列在 `缺陷`）；**不直接写 `prod/`**，人批了才由档案的归档脚本并进去。没有设计档案目录、也不打算建的项目，整步跳过，提议表里不写这几节。
4. **候选蒸馏**：`references/candidate-distillation.md`。
5. **`DESIGN.md` 对账**：`references/design-md-reconcile.md`。两者写 `DESIGN.md` 的判据与流程都在 `idea-loop:design-modeling`，这里不复述。
6. **写提议表**（形状、各类行的处置闭集见 `references/proposal-table.md`），先过 `node "${CLAUDE_PLUGIN_ROOT}/scripts/proposal-table-check.mjs" <表>`，退出码 0 才交出去。`候选` 与 `DESIGN.md 条目` 有行时，另出一页审核页，每行一张卡（`references/review-page.md`）：候选卡有界面截图、拟写进 `DESIGN.md` 的原文和落在哪一节、带推荐的选择；维护卡有改前 → 改后和点名的依据。有行：量大发 Artifact，会话里逐行摆给人，人不在会话里时另发一条推送通知；**空表只推一句「这次无事」**，不发 Artifact。

**执行段**（人逐行批过之后）：只执行批了的行，每类行怎么执行见 `references/proposal-table.md` §4；然后 link sweep、重新生成各层 `index.md`（`docs/spec/index.md` 用 `spec-status.mjs index <docs>`）、**开一个只改 `docs/`、`DESIGN.md`、`GLOSSARY.md` 的 PR**。删 spec 是删它整个目录（含 `tickets/` 和 `assets/`；`assets/` 里 ADR 要引的证据图先挪进 ADR 旁边）。目标仓库还是旧平铺布局，先提议按 wiki-conventions §2.2 迁移。最后报告：动了什么、留了什么、为什么留。

**写 `DESIGN.md` 永远停在人身上**：提议段只把旧文和新文并排放进提议表；人批了、确认措辞，才落笔。缺陷（产品坏了、法对代码错）起草成目标仓库的 GitHub issue，人批了才开，不打 `status:*` label。

**幂等**：同一批文档重跑一次，提议表应为空。不为空说明上一次没处理干净——这是自检。

## 怎么调

人手动调 `/idea-loop:dreaming`。什么时候跑、要不要定时，由用户自己定。

可以**只跑某一部分**（比如只跑候选蒸馏）。**单条蒸馏**：在会话里口述了一条视觉规则、想当场落，就手动调一次并带上这条规则——只处理这一条，**不开浏览器、不跑其它部分、不出提议表**，步骤见 `references/candidate-distillation.md` §4；不调就记成候选，等下一次对账。

**这是批量对账，不是单份 spec 的收尾**：别在 `to-spec` 或 `implement` 刚跑完之后立刻跑——那等于拿几分钟前写的 spec 去撞几分钟前写的代码，也撑不起上面的幂等自检。前向环里没有任何一步写 ADR，ADR 只在这里产生；一份 spec 从「活干完了」到「被蒸馏成 ADR 并删除」之间有一段间隔，那是设计，不是漏掉了。
