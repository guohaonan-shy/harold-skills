# Issue tracker：GitHub

这个仓库的需求以 GitHub issue 的形式进来。所有操作用 `gh`，在仓库的 checkout 里跑，仓库由 `git remote` 推出来。

issue 是需求的入口，不是工单：待办的 issue 被起草成 spec，spec 走到哪一步，issue 上的 label 就跟到哪一步，spec 的 PR 合并时关掉它。spec 和工单都是 `docs/spec/<slug>/` 下的文件，issue 里不放 spec 正文。

## 操作

- **读一个 issue**：`gh issue view <号> --comments`，正文和评论都读完。
- **列 issue**：`gh issue list --state open --json number,title,labels`，按需加 `--label`。
- **评论**：`gh issue comment <号> --body "..."`，多行正文用 heredoc。
- **加、去 label**：`gh issue edit <号> --add-label "..."` / `--remove-label "..."`。
- **关闭**：`gh issue close <号> --reason completed|"not planned" --comment "..."`。

## 发布 spec

spec 推送到远端之后才发布到这里（issue-dispatch 的起草要等起草 PR 合并进主分支），免得 issue 指向一份别人读不到的 spec。用 idea-loop 的 `issues.mjs publish`，不手开：

- spec 覆盖了已有的 issue：按 spec 的状态同步它们的 label，第一次同步时留一条评论指向 spec。
- 没有：开一个标题以「spec：」开头的 issue，挂上 spec 的状态 label，正文是 spec 的 summary、spec 文件路径和它所在的分支。设计和实现的 loop 靠它找到这份 spec。

## 状态 label

idea-loop 只管 `status:*` 这一组 label，由它的脚本按 spec 的状态改，不手打；别的 label 是这个仓库自己的。

| issue 的状态 | GitHub 上 |
|---|---|
| 待办 | open，没有 `status:*` label |
| 不接手 | open，`status:搁置`，没有 spec 覆盖它：人手动打，idea-loop 不接 |
| 跟着 spec 走 | open，恰好一个 `status:<spec 的状态>`：`草稿` / `审核中` / `待设计` / `设计中` / `待实现` / `在飞` / `已拍板未排期` / `搁置` |
| 已解决 | closed，completed：spec 的 PR 合并后 |
| 不做 | closed，not planned：人审 spec 时决定不做 |

spec 覆盖了哪几个 issue，记在 spec frontmatter 的 `issues: [12, 15]` 里。spec 是真相，label 是它的投影。
