---
name: dreaming
description: 把知识库、设计档案、DESIGN.md 和术语表跟代码对账，提议该订正、归档、删除的内容，人批过才执行。
disable-model-invocation: true
---

文档写下时是对的，代码往前走了，没人回头改那一行。这个 skill 拿每份文档的自我陈述，去撞真实的代码和真实的 PR 状态，然后**提议**处置；人批过的才执行。

**dreaming 只编排**：起环境、派工、汇提议表并过校验脚本、做审核页、等人批、执行段。每一段对账由一个专职 agent 做，模型与思考强度钉在各自的定义里；提议段里它们只读，只写自己那段的中间物。

先用 Skill 工具调 `idea-loop:wiki-conventions`（目录、ADR、人机分工、link sweep 都按它）和 `idea-loop:spec-status`（翻状态只走 `spec-status.mjs`；`check` 顺带报旧平铺布局和非法状态）。目标项目有 `GLOSSARY.md` 时，再用 Skill 工具调 `idea-loop:glossary`。

## 纪律

- **所有核实对 `origin/<基准分支>`**，不对本地工作树：本地会落后，在落后的树上判「未实现」就是误判。派给 agent 的指针也是这个 worktree。
- **每个判定都靠这一次跑出来的证据**，不凭记忆、不凭文档自己的旧结论。存疑就留着不动。
- **扫描范围**：`docs/`、`GLOSSARY.md`、`REVIEW.md`、`DESIGN.md`、仓库里各插件的 references。`CLAUDE.md` 与 `AGENTS.md` 不在范围内。

## 流程：两段，中间停在人身上

**提议段**，只读不写：

1. **起环境**：读目标仓库 `DEVELOPMENT.md` 的「分支」节拿基准分支（没有这份文件就停下，告诉人跑 `/idea-loop:setup`）；`git fetch`，从 `origin/<基准分支>` 新切一个 worktree 在里面工作，这次的中间物放 `.tmp/dreaming/<YYYY-MM-DD>/`。目标仓库还是旧平铺布局，提议表里先提议迁移（`idea-loop:wiki-conventions` 的「从平铺布局迁移」）。
2. **自己做、不起 agent**：
   - **漏归档**：照 [references/missed-archive.md](references/missed-archive.md)，查基准分支上还留着设计产物的已完成需求。
   - **retro 候选**：候选池里出现 ≥ 3 次的，照 [references/retro-candidates.md](references/retro-candidates.md) 摆进提议表；批了开成 issue，不改 skill。
   - **对账范围**（`prod/` 有对象时）：dreaming 每周由 `/idea-loop:setup` 建的定时任务自己跑，截图对账只对上次成功执行以来代码动过的状态做；定基准、挑状态、写提议表开头那一行，照 [references/incremental-scope.md](references/incremental-scope.md)。人调用时说「全量」，或没有基准点，就全量。
   - **全站初扫**（`prod/` 为空时）：照 [references/initial-scan.md](references/initial-scan.md)。`prod/` 有对象时不做全站初扫，档案对账整个交给下面的 ui-reviewer；项目没有设计档案目录、也不打算建，这一项和档案对账整个跳过。
3. **派工**：下面三个互不依赖，**在同一条消息里并行起**，只给指针（worktree、基准分支、中间物目录、范围；要开浏览器的再给各自的空闲端口与同一个浏览器锁目录，锁 owner 各写自己的名字）。

   | agent | 做什么 | 交回 |
   |---|---|---|
   | `idea-loop:ui-reviewer`（对账模式，sonnet · high） | UI 档案对账：源码波（不开浏览器）加实时波，照 [references/archive-reconcile.md](references/archive-reconcile.md)；状态清单按对账范围定；状态多要分批时，同一条消息起第一批（只有它跑源码波），后面的批等它交回 | 结果文件，进 `档案对象`、`档案状态` 与 `缺陷` |
   | `idea-loop:adr-reconciler`（sonnet · high） | spec → ADR：判 spec 上线没有、起草 ADR、标被取代的 ADR 小节、找漏网的工单；次要查 `docs/domain/`、参考手册、`GLOSSARY.md`、`REVIEW.md` 的过期，方法在 [references/docs-reconcile.md](references/docs-reconcile.md) | `rows-docs.md`（`文档` 一节） |
   | `idea-loop:design-steward`（opus · high） | 候选蒸馏 + `DESIGN.md` 对账 + token；对 `DESIGN.md` 的一切修改出自它 | `rows-design.md`（`候选`、`DESIGN.md 条目` 与牵出的 `缺陷` 行） |

   项目没有设计档案目录时不起 ui-reviewer，档案那几节不写。
4. **汇提议表**：把三个 agent 交回的行、漏归档与初扫的行并成一张表；ui-reviewer 交回的 `补扫页面` 行先照 [references/archive-reconcile.md](references/archive-reconcile.md) 的「源码波」处理。标题下先写对账范围那一行（上一张提议表还没处理时再加一行），形状、各类行的处置闭集、怎么摆给人，照 [references/proposal-table.md](references/proposal-table.md)。先过 `node "${CLAUDE_PLUGIN_ROOT}/scripts/proposal-table-check.mjs" <表>`，退出码 0 才交出去。`候选` 与 `DESIGN.md 条目` 有行时，另做一页审核页，照 [references/review-page.md](references/review-page.md)。完成条件：校验通过，表或「这次无事」已经交到人面前。

**执行段**，人逐行批过之后：只执行批了的行，照 [references/proposal-table.md](references/proposal-table.md) 的「执行段」做，结果是一个只改 `docs/`、`DESIGN.md`、`GLOSSARY.md` 的 PR。执行段不拆给 agent。最后报告：动了什么、留了什么、为什么留；这张表处理完（批了的行执行了，或每一行都回了「不批」）就删掉它的 `.tmp/dreaming/<日期>/`，下一次靠它判断上一张有没有处理。

**写 `DESIGN.md` 和开 issue 都停在人身上**：提议段只把旧文和新文并排放进提议表，人批了、确认了措辞才落笔。缺陷（产品坏了、法对代码错）起草成目标仓库的 GitHub issue，人批了才开。

**幂等**：同一批文档重跑一次，提议表应为空。不为空说明上一次没处理干净。

## 只跑一部分

人调用时可以说只跑某一部分，只起对应的那个 agent（或只做漏归档），只出那几节：只跑 spec → ADR 起 `adr-reconciler`；只跑候选蒸馏或只跑 `DESIGN.md` 对账起 `design-steward`，范围写明哪一部分；只跑设计档案走档案那一路。

**单条蒸馏**：人在会话里口述了一条视觉规则、想当场落，调用时带上这条规则：只起 `design-steward`，范围「单条蒸馏」，不开浏览器、不跑其它部分、不出提议表，照 [references/candidate-distillation.md](references/candidate-distillation.md) 的「单条蒸馏」。没有单独调用的，这条规则记成候选，等下一次对账。
