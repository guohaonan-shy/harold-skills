---
type: spec
status: 实现中
tags: [idea-loop, writing-for-agents]
summary: 改 agent 文档先诊断再定方案；按实体组织、参考同样剪枝、通用文档不带项目信息；retro 候选写明怎么验证
related: ["[[2026-10-31-writing-for-agents-scope-grill]]", "[[design-archive-skill-length]]", "[[decision-rules-who-decides]]", "[[ui-reviewer-archive-pointers]]", "[[2026-10-27-design-archive-skill-length-grill]]"]
issues: [154, 155, 156, 198]
---

# writing-for-agents：改 agent 文档先诊断，按实体组织，参考同样剪枝，通用文档不带项目信息，retro 候选写明怎么验证

## 验证

2026-10-31 对着 `main` 核（76f893c；PR #203 合并后在 571969a 上复核了 `to-spec` 与 `writing-for-agents`），手段是读插件文本、grep、`wc -m`（UTF-8 字符数）和 `git log`。

| issue | 结论 | 证据 |
|---|---|---|
| #154 to-spec：改 agent 文档的 spec，方案先从 writing-for-agents 的诊断和调用方清单推出来 | 存在 | `to-spec` 的「探代码」一步和全文都没提 `writing-for-agents`；#125 的 spec 因此重写了两次，详情在「问题」1 |
| #155 writing-for-agents：讲数据模型的文档，主体围绕实体与关联写，命令行与格式细节进参考 | 存在 | `writing-for-agents`「信息层级」只有「按分支判断内联还是外置」，没有说按什么切分支；详情在「问题」2 |
| #156 writing-for-agents：外置的参考同样要剪枝，不复述脚本内部实现 | 存在 | 「剪枝」没点名参考文件，仓库的长度规则只管主体；插件 90 份参考里 20 份超过 5000 字，详情在「问题」3 |
| #198 idea-loop agents：多个 agent 定义用 ${CLAUDE_PLUGIN_ROOT} 文件路径直接读别的 skill 的 references/ | 存在 | 13 个 agent 定义按路径读 skill 的参考，全都符合插件规则，不符的是 `writing-for-agents` 的说法没写 agent 这一种；详情在「问题」4 |

问题 5、6 不来自 issue：5 是 #80 的 retro 候选（#80 会话 2026-10-31 转来），6 是人在本会话审 spec 时给的方向（raw 的 U1），两条都在本会话里核过现状。

## 问题

### 1. 改 agent 文档的 spec，方案没先从 writing-for-agents 推出来

`idea-loop:to-spec` 的「探代码」一步只要求「探到 spec 里要写的每条现状都能指出出处」，全文没有 `writing-for-agents` 这个词（`grep` 0 处）。issue 要改的是 skill、参考、agent 定义时，起草方照样只探代码，不先诊断文档本身。

例子：#125（design-archive 的 SKILL.md 超长）。调度会话交代「精简照 `idea-loop:writing-for-agents` 的写法」，第一版 spec（#138，6fdabc4）只定了「按分支挪进 references、只换位置」。人追问「你用writing-for-agent 这个skill扫design-archive这个skill，你觉得问题在哪？」「这个skill目前是给谁引用的」之后，spec 又重写了两次：#145（234e5fb）改成以图的实体为中心，#146（c5111b4）把 sections.md 的精简并进来。三个 PR 都在 2026-10-27。

### 2. 讲数据模型的文档，按操作拆分支会把实体定义切碎

`writing-for-agents`「信息层级」给的判断标准是「每个分支都需要的内联，只有部分分支走到的放到指针后面」，但没说分支按什么切。#125 的第一版就按文档的操作切成「写对象 / 读档案 / 校验 / 归档」四个分支，节点和边的定义被切进写对象的参考里，只读档案的调用方看不懂查询结果。人的原话：「写档案和读档案的对象不是一个吗？我倾向于将节点、边关联以及图实体描述清楚就行。校验和归档其实都是一些命令行，不同分支的内容走对应的reference，渐进式纰漏即可。」改完的样子是现在的 `design-archive` 主体：以图的实体为中心，写法、拍图、校验、查询、归档各进一份参考。

### 3. 参考文件不受篇幅约束，剪过的也会再长回去

仓库 `AGENTS.md` 只写「SKILL.md 主体保持精简（< 5000 字）」；`writing-for-agents`「剪枝」讲单一事实来源、环境即缓存、相关性、空操作，但没点名挪到指针后面的参考。现状：

