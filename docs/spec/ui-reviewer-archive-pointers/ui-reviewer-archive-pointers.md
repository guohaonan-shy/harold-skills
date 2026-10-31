---
type: spec
status: 完成
tags: [idea-loop, ui-archive]
summary: ui-reviewer 开工与对账模式用文件路径指向设计档案的分段写法：验证为不存在，已在 design-archive-skill-length 里改成能力名加节名
related: ["[[design-archive-skill-length]]", "[[canvas-truth-dreaming-agents]]"]
issues: [91]
---

# ui-reviewer：开工一节与对账模式用文件路径指向设计档案的分段写法

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #91 | 不存在 | issue 说的两处都已经按能力名加节名指了，随 PR #152（2026-10-28 合并）做掉：开工一节在提交 4e42c73 里从「长页面再读它的 `references/sections.md`」改成「用 Skill 工具调 `idea-loop:design-archive`，看它的『图的实体』『目录与命名』『进入方式从图上推导』，再按它的『按需读』……」；对账模式第 3 步「拍」在提交 6becd9e 里改成照 `idea-loop:design-archive` 的「拍档案截图」的「长页面的入口状态」「段内交互的状态」「滚动驱动的段」「单屏状态」，`sections.md` 本身也在这次删掉了。归档模式那一处是 #55 的 PR #90（提交 ae3927d）改的，issue 已写明。2026-10-31 对着 `origin/main cb11785` 核：`grep -c sections.md idea-loop/agents/ui-reviewer.md` 为 0，整个 `idea-loop/` 下也没有文件再提 `sections.md`；用 `git log -S sections.md -- idea-loop/agents/ui-reviewer.md` 找到上面三个提交，逐个看了它们对这个文件的 diff。ui-reviewer 里还剩一处文件路径（产出发现一节指向 `pr-review` 的 `references/review-standards.md`），指的不是设计档案、跟本 issue 无关；同样写法在 pr-reviewer、uiux-researcher、各 seo 方向 agent 等十来个 agent 定义里都有，算不算违反 writing-for-agents「引用另一个 skill」那条，不在本 issue 里判。 |

## 关联

- 覆盖的 issue：#91 idea-loop ui-reviewer：开工一节与对账模式仍用文件路径指向设计档案的分段写法
- 做掉它的 spec：[[design-archive-skill-length]]，PR #152；归档模式那处由 [[canvas-truth-dreaming-agents]] 的 PR #90 改
- 相邻还没完成的：#61、#184 长页面的可引用分段，#69 加载中入口的分段，#128 窄侧栏被认成滚动驱动，#192 浏览器测试在本机卡住，都改的是设计档案的分段脚本或规则本身，不碰 ui-reviewer 怎么指向它，无重叠
