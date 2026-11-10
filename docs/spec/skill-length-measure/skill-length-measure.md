---
type: spec
tags: [repo-conventions, skill-writing]
summary: 「SKILL.md 主体 < 5000 字」写明量法：去掉 frontmatter、按 UTF-8 字符数，给一条照抄就对的命令
related: ["[[dreaming-skill-length]]", "[[retro-skill-length]]"]
issues: [132]
---

# SKILL.md「主体 < 5000 字」写明怎么量

> #132 存在：规则只写「主体 < 5000 字」，没写怎么量；照常用的 `wc -m` 在 Claude Code 的 shell 里数的是字节，全仓 46 份 SKILL.md 里 31 份会被误报超长，详情在「问题陈述」

## 问题陈述

### 规则没写量法，顺手的量法数出的是字节

规则在三处：`AGENTS.md` 的目录树注释「主体 < 5000 字」、「SKILL.md 编写约定」上方要点「SKILL.md 主体保持精简（< 5000 字）」，`REVIEW.md`「额外要求」的「主体 < 5000 字」。三处都没说「字」怎么数、主体从哪算起。

agent 一般用 `wc -m` 量。Claude Code 的 shell 里 `LANG`、`LC_ALL` 都是空的，locale 是 C，`wc -m` 这时按字节数，一个汉字算 3 个。2026-11-10 对着 `origin/main e8c14bf` 量 `idea-loop/skills/productivity/dreaming/SKILL.md`：

| 量法 | 结果 |
|---|---|
| `wc -m`（C locale） | 6821，看着超了 |
| `LC_ALL=en_US.UTF-8 wc -m`（整份文件） | 3696 |
| 去掉 frontmatter 后按 UTF-8 字符数 | 3580，离上限还差约 1400 |

全仓（不含子模块 `excalidrawer/`）46 份 SKILL.md 都去掉 frontmatter 后各量一遍：C locale 下 `wc -m` 报 ≥ 5000、按字符数其实 < 5000 的有 31 份；按字符数真超的 5 份（`content-creator` 的 thumbnail-gen、`happy-life` 的 daily-coffee-oracle、idea-loop 的 design-modeling、implement、wiki-conventions），跟量法无关。

已经造成的误报：#93（dreaming，spec `dreaming-skill-length` 验证为不存在）、#124（retro，spec `retro-skill-length` 验证为不存在），两个 issue 各开了一个会话，量一遍才发现没超。

### 根因

仓库里量对了的只有几份文档测试（如 design-archive、pr-review 的 tripwire），它们各自用「去掉 frontmatter、数 Unicode 字符」量自己那一份；规则本身没写这个量法，agent 读规则时拿不到。

## 方案

改完以后，agent 读到「主体 < 5000 字」时同一处就写着怎么量和一条照抄就对的命令，在任何 locale 下量出的都是字符数。

改的是给 agent 读的文档，对的杠杆是「规则写在读者读到它的那一处」：

- `AGENTS.md`「SKILL.md 编写约定」上方那条要点（「SKILL.md 主体保持精简」）补上量法：主体 = 去掉开头 frontmatter 之后的部分，「字」= UTF-8 字符数（一个汉字、一个字母、一个空格都算 1），附命令 `awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`，并点一句不带 `LC_ALL` 的 `wc -m` 数的是字节。
- `AGENTS.md` 目录树注释「主体 < 5000 字」和 `REVIEW.md` 那条不重复写量法，各补一个指回那条要点的指针（`REVIEW.md` 已有「`AGENTS.md`「SKILL.md 编写约定」」的出处，要点在那一节前面，指针改指到它真正所在的位置）。

命令已核过：对 dreaming 那份，awk 管道得 3580，跟 Node 去掉 frontmatter 后 `[...s].length` 一致。

同一规则的其他入口：

| 入口 | 纳入 / 排除 |
|---|---|
| `AGENTS.md` 两处、`REVIEW.md` 一处 | 纳入 |
| 各插件 README、已合并的 spec 里提到「5000 字」的句子 | 排除：它们引用规则，不定义它；量法只写一处 |
| 已有的 tripwire 测试 | 排除：它们已经按字符数量，不用改 |

## User Stories

只修问题、不加能力：

1. 期望行为：agent 照 `AGENTS.md` 的命令量任意一份 SKILL.md，在 C locale 和 UTF-8 locale 下得到同一个数，等于去掉 frontmatter 后的字符数；dreaming 那份量出 3580，不报超长。

## 实现决策

- **只写量法，不加检查脚本**。依据：分拣评论的建议（「先写清楚量法就够了」）；issue 原文把加脚本列为可选方向。真超的 5 份要不要拦是另一件事，加全仓检查会立刻让它们红，超出本 issue。
- **命令用 `awk … | LC_ALL=en_US.UTF-8 wc -m`**，不用 Node 一行。依据：规则写在仓库级 `AGENTS.md`，读者是任何 plugin 的 agent，`awk`、`wc` 是 macOS 与 Linux 都自带的；`en_US.UTF-8` 在两边都有。
- **量法只写在一处**（「SKILL.md 编写约定」上方要点），另两处写指针。依据：单一事实来源，`writing-for-agents` 的「剪枝」。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约 | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | 不涉及：按仓库 `AGENTS.md` §5 跳过 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

只改文档。验收靠跑一遍规则里写的命令：

- **seam**：规则里那条命令本身。它能抓到：命令写错、在 C locale 下仍按字节数；漏掉：agent 不照命令、自己用别的量法。
- **增量功能测试**：
  - 前置：shell 里 `LANG`、`LC_ALL` 为空。
  - 步骤：把 `AGENTS.md` 里的命令原样套到 `idea-loop/skills/productivity/dreaming/SKILL.md` 上跑；再加 `LC_ALL=C` 前缀跑一次。
  - 期望：两次都得 3580（或改动当时的字符数），与 Node 去掉 frontmatter 后 `[...s].length` 相同。
  - 覆盖：期望行为 1。
- 全量测试 `node --test '*/scripts/*.test.mjs'` 照跑（`no-project-leak` 等不受影响）。
- **照着谁写**：`idea-loop/scripts/design-archive-skill-doc.test.mjs` 的 `body()`：同一个「去掉 frontmatter、数字符」的量法。

## Out of scope

- 加全仓 SKILL.md 篇幅检查脚本或测试。
- 精简按字符数真超的 5 份 SKILL.md（design-modeling、implement、wiki-conventions 等）。
- 给 references 定篇幅上限（spec `writing-for-agents-pruning-layers` 管剪枝）。

## 关联

- 覆盖的 issue：#132
- 同一量法造成的误报：#93（spec `dreaming-skill-length`）、#124（spec `retro-skill-length`），都已验证为不存在，本 spec 管根因，无重叠
- 相关 spec：`writing-for-agents-pruning-layers`（#156，已关）也提到 5000 字，管的是参考文件的剪枝，不改这条规则的量法，无重叠
- 相邻还没完成的：#137（按字符数真超长的几份）要精简文件，本 spec 不碰，量法写清楚后它照此量
