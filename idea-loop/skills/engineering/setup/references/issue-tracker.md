# Issue tracker：GitHub

这个项目的需求以 GitHub issue 的形式进来。所有操作用 `gh`，每条带 `-R <owner/repo>`（home 项目清单里这个项目登记的仓库），不靠当前目录推仓库。

issue 是需求的入口，也是工作的队列：idea-loop 的调度给每个 triage、todo 的 issue 出一个会话（一个 issue 一个会话），从评估、设计一路走到实现合并。要做的事写在 spec 里（`docs/spec/<slug>/` 下的文件，工单也在那里），issue 里不放 spec 正文。

## 操作

- **读一个 issue**：`gh issue view <号> --comments`，正文和评论都读完。
- **列 issue**：`gh issue list --state open --json number,title,labels`，按需加 `--label`。
- **评论**：`gh issue comment <号> --body "..."`，多行正文用 heredoc。
- **加、去 label**：`gh issue edit <号> --add-label "..."` / `--remove-label "..."`；`status:*` 不走这里，用 `dyna issues set`（手写的会被 hook 拦下）。
- **关闭**：`gh issue close <号> --reason completed|"not planned" --comment "..."`。

## 状态

状态只由 idea-loop 的 `dyna issues` 改。

| 状态 | GitHub 上 | 意思 |
|---|---|---|
| backlog | open，没有 `status:*` | 新进来、没验证；或先放着 |
| triage | `status:triage` | 验证过，要人评估（grill、设计） |
| todo | `status:todo` | 可以被调度派成会话 |
| in-progress | `status:in-progress` | 会话在做，spec 提交后开 draft PR |
| in-review | `status:in-review` | PR 全部转 ready，等人看 |
| done | closed，completed | 全部 PR 合并 |
| canceled | closed，not planned | 不做；验证为不存在；重复 |

triage：用 / 跳过

（选一个写在这一行：「triage：用」，或「triage：跳过」——跳过的项目 backlog 直接到 todo，grill 与设计在 todo 的会话里做。）

## 优先级

issue 的优先级是 `priority:P0`、`priority:P1`、`priority:P2` 三个 label，一个 issue 最多一个，没有就是没有优先级。P0 = 线上坏了、安全问题（权限、付款、数据越权），拿不准不判；开出疑似 P0 的 issue 时当场复现，复现到了翻 todo 并通知人。调度先派指派给本人的 todo，按 P0 → P1 → P2 → 没有优先级排，同一级里最早的先派；本人名下没有可派的，才派未指派的，同样先按优先级，同一优先级里在 todo 里停留久的先；指派给别人的不派。

## PR

一个 issue 一个 PR，PR 正文写 `Refs <owner>/<repo>#<号>`（不写 `Closes`：状态只由 `dyna issues` 改）。

## 调度

调度每一轮读这张表，定此刻派什么、同时最多开几个会话；改了这里，下一轮就按新的走。没有这一节的项目按下面这两行走。

| 时段 | 派什么 | 上限 |
|---|---|---|
| 09:00–19:00 | triage | 3 |
| 22:00–08:00 | todo | 3 |

时段左闭右开，开始晚于结束就是跨午夜；派什么只能写 `triage` 或 `todo`；表里没覆盖的时间不派；两行重叠时靠前的一行算。

## 分类 label

issue 还带两种分类 label：模块 `type:<父类>`，可选的子类 `type:<父类>/<子类>`，打子类时父类一起打；类型 `kind:bug`、`kind:feature`、`kind:improvement`。分类由 idea-loop 分拣 issue 时打，人也可以手动打。不在状态、分类和保留清单里的 label 会被清掉，要留的列在「保留的 label」。

模块的写法（脚本照这个格式读本节：父类、子类各一行，名字放反引号里，后面「：」接说明，子类缩进两格；「保留的 label」一行把别的要留的 label 放反引号里；本节到下一个 `##` 标题为止）：

- `<父类>`：<什么样的 issue 归它>
  - `<子类>`：<什么样的 issue 归它>
- `<父类>`：<什么样的 issue 归它>

保留的 label：`<label>`、`<label>`
