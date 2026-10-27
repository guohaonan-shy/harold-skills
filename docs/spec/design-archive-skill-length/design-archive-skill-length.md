---
type: spec
status: 正式
tags: [idea-loop, design-archive, skill-length]
summary: design-archive 的 SKILL.md 主体按字符数 11386，超 5000：按分支把写对象、校验规则、查询字段挪进 references
related: ["[[dreaming-skill-length]]", "[[retro-skill-length]]"]
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

精简后，`design-archive` 的主体只放每个调用方都要的东西，加上每个分支一个指针；各分支的细节在它自己的 `references/` 文件里。内容只换位置、不删规则；删的只有两类，在 PR 描述里逐条列出：跟别的单一事实来源重复的句子（写明在哪），和照 `idea-loop:writing-for-agents`「剪枝」判为空操作的句子。

主体留下：

- **图的模型**：节点、边、分段、可引用对象、档案组件与 `DESIGN.md` 基础件的分层，收紧措辞。
- **目录与分工**：`prod/` 的目录树、文件命名（页面前缀、工作区前缀、basename 全局唯一）、`delta/` 与 `prod/` 同构、谁能写 `prod/`、素材与截图矩阵。`tmp/<spec-slug>/` 的生命周期只留一句指向 `idea-loop:wiki-conventions`「目录」，那里已经写全；只属于 `delta/` 的规则（冻结后 `canvas/` 是设计真相、没有设计稿时 `delta/` 记最小差异）留在这里。
- **进入方式从图上推导**：原样。
- **写档案对象**（新的一节，替代原来的「建模的取舍」「frontmatter」「正文」三节）：一两句说清什么时候读，指向一份新的 references 文件，那份文件收这三节的全文。
- **校验**：命令、退出码、「写完 `delta/` 的标志」；逐条规则表挪进 references，主体一句指针。
- **查询模块**：命令、七个入口的名字各一句、MCP 工具同名；每个入口的参数与返回挪进已有的 `references/query.md`。
- **归档**：命令、退出码、谁在什么时候跑，原样或收紧。

同一行为的其他入口（按名字和节名指到这份 skill 的地方），逐个处理：

| 入口 | 现在指的 | 处置 |
|---|---|---|
| implementer 定义「写档案」 | 「目录与分工」到「进入方式从图上推导」 | 纳入：改成同时点名「写档案对象」，让它照指针读到字段表 |
| ui-reviewer 定义「开工」 | 目录、frontmatter、正文、进入方式、查询、归档 | 纳入：「frontmatter、正文」改成「写档案对象」 |
| dreaming `references/initial-scan.md` | 目录、frontmatter、正文、进入方式 | 纳入：同上 |
| `idea-loop:wiki-conventions`「frontmatter」 | design-archive 的「frontmatter」 | 纳入：改成「写档案对象」 |
| uiux-refine `references/design/motion-protocol.md` | 「sections frontmatter and 正文」 | 纳入：改成「写档案对象」 |
| dreaming `references/archive-reconcile.md` | 「目录与分工」「进入方式从图上推导」「查询模块」 | 节名不变，不改 |
| design-steward 定义 | 只点名 skill（查询档案对象） | 不改 |
| ui-reviewer 归档模式、ui-measure | 「长页面的分段」「拍图：分段脚本」（`references/sections.md` 的标题） | 不动 `sections.md`，不改 |
| design-modeling 准入分层表 | 档案对象的「决定」 | 不改 |

## User Stories

1. 期望行为（对应问题 1）：`idea-loop:design-archive` 的 SKILL.md 去掉 frontmatter 后按字符数少于 5000；只读档案、只写对象、只跑归档的调用方，各自只沿一个指针读到自己要的那份参考，原来主体里的每条规则都还能在主体或它的 `references/` 里找到。

## 实现决策

- **量法**：去掉 frontmatter 后按 UTF-8 数字符。依据：[[dreaming-skill-length]] 与 [[retro-skill-length]] 已经这样量，并写明 design-archive 按这个量法确实超了。规则怎么写明量法归 #132，本 spec 不改 `AGENTS.md` / `REVIEW.md`。
- **按分支拆，不按长度拆**。依据：`idea-loop:writing-for-agents`「信息层级」的判据「每个分支都需要的内联，只有部分分支走到的放到指针后面」。三个分支：写档案对象、读档案（查询）、归档；校验的命令每个写对象的分支都要，留主体，规则表只在报错时要，外置。
- **新的 references 文件只收「建模的取舍」「frontmatter」「正文」三节**，一份文件，因为三节总是一起用（写一个对象既要字段又要正文结构又要取舍），拆开要多读几次。校验的规则表放进同一份还是单独一份，由实现时看长度定：都只服务写对象这一个分支，放一起也符合「就近归置」。
- **节名「写档案对象」**：外部入口按节名指过来，节名就是契约；原来的「frontmatter」「正文」「建模的取舍」不再是主体的节名，外部入口同一个 PR 里改掉（见「方案」的入口表）。`references/sections.md` 的标题「长页面的分段」「拍图：分段脚本」不动，两条已有的文档测试钉着它们。
- **只换位置，不改规则**：挪动的文字原样或只收紧措辞，不改任何字段名、规则编号、命令、退出码。改规则不在这个 issue 里。
- **删掉的句子逐条交代**：每一句删掉的，PR 描述里写它的去处（「在 wiki-conventions『目录』」）或删的理由（空操作），让 review 能逐句核。

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
