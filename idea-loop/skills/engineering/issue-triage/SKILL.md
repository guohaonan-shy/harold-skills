---
name: issue-triage
description: backlog issue 的每周分拣，和疑似 P0 的 issue 的当场复现。分拣 backlog、或开完疑似 P0 的 issue 时用。
argument-hint: "[全部 | P0 <issue 号>]"
---

backlog 里的 issue 没人验证过。你把它们交给 `idea-loop:issue-triager` 一个个查完，把结论拼成一张表摆给人，人逐行批去向，你照批的翻状态。状态怎么翻、前提是什么，读 `idea-loop:issues`。

下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指当前 worktree 的 `docs/`，`<主分支>` 取目标仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

三种调用，`$ARGUMENTS` 决定：

| 调用 | 做什么 |
|---|---|
| 不带参数 | 每周分拣：取最早的 15 个 backlog issue，走「分拣」 |
| `全部` | 存量分批跑完：每 15 个一批，一批一张表，人批完一张才跑下一批 |
| `P0 <号>` | 走「P0 当场复现」 |

## 分拣

1. **备环境**：`git fetch origin`，用 `git worktree add --detach <路径> origin/<主分支>` 切一个 worktree 给子代理查代码、复现用；中间物放它的 `.tmp/triage/<号>/`。
2. **取一批**：`issues backlog <docs> 15`。`全部`：不带上限列出全部，每批取还没处理过的最早 15 个。
3. **派子代理**：每个 issue 起一个 `idea-loop:issue-triager`，给 issue 号、`<docs>` 和上面 worktree 的绝对路径；**同时最多 5 个**，一个交回再补下一个。它们各自在 issue 上贴证据评论，交回一行 JSON（号、结论、评论链接、建议去向、建议优先级）。
4. **拼表**：每个 issue 一行：号和标题、结论、证据评论链接、建议去向（带优先级）。建议去向有四种：

   | 建议 | 人批了之后 |
   |---|---|
   | todo + P1 或 P2 | `issues set <docs> todo <号>`，`issues priority <docs> <P1 或 P2> <号>` |
   | triage + P1 或 P2 | `issues set <docs> triage <号>`，`issues priority <docs> <P1 或 P2> <号>`；人自己开 triage 会话 |
   | canceled | `issues set <docs> canceled <号> --comment=<理由>` |
   | 留在 backlog | 什么都不做 |

   项目跳过 triage 的（`ISSUE_TRACKER.md` 写了「triage：跳过」），没有 triage 这一行。结论里标了「疑似 P0」的，建议优先级写 P1，人可以改成 P0。
5. **等人批**：表摆在会话里，用 PushNotification 发「N 个 issue 等你批」，停下。人逐行回「是」或改去向、改优先级，你照批的执行；没回的行不动。
6. **记「不做」**：人拒掉一个需求（不是重复、已实现、复现不出），把它写进 `docs/records/out-of-scope/<slug>.md`：`type: record`，一个概念一份文件，写是什么、为什么不做（人的原话）、相关 issue 号；同一个概念再被提，往同一份里追加号码。文件走只改 `docs/` 的 PR，检查全过就合并（`idea-loop:wiki-conventions` 的「知识库落地」）。
7. **收尾**：删掉第 1 步的 worktree。`全部` 还有没处理的，回第 2 步跑下一批。

完成条件：这一批每一行都按人的回复处理了，或人说不批。

## P0 当场复现

「开一个 issue」开出疑似 P0（线上坏了、安全问题）的 backlog issue 后调到这里。备环境同上，只起一个 `idea-loop:issue-triager`：

- 复现到了：`issues set <docs> todo <号>`，`issues priority <docs> P0 <号>`，用 PushNotification 通知人。
- 没复现到：留在 backlog，`issues note <docs> <号> <文件>` 贴一条「疑似 P0，没复现到」，写试了什么。

## 边界

- 子代理只读不翻状态；状态只走 `issues`，在这里翻。
- 一次最多 15 个，是为了一张表批得完；不为凑数多取。
