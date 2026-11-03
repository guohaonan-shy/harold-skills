# Issue tracker：GitHub

这个仓库的需求以 GitHub issue 的形式进来。所有操作用 `gh`。issue 所在的 GitHub 仓库写在知识库 `idea-loop.json` 的 `issues`，idea-loop 的脚本（`issues.mjs`）读它；手敲 `gh` 时加 `--repo <那个仓库>`。

issue 是需求的入口，也是工作的队列：idea-loop 的调度给每组待验证的 issue（一个根 issue，或一个没被整合的 issue）出一张会话卡片，人点开后，一组（一个根 issue 加它的子 issue，或一个没被整合的 issue）一个会话，从验证、设计一路走到实现合并。要做的事写在 spec 里（知识库里 `docs/spec/<slug>/` 下的文件，工单也在那里），issue 里不放 spec 正文。

## 操作

- **读一个 issue**：`gh issue view <号> --comments`，正文和评论都读完。
- **列 issue**：`gh issue list --state open --json number,title,labels`，按需加 `--label`。
- **评论**：`gh issue comment <号> --body "..."`，多行正文用 heredoc。
- **加、去 label**：`gh issue edit <号> --add-label "..."` / `--remove-label "..."`。
- **关闭**：`gh issue close <号> --reason completed|"not planned" --comment "..."`。

## 状态 label

`status:*` 这一组 label 全由 idea-loop 的 `issues.mjs` 改；人只手动打 `status:搁置`。

| issue 的状态 | GitHub 上 | 意思 |
|---|---|---|
| 待验证 | open，没有 `status:*` | 新进来，调度会给它出会话卡片 |
| 讨论中 | `status:讨论中` | issue 会话在复现、起草 spec、跟人 grill |
| 设计中 | `status:设计中` | spec 定稿、碰 UI，在设计 |
| 实现中 | `status:实现中` | 在切工单、实现、跑 review 第一轮 |
| 审核中 | `status:审核中` | PR 已开出、review 过一轮、转了 ready，等人读 |
| 搁置 | `status:搁置` | 先放着，loop 不碰 |
| 关闭·不存在 | closed，not planned | 验证发现问题不成立，或人决定不做 |
| 关闭·完成 | closed，completed | 这条线的 PR 全部合并了 |

一个 issue 会话从讨论到合并只在一条分支上，label 全由它挂：开场认领讨论中，spec 定稿、设计冻结后照会话分支上的 spec 翻到设计中或实现中，交审核报告、PR 转 ready 时翻审核中，全部合并后关掉。调度每轮对账只兜底关掉知识库主分支上已经完成或验证为不存在的。spec 覆盖了哪几个 issue，记在 spec frontmatter 的 `issues: [12, 15]` 里；一个都没覆盖的 spec（从对话里写的），会开一个标题以「spec：」开头的 issue 作为它在这里的入口，当场挂讨论中。

## 分类 label

issue 还带分类 label：`type:<父类>`，可选的子类 `type:<父类>/<子类>`。有哪些分类、另外保留哪些 label，写在 `AGENTS.md` 的「issue 分类」一节；分类由 idea-loop 验证 issue 时打。不在状态、分类和保留清单里的 label 会被清掉，要留的写进那一节。
