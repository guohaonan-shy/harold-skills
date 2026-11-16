# 核对与落地里只有部分运行才走到的分支

## 交回的 `by_existing_practice`

`by_existing_practice` 每条必须带至少一处现存实例，没有的不收：退回执行方，要么补实例，要么改按「行为没定」停（`idea-loop:decision-rules` 的「依据冲突或没有：停下问人」）。

## ff 不了

ff 不了（期间别的先落地了）就退回它：合入最新提交、重新压成一个、重跑它这张工单那组测试（工单写的或改到的单元测试、涉及的 API 测试、选中的存量回归），不跑全量，不算失败。

## 跟这次无关的存量问题

**跟这次无关的存量问题自动开 issue**（它不在这份 spec 的问题之内，`idea-loop:decision-rules` 的「核心」）：逐条照 `idea-loop:issues` 的「开一个 issue」开（为什么不做：它跟这张工单无关）。把「做了什么 + 依据（它跟这张工单无关）+ issue 链接」记进 handled，下次 Review 汇报（来自实现）和第 1 轮 review 汇报的「已按规则处理」都带它。开不成的也记进 handled，让人在 Review 汇报里看到。
