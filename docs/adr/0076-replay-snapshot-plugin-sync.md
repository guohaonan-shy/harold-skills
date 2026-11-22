---
type: adr
status: 生效
tags: [idea-loop, retro, replay, replay-snapshot-plugin-sync]
summary: 回放时把项目快照里被改动的插件文件换成各自这一边的版本，改前改后读到不同的规则；评测材料不换
related: ["[[212]]", "[[0028-retro]]", "[[0052-replay-run-large-now]]"]
---

# ADR-0076 — 规则回放：快照里的插件文件跟着被比对的那一版走

> 由 spec `replay-snapshot-plugin-sync` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

规则回放（见 [[0028-retro]]）把用例提交时的仓库拷两份，一份配主分支的插件（改前）、一份配分支的插件（改后），各跑一遍，再问一道是/否题：改前该答「否」、改后该答「是」。两边靠 `--plugin-dir` 区分，但 harold-skills 自己的用例，被回放的仓库就是这个仓库，快照里本身带一份 `idea-loop/`。13 个用例里 11 个是这样（另 2 个提交不在本仓库，快照里没有插件）。

真实例子（#212）：用例 `writing-branch-by-caller` 的 prompt 写「精简照 `idea-loop:writing-for-agents` 的写法」，agent 没调 Skill，直接读项目目录里快照 `570e135` 的旧 `writing-for-agents/SKILL.md`，跟主分支差 7 行。改前改后读到同一份，两次回放（`20261031T082300`、`20261031T082801`）两边都答「否」。当时的绕法是在 prompt 里加「用 Skill 工具调它，不要去读仓库里的那份文件」，已加了三处，漏一次就是一整轮付费回放；#180 那组工单多跑了 6 次，回放费从估计的 $3–10 涨到 $14.96（issue 原文）。

## 2 决策（how）

- **runner 只换两份插件之间不同的文件**，不整个换掉快照里的 `idea-loop/`。整个换会让 `writing-branch-by-caller`、`writing-prune-references` 失效：它们要 agent 精简的正是快照里超长的旧 `design-archive/SKILL.md`。人在 #212 triage 会话选了「只换被改动文件」（2026-11-16），不走「只在用例写法里要求 prompt 调 Skill」那条（靠人记）。
- 做法：比出改前、改后两份插件之间所有增、改、删的文件；解包快照后、做初始提交之前，若快照里同一相对位置有同名插件（`.claude-plugin/plugin.json` 的 `name` 相同），就把每个文件换成这一边的版本，这一边没有的就删；快照里没有这个插件的用例原样不动。换在提交之前，所以 run 结束列「agent 写了哪些文件」时，换进去的不会被算成 agent 的产出。
- **插件顶层 `evals/` 不换**：夜间 review 第 1 轮发现，规则改动和它的回放用例总是同一个提交加进来，换了它，改后那一遍的项目里会多出判定题和人的原话，回放就证明不了规则改对了。按推荐定（人不在），白天没有推翻。
- 「用到了改动」的核对，把项目里那份插件目录也算作改后插件的位置，Bash 里相对路径读被改动文件也认。
- 代价：快照里的插件目录成了「快照加被改动文件的这一边版本」的混合，跟当时那一刻不完全一样。接受。
- 取舍（没做）：三个用例 prompt 里已有的「用 Skill 工具调」不删（用例输入的改写，另走用例的「prompt 改写记录」）；#275 的线上读取泄漏不在这里修，见 [[0075-replay-gh-isolation]]。

## 3 结果（result）

- `idea-loop/evals/retro/retro-replay.mjs` 有 `pluginDiffOf`（比两份插件，顶层 `evals/` 排除）、`swapPluginFiles`（按这一边的版本写入或删除）、`pluginRelDirOf`；`idea-loop/evals/retro/replay.mjs` 的 `exercisedBy` 接受 `projectRelDirs`。
- 合并在 PR #405（规则回放：快照里的插件文件跟着被比对的那一版走），#212 已关闭；决定记录 [[212]]。
- 守护：`idea-loop/scripts/retro-replay.test.mjs` 里 `pluginDiffOf`、`swapPluginFiles`、`pluginRelDirOf` 的单元测试，以及 e2e：两边各读到自己那一边的版本且未改动文件保持快照、换进去的文件不进产出、快照里没有或是另一个插件时原样解包、`evals/` 永不换入、相对路径读被改动文件算用到；本次对账该文件 78 条全过。