| 文件 | 字数（UTF-8 字符数） |
|---|---|
| `design-archive` 的 `sections.md`（#125 改写之前，4e42c73） | 12506 |
| 它改写成的 `shooting.md`（6becd9e，2026-10-27） | 6461 |
| `shooting.md` 现在（bde3b4a 之后，2026-10-28） | 6658 |
| `design-archive` 主体现在 | 4591 |
| 插件里超过 5000 字的参考 | 90 份里 20 份，最长 20330（`uiux-refine` 的 `design-core.md`） |

`sections.md` 大半是在复述脚本内部做了什么、常量和算法；#125 的第一版 spec 也只盯着主体，人说了「section.md我觉得也应该简化」才并进来（#146）。改写后的参考第二天又多了 197 字。

字数是 UTF-8 字符数（`LC_ALL=en_US.UTF-8 wc -m`；不设 locale 时 macOS 的 `wc -m` 数的是字节，会差出近一倍）。

### 4. agent 读起它的 skill 的参考，两份文档说法不一

13 个 agent 定义用 `${CLAUDE_PLUGIN_ROOT}/skills/<分类>/<skill>/references/…` 读 skill 的参考。逐个核了「谁起它、它读谁的参考」：

| agent | 读谁的参考 | 谁起它 |
|---|---|---|
| backlink-analyst、geo-analyst、keyword-miner、page-optimizer、technical-auditor | seo-scan | seo-scan |
| pr-reviewer | pr-review | pr-review |
| ui-reviewer | pr-review | pr-review、uiux-refine、dreaming |
| uiux-researcher | uiux-research | uiux-research |
| uiux-imaginer | uiux-imagine | uiux-imagine |
| designer | uiux-refine | uiux-refine、design-change-sync |
| implementer | implement | implement、pr-review |
| adr-reconciler、design-steward | dreaming | dreaming |

13 个都读的是起它的那个 skill 的参考（ui-reviewer 读 pr-review 那处，就是 pr-review 起它时要交的发现文件格式）。插件规则 `idea-loop/AGENTS.md`「参考资料归谁」原文：「放在那个 skill 自己的 `references/`，只有这个 skill 和它起的 agent 读」；`agent-builder` 也写着「列『路径：它是什么，什么时候读』，资料放在调用方 skill 的 `references/`」。所以这 13 处都合规。

对不上的是 `writing-for-agents` 的 `SKILL-MECHANICS.md`「引用另一个 skill」：它写「不写文件路径：目录一挪路径就断」「别的 skill 不读它的 `references/`」，没提 agent。读到它的人（#198 就是这样）会以为 agent 按路径读也违规。另外，13 处里 9 处读的是只能由人调用的 skill（seo-scan、uiux-imagine、uiux-refine、dreaming），Skill 工具调不到它们，「改成用 Skill 工具调 + 节名」这条路走不通。

「目录一挪路径就断」这个风险是真的：现在没有检查核这些路径还在。`skill-private-references.test.mjs` 只扫 skill 和它们的参考，不扫 `agents/`。

### 5. 文档按作用域该带什么，规则没区分

`writing-for-agents` 讲了指针、层级、剪枝，没讲一份文档会在哪些项目里被读到、因此能带什么（全文搜「用户级」「作用域」0 处）。结果通用的文档里也写进了某个项目的例子，到别的项目读不懂：

- #80 改用户级 `~/.claude/CLAUDE.md` 时，草稿沿用了一个项目的页面名、文件名和缩写编号。人的原话：「这个能不能尽可能通俗一些、去项目化一些，里面有很具体我的项目信息和我导读场景」。
- 同一天 #142 的 retro，候选也是「改成（例子去项目化……）后批」（`docs/raw/decisions/142.md` 候选 1）。一天两次同样的纠正。
- 插件里现在还有两处 Toeflair 场景的例子：`to-spec` 的 User Story 示例「作为备考的学生，我想要重做一道错题时不扣练习次数……」，`glossary` 的术语示例（「学生可以做的一条练习，属于四种题型之一」「发音、听力、表达」）。插件文本里点名 Toeflair 的还有 README 的「Portability」一处。
- 仓库 `AGENTS.md` 的规则本身还写着「Toeflair 只作为举例出现」。人在本会话的方向是：idea-loop 这种通用工作流和全局 CLAUDE.md「不能带有一丝项目相关的信息」。

