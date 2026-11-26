---
type: record
captured: 2026-11-25
title: "retro 候选：外链候选不论从哪来，卖备考服务的机构一律过滤掉"
tags: [retro-candidates]
---

> 来自 Tofelair#1126 的 retro（2026-11-25）。人批了，去处选「进候选池」。

- 信号：纠正与追问（我从 AI 回答的引用里挑了一个补习班的站推荐开外链 issue），加人自己说的方向
- 落点：插件 `idea-loop:link-prospecting` 的过滤规则；`idea-loop:seo-outreach` 开工时对每个目标站再核一遍
- 旧文：`link-prospecting`：「直接竞品、疑似付费位的拓展目标不列。」没写什么算直接竞品；`seo-outreach` 不核；不经过 link-prospecting 进来的候选（人给的名单、AI 回答里挑的）没人过滤
- 新文：「直接竞品」写清：本身卖托福或同类考试备考服务的机构，包括补习班、课程商、备考平台、一对一辅导，不论它的页面是不是在写工具推荐。这类站不论从哪个入口来（竞品外链档案、SERP、AI 回答的引用、人给的名单），都不进外链候选。`seo-outreach` 开工时对每个目标站再判一次，判出来的记进跟进表「不发」，写明「直接竞品：<它卖什么>」。
- 归并：`link-prospecting`「直接竞品、疑似付费位的拓展目标不列」的加强：规则已有但没起作用，补上定义和不经过它的入口
- 验证：判不了：这次是会话里临时推荐，没走 skill，回放用例复现不了当时的入口
- 例子：#1126 收尾时，我从 12 条 AI 回答的引用里挑出 atlas.com.tw（被引 4 次），推荐开外链 issue；人看了说它是补习班。待核的张力：Tofelair#1124 夜里按推荐把「卖真人一对一 IELTS 课」的 English Coach Online 判为不算直接竞品（`docs/raw/decisions/1124.md` 题 1），跟这里「一对一辅导算直接竞品」对不上，整合时要人定边界
- 状态：在池里

## 出现

- Tofelair#1126（2026-11-25）：「atlas.com.tw 我看了下，是一个补习班，没必要开issue了。这个pr可以合并」（我刚推荐为它开外链 issue）；retro 时：「我觉的核心还是要讲这些网站从外链中过滤出去」；决定记录：Tofelair `docs/raw/decisions/1126.md` 候选 2
