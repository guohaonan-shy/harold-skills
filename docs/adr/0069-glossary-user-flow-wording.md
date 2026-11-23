---
type: adr
status: 生效
tags: [idea-loop, glossary, wording, glossary-user-flow-wording]
summary: 插件里两处「用户流程」改成术语表标准叫法「用户路径」，不加避用词检查
related: ["[[389]]"]
---

# ADR-0069 — 插件里的「用户流程」改成「用户路径」

> 由 spec `glossary-user-flow-wording` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

根目录 `GLOSSARY.md` 的「用户路径」条目写着 `_Avoid_: 用户流程, flow, 交互图`。issue #389：2026-11-20 对 origin/main（94150ce5）`grep -rn 用户流程 idea-loop --exclude-dir=evals` 还有两处用着这个避用词：

- 设计档案 MCP 的 `design_journey` 工具描述（`idea-loop/scripts/design-archive-mcp.mjs`）。工具描述常驻每个装了 idea-loop 的会话的上下文，同一段里上一句是「查一条用户路径」、参数叫「用户路径名」，下一句却写「用户流程」，agent 会以为是两件事。
- `to-spec` 测试决策表的类别行「端到端用户流程」（`idea-loop/skills/engineering/to-spec/SKILL.md`），这张表原样抄进每份 spec。

根因：两处写在「用户路径」进术语表之前，术语表加词时没回头扫插件。

## 2 决策（how）

- 两处都改成术语表的标准叫法「用户路径」，括号里的例子、工具名、参数、表的行数不动。依据：`GLOSSARY.md` 的 `_Avoid_` 行，以及 `to-spec` 第 3 步「用目标项目术语表的标准叫法」。
- 已有 26 份 spec 抄过去的旧行、`docs/raw/` 里人的原话、`evals/` 下取自历史快照的用例都不回头改；新起草的 spec 从改后的模板抄。
- 插件版本升 patch（`REVIEW.md` 的 patch 含「修说明里前后不一致的地方」）。不改 README：README 没提到这两句话。夜间模式按推荐定，人看到后没有推翻（决定记录 [[389]]）。

取舍（没做）：不为术语表的避用词新加机械检查（扫插件里的 `_Avoid_` 词）。避用词目前没有机械检查，为两个词加一条超出这个 issue；要加另开 issue。

## 3 结果（result）

- `idea-loop/scripts/design-archive-mcp.mjs` 的 `design_journey` 描述写「要走通一整段用户路径」；`idea-loop/skills/engineering/to-spec/SKILL.md` 的测试决策表类别行是「端到端用户路径」。2026-11-22 对 origin/main 重跑 `grep -rn 用户流程 idea-loop --exclude-dir=evals`，无输出。
- 合并在 PR #443（插件里的「用户流程」改成「用户路径」），`plugin.json` 随之 0.1.45 升到 0.1.46；issue #389 已关闭。
- 没有新测试：全量测试只守语法和版本，漏改靠上面那条 grep。