### 6. retro 候选不写怎么验证改动治好了当时的问题

`retro` 的候选现在有七栏：信号、原话、落点、旧文、新文、归并、同类。「归并」是 PR #203 刚加的，管的是新内容和已有原则怎么结合；没有一栏写这条改完以后，怎么证明它在当时出问题的那一刻真的让 skill 变了。回放用例要到实现时才由 implementer 写（`implementer` 定义里「要判断的……写一个回放用例」），批候选的人看不到它将来怎么验，有的候选也写不出能判的用例。人的原话：「要结合candidate分析，这个内容到底可以和现有的skill怎么结合，以及这块内容要如何验证这个改动确实对于之前的问题解决了」。

### 根因

1. `to-spec` 不分 issue 的对象，探的永远是代码；文档本身也是要诊断的现状，没有一步要求这样做。
2. 「按分支判断」没说分支按调用方要的东西切，起草方按文档的操作切。
3. 「剪枝」只被当成主体的规则，参考没人约束，`sections.md` 这样的沉积就长出来了。
4. 修正：issue 原先认为 agent 定义违反了「不读别的 skill 的 references/」；实测 13 处全符合插件规则，问题在 `SKILL-MECHANICS.md` 只写了 skill 之间的情形，以及没有检查守住这些路径。
5. 写作规则只按文档的形态分（skill、agent、AGENTS.md），不按它的作用域分；仓库规则还明文允许插件拿 Toeflair 举例。
6. retro 把验证留给了实现阶段，候选被批时没有回答「怎么知道它管用」。

## 方案

改完以后：

- 起草改 agent 文档的 spec 时，方案里每处改动都标着它对的是 `writing-for-agents` 的哪条杠杆，开头列着谁在调这份文档、各读哪几块。#125 那样「先只挪位置」的第一版不会再出现。
- `writing-for-agents` 讲清两件事：分支按调用方要的东西切，讲数据模型的文档里实体和关联是每个分支都要的；剪枝同样适用于参考，脚本参考只写调用方要照做的、要处理的、靠看找不到的。
- `SKILL-MECHANICS.md` 写明 agent 读起它的那个 skill 的参考时按插件根下的完整路径写；有一条检查核这些路径存在、而且读的是起它的 skill 的参考。
- 写文档的人先看它的作用域：通用的（插件的 skill、agent、参考，用户级 `~/.claude/CLAUDE.md`）一点项目信息都不带，例子用任何项目都成立的；项目级的（项目根的 `AGENTS.md` / `CLAUDE.md`、项目 `docs/`）才带项目信息和 few-shot。插件里现有的两处项目例子换成通用的。
- retro 的每条候选多一栏「验证」：写出改完之后怎么在当时那一刻证明它管用，人批候选时就看得到。

怎么做：

- `to-spec` 的「探代码」加一段（文本照 #154 retro 批过的新文）：issue 要改的是给 agent 读的文档时，起草方案之前先用 Skill 工具调 `idea-loop:writing-for-agents` 逐条诊断，再列调用方清单；「方案」从这两样推出来。
- `writing-for-agents`「信息层级」与「剪枝」：改写已有的原则，不另加新条，见「实现决策」。
- `SKILL-MECHANICS.md`「引用另一个 skill」加一条 agent 的情形；`skill-private-references` 这条检查扩到 `agents/`。

同类入口：

| 入口 | 纳入 / 排除 |
|---|---|
| `to-spec`「探代码」 | 纳入：#154 的落点 |
| `issue-verify` 的「先复现」 | 排除：它调 `to-spec` 起草，规则写在 `to-spec` 一处就覆盖 |
| `agent-builder` | 排除：它本来就要求照 `writing-for-agents` 写，路径写法也已经是「路径：它是什么，什么时候读」 |
| `implementer` | 排除：它照 `CODING_STANDARDS.md` 的链接读 `writing-for-agents`（#147 已修） |
| `writing-for-agents`「信息层级」「剪枝」 | 纳入：#155、#156 的落点 |
| `SKILL-MECHANICS.md`「引用另一个 skill」 | 纳入：#198 |
| 仓库 `AGENTS.md` 的长度规则（「SKILL.md 主体 < 5000 字」） | 排除：给参考定一个字数上限是另一件事，#156 要的是剪枝的判断，不是阈值 |
| 现有 20 份超 5000 字的参考 | 排除：本次只改规则；逐份剪由以后改到它们的 spec 按新规则做 |
| 13 个 agent 定义 | 排除：都合规，不改 |
| `writing-for-agents`「剪枝」的相关性一条 | 纳入：问题 5 的落点 |
| `to-spec` 的 User Story 示例、`glossary` 的术语示例、README「Portability」 | 纳入：换成通用例子，去掉 Toeflair |
| 仓库 `AGENTS.md`「不硬编码 Toeflair」一条 | 纳入：改成插件不带任何项目信息 |
| `idea-loop/evals/` 下的用例 | 排除：回放用例本来就是取自真实会话的固定输入，项目信息是它的数据，不是规则 |
| 用户级 `~/.claude/CLAUDE.md` 的内容 | 排除：#80 已经按「去项目化」改写过；它不在仓库里，本次只改写法规则 |
| `retro` 的候选格式与「做完的条件」、候选池文件的字段 | 纳入：问题 6 的落点 |

