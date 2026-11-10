---
type: adr
status: 生效
tags: [idea-loop, design, ui-archive]
summary: docs/design 分 tmp / prod，prod 是按页面状态建的一张图，设计与验证共用，合并前由归档脚本写入
related: ["[[0002-design-loop-v2-imagine-refine]]", "[[2026-10-23-design-truth-after-freeze]]"]
---

# ADR-0003 — 线上 UI 状态档案：docs/design 分 tmp / prod，设计与验证共用一张状态图

> 由 spec `ui-state-archive` 蒸馏而来，该 spec 已删除。
> 本 ADR 改动 [[0002-design-loop-v2-imagine-refine]] 里 imagine / refine 产物的落点（改到 `docs/design/tmp/<spec-slug>/`）；
> 其中「合并前钩子」与「冻结时写 delta」两处后来又被取代，见 §3 末尾。

## 1 背景（why）

2026-10-16 对 main（idea-loop 0.0.24）和一个用 idea-loop 的真实项目核对，缺三样东西：

1. **想知道某个页面现在长什么样、有哪些状态，没有一处能查。** 设计档案是按 spec 命名的冻结记录，记的是「这次要改成什么样」，不是「线上现在什么样」；同一个报告页的状态散在两份 spec 的记录里，当初否掉的做法也只写在那份 spec 命名的记录里。
2. **冻结画布的进入方式（画布地址加 `?state=`）进不了真实应用。** 到「某一题分析失败」要什么账号、什么数据、拦哪个请求，没有地方记，grill 复现、写测试、review 走流程都要各自重摸。
3. **UI 改动合并后没有任何一步把它写回档案。** 实现偏离画布、review 又改了 UI，档案都不知道；没走设计流程的小 UI 改动完全不进档案。

## 2 决策（how）

- **目录拆两半。** `tmp/<spec-slug>/`（imagine、canvas、delta 三个子目录）放进行中需求的全部过程产物，只在本地、不进 PR；`prod/` 放线上现状，提交。放弃的需求丢画布，有价值的结论写回 spec 或 issue。
- **`prod/` 是一张图。** 节点是页面状态（完整的一屏，组件自己的状态不单独建模）；边写在出发状态里，分用户行为（带 ARIA 角色加名字的定位）和系统行为（写怎么让它发生）两类；跨页跳转也是边。组件按代码组件各存一份，动效、用户路径各一份，用 wikilink 互引，Obsidian 里可以顺着逛。
- **进入方式不手写，从图上推。** 只有入口节点写地址与前置条件，任一状态的进入方式 = 入口到它的最短路径（跳过标了 `blocked` 的边）；进不去又没标 `blocked` 算校验错误。选项是「每个状态各写一份进入步骤」，否掉的理由是它会随画面漂移、漏写本身就是漂移。
- **决定跟着它说的对象走。** 页面、组件、动效、用户路径各有「决定」（为什么、否掉过、来源）和「设计法候选」两节，状态文件不写决定。不另设 notes 文件。
- **读一个查询模块，写只有归档脚本一条路。** 查询原定六个入口（页面、状态、用户路径、需求差异、反查、关键词），外面包命令行和只读 MCP；MCP 声明在插件自己的 `.mcp.json`，目标项目零配置，Codex 不读档案。`prod/` 只由归档脚本在人批过之后写，agent 只写 `delta/`，所以谁也绕不过校验和人审。
- **`delta/` 与 `prod/` 同构**，放改完之后的全文，删除的对象 id 列在 `removed.md`：归档 = 覆盖加删除，需求差异 = 逐对象比对，都不用解析补丁。
- **`prod/` 只存精简矩阵**（每状态一张主视口图、每个有动效处一张 GIF），完整矩阵随 `tmp/` 清掉；素材走 Git LFS，脚本只提示、不代改 `.gitattributes`。
- **UI 审查是一个独立 agent（ui-reviewer）**，既在每轮 pr-review 里拿实现出来的图对冻结的图抓漏，也在合并前对着实现核、通过后重拍素材、起草说明交人审。
- **旧的按 spec 命名的冻结记录不迁**，校验遇到 `tmp/`、`prod/` 以外的目录只打一条「旧布局，建议删」。浏览页不做，人用 Obsidian 逛。

## 3 结果（result）

树上现在是（核对 `origin/main` 92fa448）：

- `idea-loop/skills/design/design-archive/`：图的实体、目录与命名、进入方式推导，加 `references/` 里的写法、校验、查询、归档脚本、拍图、UI 审查归档与对账。
- 脚本：`design-archive.mjs`（解析）、`design-archive-check.mjs`（校验，现为七条规则）、`design-archive-query.mjs`（查询）、`design-archive-write.mjs`（归档，含 LFS 与 `.gitignore` 提示，`--dry-run`）、`design-archive-mcp.mjs`（只读 MCP，`idea-loop/.mcp.json` 里的 `design-archive`）、`flow-compose.mjs` 的状态 id 输入。
- 查询后来多了第七个入口 `affected`（为 dreaming 的增量对账，MCP 工具 `design_affected`）。
- `idea-loop:ui-reviewer` 定义在 `idea-loop/agents/ui-reviewer.md`（sonnet、high），三种模式：每轮走查、归档、对账；`pr-review` 的 `references/ui-walkthrough.md` 与 `merge.md` 的「合并前归档」把它接进流程。
- design-lint 钩子监视 `docs/design/tmp/<spec-slug>/canvas/`，imagine 的方向说明在 `tmp/<spec-slug>/imagine/`，implement / implementer 拿集成 worktree 里 `tmp/<spec-slug>/` 的绝对路径、没有设计稿时在 `delta/` 记最小差异。

**取代线索（本决策里已被后来的决定改掉的两处）：**

- **合并前钩子。** 原定「PreToolUse 挂在 Bash 上，见 `gh pr merge` 且 `tmp/` 非空就拦」。已删（`merge-gate-hook` 脚本及其在 `hooks.json` 里的注册不在了），归档改为 pr-review 合并步骤里的一步；网页上点合并或在别的会话合并会绕过它，由每周 dreaming 的「漏归档」检查兜底。见 [[2026-10-23-design-truth-after-freeze]]，落地在 PR #90（spec `canvas-truth-dreaming-agents`）。
- **冻结时由 designer / refine 写 `delta/`。** 原定冻结时额外写 `delta/`。现改为：冻结之后 `canvas/` 是唯一的设计真相，设计变了由 designer 改画布；`delta/` 只在合并前由 ui-reviewer 归档模式从最终画布加实现整份写出。

其余（图的模型、进入方式推导、只经归档脚本写 `prod/`、`delta/` 同构、精简矩阵）照原样在树上。
