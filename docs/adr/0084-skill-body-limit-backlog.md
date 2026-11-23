---
type: adr
status: 生效
tags: [idea-loop, skill-writing, pr-review, design-modeling, skill-body-limit-backlog]
summary: design-modeling 与 pr-review 两份 SKILL.md 把部分运行才走到的分支挪进 references 压回 5000 字，字数测试守回 5000
related: ["[[0059-test-layering-ci-full]]", "[[0009-design-archive-skill-length]]", "[[137]]", "[[2026-11-16-issue-137-scope]]"]
---

# ADR-0084 — idea-loop 两份 SKILL.md 主体压回 5000 字：挪，不删

> 由 spec `skill-body-limit-backlog` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`AGENTS.md`「标准 plugin 目录结构」和 `REVIEW.md`「额外要求」都规定 SKILL.md 主体（去掉 frontmatter，用 `LC_ALL=en_US.UTF-8 wc -m` 数字符）< 5000 字。2026-11-16 对着 origin/main `a032e45` 重量，idea-loop 里超线的是 `skills/design/design-modeling/SKILL.md`（5485）和 `skills/engineering/pr-review/SKILL.md`（5108）；wiki-conventions（7854）归 #302，别的插件的 thumbnail-gen（15224）、daily-coffee-oracle（13064）人定这次不动。

超线的代价是每次调用都把只有部分运行才走到的内容读进上下文。例：design-modeling 的「一次写入怎么走」只有真写 `DESIGN.md` 的运行走到，但 uiux-refine、ui-reviewer 只为写一条设计法候选调它，也要读这一节。

字数测试守的也不是 5000：`pr-review-slim-doc.test.mjs` 的上限是 5108（#303 为了恢复被压掉的原句，把「< 5000」改成「不比 5108 长」，见 [[0059-test-layering-ci-full]]）；`implement-replay-large-doc.test.mjs` 还有一条「implement 不比 9589 字长」，implement 已压到 4874 并由别的测试守，这条没有约束力。

## 2 决策（how）

决定记录 [[137]]、[[2026-11-16-issue-137-scope]]：#137 原本被评论扩成「按写法规则重写全部 skill、脚本收成命令行工具、加结构检查」，人拆开，字数存量留在 #137，其余拆成 #339、#340、#341 随 0.2.0；并说「只修改idea-loop下面的」。

- **挪，不删，不改写**：只有部分分支走到的内容原样搬进该 skill 自己的 `references/`（每份参考资料归一个 skill），主文件在原处留一句以触发条件开头的指针；依据是 #304 第 1 轮把「删句子凑字数」打回过。要顺手改写的开 issue（#340）。
- **被别处按小节名点到的小节保留标题**：pr-review 的「设计变更」（约 299 字）挪进 `references/design-change.md`；design-modeling 的「一次写入怎么走」（约 753 字）挪进 `references/write.md`；dreaming、design-steward、uiux-imagine、design-change-sync 等调用方不用改。
- **字数测试收回 5000**：pr-review 的上限改回 < 5000，旧「棘轮」措辞去掉；implement 的 9589 旧断言删掉；design-modeling 新加一条文档测试。
- 版本升 patch（内容只换位置、行为不变）；`idea-loop/README.md` 里写这两个 skill 文件布局的同步加上新参考文件。

取舍（没做）：不重写内容（#340）、不把脚本收成命令行工具（#339）、不做全仓库字数棘轮（#341）；thumbnail-gen、daily-coffee-oracle 留作已知存量，仍超 5000。人在审 PR 时另提的 design-modeling 开头与「结构」重排（hook 已自动做的事不再复述）在同一 PR 里做了，此项决定见 [[137]] 题 4。

## 3 结果（result）

- `idea-loop/skills/design/design-modeling/references/write.md` 与 `idea-loop/skills/engineering/pr-review/references/design-change.md` 存在，两份 SKILL.md 的对应小节只剩指针；2026-11-22 重量主体 design-modeling 4661、pr-review 4989（对着 c2b43c34）。`idea-loop/README.md` 文件布局列了这两个参考文件。
- 合并在 PR #373（idea-loop 两份 SKILL.md 主体压回 5000 字）；issue #137 已 CLOSED（2026-11-18）；决定记录 [[137]]。
- 守护：`idea-loop/scripts/pr-review-slim-doc.test.mjs`（主体 < 5000、「设计变更」指向参考文件）、`idea-loop/scripts/design-modeling-slim-doc.test.mjs`（主体 < 5000、小节标题与指针在、参考文件里有备份 / lint / diff 三步）、`idea-loop/scripts/design-change-final-version-doc.test.mjs`（pr-review 的设计变更拼上参考文件再测）；`implement-replay-large-doc.test.mjs` 里 9589 那条已无。
