---
name: issue-triage
description: backlog issue 的每周分拣，和疑似 P0 的 issue 的当场复现。分拣 backlog、或开完疑似 P0 的 issue 时用。
argument-hint: "[全部 | P0 <issue 号>]"
---

backlog 里的 issue 没人验证过。你把它们交给 `idea-loop:issue-triager` 一个个查完，按各自交回的建议去向直接翻状态。状态怎么翻、前提是什么，读 `idea-loop:issues`。

推送等运行环境的能力，用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的『<能力>』。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指当前 worktree 的 `docs/`，`<主分支>` 取目标仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

**Linear 项目**（`ISSUE_TRACKER.md` 第一个标题写 Linear）里，取 backlog、贴评论、打 label、翻状态用 MCP，照 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它）做，不跑 `issues backlog` / `note` / `set` / `priority` / `type`；翻状态前仍先 `issues check <docs> <状态> <号> --from=<现在>`。

三种调用，`$ARGUMENTS` 决定：

| 调用 | 做什么 |
|---|---|
| 不带参数 | 每周分拣：取最早的 15 个 backlog issue，走「分拣」 |
| `全部` | 存量分批跑完：每 15 个一批，一批接一批，直到取不到还没处理过的 |
| `P0 <号>` | 走「P0 当场复现」 |

## 分拣

1. **备环境**：`git fetch origin`，用 `git worktree add --detach <路径> origin/<主分支>` 切一个 worktree 给子代理查代码、复现用；中间物放它的 `.tmp/triage/<号>/`。
2. **取一批**：`issues backlog <docs> 15`。`全部`：不带上限列出全部，每批取还没处理过的最早 15 个。
3. **派子代理**：每个 issue 起一个 `idea-loop:issue-triager`，给 issue 号、`<docs>` 和上面 worktree 的绝对路径；**同时最多 5 个**，一个交回再补下一个。它们各自在 issue 上贴证据评论，交回一行 JSON（号、结论、评论链接、建议去向、建议优先级）。
4. **照建议执行**：每个 issue 按子代理交回的建议去向翻。建议去向有四种：

   | 建议 | 执行 |
   |---|---|
   | todo + P1 或 P2 | `issues set <docs> todo <号>`，`issues priority <docs> <P1 或 P2> <号>` |
   | triage + P1 或 P2 | `issues set <docs> triage <号>`，`issues priority <docs> <P1 或 P2> <号>`；调度会给它出会话卡片，人点了才开 triage 会话 |
   | canceled | `issues set <docs> canceled <号> --comment=<理由>` |
   | 留在 backlog | 什么都不做 |

   项目跳过 triage 的（`ISSUE_TRACKER.md` 写了「triage：跳过」），没有 triage 这一行。
   - **不替人拒需求**：canceled 只来自重复、命中「不做」清单、已实现、复现不出四种；子代理建议 canceled 而理由不在这四种里的，改翻 triage。拿不准值不值得做的翻 triage，不 canceled，交给人评估。
   - **疑似 P0**：结论里标了「疑似 P0」的，照建议去向翻，优先级写 P1；P0 由人改。
5. **推送**：只在两种情况，用『推送』能力点名这几个号：有留在 backlog 的 issue（子代理评论里写了「还要你补」），或有疑似 P0。都没有，不推送。
6. **收尾**：删掉第 1 步的 worktree。`全部` 还有没处理的，回第 2 步，一批接一批跑完。

完成条件：这一批每一行都按建议去向处理了。

## P0 当场复现

「开一个 issue」开出疑似 P0（线上坏了、安全问题）的 backlog issue 后调到这里。备环境同上，只起一个 `idea-loop:issue-triager`：

- 复现到了：`issues set <docs> todo <号>`，`issues priority <docs> P0 <号>`，用『推送』能力通知人。
- 没复现到：留在 backlog，`issues note <docs> <号> <文件>` 贴一条「疑似 P0，没复现到」，写试了什么。

## 边界

- 子代理只读不翻状态；状态只走 `issues`，在这里翻。
- 一批最多 15 个；不为凑数多取。
- 「不做」清单在 `docs/records/out-of-scope/<slug>.md`，由 triage 会话里人决定不做时写（`idea-loop:issue-session` 的起草 spec），这里不写。
