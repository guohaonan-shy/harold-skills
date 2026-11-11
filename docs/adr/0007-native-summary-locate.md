---
type: adr
status: 生效
tags: [idea-loop, ui-archive, sections]
summary: 原生折叠标题按角色定位不到：边的 locate 兜底写 { text }，测量把按角色找不到的可点元素单列出来
related: ["[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0007 — 设计档案：原生折叠控件按角色定位不到

> 由 spec `native-summary-locate` 蒸馏而来，该 spec 已删除。
> 这份 spec 本身只是一次验证：它判定 issue #64 的两个诉求已经在 ADR-0004（`design-archive-sections`）的试跑后决定里做掉，没有新增实现。

## 1 背景（why）

设计档案里的边用 ARIA 角色加名字定位元素。原生 `<summary>`（FAQ 折叠标题）按角色找不到，于是「点开 FAQ」写不成边；分段测量也没有办法说「这个可点元素按角色找不到」。issue #64 要求这两件事。

## 2 决策（how）

- **边的 `locate` 允许写成只有 `{ text: <完整文字> }`**，只在按角色加名字定位不到时才用，不与 `role` / `name` 混写；校验拒绝空文字和混写。选项之一是对 `{ text }` 另外打「比较脆」的提示，没做：规则已经用「只在角色定位不到时用」限定了它。
- **测量如实标出**：分段测量给每个可点元素带 `byRole`，找不到的是 `byRole: false` 并带 `textMatches`（按完整文字找到几处）；归属结果把它们单列为 `roleUnresolved`，命令行另打一行提示。
- 这两件事是在 ADR-0004 的试跑后决定里（人审过后）一并做的，所以 #64 没有独立实现；issue 以 NOT_PLANNED 关闭，实际是被并入那份 spec。

## 3 结果（result）

- 校验在 `idea-loop/scripts/design-archive-check.mjs` 里接受 `locate: { text }`、拒绝空文字与混写；`design-archive` skill 的 `references/writing.md` 写明这条边规则。
- `idea-loop/scripts/design-archive-sections.mjs` 的测量带 `byRole` / `textMatches`，`attribute` 输出 `roleUnresolved`；`design-archive-sections-browser.test.mjs` 有用原生 `<summary>` 页面的用例（断言它进 `roleUnresolved`、`textMatches` 为 1）。
