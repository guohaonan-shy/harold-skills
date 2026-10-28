# 03 — issue-session 切完工单、实现之前停下请人压缩

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

issue 会话（`idea-loop:issue-session`）现在把审核、grill、写 spec、切工单、实现、review 放在同一个会话里，进实现时上下文原样带着，编排者每一轮都用 Opus 重读整段审核历史（本机统计：进实现时上下文中位约 23 万 token）。改成在「实现」一节里加一个停点：

- **位置**：to-ticket 切完工单（工单已提交）之后、调 implement 之前。从「审核」或「设计」进实现都走这里。
- **停下要做的**：用 PushNotification 发一句话，然后停下，给人两条要敲的命令：
  1. `/compact 保留 issue #<号>、spec <slug>、当前分支 impl/<slug> 和 worktree 路径、工单已切好；审核和设计阶段的讨论已经写进 spec，不用保留`
  2. `/idea-loop:issue-session <号>`
- **为什么要人敲**：`/compact` 只能人敲，agent 调不了；压缩之后 skill 原文不一定还在上下文里，所以再调起一次 issue-session。它的「开场」读到 issue 是「实现中」、是人直接调的，就照现有规则去「实现」。
- **重新调起后不重切**：「实现」一节写明，spec 的工单目录下已经有工单，就跳过切票，直接调 implement。
- 停点只在进实现前。换到设计、实现合并后关闭、pr-review 开始前都不压缩；人直接敲 `/idea-loop:implement`、不经 issue-session 时也不管。

人的决定（来自 spec）：「进入实现之前一定要compact上下文」，位置是「切分工单之后，实现之前压缩」。

## 验收标准

- [ ] 一个文档检查：issue-session 的「实现」在调 to-ticket 之后、调 implement 之前，有停下请人压缩的一步，给出 `/compact` 和重新调起 issue-session 两条命令；写明工单目录下已有工单时跳过切票。先在改前的文字上看到它失败，再改到通过
- [ ] 重新调起的路径走得通：对着 issue-session「开场」的现有规则核一遍，「实现中」状态、人直接调起时会进「实现」，归位那几步重跑不出错（照文字核对，写进交回的 verified）
- [ ] 插件 README 里描述 issue-session 各阶段的地方提到这个停点
- [ ] issue-session 的 SKILL.md 主体仍在 5000 字以内（按字符数，去掉 frontmatter）
- [ ] 插件全量测试是绿的

## 选中的存量回归

- `session-digest.test.mjs`：它按 `/idea-loop:issue-session <号>` 的形状解析会话记录，这张让人在压缩后重新敲这条命令，形状不能变
