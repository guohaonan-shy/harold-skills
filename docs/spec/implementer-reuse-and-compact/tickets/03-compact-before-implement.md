# 03 — issue-session 切完工单、实现之前停下请人压缩

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

issue 会话（`idea-loop:issue-session`）现在把审核、grill、写 spec、切工单、实现、review 放在同一个会话里，进实现时上下文原样带着，编排者每一轮都用 Opus 重读整段审核历史（本机统计：进实现时上下文中位约 23 万 token）。改成在「实现」一节里加一个停点：

- **位置**：to-ticket 切完工单（工单已提交）之后、调 implement 之前。从「审核」或「设计」进实现都走这里。
- **停下要做的**：用 PushNotification 发一句话，然后停下，打出一条填好的压缩指令给人复制执行，再请人说一句「继续」。指令是写在 issue-session 里的一份通用模板，停下时把 `<号>`、`<slug>`、`<绝对路径>` 换成这一次的值。模板原文（照抄进 issue-session）：

  ```
  /compact 下一步：在这个 issue 会话里调 idea-loop:implement <slug>。保留：issue #<号>（及同一份 spec 覆盖的其它号）、spec docs/spec/<slug>/、工单已切好在它的 tickets/ 下、当前分支 impl/<slug>、worktree <绝对路径>；本会话跑的是 idea-loop:issue-session，实现 PR 合并后去它的「换阶段」；还没写进 spec 或工单的人的决定，原话逐条保留。丢掉：审核、grill、设计阶段的讨论过程，复现和查询的输出，工具调用的原始记录。
  ```

- **为什么要人敲、为什么说「继续」就够**：`/compact` 只能人敲，agent 调不了，压缩也不会开启新的一轮，所以要人说一句话。压缩后 Claude Code 会把会话里调过的 skill 原文挂回来（`invoked_skills` 附件），issue-session 的规则还在，不用再调一次。
- **重敲 issue-session 也不出错**：万一人重敲了 `/idea-loop:issue-session <号>`，它的「开场」读到 issue 是「实现中」、是人直接调的，照现有规则去「实现」；「实现」一节写明 spec 的工单目录下已经有工单就跳过切票，直接调 implement。
- 停点只在进实现前。换到设计、实现合并后关闭、pr-review 开始前都不压缩；人直接敲 `/idea-loop:implement`、不经 issue-session 时也不管。

人的决定（来自 spec）：「进入实现之前一定要compact上下文」，位置是「切分工单之后，实现之前压缩」。

> 人的决定（2026-10-29）：「03 我同意B，但我建议在这个PR里面修复」——B 指：把「提交工单」写进 `idea-loop:to-ticket` 自己的落盘一步（人直接调 to-ticket 也覆盖），issue-session「实现」第 1 步里「并把工单提交进当前分支」那句删掉，在这个 PR 里做。

> 人的决定（2026-10-30）：撤掉压缩。#165 的会话里人定了「实现一律放在子会话里」，转来后人在本会话选「照做，撤掉」「to-ticket 提交工单：保留」「#153：drop」。

## 验收标准

- [x] 一个文档检查：issue-session 的「实现」在调 to-ticket 之后、调 implement 之前，有停下请人压缩的一步：打出填好的压缩指令（模板写在 issue-session 里，含「下一步」「保留」「丢掉」三部分），请人执行后说「继续」；写明工单目录下已有工单时跳过切票。先在改前的文字上看到它失败，再改到通过（后来改了：2026-10-30 人决定撤掉压缩，压缩停点与模板已删，见最后一格；跳过切票保留）
- [x] 人重敲 issue-session 的路径也走得通：对着 issue-session「开场」的现有规则核一遍，「实现中」状态、人直接调起时会进「实现」，归位那几步重跑不出错（照文字核对，写进交回的 verified）
- [x] 插件 README 里描述 issue-session 各阶段的地方提到这个停点
- [x] issue-session 的 SKILL.md 主体仍在 5000 字以内（按字符数，去掉 frontmatter）
- [x] 插件全量测试是绿的
- [x] 人的决定（2026-10-29）：to-ticket 的「落盘」写明人点头、工单全部落盘、spec 翻成「实现中」之后，把工单和 spec 的改动提交进当前分支（执行方的 worktree 从这条分支切出，不提交就读不到）；issue-session「实现」第 1 步不再自己写提交，只调 to-ticket。文档检查覆盖这两处（先在当前文字上看到它失败）；README 里 to-ticket 的描述如提到落盘就同步；插件全量测试是绿的
- [x] review 第 1 轮 C2（2026-10-30）：issue-session「实现」的「做」那一步，开始实现和接 review 两处都写成「用 Skill 工具调 `<插件>:<名字>`」（规则原文同上：「要 agent 当场用上另一个 skill：写『用 Skill 工具调 <插件>:<名字>』」）；照抄进 issue-session 的压缩指令模板原文不动
- [x] 人的决定（2026-10-30）：撤掉进实现前的压缩停点——issue-session「实现」里停下、发通知、打出压缩指令模板、等人说「继续」的那一步与模板原文都删掉，回到切工单（已有工单就跳过）后直接用 Skill 工具调 `idea-loop:implement`；README 里提压缩停点的那句删掉；对应的文档检查断言删掉或改成断言「实现」里没有压缩停点。保留：to-ticket 落盘后提交工单与 spec、issue-session 不自己提交、已有工单跳过切票、「做」一步的「用 Skill 工具调」写法。插件全量测试绿

## 选中的存量回归

- `session-digest.test.mjs`：它按 `/idea-loop:issue-session <号>` 的形状解析会话记录；这张改了 issue-session 的「实现」，人重敲这条命令时形状不能变
