---
type: adr
status: 生效
tags: [repo-conventions, skill-writing]
summary: 「SKILL.md 主体 < 5000 字」写明量法：去掉 frontmatter、按 UTF-8 字符数，附照抄就对的命令，只写一处
related: []
---

# ADR-0033 — SKILL.md「主体 < 5000 字」写明怎么量

> 由 spec `skill-length-measure` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

仓库规则只写「主体 < 5000 字」，没说「字」怎么数、主体从哪算起。agent 顺手用 `wc -m`，而 Claude Code 的 shell 里 locale 是 C，`wc -m` 数的是字节，一个汉字算 3。2026-11-10 对着当时的主分支量：全仓（不含子模块 `excalidrawer/`）46 份 SKILL.md 里，31 份在 C locale 下被误报 ≥ 5000、按字符数其实未超；已造成 #93（dreaming）、#124（retro）两次白开会话去验证。仓库里量对了的只有几份文档测试，规则本身读不到。

同一个误报先后在 retro（#124）和 dreaming（#93）上出现：issue 报它们的 SKILL.md 主体超 5000 字，实测都是 C locale 下 `wc -m` 数成字节，两个 issue 因此验证为不存在、以 NOT_PLANNED 关闭，不是确认不做。

## 2 决策（how）

- **只写量法，不加检查脚本。** 分拣评论建议先写清楚就够；全仓检查会立刻让真超长的几份变红，那是另一件事。
- **命令用 `awk … | LC_ALL=en_US.UTF-8 wc -m`，不用 Node 一行**：规则在仓库级，读者是任何 plugin 的 agent，awk 与 wc 在 macOS 和 Linux 都自带。
- **量法只写一处**，另两处写指针（单一事实来源，`writing-for-agents` 的剪枝）。
- 不精简那几份真超长的 SKILL.md，不给参考文件定字数上限，均另案。

## 3 结果（result）

- 仓库根 `AGENTS.md` 的「标准 plugin 目录结构」要点第一条写明：主体 = 去掉开头 frontmatter 之后的部分，「字」= UTF-8 字符数，附量法命令，并点明不带 `LC_ALL` 的 `wc -m` 在 C locale 下数字节；目录树注释「主体 < 5000 字」指向这条要点。
- `REVIEW.md` 的额外要求同样改为指回 `AGENTS.md` 的要点，不重复写命令。
- 对账时按这条命令量，当前 idea-loop 下主体超 5000 字的是 `implement`、`wiki-conventions`、`design-modeling` 三份，与量法无关（真超长的另案处理）。
