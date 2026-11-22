---
type: spec
issues: [389]
tags: [idea-loop, glossary, wording]
summary: 插件里两处「用户流程」改成术语表的标准叫法「用户路径」
related: []
---

# 插件里的「用户流程」改成「用户路径」

> #389 存在：`idea-loop` 下（除 `evals/`）还有两处写着术语表避用的「用户流程」；2026-11-20 对着 origin/main（94150ce5）用 `grep -rn 用户流程 idea-loop --exclude-dir=evals` 核过，详情在「问题陈述」

## 问题陈述

### 1. 两处措辞踩了术语表的避用词

根目录 `GLOSSARY.md` 的「用户路径」条目（第 39–41 行）写着 `_Avoid_: 用户流程, flow, 交互图`。插件里还有两处用着这个避用词（2026-11-20 对着 origin/main 94150ce5 核过；分拣证据见 [#389 的评论](https://github.com/guohaonan-shy/harold-skills/issues/389)）：

| 在哪 | 现在的原文 | 谁读到 |
|---|---|---|
| 设计档案 MCP 的 `design_journey` 工具描述（`idea-loop/scripts/design-archive-mcp.mjs`） | 「什么时候用：要走通一整段**用户流程**（端到端测试、验收、复现一串操作）时。」 | 每个装了 idea-loop 的会话，工具描述常驻上下文 |
| `to-spec` 的「测试决策」表（`idea-loop/skills/engineering/to-spec/SKILL.md`） | 类别行名「端到端**用户流程**」 | 每次起草 spec 的会话；这张表原样抄进每份 spec |

第一处最容易误导：同一个工具描述的上一句是「查一条用户路径」，参数也叫「用户路径名」，下一句换成「用户流程」，读到的 agent 会以为是两件事。

### 根因

两处都写在「用户路径」进术语表之前，术语表加词时没有回头扫插件。

## 方案

改完以后，插件里提到「用户为做成一件事依次经过的界面状态」时只有「用户路径」一个叫法，`design_journey` 的描述前后两句说的是同一个词。

| 在哪 | 改前 | 改后 |
|---|---|---|
| `design_journey` 工具描述 | 要走通一整段用户流程（端到端测试、验收、复现一串操作）时 | 要走通一整段用户路径（端到端测试、验收、复现一串操作）时 |
| `to-spec` 测试决策表的类别行 | 端到端用户流程 | 端到端用户路径 |

只改措辞，不改工具名、参数、表的行数和仪器列。纯文字替换，不画时序图：没有模块之间的消息变化。

同一行为的其他入口：

| 入口 | 纳入还是排除 |
|---|---|
| `design_journey` 工具描述 | 纳入 |
| `to-spec` 测试决策表 | 纳入 |
| `docs/spec/` 下 26 份已有 spec 抄过去的「端到端用户流程」行 | 排除：它们是当时的记录，不回头改；新起草的 spec 从改后的模板抄 |
| `docs/raw/` 里人的原话（如 2026-11-16 refine-advisor grill 的记录） | 排除：原话不改 |
| `evals/` 下的用例与快照 | 排除：取自历史快照，issue 本身也排除了它 |
| 根目录 `GLOSSARY.md` 的 `_Avoid_` 行 | 不动：它本来就是在列避用词 |

## User Stories

只修问题、不加能力：

1. 期望行为：`grep -rn 用户流程 idea-loop --exclude-dir=evals` 没有输出；`design_journey` 的描述和 `to-spec` 的测试决策表都用「用户路径」。

## 实现决策

- 改后的措辞取术语表的标准叫法「用户路径」，括号里的例子和表的其余列不动。依据：根目录 `GLOSSARY.md`「用户路径」条目的 `_Avoid_` 行；`to-spec` 自己的第 3 步「目标项目有 `GLOSSARY.md` 就用它的标准叫法、不用 `_Avoid_` 里的词」。
- 版本：改了 `idea-loop/` 下的文件，`plugin.json` 的 `version` 升 patch。依据：`REVIEW.md`「额外要求」的版本三档，patch 含「修说明里前后不一致的地方」。
- 不加防回归的检查：术语表的避用词目前没有机械检查，为两个词新加一条检查超出这个 issue；记在「Out of scope」。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及：只改字符串 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及：工具名、参数不变，`design-archive-mcp.test.mjs` 不断言这句描述 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval，门槛对线上基线、不写绝对值；装了 `ai-eval` 的项目，跑流水线的改动走 eval-run，多轮对话里的一步走 eval-replay | 不涉及：同义词替换，不改 agent 该做什么 |
| 视觉正确性 | UI 实现环（`idea-loop:ui-measure`，逐格比对冻结画布） | 不涉及 |
| 端到端用户路径 | 浏览器端到端测试 | 不涉及 |

- **seam**：仓库的全量测试命令（`REVIEW.md`「验证命令」）加一条 grep。全量测试能抓到改字符串时弄坏了语法或版本没升（`plugin-version.test.mjs`）；grep 能抓到漏改。
- **增量功能测试**：
  - 前置：本分支改完。
  - 步骤：跑 `grep -rn 用户流程 idea-loop --exclude-dir=evals`；跑全量测试。
  - 期望：grep 无输出；全量测试全过。
  - 覆盖：问题 1 的期望行为。
- **照着谁写**：不新写测试。

## Out of scope

- 给术语表的避用词加机械检查（扫插件里的 `_Avoid_` 词）。

## 关联

- 相邻还没完成的 issue：#216（交付物和 evidence 之间缺一层「交给人决策」）、#418（dreaming 问人范围的说法）都不碰这两处文字，没有重叠，不分先后。
- 相关 spec：无。
