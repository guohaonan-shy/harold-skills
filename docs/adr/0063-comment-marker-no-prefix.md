---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, comments, comment-marker-no-prefix]
summary: idea-loop 发的评论去掉「🤖 idea-loop：」开头与「由 Claude 代发」署名，脚本改认隐藏标记
related: ["[[296]]", "[[2026-11-18-comment-writing-grill]]"]
---

# ADR-0063 — idea-loop 发的评论不再带机器开头，脚本改认隐藏标记

> 由 spec `comment-marker-no-prefix` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#296。idea-loop 往 GitHub 发的评论，读到的第一样东西是「🤖 idea-loop：」（`issues.mjs` 发的），或合并时贴的 review 归档评论开头的「由 Claude 代发」一行（`review-loop.mjs` 在没配 GitHub App 时加的）。团队成员要先读过它和分支路径，才看到要他做什么。2026-11-18 查本仓库最近 100 条 issue / PR 评论：65 条带前者、34 条带后者。真实例子是 #327 里要人定一道题的那条评论：先是「🤖 idea-loop：」、分支名、spec 路径，才是「要人定一题」。人在 #296 的 triage 会话里说开头那句不需要了、给团队其他成员看差点意思，又说「我倾向于不署名」。

前缀不只是装饰：脚本靠它认出 idea-loop 自己的评论（调度判断 backlog issue 是否「还要你补」，只认带前缀、含「还要你补」的那条），issue 会话开场也靠「读最近一条『🤖 idea-loop：』开头的评论」知道上次停在哪、分支叫什么。去掉前缀得先换一种认法。

评论正文该怎么写（第一句写结论和要他做什么、发出后变了另发新的），人定为个人的规矩，写进 home 的 `AGENTS.md`，idea-loop 不放表达方式的内容；这份只管挡在那条规矩前面的机械部分。

## 2 决策（how）

- **写**：`issues.mjs` 发的每条评论（`issues set --comment`、`issues note`、`issues migrate` 补的评论），正文最前面单独一行放 `<!-- idea-loop -->`（GitHub 渲染 markdown 时不显示 HTML 注释；归档评论本来就用 `<!-- idea-loop-archive … -->` 这么做）。传进来的文字已带旧前缀的，先去前缀再加标记，已带标记的不重复加。标记字符串在 `issues.mjs` 定义一处，别的脚本和测试从那里引。
- **认**：一个函数判断「是不是 idea-loop 发的」：含标记，或以旧前缀开头。旧前缀一直认、不设截止日期：已发出去的评论不改（人定「旧的评论不用管」），开着的 issue 上分拣贴的「还要你补」评论都还是旧前缀。
- **读**：skill 里写「最近一条『🤖 idea-loop：』开头的评论」的地方，改成「带标记（或旧前缀）的」。
- **不署名**：`review-loop.mjs` 不论有没有配 GitHub App 都不再加「由 Claude 代发」，`withAuthorship` 分支删掉；配了 App 的由 bot 账号发，没配的用 gh 当前账号发。根目录 `AGENTS.md` 的 idea-loop 刻意例外第 2 条同步改成「不加署名」；`implement`、`pr-review` 里「PR 上不以人的身份发言」改成「PR 上不和人往来」，保留原意（不在 PR 上开 thread、不替人答题）。

取舍（没做）：

- Linear 上的评论（agent 直接用 MCP 的 `save_comment` 发）只去前缀、不加标记：Linear 没有脚本读评论，agent 读最近几条内容就能接上，`<!-- -->` 在 Linear 里会不会原样显示没验证过。
- `pr-body.mjs`（PR 描述）、setup 生成的 `ISSUE_TRACKER.md` 评论命令模板：本来就没有前缀，不改。
- 已经发出去的评论、ADR 里提到旧前缀的历史描述：不回头改。

## 3 结果（result）

- 代码：`idea-loop/scripts/issues.mjs` 导出 `AI_MARKER`（`<!-- idea-loop -->`）与 `isIdeaLoopComment`，「还要你补」的判断（`asksForMore`）改用后者；`idea-loop/scripts/review-loop.mjs` 的 `archiveBody` 不含「由 Claude 代发」。
- 文字：`issue-session` 的认领与起草、`draft-spec.md`、`issue-dispatch` 早上汇总、`issues` 的 `references/github.md`、`issue-triager` agent 定义等引用旧前缀的地方，已改成认标记并保留「（或旧前缀）」的说法；`AGENTS.md` 第 2 条例外已是「不加署名（人 2026-11-18 在 #296 定）」。
- 合并在 PR #411（idea-loop 发的评论不再带机器开头）；issue #296 已 CLOSED（2026-11-20）。决定记录 [[296]]；讨论素材 [[2026-11-18-comment-writing-grill]]。
- 守护：`idea-loop/scripts/comment-marker-doc.test.mjs`（旧前缀只写在认它的地方、不再出现「由 Claude 代发」与「以人的身份」、各读评论处点名标记）、`idea-loop/scripts/issues.test.mjs`（新发评论以标记开头且只一次、新旧两种「还要你补」都被认出、`isIdeaLoopComment`）、`idea-loop/scripts/review-loop.test.mjs`（归档正文无「由 Claude 代发」）。
- 未验：合并后在 GitHub 上打开一条新评论、看渲染出来第一行是正文，spec 定为人看一眼、不写成测试。
