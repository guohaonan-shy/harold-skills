---
type: spec
status: 正式
tags: [idea-loop, design-archive, skill-length]
summary: design-archive 的 SKILL.md 主体按字符数 11386，超 5000：主体只讲图的实体，命令与写法走 references
related: ["[[2026-10-27-design-archive-skill-length-grill]]", "[[dreaming-skill-length]]", "[[retro-skill-length]]"]
issues: [125]
---

# design-archive：SKILL.md 主体超过 5000 字的上限

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #125 idea-loop design-archive：SKILL.md 主体约 2.1 万字，超过 5000 字的上限 | 存在 | 去掉 frontmatter 后主体按字符数 11386，是上限的 2.3 倍；详情在「问题」 |

## 问题

### 1. 只走一个分支的调用方，也要读完 1.1 万字

2026-10-27 对着 `origin/main 37a76b5` 量 `idea-loop/skills/design/design-archive/SKILL.md`，量法跟 [[dreaming-skill-length]] 相同（按 UTF-8 读、去掉 frontmatter 后数字符）：

| 量法 | 结果 |
|---|---|
| C locale 下 `wc -m`（issue 用的） | 21626（这是字节数） |
| `LC_ALL=en_US.UTF-8 wc -m`，整份文件 | 11494 |
| 去掉 frontmatter 的主体，按字符数 | **11386** |
| 主体里的汉字 + 英文词 | 约 5200 |

没有一种说得通的「字」的读法会让它落在 5000 以内。规则原文：仓库 `AGENTS.md`「SKILL.md 主体保持精简（< 5000 字），把长篇领域知识、真实案例放 `skills/<name>/references/`」，`REVIEW.md` 同写。

主体按节分（字符数）：

| 节 | 字符 | 谁要读 |
|---|---|---|
| 图的模型 | 1267 | 所有调用方 |
| 建模的取舍 | 769 | 只有写档案对象的（implementer、ui-reviewer 归档模式、dreaming 初扫） |
| 目录与分工 | 2020 | 所有调用方；其中 `tmp/` 的生命周期一段跟 `idea-loop:wiki-conventions`「目录」的 `design/` 两层重复 |
| frontmatter | 3122 | 只有写档案对象的 |
| 正文 | 488 | 只有写档案对象的 |
| 进入方式从图上推导 | 348 | 所有调用方 |
| 校验 | 1339 | 写档案对象的读命令与「写完 `delta/` 的标志」；逐条规则表只在校验报错要看懂时读 |
| 查询模块 | 1200 | 读档案的（dreaming 对账、design-steward、implementer 复现） |
| 归档 | 733 | 只有 pr-review 合并前、ui-reviewer 自检 |

只读档案的调用方（dreaming 的对账、design-steward「查询档案对象」）每次要带上 3122 字的 frontmatter 字段表和 769 字的建模取舍，它们用不到；写档案对象的调用方要带上查询每个入口的返回说明，同样用不到。照 `idea-loop:writing-for-agents`「信息层级」：每个分支都需要的内联，只有部分分支走到的放到指针后面。现在这份文件把几个分支的参考全放在顶层，是那里说的蔓延。

### 根因

这份 skill 是设计档案几个 spec（[[ui-state-archive]]、[[design-archive-sections]]、[[design-archive-unstable-sections]] 等）一层层加出来的，每次加的都是新字段、新规则，加进了主体；只有分段一块当时挪进了 `references/sections.md`。

修正：issue 原先认为主体约 21700 字，实测 21626 是 C locale 下 `wc -m` 数的字节数，按字符数是 11386。仍然超了，只是超的幅度是 issue 说的一半。

## 方案

精简后，`design-archive` 的主体把**图的实体和它们之间的关联**描述清楚：读档案和写档案面对的是同一组对象，这一部分只写一处，两边都用。主体里另外只有目录与命名、进入方式怎么从图上推导，和一张按需读的指针表；校验、查询、归档的命令行，以及写对象文件的格式细节，各走对应的 `references/`，渐进披露。规则一条不改：字段名、规则编号、命令、选项、退出码都不改。

主体：

