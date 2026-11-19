---
type: record
captured: 2026-11-17
title: "retro 候选：起草 spec 时，要改的界面先对照 DESIGN.md 里管它的规则，不合规的写进 spec 让人定范围"
tags: [retro-candidates]
---

> 来自 guohaonan-shy/Tofelair#771 的 retro（2026-11-17）。人批了，去处选「进候选池」。

- 信号：人自己说的方向（第一版 spec 只修失败页文案、写「版式不变」，没发现这张页本身违反 DESIGN.md 的整页失败规则；人看交付截图才指出）
- 落点：idea-loop:to-spec 的「探代码并谈 seam」一步
- 旧文：「没探过就先探，探到 spec 要写的每条现状都能说清在哪、什么时候查的」（没提 DESIGN.md）
- 新文：加一句「要改的界面元素在目标项目 DESIGN.md 里有对应规则的，对照现状核一遍；不合规的写进『问题陈述』，并把要不要一起改写成一道题。」
- 归并：无（「证据是什么」管现状要有出处，不管现状合不合设计规则）
- 验证：回放用例：提交 guohaonan-shy/Tofelair ba7b6e26（第一版 spec）；prompt「/idea-loop:to-spec issue #771：Interview 做题页两处 catch 把 err.message 显示给学生……」；是/否题「spec 是否指出 Interview 失败页不符合 DESIGN.md 的整页失败规则（感叹号图标加大白容器、没有重试）？」改前否
- 例子：Tofelair #771 只修了 Interview 失败页的英文原文，spec 写「版式不变、只换文字」；人看交付截图说黄色感叹号加大白容器「算作ai slop」，要按写作的布局改，同一个 PR 多走了一轮 spec、工单和 review。DESIGN.md 早写了整页失败「illustration, title, one plain sentence, then the actions」。
- 状态：在池里

## 出现

- guohaonan-shy/Tofelair#771（2026-11-17）：「内容没啥问题，我觉的唯一的问题就是那个黄色感叹号icon + 底层有一个巨大的白色容器，这个设计算作ai slop。我在想这两个错误页面是否要按照writing的布局重新设计下？3D 粘土 + 文案 + 按钮？」（看第一版审核报告时）；决定记录：guohaonan-shy/Tofelair `docs/raw/decisions/771.md` 候选 2
