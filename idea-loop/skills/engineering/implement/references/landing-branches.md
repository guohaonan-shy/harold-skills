# 核对与落地里只有部分运行才走到的分支

## 交回的 `by_existing_practice`

`by_existing_practice` 每条必须带至少一处现存实例，没有的不收：退回执行方，要么补实例，要么改按「行为没定」停（用户规则的「停下问我」）。

## ff 不了

ff 不了（期间别的先落地了）就退回它：合入最新提交、重新压成一个、重跑它这张工单那组测试（`${CLAUDE_PLUGIN_ROOT}/agents/implementer.md` 「做」里「交回前跑」的那一组），不跑全量，不算失败。

## 不影响本次改动的存量问题

**不影响本次改动的存量问题自动开 issue**（它不在这份 spec 的问题之内）。开之前对 `found` 里的每条存量，照 review 标准的范围题再核一遍（判据和两个引导词「本分支才撞上 / 挡不挡目标」见 [stop-and-defer.md](stop-and-defer.md) 存量那一行）：挡的、本分支才撞上的，退回同一个执行方在这张工单里修，记进 handled；不挡的才逐条照 `idea-loop:issues` 的「开一个 issue」开（为什么不做：它不挡这份 spec 的目标，这次改动也没引入它）。把「做了什么 + 依据（范围题怎么判的）+ issue 链接」记进 handled，下次 Review 汇报（来自实现）和第 1 轮 review 汇报的「已按规则处理」都带它。开不成的也记进 handled，让人在 Review 汇报里看到。

## 勾框

工单在 home 里，执行方的 commit 只含代码。落地（只快进）之后，照交回的 `acceptance` 在 `<项目目录>/docs/spec/<spec-slug>/tickets/` 里勾好这张工单的框；有延后给后续工单的，在那张工单的验收标准末尾追加 `- [ ] <判据>（继承自 NN）`。然后照 `idea-loop:wiki-conventions` 的「知识库落地」一次 `commit` 到 home，只列这两张工单，消息 `docs(tickets): <NN> — 落地`。