- **开头**：档案是什么，加一个引导词「派生」：档案只写源头（页面、状态、边、组件、动效、用户路径），进入方式、`usedBy`、`prod/index.md` 的清单、截图都是派生物，由脚本或查询算，不手写。原来这条规则分在四处、四种说法。
- **图的实体**：每种实体一小节，写它是什么、跟谁关联、挂哪些字段（字段名点到为止）。实体：页面、状态（节点；入口节点）、边（`user` / `system` 两类，条件 `when`，走不通的 `blocked`，跨页跳转也是边）、分段（不是节点，一句话加指针）、组件、动效、用户路径；再加档案组件与 `DESIGN.md` 基础件是两层。同一个概念的定义、关联、字段放在同一个小节里（`writing-for-agents` 的「就近归置」）：`blocked` 现在散在 8 处，`usedBy` 散在 4 处，改完各只在自己的实体下定义一次。
- **目录与命名**：`prod/` 的目录树、状态文件名带页面前缀、组件文件名带工作区前缀、basename 全局唯一、`delta/` 与 `prod/` 同构（`removed.md`）、`prod/` 只由归档脚本写（只说这一次）。`tmp/<spec-slug>/` 的生命周期只留一句指向 `idea-loop:wiki-conventions` 的「目录」；只属于 `delta/` 的两条（冻结后 `canvas/` 是设计真相，没有设计稿时 `delta/` 的最小差异就是唯一的设计真相）留在这里。
- **进入方式从图上推导**：原样。
- **按需读**：一张表，每行一个分支、什么时候读、读哪份：

  | 什么时候 | 读 |
  |---|---|
  | 写一个对象文件：完整的 frontmatter 示例、正文的固定小节、决定的写法、建模的取舍、截图矩阵与 `prod/index.md` 的设置键 | 新的 references 文件 |
  | 长页面的分段 | `references/sections.md`（不动） |
  | 查档案 | MCP 工具 `design_*`，用法以工具的 description 为准；命令行同名，退出码与返回字段在 `references/query.md` |
  | 校验：命令、退出码、规则表、「写完 `delta/` 的标志」 | 新的 `references/check.md` |
  | 归档：命令、退出码、谁在什么时候跑、脚本做了什么 | `references/archive-script.md` |

删的只有两类，PR 描述里逐条写去处或理由：在别处已有单一事实来源的（`tmp/` 生命周期与 `research/` 不归档 → wiki-conventions；查询七个入口的表 → MCP 工具的 description 与 `--help`；`prod/` 只由脚本写的另外三遍；校验规则 0 重抄的必填字段 → 改成指向字段所在处），和照 `idea-loop:writing-for-agents`「剪枝」判为空操作的。归档一节末尾「网页上点合并会绕过归档」的已知缺口是合并方的事，挪进 `idea-loop:pr-review` 合并参考，那里已有就删。

同一行为的其他入口（按名字和节名指到这份 skill 的地方），逐个处理：

| 入口 | 现在指的 | 处置 |
|---|---|---|
| implementer 定义「写档案」 | 「目录与分工」到「进入方式从图上推导」 | 纳入：改成指新的节名（图的实体、目录与命名、进入方式），写对象时顺指针读写法 |
| ui-reviewer 定义「开工」 | 目录、frontmatter、正文、进入方式、查询、归档 | 纳入：改成新的节名 |
| dreaming `references/initial-scan.md` | 目录、frontmatter、正文、进入方式；另外重抄了「入口是加载中」 | 纳入：改成新的节名，重抄的一句改成指针 |
| dreaming `references/archive-reconcile.md` | 「目录与分工」「进入方式从图上推导」「查询模块」 | 纳入：改成新的节名 |
| `idea-loop:wiki-conventions`「frontmatter」 | design-archive 的「frontmatter」 | 纳入：改成「图的实体」 |
| uiux-refine `references/design/motion-protocol.md` | 「sections frontmatter and 正文」 | 纳入：改成「图的实体」 |
| design-steward 定义 | 只点名 skill（查询档案对象） | 不改 |
| ui-reviewer 归档模式、ui-measure | 「长页面的分段」「拍图：分段脚本」（`references/sections.md` 的标题） | 不动 `sections.md`，不改 |
| design-modeling 准入分层表 | 档案对象的「决定」 | 不改 |

## User Stories

1. 期望行为（对应问题 1）：`idea-loop:design-archive` 的 SKILL.md 去掉 frontmatter 后按字符数少于 5000；调用方读完主体就知道图里有哪些实体、怎么关联，要写对象、校验、查询、归档时各自只沿一个指针读到那份参考；原来主体里的每条规则都还能在主体或它的 `references/` 里找到，删掉的有去处。

## 实现决策

