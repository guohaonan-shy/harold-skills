# 09 — eval baseline 与文档终稿

**Blocked by**：01 — prototype；02 — 访谈到切票这一段接上闸门；03 — UI 实现环；08 — refine 的动效段与素材段
**设计冻结**：不涉及 UI

## 要建什么

这几个新 skill 会长期迭代 rubric 和 prompt，没有基准就没法判断一次改动是好是坏。所以选**一个真实 case**（自带最小的 DESIGN.md 与 PRODUCT.md）当 baseline，跑一次 eval 存档；此后每次改 rubric、prompt 或 SKILL.md 都对着它重跑。

整条环的**接通检查并入这个 baseline 的断言项**，不另做一次性干跑——干跑的结论会随会话消失，断言不会。

这是对本仓库"这类主观输出跳过 quantitative eval"约定的**有意例外**，理由要写在文档里，否则下一个读到它的人会以为是遗漏。

最后把文档收口：skill 表补齐、两栏分类正确、plugin 描述与仓库根说明同步。

## 验收标准

- [x] 选定一个真实 case 作为 baseline，含最小的 DESIGN.md 与 PRODUCT.md，跑一次 eval 并存档结果
- [x] baseline 覆盖发散、收敛、原型三个 skill
- [x] 整条环的接通检查作为断言项写进 baseline：原型落 raw；碰 UI 的 spec 落等设计冻结、冻结后翻在飞；raw 桶里有画布和 ledger；仍未冻结的 UI ticket 字段落 ⛔；全仓无跨 plugin 调用
- [x] baseline 的用途写进文档：此后每次改 rubric、prompt 或 SKILL.md 都对着它重跑，让改动有依据
- [x] 这条"有意例外"及其理由写进文档，与仓库既有的跳过 eval 约定并置说明
- [x] **不**为评语和方向说明的质量建 promptfoo 套件——质量走这个 baseline
- [x] `idea-loop` README 的 skill 表是十个 skill，模型可调用 / 只能人调两栏分类正确
- [x] plugin 描述与仓库根 CLAUDE.md 里 `idea-loop` 那一段同步，且不再提及已退役的 plugin
- [x] 前向环的那句总述更新成带方括号两段的形状：只在 spec 落成等设计冻结时才走那两段

## 选中的存量回归

本仓库**无 test-cases 库**。三套 node 单测（lint 规则、视觉比对函数、评分自洽校验）在本张**全部跑一遍**——这是整批工作合并前的最后一刀，它们共用一条运行命令，这里是唯一一次确认那条命令跑得全的机会。

lint hook 也实跑一次：整批改动动过它的位置与触发面。
