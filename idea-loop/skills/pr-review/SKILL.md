---
name: pr-review
description: 在一个已经 open 的 PR 上跑一轮两轴 review——调用它的会话做编排，起 plugin 自带的 pr-reviewer agent：它自己跑仓库声明的机械检查（只看改动行），并行起两个只读 Codex 进程（gpt-5.6-sol，思考强度 high）分别回答 Spec（代码是否解决了 spec 要解决的问题）与 Standards（代码是否遵守仓库写下来的规则），Spec 问题逐条复现并画成图，两轴引文由脚本校验，最后以项目 bot 的身份开这一轮的 review thread、更新 PR 描述。人在 thread 里批示「修 / 不修 / 进 backlog」，编排者把要修的写回工单、派 implementer 修，下一轮由人触发。implement 全部落地后会自动接它跑第一轮；人要再跑一轮时调它。不合并。
---

# PR review

**一次调用跑一轮。** 这份文件是入口，写的是**编排机制**：起谁、交接什么、人批示之后怎么修。一轮 review 具体怎么跑写在 `agents/pr-reviewer.md` 里，问什么、什么算问题写在 `references/review-standards.md` 里，这里不复述。

> 先读一次 `../../references/pr-description.md`（PR 页面每一块写什么，§2 是 bot 身份与 thread）。

## 0 什么时候跑

- **`implement` 全部落地后自动接**：PR 刚转成 open，跑第 1 轮。
- **人触发下一轮**：人调 `/idea-loop:pr-review`，或者在对话里说「再跑一轮」。一般是上一轮的批示修完之后。
- 推送、`gh pr create`、某个 skill 跑完，都**不是**触发条件。不装任何自动触发的 hook。

前提：

- PR 是 **open**。还是 draft，说明工单没落地完或还有等决定的事，回 `implement`。
- 当前 worktree 是这个 PR 的集成分支，工作区干净（`git status --short --untracked-files=no` 为空），本地 HEAD 已推送、等于 PR 的 head。
- 能找到 Codex companion（`agents/pr-reviewer.md` §2 的查找办法）。编排者先找一次，找不到就在开跑前告诉人缺什么。不安装，不改 Codex 配置。

## 1 两个角色

| 角色 | 是谁 | 做什么 |
|---|---|---|
| **编排者** | 调用 pr-review 的这个会话 | 起审查者、读人在 thread 里的批示、把要修的写回工单、派 implementer、在 thread 里回复做了什么 |
| **pr-reviewer** | `idea-loop:pr-reviewer`（`agents/pr-reviewer.md`），`sonnet` · xhigh | 一轮一个：机械检查、两个 Codex 进程、复现画图、校验、开 review thread、更新描述 |

修复不归审查者，归 `idea-loop:implementer`（`agents/implementer.md`）。审查和修复分开，是为了让审查者只读，它的结论不被它自己的修法影响。

## 2 跑一轮

1. 轮次取 `node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-thread.mjs" list <owner/repo> <PR 号>` 输出的 `next.review`。之前各轮 review thread 的首条评论 id 也从这里拿。
2. 用 Agent 工具起 `idea-loop:pr-reviewer`，**只给指针**：worktree 路径、`<owner/repo>`、PR 号、基准分支、轮次、spec 路径与工单目录、之前各轮 review thread 的 id、companion 路径。
3. 等它交回，**不提前汇报**。
4. **在对话里只说几句**：第几轮，Spec 几条、Standards 几条，thread 链接。有未完成的轴或检查，要明说：**未完成不等于没问题**。缺词也念出来（概念 + 推荐叫法），问人要不要开一轮 `grill` 把它们定下来；不写进术语表。

## 3 人批示之后

人在这一轮的 review thread 里批示（「S1 修，C2 不修，C3 进 backlog」），回到对话说一声。人直接在对话里批示也行，编排者把原文转贴进 thread，开头标「Harold 在对话里回答：」。

`pr-thread.mjs read` 读这个 thread，逐条处理：

- **修**：先找到它归哪张工单。
  - Spec 条目：它引用的那张工单。
  - Standards 条目：对代码片段所在的行跑 `git blame`，找到引入它的 commit，读 commit 的 `Ticket:` trailer。
  - 两条路都找不到（比如代码来自一次不带 trailer 的修复），就问人归哪张。

  在那张工单的验收标准末尾追加 `- [ ] review 第 <N> 轮 <编号>（<日期>）：<应有的行为，或要遵守的规则原文>`，用 `docs(tickets): <NN> — review 第 <N> 轮 <编号>` 提交，然后派一个 `idea-loop:implementer` 做这张工单。它只会去做没勾的那几格，commit 照样带同一个 `Ticket:` trailer。同一张工单上有好几条要修的，一次写完再派一次。多张工单的，按编号串行派。全部修完推送。
- **不修**：在 thread 里回一句收到。下一轮不再报它，除非有新证据。
- **进 backlog**：在目标仓库的 `docs/quality-backlog.md` 追加一条（是什么、在哪、为什么这次不修），提交、推送，在 thread 里回提交链接。
- **疑问**：在 thread 里直接回答。

每处理完一条，就在同一个 thread 里回一条，说明做了什么并带上提交链接（`pr-description.md` §2）。全部处理完，回一句「都处理完了，确认无误请 resolve；要再跑一轮就告诉我」。**resolve 由人点。下一轮也由人触发**，编排者不自己接着跑。

## 4 合并

**只在人在对话里明确下令时合并。** 没有 mergeReady 判定，也没有自动批准：人看过最新一轮的 thread 和交付验收，自己决定。

合并之后：删工单（`to-ticket` §7），删这个 PR 的素材 release（`evidence.mjs cleanup <owner/repo> <PR 号>`），清掉 `.tmp/implement/<spec-slug>/` 和 `.tmp/pr-review/<PR 号>/`。

## 不做

- 编排者不自己审代码、不自己改代码、不跑审查者的检查。
- 不替人批示；不在人批示之前修任何东西；不自己开下一轮。
- 不以人的身份在 PR 上发言，不点 resolve，不合并、不批准 PR。