## User Stories

只改规则文本、不加能力，每个问题一行期望行为：

1. 期望行为：issue 要改的是给 agent 读的文档时，`to-spec` 在起草方案之前调 `idea-loop:writing-for-agents` 诊断、列出调用方；「方案」里每处改动标明对的是哪条杠杆。
2. 期望行为：`writing-for-agents` 写明分支按调用方要的东西切；讲数据模型的文档，主体把实体、关联、各自的字段讲清，读写共用，命令行和只在写文件时才要的格式进对应的参考。
3. 期望行为：`writing-for-agents` 的剪枝写明同样适用于外置的参考；脚本、命令行的参考只写调用方要照做的步骤、要处理的输出和靠看找不到的坑，内部实现、常量、算法留给源码和 `--help`。
4. 期望行为：`SKILL-MECHANICS.md` 写明 skill 起的 agent 读这个 skill 的参考，按插件根下的完整路径写；一条检查在 agent 读了不存在的路径、或读了不起它的 skill 的参考时变红。
5. 期望行为：`writing-for-agents` 写明按作用域决定文档能带什么：通用文档不带任何项目信息、例子用任何项目都成立的，项目级文档才带项目信息和 few-shot；插件文本（`evals/` 除外）里搜不到 Toeflair 和它的场景例子。
6. 期望行为：`retro` 的每条候选有「验证」一栏，写回放用例（当时的提交、让 skill 产出的那句 prompt、一道从人原话写出的是/否题）或检查名（先在历史错误上看它红）；「做完的条件」要求这一栏填了。

## 实现决策

### 已定（照规则）

