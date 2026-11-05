# Linear 上的 issue

**脚本还不接 Linear**（排在 0.2.x 的补丁版本）。这一份只是对照：业务的 issue 在 Linear 上时，实体的每个字段对应 Linear 的什么，接上之前人照这张表手动维护。

| 字段 | Linear 上 |
|---|---|
| 状态 | workflow state，团队里建九个同名状态：backlog、todo 归 Backlog / Unstarted 类，spec、design、implement、review 归 Started 类，blocked 归 Started 类，done 归 Completed 类，canceled 归 Canceled 类。不用 label 表达状态 |
| 分类 | 模块用 Project；父类、子类的细分用 label（`type:<父类>/<子类>`） |
| 优先级 | Linear 自带的 priority（Urgent、High、Medium、Low 对应 P0 起） |
| 父 / 子 | sub-issue（parent）；同样只用两层 |
| blocked by | issue relation「blocked by」 |
| milestone | 版本用 Release（Business 及以上）；没有就用 Project milestone |
| 评论 | comment，带「🤖 idea-loop：」前缀 |
| 「这几个相关」 | issue relation「related」 |

Linear 的 PR 与 issue 是多对多的，idea-loop 仍按一个 issue（或一个子 issue）一个 PR 用。
