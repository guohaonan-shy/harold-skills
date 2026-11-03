# 一份 spec 有几个 PR

一份 spec 落在几个代码仓库里时走这份：每个代码仓库一个 PR，知识库一个 PR。只有一个代码仓库的业务也是一个代码 PR 加一个知识库 PR，下面「全部合并才算完」照样适用（其余的 PR 就是知识库那个）。`review-loop`、设计产物的意思同 [`../SKILL.md`](../SKILL.md)。

## 每个 PR 各跑 review

- **每个有代码的 PR 各跑 review**，轮次和上限互相独立。跑某个 PR 时，「当前 worktree」是它所在仓库的集成 worktree（会话所在仓库就是会话 worktree，别的仓库是 `.tmp/repos/<仓库名>/`），review loop 文件也记在那个 worktree 的 `.tmp/review-loop/` 下；spec 和工单仍在知识库里读。
- **知识库 PR 不跑 review 轮**：它只有工单、设计、归档的文档改动，跟只含文档的 spec PR、设计 PR 一样（`idea-loop:decision-rules` 的「不自动的」）；它的内容在各代码 PR 的审核报告里一起交。
- 修复回工单照 `../SKILL.md` 的「回工单」：`git blame` 在对应仓库里做，派 implementer 时带上那张工单所在仓库的集成 worktree。

## 全部合并才算完

人对某个 PR 说合并时，按 [`merge.md`](merge.md) 合完这一个，然后：

1. 读这个 PR 描述 `reference` 区列出的这份 spec 的**全部 PR**，用 `gh pr view <号> --repo <owner/repo> --json state` 逐个查其余的。
2. **全部合并了**，才让会话去「换阶段」跑 `issues advance`（见 `idea-loop:issue-session`；不在 issue 会话里的，合并后在知识库主 checkout 上跑 `issues.mjs reconcile`）。
3. **还有没合的**：不翻 issue，在汇报里写「还剩哪几个没合」（仓库和 PR 链接），等人说合并下一个。

## 删工单与归档的时机

删工单、spec 翻完成（[`deliver.md`](deliver.md) 的第 2 步）和设计归档（[`merge.md`](merge.md) 的「合并前归档」）都是**知识库 PR** 里的提交，要赶在这份 spec 最后合并的那个 PR 之前做完：

- 第 2 步在第一个 PR 交审核报告时做一次；其余 PR 交报告时看到 spec 已经是「完成」，就跳过。
- 设计归档在合并知识库 PR 之前走；合并代码 PR 不走。
- 清理：合并某个 PR 后只删它自己的东西（它的素材分支、`.tmp/review-loop/<PR 号>.md`、`.tmp/pr-review/<PR 号>/`）；`.tmp/implement/<spec-slug>/` 和 `.tmp/repos/` 下的 worktree 等最后一个 PR 合并后再收。
