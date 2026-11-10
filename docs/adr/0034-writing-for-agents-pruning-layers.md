---
type: adr
status: 生效
tags: [idea-loop, writing-for-agents]
summary: 改 agent 文档先诊断；分支按调用方要的东西切；参考同样剪枝；通用文档不带项目信息；retro 候选写明怎么验证
related: ["[[2026-10-31-writing-for-agents-scope-grill]]", "[[2026-10-27-design-archive-skill-length-grill]]"]
---

# ADR-0034 — writing-for-agents：先诊断、按实体组织、参考同样剪枝、通用文档不带项目信息

> 由 spec `writing-for-agents-pruning-layers` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

- `design-archive` 的 SKILL.md 超长（#125）：起草方只探代码，不先诊断文档本身，第一版 spec 按文档的操作切分支，把节点和边的定义切进写对象的参考里，spec 为此重写了两次。
- 脚本参考大半在复述内部实现，剪过的参考第二天又长回去；当时插件里 90 份参考有 20 份超 5000 字。
- 13 个 agent 定义按完整路径读起它的 skill 的参考，实测全部合规，但 `writing-for-agents` 只写了 skill 之间的情形，读到它的人会以为违规（#198）；且没有检查守这些路径。
- 通用文档里写进了某个项目的例子：一天两次同样的纠正。
- retro 候选没有一栏回答「怎么知道这条改完管用」。

## 2 决策（how）

- **`to-spec` 在改 agent 文档时先调 `writing-for-agents` 逐条诊断、列调用方清单，方案从这两样推出，每处改动标明对的哪条杠杆**（#154）。
- **改写已有原则，不另加新条**（遵循「剪枝」里「先归并」）：
  - 「信息层级」：分支按调用方要的东西切，不按文档的操作切；讲数据模型的文档，实体、关联、字段读写共用、每个分支都要，命令行与只在写文件时才要的格式进对应的参考（#155）。
  - 「剪枝」的环境一条与沉积一条：外置的参考同样算缓存，脚本参考只写调用方要照做的、要处理的、靠看找不到的；参考不受主体篇幅约束，最容易沉积（#156）。
  - 「剪枝」的相关性一条：按文档会被读到的范围算。会在多个项目里读到的（插件的 skill、agent、参考，用户级 `~/.claude/CLAUDE.md`）不带任何项目信息，项目级的才带。
- **agent 读起它的 skill 的参考，按插件根下的完整路径写，合规，不改 agent 定义**；用检查守路径（#198）。
- **不给参考定字数上限**：#156 要的是剪枝判断，不是阈值。
- **retro 候选加「验证」一栏**：回放用例三样、检查名（先在历史错误上看它红），写不出的写「判不了」和原因。
- 插件里现有的项目例子（`to-spec` 的 User Story 示例、`glossary` 的术语示例）换成通用的；仓库根 `AGENTS.md` 改成「插件里不出现任何项目的信息」。

## 3 结果（result）

- `to-spec` 的「探代码并谈 seam」一步已写入诊断要求；`writing-for-agents` 的 SKILL.md 与 `SKILL-MECHANICS.md`（「引用另一个 skill」加了 skill 起的 subagent 读参考的情形）已按上改写；`retro` 候选格式有「验证」一栏。
- 检查：`skill-private-references.test.mjs` 扩到 `agents/`（路径存在，且读的是起它的 skill 的参考）；`no-project-leak.test.mjs` 守插件文本不带项目信息；另有各规则的文本 tripwire（如 `writing-for-agents-scope-doc`、`to-spec-diagnose-agent-docs-doc`、`retro-candidate-verify-doc`）。
- 回放用例 `writing-branch-by-caller`、`writing-prune-references`、`writing-no-project-info`、`to-spec-diagnose-agent-docs`、`retro-candidate-verify` 各守一条规则。
- 现有超 5000 字的参考本次未逐份剪，留待以后改到它们时按新规则做。