- **#154 照 retro 批过的新文写进 `to-spec`「探代码」**：落点和新文是人在 retro 里批的（#154 正文「候选（retro 批了）」）。`to-spec` 已被 `decision-rules-who-decides` 重写（PR #203，2026-10-31 合并），那份 spec 写明「这份先，#154 后」，所以本条落在重写后的「探代码并谈 seam」一步；措辞随新结构顺一下，意思不变。
- **#198 照插件规则：agent 读起它的 skill 的参考合规，不改 agent 定义**：依据 `idea-loop/AGENTS.md`「参考资料归谁」原文「只有这个 skill 和它起的 agent 读」，和 `agent-builder` 的「资料放在调用方 skill 的 `references/`」。`SKILL-MECHANICS.md` 跟已定的做法对不上，按「本次同步改」：「引用另一个 skill」加一条，写 skill 起的 subagent 读这个 skill 的参考时写插件根下的完整路径（`${CLAUDE_PLUGIN_ROOT}/…`），别的 agent 和 skill 照旧调 skill、给节名。`writing-for-agents` 是通用的写法文档，这条不写 idea-loop 的目录名。
- **路径会断的风险用检查守，不用改写法**：能机械判定的规则做成检查（仓库 `AGENTS.md` §5「能机械判定的规则不走这里，做成检查」）。`skill-private-references` 的检查扩到 `agents/`：每个 `${CLAUDE_PLUGIN_ROOT}/skills/…/references/…` 路径要存在，路径里的 skill 要是起这个 agent 的 skill 之一（「谁起它」按 skill 正文里出现 `idea-loop:<agent>` 判）。先在一个故意写错的路径上看它变红。
- **作用域规则并进「剪枝」的相关性一条，不另加新条**：依据同上，「先归并」。它是相关性的特例：一行在这个项目里相关，到别的项目就是「从来就和任务无关」，所以相关性要按这份文档会被读到的每一处算。改写成「相关性按这份文档会在哪些地方被读到来算：通用的文档（插件的 skill、agent、参考，用户级 `~/.claude/CLAUDE.md`）不带任何项目信息，规则从一次项目里的纠正来，写进去时去掉项目的页面名、文件名、工具名，例子用任何项目都成立的；项目级的文档（项目根的 `AGENTS.md` / `CLAUDE.md`、项目 `docs/`）才带项目信息和 few-shot」。分哪两级、各带什么，依据是人的原话（raw U1）：「idea-loop我理解属于通用工作流，不能带有一丝项目相关的信息；全局纬度的claude.md也是一样的」。`writing-for-agents` 本身是通用文档，这条里不点 idea-loop 的名。
- **插件里的项目例子本次换掉，仓库规则同步改**：人的原话同上；只有三处（`to-spec` 一处、`glossary` 一处两行、README 一处），按「本次同步改」。仓库 `AGENTS.md` 的「Toeflair 只作为举例出现」改成「插件里不出现任何项目的信息，例子用通用的」；前一句「从一个真实项目（Toeflair）里通用化出来」是仓库自己的历史，留着。
- **retro 候选加「验证」一栏**：依据是人的原话（raw U1）「这块内容要如何验证这个改动确实对于之前的问题解决了」，以及仓库 `AGENTS.md` §5 已定的验收方式（改前「否」、改后「是」才算这条规则真的让 skill 变了；能机械判定的做成检查并先在历史错误上看到它失败）。这一栏只写验收的形状，用例文件仍由实现时写。写不出能判的是/否题、也做不成检查的候选，「验证」写「判不了」和原因，人批的时候就知道它没法验。「做完的条件」的「八项」随之改成「九项」，候选池文件的字段同步加这一栏。
- **不给参考定字数上限**：#156 要的是剪枝判断写进规则；字数阈值改的是仓库 `AGENTS.md` 的长度规则，排除理由见「方案」的同类入口表。

- **#155、#156 改写已有原则，不另加新条**：依据是 `writing-for-agents`「剪枝」第一条原文（PR #203 合并后在主分支）：「先看它是不是哪条已有原则的特例；是，就改写那条原则，不加新条」，也是人在 [[decision-rules-who-decides]] 里的决定（U4）。retro 批过的两段新文是这条规则写进来之前批的，意思保留，写法照「先归并」改。两条都是特例：
  - #155 是「信息层级」里「每个分支都需要的内联，只有部分分支走到的放到指针后面」的特例：#125 出错不是因为没有这条，是把分支按操作切了，实体定义其实每个分支都要。改写成「分支按调用方要的东西切，不按文档的操作切：每个分支都需要的内联……；讲数据模型的文档，实体和关联就是每个分支都要的那块，命令行和只在写文件时才要的格式进对应的参考」。
  - #156 是「剪枝」里「环境……复述它的文档就是一份缓存」和「沉积」两条的特例：脚本内部实现就是源码这个环境的缓存。「环境」一条补「挪到指针后面的参考同样算：脚本、命令行的参考只写调用方要照做的、要处理的、靠看找不到的」，「沉积」一条补「参考不受主体篇幅约束，最容易沉积」。
  - 合计约 120 字，比各加一段（约 190 字）少，规则各只在一处。

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：`skill-private-references` 的检查扩到 `agents/`，先写一个读错 skill 的假 agent 文本看它红 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 碰到：三条规则文本改动，走仓库的 retro 回放（规则改动的验收，见仓库 `AGENTS.md` §5 第二个例外）；文本是否写进去，走文档 tripwire |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：
  - 插件 `scripts/` 下的 node:test 文档 tripwire，读 skill 文本断言规则在不在。抓得到：规则漏写、被后来的改动删掉；抓不到：agent 照不照做。
  - `skill-private-references` 检查，扫 skill 和 agent 定义。抓得到：路径断了、agent 读了不起它的 skill 的参考；抓不到：路径对但读的那一节已经改名。
  - retro 回放，输入取 #125 起草第一版 spec 的那一刻（570e135，#138 之前）。抓得到：规则让 `to-spec` 的产出真的变了；抓不到：别的类型的 agent 文档。
  - retro 回放，输入取 #80 改写用户级 CLAUDE.md 的那一刻（草稿还带着项目例子），和本会话 retro 出候选的那一刻。抓得到：作用域规则、「验证」一栏真的改了产出；抓不到：没在回放里出现的文档类型。