- **量法**：去掉 frontmatter 后按 UTF-8 数字符。依据：[[dreaming-skill-length]] 与 [[retro-skill-length]] 已经这样量，并写明 design-archive 按这个量法确实超了。规则怎么写明量法归 #132，本 spec 不改 `AGENTS.md` / `REVIEW.md`。
- **主体以图的实体为中心，读写共用一处**。依据：人的原话「写档案和读档案的对象不是一个吗？我倾向于将节点、边关联以及图实体描述清楚就行」。取代起草时「按写对象 / 读档案 / 归档三个分支拆」的做法：那样会把实体的定义切到写对象的参考里，读档案的调用方看不懂查询返回的 `blocked`、「进不去」。
- **命令行全部外置**。依据：人的原话「校验和归档其实都是一些命令行，不同分支的内容走对应的 reference，渐进式纰漏即可」。主体对校验、查询、归档各只留一行「什么时候、读哪份」。
- **写对象文件的格式细节外置成一份**：完整的 frontmatter 示例、字段的必填规则、正文固定小节、决定的写法、建模的取舍、截图矩阵与 `prod/index.md` 设置键。它们只在写一个文件时要，且总是一起要（`writing-for-agents`「信息层级」：只有部分分支走到的放到指针后面）。主体里实体的字段名点到为止，必填规则在这一份。
- **查询以 MCP 工具的 description 为单一事实来源**。依据：插件的 MCP server 给七个工具都写了「查什么」和「什么时候用」，server 的 instructions 常驻；主体里那张七个入口的表是第三份副本（另两份是 description 与 `design-archive-query.mjs --help`）。
- **引导词「派生」**：定义一次，进入方式、`usedBy`、`prod/index.md`、截图四处挂它。
- **节名就是契约**：外部入口按节名指过来，主体的新节名（图的实体、目录与命名、进入方式从图上推导、按需读）定了之后，上表纳入的入口同一个 PR 里改掉。`references/sections.md` 的标题「长页面的分段」「拍图：分段脚本」不动，两条已有的文档测试钉着它们。
- **规则不改，删句逐条交代**：字段名、规则编号、命令、选项、退出码不改；删掉的每一句，PR 描述里写去处或删的理由，让 review 能对着旧文逐句核。

## 技术方案总览

### 后端

不涉及

### 前端内部

不涉及

### 前端交互

不涉及

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：文档测试（node:test 读 md），见下 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：规则不变，只换位置 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：插件 `scripts/` 下的文档测试（node:test 读 skill 与 agent 的 md）。能抓到：主体超长、外部入口指向不存在的节名、`sections.md` 的两个标题被动了；漏掉：挪动时措辞改坏了意思，这一半靠 review 对着旧文逐句核。
- **增量功能测试**：
  - 一条文档测试：design-archive 的 SKILL.md 去掉 frontmatter 后字符数 < 5000。先在主分支上看到它红（11386），再变绿。
  - 一条文档测试：skills 与 agents 里每一处「`idea-loop:design-archive` 的「X」」，X 都是这份 SKILL.md 的一个标题，或它 `references/` 下某份文件的一个标题。先在改了节名、没改入口时看到它红。
  - 现有的 `ui-reviewer-archive-doc`、`design-archive-sections-doc`、`skill-private-references` 测试照旧全过。
  - review 时对照：旧主体的每一节在新主体或哪份 references 里，删掉的句子在 PR 描述里有去处或理由。
- **prompt / eval 变动**：无 prompt/eval 变动。
- **照着谁写**：`ui-reviewer-archive-doc.test.mjs`（按节名取文档、断言指针）、`design-archive-sections-doc.test.mjs`（扫 skills 与 agents 下的 md）。

## Out of scope

- 其余按字符数也超 5000 的 SKILL.md（setup、wiki-conventions、implement、pr-review、to-spec、uiux-refine、design-modeling、spec-status，以及 content-creator 的 thumbnail-gen、happy-life 的 daily-coffee-oracle）：各是各的存量，已开成 #137，不并进这次。
- 写明「字」怎么量、给 `REVIEW.md` 加一个通用的长度检查：#132 管。这次只给 design-archive 一份文件加检查。
- dreaming `references/initial-scan.md` 里跟「建模的取舍」相近的几句（入口是加载中等）：那是 dreaming 自己的文件，要不要改成指针归 dreaming。
- ui-reviewer 定义「开工」里按路径点名 `references/sections.md`：不在 skill 目录下，`skill-private-references` 测试不扫 agents；这次不改。

## 关联

- 覆盖的 issue：#125 idea-loop design-archive：SKILL.md 主体约 2.1 万字，超过 5000 字的上限
- 其余超标的 SKILL.md：#137，不重叠
- 同一个量法的先例：[[dreaming-skill-length]]（#93，不存在）、[[retro-skill-length]]（#124，不存在）
- #132 SKILL.md「主体 < 5000 字」没写怎么量：本 spec 沿用先例的量法，不改规则写法；两者不重叠，#132 先合的话这里加的长度测试改成调它的检查
- 相邻的 spec：[[ui-state-archive]]（#28 #48）、[[design-archive-sections]]（#61）还是「实现中」，但 `tickets/` 已空、没有开着的 PR，活已合并、等 dreaming 对账；[[design-archive-unstable-sections]] 已「完成」，它加进 design-archive 的指针随这次一起挪。2026-10-27 查过，没有开着的 PR 在改 design-archive 的 SKILL.md，无重叠、不分先后
