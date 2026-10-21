---
name: dreaming
description: 把知识库、设计档案、DESIGN.md 和术语表跟代码对账，提议该订正、归档、删除的内容，人批过才执行。
disable-model-invocation: true
---

文档写下时是对的，代码往前走了，没人回头改那一行。这个 skill 拿每份文档的自我陈述，去撞真实的代码和真实的 PR 状态，然后**提议**处置；人批过的才执行。

先用 Skill 工具调 `idea-loop:wiki-conventions`（目录、ADR、人机分工、link sweep 都按它）和 `idea-loop:spec-status`（翻状态只走 `spec-status.mjs`；`check` 顺带报旧平铺布局和非法状态）。目标项目有 `GLOSSARY.md` 时，再用 Skill 工具调 `idea-loop:glossary`。

## 纪律

- **所有核实对 `origin/<基准分支>`**，不对本地工作树：本地会落后，在落后的树上判「未实现」就是误判。
- **PR 编号要交叉核对标题。** grep `#\d+` 会抓到 hex 色值（`#2563eb`）和文档内部的任务编号，`gh pr view 15` 照样返回一个看起来合理的无关 PR；PR 标题与文档主题对得上才算。
- **扫描范围含 `CLAUDE.md` 和仓库里各插件的 references**：每次会话都注入上下文的文件，往往是最陈旧的。
- **覆盖的 issue 挂着 `status:搁置` 的 spec，不做年龄判定**：年龄分不出被遗忘和被故意排期。`草稿` / `审核中` / `正式` 的 spec 还没开工，只看它在这个状态停了多久（提议人去定、去设计或把 issue 搁置），不判实现。
- **每个判定都靠这一次跑出来的证据**，不凭记忆、不凭文档自己的旧结论。存疑就留着不动。

## 判定可证伪

每份 spec 判三档之一并附证据：`已实现`（找到文档承诺的主要代码物，附 1–2 条路径）· `部分实现`（说清有什么、缺什么）· `未实现`（说清搜了哪些关键词和路径）。做法：从正文抽出它承诺的具体代码物（组件名、API 路径、DB 表 / 列、prompt 模块、feature flag），实际 Grep / Glob 去查。文档太抽象、没有可查的代码物，判 `无法机械判定` 并写明原因。

## 几种情况怎么处置

| 情况 | 信号 | 处置 |
|---|---|---|
| spec 已实现 | 代码物在树上 / PR 已合并且标题对得上 | 写 ADR → 删整个 spec 目录 |
| spec 部分实现 | 有的在、有的缺 | 已完成的写 ADR，剩下的留一份小 spec；剩下的无限期不做，提议把它覆盖的 issue 挂 `status:搁置` |
| spec 确认不做 | 人确认（不从超时推断） | 写 ADR（未采纳，带 why-not）→ 删整个 spec 目录 |
| spec 说 X，代码是 Y | 代码物在，形态对不上 | **报警，交人**：文档在撒谎，比过期危险 |
| domain / reference 与现状不符 | 引用的表 / 字段 / 接口已改名 | 订正，不删 |
| `GLOSSARY.md` 与现状不符 | `_Avoid_` 里的词出现在新代码或新文档里；词条说的概念在代码里已经没了 | 逐条问人，同意了才订正或删除；新增词条只在 `idea-loop:grill` 里 |
| 新 ADR 推翻某个生效 ADR 的一节 | 写新 ADR 前搜 `docs/adr/` 的同话题旧决策 | 按小节标注取代（`idea-loop:wiki-conventions` 的「frontmatter」） |
| 漏网的工单 | `docs/spec/<spec-slug>/tickets/` 里还躺着、对应 PR 已合并（`gh` 查，标题对得上） | 删除 |

删 spec 是删它整个目录（含 `tickets/` 和 `assets/`）；`assets/` 里 ADR 要引的证据图先挪到 ADR 旁边。

## 流程：两段，中间停在人身上

**提议段**，只读不写：

1. **起环境**：读目标仓库 `DEVELOPMENT.md` 的「分支」节拿基准分支（没有这份文件就停下，告诉人跑 `/idea-loop:setup`）；`git fetch`，从 `origin/<基准分支>` 新切一个 worktree 在里面工作，这次的中间物放 `.tmp/dreaming/<YYYY-MM-DD>/`。目标仓库还是旧平铺布局，提议表里先提议迁移（`idea-loop:wiki-conventions` 的「从平铺布局迁移」）。
2. **知识库对账**：列出 `docs/` 全部文件、`CLAUDE.md`、`GLOSSARY.md`（有就列）、仓库里各插件的 references，逐份取证，按上面的纪律、判定和处置表出结论。量大就派 subagent 并行，每个只读，回结构化表格。
3. **设计档案**（`docs/design/prod/`）：有对象就做档案对账，照 [references/archive-reconcile.md](references/archive-reconcile.md)；`prod/` 为空就做全站初扫，照 [references/initial-scan.md](references/initial-scan.md)。产物都先放这次运行自己的 `docs/design/tmp/dreaming-<YYYY-MM-DD>/`，人批了才由归档脚本并进 `prod/`。项目没有设计档案目录、也不打算建，整步跳过，提议表里不写这几节。
4. **候选蒸馏**：照 [references/candidate-distillation.md](references/candidate-distillation.md)。
5. **`DESIGN.md` 对账**：照 [references/design-md-reconcile.md](references/design-md-reconcile.md)。
6. **写提议表**：形状、各类行的处置闭集、怎么摆给人，照 [references/proposal-table.md](references/proposal-table.md)。先过 `node "${CLAUDE_PLUGIN_ROOT}/scripts/proposal-table-check.mjs" <表>`，退出码 0 才交出去。`候选` 与 `DESIGN.md 条目` 有行时，另做一页审核页，照 [references/review-page.md](references/review-page.md)。完成条件：校验通过，表或「这次无事」已经交到人面前。

**执行段**，人逐行批过之后：只执行批了的行，照 [references/proposal-table.md](references/proposal-table.md) 的「执行段」做，结果是一个只改 `docs/`、`DESIGN.md`、`GLOSSARY.md` 的 PR。最后报告：动了什么、留了什么、为什么留。

**写 `DESIGN.md` 和开 issue 都停在人身上**：提议段只把旧文和新文并排放进提议表，人批了、确认了措辞才落笔。缺陷（产品坏了、法对代码错）起草成目标仓库的 GitHub issue，人批了才开。

**幂等**：同一批文档重跑一次，提议表应为空。不为空说明上一次没处理干净。

## 只跑一部分

人调用时可以说只跑某一部分（比如只跑候选蒸馏，或只跑 `DESIGN.md` 对账），只出那几节。

**单条蒸馏**：人在会话里口述了一条视觉规则、想当场落，调用时带上这条规则：只处理这一条，不开浏览器、不跑其它部分、不出提议表，照 [references/candidate-distillation.md](references/candidate-distillation.md) 的「单条蒸馏」。没有单独调用的，这条规则记成候选，等下一次对账。
