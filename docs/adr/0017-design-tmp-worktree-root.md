---
type: adr
status: 生效
tags: [design, uiux-imagine, uiux-refine, worktree]
summary: imagine / refine 的设计过程目录按当前 worktree 根（git rev-parse）定位，不再用 CLAUDE_PROJECT_DIR
related: ["[[0002-design-loop-v2-imagine-refine]]", "[[77]]"]
---

# ADR-0017 — 设计过程目录按当前 worktree 根定位

> 由 spec `design-tmp-worktree-root` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`uiux-imagine` 与 `uiux-refine` 用 `${CLAUDE_PROJECT_DIR}` 当「当前工作区根」，拼出变种板、画布、`rounds.md`、方向说明所在的设计过程目录。2026-10-27 在 worktree 会话里复现（#77）：skill 文本里的这个变量加载时被替换成**主 checkout** 的路径，不是当前 worktree；同一会话的 Bash 里它却是空的。两种情形都不是当前 worktree。

真实后果（来自 #77 的 2026-10-22 实例）：一场 imagine 第一轮约 37MB、161 个文件写进主 checkout，之后调研子代理按 `git rev-parse --show-toplevel` 写进 worktree，同一份设计的产出拆成两半；主 checkout 里那份在 worktree 归档后成孤儿，`rounds.md`（imagine 中断后接着做的依据）也不在 worktree 里，恢复时找不到。

## 2 决策（how）

- **「当前 worktree 根」取 `git rev-parse --show-toplevel`**，两份 skill 在目录约定那一句定义一次，之后的命令都以它为前缀；交给子代理（uiux-imaginer、designer）和校验脚本的路径写成绝对路径。依据是产品里已有的统一做法：`uiux-research` 定落图目录、`wiki-conventions` 的「中间产物」一节都这样写。
- **skill、agent 文本里不再出现 `CLAUDE_PROJECT_DIR`**；用文本绊线测试钉住，防止有人再放回去。
- **范围只到 imagine / refine 两份 skill 里用该变量拼路径的六处**（imagine：目录约定、方向说明校验、开工前把 issue 翻成设计中的命令；refine：目录约定、方向说明校验、评分命令）。其余入口逐个看过都不经过这个变量：`uiux-research` 已按 worktree 根；冻结、`design-change-sync`、`ui-reviewer`、`implementer` 用相对路径或由编排者给绝对路径；hook 与脚本已按 `git rev-parse --show-toplevel` 取根。
- **不处理 issue 里「合并前钩子会被无关 PR 拦下」那一节**：该钩子（`merge-gate-hook`）已在更早的重构里整个删掉，问题不存在。
- 别的仓库主 checkout 里已留下的孤儿目录是一次性本地清理，不进插件。

## 3 结果（result）

- `uiux-imagine`、`uiux-refine` 的 SKILL.md 都写明设计过程目录在 `<worktree 根>/docs/design/tmp/<spec-slug>/` 下，worktree 根取 `git rev-parse --show-toplevel`；issue 状态命令也用 `<worktree 根>/docs` 前缀。
- 脚本 `design-tmp-worktree-root-doc.test.mjs` 扫 `skills/` 与 `agents/` 全部 Markdown：没有一处出现 `CLAUDE_PROJECT_DIR`，且两份 SKILL 都写了 worktree 根的定义。
- 该测试只读文本，看不到执行者是否照做；真实 worktree 会话里跑一次 imagine 确认主 checkout 的 `docs/design/tmp/` 不出新目录，是人验项。
- 实现于 PR #140（2026-10-27 合并）。