- **增量功能测试**：
  - 前置：插件装的是改后的版本；仓库在 570e135。步骤：照 #125 当时的 prompt 让 `to-spec` 起草 design-archive 精简的 spec。期望：方案开头有对 `writing-for-agents` 各条杠杆的诊断和调用方清单，主体按图的实体组织，范围里包含参考文件的剪枝。覆盖：期望行为 1、2、3。改前的插件在同一输入上答「否」才算过。
  - 前置：插件装的是改后的版本；输入是 #80 当时那份带项目例子的全局 CLAUDE.md 草稿。步骤：让 agent 照 `writing-for-agents` 改写它。期望：改写后的文件里没有具体项目的页面名、文件名、工具名，例子任何项目都读得懂。覆盖：期望行为 5。改前答「否」才算过。
  - 前置：插件装的是改后的版本；输入是一场有纠正的 issue 会话的记录。步骤：跑 `retro`。期望：每条候选都有「验证」一栏，写出了当时的提交、prompt 和是/否题，或检查名，或「判不了」和原因。覆盖：期望行为 6。
  - 前置：插件文本里（`evals/` 除外）写进 Toeflair 或它的场景例子。步骤：跑插件的测试。期望：tripwire 红，指出文件和那一行。覆盖：期望行为 5。
  - 前置：在一个 agent 定义里写一个指向不存在的参考的路径，或指向一个不起它的 skill 的参考。步骤：跑插件的测试。期望：`skill-private-references` 红，指出那个 agent 和路径。覆盖：期望行为 4。
- **prompt / eval 变动**：改 `to-spec`、`writing-for-agents`、`SKILL-MECHANICS.md`、`retro`、`glossary` 的文本；加 retro 回放用例，一条规则一个用例：#154、#155、#156 三个共用 570e135 的输入，作用域规则一个取 #80 的输入，「验证」一栏一个取本会话；每个一道是/否题，从人当时的原话写。用例的大小照 `idea-loop/evals/retro/` 的规则定。
- **照着谁写**：tripwire 照 `scripts/pr-review-cross-skill-refs-doc.test.mjs`；检查照 `scripts/skill-private-references.test.mjs` 本身；回放用例照 `evals/retro/cases/implementer-reads-standards/`。

## Out of scope

- 清 `idea-loop/evals/` 里的项目信息：那是回放用例的固定输入。
- 剪现有的 20 份超 5000 字的参考：本次只改规则，逐份剪由以后改到它们的 spec 做。
- 给参考定字数上限：改的是仓库 `AGENTS.md` 的长度规则，不是写法。
- 改 13 个 agent 定义的路径写法：都合规。
- `issue-verify`、`agent-builder`、`implementer` 的同类入口：理由见「方案」的同类入口表。

## 关联

- 覆盖的 issue：#154 to-spec：改 agent 文档的 spec，方案先从 writing-for-agents 的诊断和调用方清单推出来；#155 writing-for-agents：讲数据模型的文档，主体围绕实体与关联写，命令行与格式细节进参考；#156 writing-for-agents：外置的参考同样要剪枝，不复述脚本内部实现；#198 idea-loop agents：多个 agent 定义用 ${CLAUDE_PLUGIN_ROOT} 文件路径直接读别的 skill 的 references/。根 issue #180。
- raw：[[2026-10-31-writing-for-agents-scope-grill]]（本会话审 spec 时人的方向）；[[2026-10-27-design-archive-skill-length-grill]]（#125 的 grill，三条 retro 候选的出处）。
- 问题 5 的来源：#80 idea-loop decision-rules 只管谁来定（已关闭，retro 候选由 #80 会话转来）；同类纠正：`docs/raw/decisions/142.md` 候选 1，候选池 `2026-10-31-problem-first-in-handoff`。
- 相关 spec：[[design-archive-skill-length]]（#125，完成）；[[ui-reviewer-archive-pointers]]（#91，完成，#198 在它的验证里被看到）。
- 相邻还没完成的：
  - [[decision-rules-who-decides]]（完成，PR #203 于 2026-10-31 合并）：重写了 `to-spec`，在 `writing-for-agents`「剪枝」加了「先归并」。本 spec 在它之后，从合并后的主分支起草。
  - 其余开着的 issue 里搜 `writing-for-agents`、`CLAUDE_PLUGIN_ROOT`，只有本组五个。
