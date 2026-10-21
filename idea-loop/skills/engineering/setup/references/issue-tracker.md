# Issue tracker：GitHub

这个仓库的需求以 GitHub issue 的形式进来。所有操作用 `gh`，在仓库的 checkout 里跑，仓库由 `git remote` 推出来。

issue 是需求的入口，不是工单：待办的 issue 被起草成 spec，spec 走到哪一步，issue 上的 label 就跟到哪一步，spec 的 PR 合并时关掉它。工单是 spec 目录下的文件。

## 操作

- **读一个 issue**：`gh issue view <号> --comments`，正文和评论都读完。
- **列 issue**：`gh issue list --state open --json number,title,labels`，按需加 `--label`。
- **评论**：`gh issue comment <号> --body "..."`，多行正文用 heredoc。
- **加、去 label**：`gh issue edit <号> --add-label "..."` / `--remove-label "..."`。
- **关闭**：`gh issue close <号> --reason completed|"not planned" --comment "..."`。

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
