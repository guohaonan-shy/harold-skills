---
type: spec
status: 完成
tags: [idea-loop, ui-archive]
summary: 原生折叠标题按角色定位不到、FAQ 展开写不成边：验证为不存在，已在 design-archive-sections 里做掉
related: ["[[design-archive-sections]]"]
issues: [64]
---

# 设计档案：原生折叠控件按角色定位不到

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #64 | 不存在 | issue 要的两件事已经并进 [[design-archive-sections]] 的「定位的兜底写法（I09）」，随 PR #67（2026-10-21 合并，插件 0.0.29）做掉了。① 写得成边：边的 `locate` 允许只写 `{ text: <完整文字> }`，只在按角色 + 名字定位不到时用，不跟 `role` / `name` 混写；档案校验认这种写法、拒绝空文字和混写，设计档案 skill 的边规则写明了这条，查询推出的进入步骤原样带出这个 `locate`。② 归属结果如实标出：分段测量给每个可点元素带 `byRole`，按角色找不到的是 `byRole: false` 并带 `textMatches`（按完整文字找到几个），归属结果把它们单列在 `roleUnresolved`，命令行另打一行提示。2026-10-26 对着 `origin/main 1444794` 跑了分段与校验的测试（106 个全过，真浏览器测试没有跳过）：其中一条用原生 `<summary>` 页面，断言它进 `roleUnresolved`、`textMatches` 为 1；校验测试断言 `locate: { text }` 通过、混写和空文字不通过。2026-10-21 第二轮试跑里营销站三处 FAQ 的展开边都按 `locate: { text }` 写成，`state mkt-pricing--faq-open` 推出的步骤照走找得到元素。没做的只有 issue「可能的方向」里的一个选项：校验对 `{ text }` 定位不额外打「比较脆」的提示；规则用「只在角色定位不到时用」限定了它，issue 的问题不依赖这条提示。 |

## 关联

- 覆盖的 issue：#64 idea-loop 设计档案：原生折叠控件（summary）按角色定位不到，FAQ 展开写不成边
- 做掉它的 spec：[[design-archive-sections]]（实现中，覆盖 #61），PR #67
- 相邻还没完成的：#61 长页面的可引用分段（同一份 spec，本 issue 不重叠，不分先后）；#65 拍不稳的段怎么稳定取证、#68 内层容器滚动的页面量不到首屏以下，都是分段脚本的别的问题，跟定位无关，无重叠
