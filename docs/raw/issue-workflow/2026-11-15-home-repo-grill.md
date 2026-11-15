---
type: raw
source_type: conversation
captured: 2026-11-15
title: grill —— idea-loop 0.2.0：home（一台设备一份的私有仓库）与知识库、记忆脱离项目
tags: [issue-workflow, release, idea-loop-0-2-0, home, knowledge-base, memory]
related: ["[[2026-11-05-issue-model-regrill]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现，取证过程略去。题号是会话里出题的编号；目标重定之前的第一轮（旧 Q1–Q5）被目标覆盖，之后从 Q1 重新编号。末尾一张「本轮决议」表。
>
> 讨论在 harold-skills 的「0.2.0 功能讨论」拆出的 home repo 子会话里进行（2026-11-12 至 2026-11-15），起点是 #252 和 Matt Pocock 的 home repo 帖子；中途 dreaming 子会话把 #286 剩下的「查询入口」「raw 召回」「文章其余建议」三题转来一起定。事实对着 origin/main（idea-loop 0.1.14 → 0.1.17）、Claude Code 2.1.299 与本机取。

## U0

2 如上图所示，关于matt提出来的点，当我开始无论是在公司项目还是个人项目开始维护多个项目时，多个项目都要安装一份skill以及相关的文件内容。这个home repo的存在其实跟我们之前的知识库拆出来算是一个事儿，将代码库通过指针放在了所谓的home repo里。

## A0

- 2026-11-04 的 0.2.0 grill 已设计过几乎一样的东西「业务根目录」（知识库所在的 git 仓库，代码仓库 clone 在它下面并忽略），11-05 被人推翻（那场 grill 的记录只在分支 `backup/247-migration-spec` 上：`docs/raw/issue-workflow/2026-11-04-idea-loop-0-2-0-restructure-grill.md` 的 U14、U15）。
- 插件按项目启用：idea-loop 在 Toeflair 的 `.claude/settings.json`、harold-skills 的 `settings.local.json` 里启用，用户级没有。Toeflair 根目录 8 份 idea-loop 生成的文件约 8 万字，`docs/` 726 份 md。
- 没有真实的多仓库业务：Toeflair 的前后端与 MCP 在同一个 git 仓库。
- 说明文件加载实测（2.1.299，haiku）：

  | 会话开在哪 | 读到 |
  |---|---|
  | home，`--add-dir` 代码仓库 | 只有 home 的 |
  | 同上，加 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` | 两份 |
  | 代码 worktree，位置在 home 下面 | 两份 |
  | 代码 worktree，位置在 home 外面 | 只有代码仓库的 |

出了旧 Q1–Q3（home 解决什么、公司项目在不在范围、11-05 推翻的理由还成不成立）。dreaming 会话转来 #286 的两题后，补了旧 Q4（raw 召回）、旧 Q5（查询入口）。

## U1

我们先整理下我们的预期目标，然后再开始grill讨论，我现在的想法是：
1 idea-loop的迭代本质上是按照项目纬度，但其实我觉得一个设备，比如mac、虚拟机只需要维护一份，这样idea-loop的迭代就不需要很割裂；同时，home repo的概念我觉的更适合我这种需要维护多个repo的工作模式。
2 另外一个方面就是知识库，我其实觉得agent更需要的是以最精简、最有效的memory内容以及知识的召回方式（https://www.anthropic.com/research/components-of-agent-memory），因此知识库层面我也想脱离项目纬度，将agent的memory + 知识库进行一次优化

## A1

目标重写为两条：idea-loop 一台设备维护一份、用 home 管多个仓库；知识库与记忆脱离项目，照文章做到少而好找。旧 Q1、Q2 被覆盖。

- 自动记忆按项目目录存：本机 10 个项目目录有记忆，Toeflair 203 条约 58 万字（feedback 71、project 98、reference 33），harold-skills 8 条。很多 feedback 是跨项目的（「操作主 checkout 用 git -C」「回复只用中文」「不手写基础设施」），只在 Toeflair 的会话里看得见。
- Toeflair 的 `MEMORY.md` 148 行、1.86 万字每轮注入。
- 三个边界：Mac 一个 home、公司虚拟机一个 home；跨项目内容合成一份、项目专属内容进 home 按项目分区；只保留 home 一种模式，单仓库是 home 与代码仓库合一的特例。

## U2

对，开始 grill

## A2

- 自动记忆按 git 仓库存、worktree 共用：Toeflair 191 个 worktree 会话分在 26 个 worktree 路径目录下，一条记忆都没有，203 条全在主 checkout 目录。文档原话「Per repository, shared across worktrees」（code.claude.com/docs/en/memory.md）。
- harold-skills 是公开仓库，Toeflair 私有；`~/home` 不存在。
- 文档：`autoMemoryDirectory` 可在用户级设置里把全设备的记忆指到一个目录；每轮只加载 `MEMORY.md` 前 200 行或 25 KB；附加目录的 `CLAUDE.md` 默认不加载、`AGENTS.md` 不加载。

出了 Q1–Q5。

## U3

Q1-Q3 我同意

Q4 raw/ 我觉的应该不是需要每轮注入的东西，而是给上层的memory内容提供原始材料

Q5 同意

## A3

「home」写进 `GLOSSARY.md`。会话转录（`~/.claude/projects/*/*.jsonl`）本机 829 个、约 8.2 GB，其中 Toeflair 约 6.7 GB。出了 Q6–Q9。

## U4

按推荐来，终端我也已经登陆了

## A4

`autoMemoryDirectory` 实测（两个假项目 projA、projB 指到同一目录，2.1.299，haiku）：

| 测什么 | 结果 |
|---|---|
| 两个项目报出的记忆目录 | 相同 |
| A 写一条，B 读 | B 读到原句 |
| A、B 同时各写一条 | 两条都在、索引没丢行（只跑一次，不能证明没有竞争） |
| `MEMORY.md` 撑到 208 行再读 | 只加载到第 200 行 |
| 超限后再写 | 写入成功，PostToolUse 报错要求压到 140 行以内，会话停下问人要不要删条目 |
| 项目 `CLAUDE.md` 软链到别处的文件 | 能加载 |

出了 Q10–Q12。

## U5

按推荐

## A5

idea-loop 有 292 个 skill / agent / 脚本文件，95 个写到知识库位置（`<docs>` 或 `docs/`），84 个写到仓库根的引导文件。各插件 README 不链 `docs/`。#236 已关。出了 Q13–Q16。

## U6

Q15 同意

Q16 我觉得这个你可以以0.2.0作为一个project，这个project 有一个集成分支，然后拆分成几个issue分开实现，最后统一在集成分支集成，再合入主干分支。

## A6

- 集成分支以前用过：`release/idea-loop-0.1.8`、`release/idea-loop-0.1.10` 各用一个 PR 合进 main（#176、#260）。
- 远端旧 `release/idea-loop-0.2.0` 落后 main 240 个提交、多 6 个；只有 Project「idea-loop issue 工作流」（#242、#243、#226）。
- idea-loop 只认 `DEVELOPMENT.md` 一个基准分支，不支持按 issue 换。

出了 Q17–Q20。

## U7

Q13 按推荐选择A
Q14 就按你说的两步处理
Q18 #298 和 #291 我会单独再调度中处理，这个0.2.0主要负责home repo + 知识库的前一
Q19 远端那个直接删除吧，然后我们重新切出来0.2.0
Q20 这个问题很值得讨论，对于这种包含了多个issue的场景，我们的issue管理要怎么做，无论是公司内的issue/subissue，还是github的issue/subissue，甚至project/issue 其实都会有这样的场景

## A7

- 删前核对：旧分支独有的 6 个提交里 2 个是合并提交、3 个决定记录在别的分支上还在、设计合并的改动已由 #253 进 main；但 draft PR #250（#241 插件拆分）以它为基准，删分支会让 GitHub 自动关掉它。
- 现在的 issue 模型（`issues/SKILL.md`）：不用父子关系归组，版本用 milestone、模块用分类、相关写正文链接；Linear 不读不写 Project、Cycle、父子关系。三次集成分支（0.1.8、0.1.10、0.2.0）都靠人手动。

出了 Q21–Q24。

## U8

home repo:https://www.aihero.dev/the-home-repo-pattern 这个应该对于我们如何使用home repo grill 开始迭代有很大的帮助

Q21 https://github.com/guohaonan-shy/harold-skills/pull/250 这个pr关掉吧，这样分支我理解就可以删除并重新拉去

Q22 用的是linear

Q23 我倾向于A

Q24 同意

## A8

- 已执行：关 #250（`feature/plugin-split` 保留），删远端旧 `release/idea-loop-0.2.0`，从 main `e259f3f` 重切。
- aihero 文章（2026-11-12 更新）：home 是新建的私有仓库，放 skills、AGENTS.md、共享文档；指针一行一个「<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.」，可附「改它之前先读它的 AGENTS.md」；会话从 home 开始，每个仓库 clone 一次、每个功能在里面开 worktree；仓库多了按业务领域分文件做索引；搬家四步（盘点仓库、共享材料分共享 / 重复 / 仓库专属 / 安装来的四类、分轮定方案表、执行）。没讲记忆、子 issue、集成分支、各仓库自己的工具怎么加载。
- 实测：软链接的 `CLAUDE.md` 里写 `@AGENTS.md`（相对或绝对）都加载不到；软链接直接指向内容文件能加载。`~/.claude/skills` 24 个 skill（9 个软链接），不在任何 git 仓库里。

出了 Q25–Q28。

## U9

关于home repo，会话需要创建修改哪些项目，每次都是clone最新的main，然后开一个worktree进行修改是吗？

Q25 issue的会话我在想是否也是需要开在home会比较好

Q26 - Q27 同意

Q28 ~/.claude/skills我觉的里面的内容可以删除了，我记得基本上都是没有用的了。项目纬度的skill我在想能否做到按照项目加载，如果都放到home，某些会话用不到toeflair的skill，其实就单纯吃上下文罢了。就相当于，虽然可能都是在home启动，但是针对修改的项目，mcp/skill需要加载的可能不一样。

## A9

- 每个仓库只 clone 一次，每个 issue 在 clone 里 `git fetch` 后从最新基准分支开 worktree。
- 会话开在 home、代码 worktree 在 `~/home/.worktrees/` 下时：代码仓库的说明文件在第一次读那个目录的文件时加载（实测）；`.claude/skills` 不加载（实测）；`.claude/settings.json` 的 hook、插件、权限和 `.mcp.json` 只从启动目录读，中途只有人敲 `/cd` 才切（文档）。会话开在 worktree 里，四样都加载。
- Toeflair 开在 home 会少掉：`.mcp.json` 6 个 MCP、3 个本地插件、7 个 skill、4 个 hook（含拦截生产库 SQL 的 `prod-sql-guard`）。

## U10

Q25 某个issue假设要修改多个仓库，你是开多个会话吗？另外，matt的home repo是怎么做的呢

Q28 gstack的我觉的可以删除了，cloudflare和railway这两个之后就可以迁移到home下了

## A10

Matt 一个 home 会话直接改各仓库，工具都在 home 里，文章没讲各仓库自己的工具怎么加载。出了 Q29（多仓库 issue 怎么开会话）、Q30（剩下的用户级 skill）。用户级 skill 近 30 天的调用统计：24 个里只有 `use-railway` 被调用过（4 个会话）。

## U11

Q25 同意

Q29 那就选择A

Q30 refero、pricing-strategy 可以留下，其他的内容我觉的可以移除

## A11

出了 Q31（文章其余建议）、Q32（收工方式）。

## U12

按推荐

## 本轮决议

| 主题 | 决议 | 出处 |
|---|---|---|
| 目标 | idea-loop 一台设备维护一份，用 home 管多个仓库；知识库与记忆脱离项目，照 agent memory 文章做到少而好找 | U1 |
| home | 每台设备一个私有仓库 `~/home`：Mac 上推到 GitHub 私有，公司虚拟机上本地 git 不连远端；harold-skills 是其中一个指针 | Q1 |
| 术语 | 叫「home」，写进 `GLOSSARY.md`；不用业务根目录、知识库仓库、workspace、主仓库 | Q2 |
| 文件归属 | 代码仓库只留自己的 `AGENTS.md` / `CLAUDE.md` 和自己的工具（hook、本地插件、`.claude/skills`）；idea-loop 生成的引导文件与 `docs/` 进 `home/projects/<项目名>/`；跨项目内容在 home 顶层 | Q3 |
| raw | 只算 `docs/raw/`，不每轮注入，是上层记忆的原始材料：dreaming 从它提炼和核对，会话上层查不到时可 grep；会话转录这次不纳入 | Q4、Q8 |
| 查询入口 | 不新增组件；设备地图写在 `~/home/AGENTS.md`，项目地图由 idea-loop 的 SessionStart hook 按项目注入，都 ≤2000 字、由 dreaming 生成；下面各层 Read / grep 按需读；改前改后量 token，不够再扩展 `design-archive` MCP | Q5、Q27 |
| 记忆 | 用户级设置 `autoMemoryDirectory` 指到 `~/home/memory/`，全设备一份；dreaming 把索引压在 140 行内，项目事实下沉到项目知识库、原处留链接 | Q6、Q9 |
| home 内容进会话 | 设备级：`~/.claude/CLAUDE.md` 软链到 `~/home/AGENTS.md`（home 里不放 `CLAUDE.md`）；项目级：hook 注入；代码仓库留在原处，桌面端 worktree 设置不改 | Q7、Q10、Q27 |
| 项目清单 | 照文章的单行指针写在 `~/home/AGENTS.md`；hook 用当前目录的 git 远端认项目；`ISSUE_TRACKER.md` 的「仓库」表并进来 | Q11、Q26 |
| home 的提交 | 只有 main，改了直接提交、只 add 自己的文件；spec 不再跟代码同一个 PR；dreaming 改直接提交（改 #298 的「开 docs PR 自己合」） | Q12 |
| harold-skills 的 `docs/` | 搬进 home，变私有 | Q13 |
| 迁移 | setup 机械搬家（照文章四类盘点），代码仓库开删文件的 PR 由人合；10 个项目的记忆复制进 `~/home/memory/` 加项目前缀，旧目录不删；第一次 dreaming 把记忆压到 140 行内 | Q14 |
| setup 改用户级配置 | 一次列出三处（用户级启用 idea-loop、`autoMemoryDirectory`、`~/.claude/CLAUDE.md` 软链）与改前改后，人同意一次全做；先备份到 `~/home/.backup/` | Q15 |
| 0.2.0 的范围 | 只做 home 与知识库迁移；#298、#291 由人另行调度、走 main | Q18 |
| 集成分支 | 删远端旧 `release/idea-loop-0.2.0`（先关 #250），从 main 重切；子 issue 的 PR 合进它，最后整条合进 main、升 0.2.0 | Q19、Q21 |
| 多 issue 归组 | 用父 issue 带子 issue（GitHub、Linear 都有）：父 issue 管整体 spec、集成分支名、合进 main 的 PR；子 issue 各开 PR 合进集成分支；Project、milestone 只作看板。公司用 Linear | Q22、Q23 |
| 落地顺序 | 0.2.0 先手动按这个形状建父子 issue、人开会话时点明基准分支；issue 模型支持父子另开一个 issue 走 main | Q24 |
| 会话开在哪 | 单仓库的 issue 会话开在代码仓库的 worktree（项目的 skill、MCP、hook、插件按项目加载）；跨项目的活和父 issue 会话开在 home | Q25 |
| 多仓库 issue | 父 issue 一个 home 会话管 spec、拆分、联调；每个仓库一个子 issue、一个会话、一个 PR | Q29 |
| 用户级 skill | 留 `refero-design`、`pricing-strategy`、`cloudflare`、`wrangler`、`use-railway`，挪进 `~/home/skills/`，`~/.claude/skills` 软链过去；其余 19 个在迁移时删，删前再确认清单 | Q28、Q30 |
| 项目自己的 skill | 留在项目仓库，按 Q25 只在那个项目的会话里加载 | Q28 |
| 文章其余建议 | 采纳「回答前先按地图查」写进 `~/home/AGENTS.md`；「标注核实过没有」「只盯易过期内容、频率随访问」先不采纳 | Q31 |
| 已知限制 | 一个需求同时改多个代码仓库没有真实例子，按 Q29 的模型，不另设计 | Q29 |
| 收工 | 这份记录和术语进集成分支；建父 issue 挂四个子 issue（#252 建 home、记忆、skill 读 home、#247 迁移），另开 issue 模型的 issue 走 main；#286 贴结论后关，#298 追加评论；四个子 issue 翻 todo，父 issue 留 triage | Q32 |
