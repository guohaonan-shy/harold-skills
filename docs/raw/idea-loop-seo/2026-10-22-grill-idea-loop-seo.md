---
type: raw
source_type: conversation
captured: 2026-10-22
title: grill —— SEO 能力放进 idea-loop：OpenSEO 负责发现，idea-loop 负责解决
tags: [idea-loop-seo, idea-loop]
related: ["[[idea-loop-seo]]", "[[2026-10-21-seo-workflow-discussion]]"]
---

# grill：SEO 能力放进 idea-loop（2026-10-22）

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 是 AI 的回应，只留结论与发现，取证过程略去。末尾「本轮决议」一行一个议题。
> 前一天的讨论见 [[2026-10-21-seo-workflow-discussion]]，当时定的是项目内插件加独立队列；这一场把位置、队列和分工重新定了。
> 本目录 `assets/` 里是 spec [[idea-loop-seo]] 的图：六张 story 树（`tree-user-stories-<n>-<场景>.png`，每个场景一张，内容与 spec「User Stories」的编号列表一致），三张时序图（`sequence-seo-scan.png`：一次扫描从 routine 触发到提 issue、写研究日志的消息顺序；`sequence-seo-issue-flow.png`：一个 SEO issue 从提出到 PR 合并经过的调度、issue 会话和人；`sequence-seo-check-hook.png`：一条命令结束后检查 hook 读 SEO.md、看产物目录、跑检查脚本并把 error 交回模型的顺序）。

## U1

https://github.com/AgriciDaniel/claude-seo 我准备在idea-loop内添加一个seo目录，将我们需要的skills放到下面；我们之前提到的skills和agent 我觉得整体上来说都没有什么问题。

seo 相关事项也作为issue进入idea-loop的工作流，我们一起来讨论下SEO的skill以及agent设计

## A1

先核了三件事：

- idea-loop 0.1.0 的 skill 已按 engineering / design / productivity 三个分类目录放，新开分类要在插件清单里登记；`no-project-leak.test.mjs` 拦 skill 里出现项目名，所以项目专属的东西只能留在项目里。
- issue 的状态已改成中文流转：没有 `status:*` 就是「待验证」，之后验证中 → 审核中 / 待设计 / 待实现 → 实现中 → 关闭。前一天方案里用来隔离的 `status:parked` 已不存在，对应的「搁置」是「loop 不碰」。
- 项目里本来就有 SEO 类 issue 按普通 issue 在走（例如 robots.txt 那条）。

据此提了第一轮八个问题：新分类目录、项目专属内容留项目、SEO issue 与 bug 共用队列、去掉扫描里的核验 agent、issue 正文写复现方法、内容类在「审核中」由人定角度、外链产出只改 docs 的 PR、spec 按仓库拆两份。

## U2

我觉得思路不太对，我注意到我们核心的数据源头open-seo是否很多skill的。我倾向于基于它的内容，将我们的已有的skill(blog-publisher, seo-lint相关的东西)融合到open-seo plugin内，同时可以继承到我们idea-loop的工作流里面。

open-seo主要是问题的发掘和验证，idea-loop负责解决，这两个我是要专门在idea-loop/seo/下面将open-seo的skill 进行复制，同时加上issue相关的内容吗？

## A2

OpenSEO 插件（1.0.0，MIT）是 9 个 skill 共约 930 行加一个远程 MCP。它的 skill 都按「人在场」写：缺信息就问用户、存关键词前先征求同意、交付一份给人读的 HTML 报告。

建议：用「蒸馏副本」的做法复制（带出处，上游更新时显式重新蒸馏，MCP 保持实时）；副本只改「没人在场时用 SEO.md 的默认值、不提问」和「交回统一格式的发现清单」两处；提 issue 的逻辑集中在 seo-scan 和它的脚本里，不撒进每个副本。分三层：发现（OpenSEO 蒸馏）、入队（seo-scan + 脚本）、解决（idea-loop 原流程加 seo-writing / lint / outreach 这些领域能力）。验证分两道：OpenSEO 的方法里自己对着线上页面核一遍，idea-loop 的验证会话再独立复现一遍，扫描里单设的核验 agent 因此去掉。

又提了：复制哪几个、放 idea-loop 还是单独插件（放 idea-loop 意味着由它声明 OpenSEO MCP、原插件要卸）、seo-lint 与 seo-geo-check 提炼成通用版。

## U3

Q1 我们在idea-loop/seo/readme.md 注明出处是来源于openseo

Q2 seo-coach也加上吧，毕竟我也不算是专家；GEO 我们是不是可以参考claude-seo的对应skill，结合open-seo 的mcp工具用writing-for-agent 来自己写

Q3 先放在idea-loop 里面吧

Q4 seo-lint/seo-geo-check 我记得现在ci会跑吧？这两个script在什么阶段跑，其实我还没有想明白，但是我觉得提炼通用版我觉得很必要（用writing-for-agent）

## A3

项目里 lint 现在在三处跑：营销站的 PR CI（构建后跑，error 挡合并）、本地回合结束的 Stop hook（工作区有未提交的营销站改动就构建加 lint，约 5 秒）、blog 发布前清单里由人自己跑。seo-geo-check 是知识型 skill（两个搜索平台的标准差异），lint 脚本附在它里面，它自己不会被自动触发。

另核到：CI 的 runner 上没有 Claude 插件，CI 跑的脚本必须在项目仓库里；OpenSEO 规定 AI 可见性的初次配置、单次检查和定期跟踪都要人批准，无人值守的 routine 买不了。claude-seo 的 seo-geo（MIT）约 400 行 skill 加两份 reference，另有约 90 行的 agent。

提了：lint 分阶段跑、通用脚本怎么到项目里、两个合成一个 skill、GEO 付费在 setup 时由人批一次而 routine 只读、seo-coach 保留人在场的写法、README 写两家出处。

## U4

Q5 PR的CI 将给项目和用户自己配置，实现会话里面；如果要放在plugin内，实现会话里hook的触发条件是什么？

Q6 先不考虑lint脚本进入到项目里，只考虑Q5在实现的会话里

Q7 合成一个skill吧

Q8 - Q9 没问题

## A4

项目现有的 Stop hook 只看编排会话自己 worktree 里未提交的改动；idea-loop 的实现会话里改代码的是后台 subagent，在它自己的 worktree 里提交，所以这个 hook 在 loop 里基本拦不住。可照抄的先例是 idea-loop 的合并闸门（执行 Bash 前触发，只认 `gh pr merge`）。提议：只拦 `git commit`，要求仓库有 SEO.md、提交的文件落在 SEO.md 写的检查范围里，再构建加 lint。另有一条推断没验证：subagent 在 worktree 里提交时 hook 拿到的工作目录是不是那个 worktree。

## U5

Q10 如果是这样就需要自己配置落地页目录在seo.md是吗？如果是这样我建议暂时不需要这个hook，我们本期只单纯优化脚本，然后后面我会让对应项目的ci更换脚本

Q11 Q10改决策了，我理解这个问题应该不需要回答了

## A5

记下：本期不做 hook，只提炼通用脚本；Q11 随之作废。补问了上一轮没回答的几项（方向 agent 与蒸馏 skill 的关系、OpenSEO 插件与前缀、项目专属写作规则、SEO issue 进流程的方式、内容类与外链的走法、spec 拆两份）。

## U6

Q12 我撤回之前的决策，如果这样的话，有个问题就是SEO.md到底有什么，hook我倾向于在npm run build 构建产物之后在run check

Q14 我会卸载openseo原来的插件，我们的skill也没有前缀

Q13、Q15 我同意

Q16 SEO 我觉没啥问题，扫描端不需要限制issue数目，issue调度那边会限制数目，直接提issue即可，验证上下文可以放到issue里面

Q17 - Q18 没问题

Q19 spec可以写两份，有个点就是SEO.md应该放在seo-setup搞定吧，这个点应该是在harold-skils里面。

## A6

项目的 `REVIEW.md` 里营销站的验证命令本来就是先构建再跑 lint，实现会话照它跑，所以构建后的 hook 是兜底，不是唯一的一道。

提了：hook 不匹配命令文本，而是看 SEO.md 写的构建产物目录是不是刚被这条命令改写过（学生端的构建不碰营销站的产物目录，不会误触发）；SEO.md 六节（站点、OpenSEO、竞品、重点页面、构建与检查、写作）；蒸馏的 skill 照上游原名，我们自己写的去掉 `seo-` 会和 idea-loop 的 `setup` 撞名、其余太泛，所以保留；扫描不限量但同类合并、撞上已开的就评论。

## U7

Q20-Q23 都同意

## A7

汇总了整体理解，请人确认。

## U8

是，先改harold-skills，然后待pr合并之后，修改toefl-demo这个仓库。

## A8

写 spec 前查相邻工作时发现：harold-skills 主 checkout 上另一个会话在做 idea-loop 0.1.1（未提交），新增 `type:<父类>/<子类>` 两级 issue 分类（写在项目 AGENTS.md 的「issue 分类」一节，`labels --prune` 会删掉分类和保留名单以外的标签），调度改成一个 issue 一个 issue 会话、从验证陪到关闭。提了两问：SEO 的标签改用 `type:` 体系；这份 spec 以 0.1.1 为准、实现排在它后面。

## U9

我先回答Q25 @[Harold Skill 0.1.x系列迭代]  你可以参考它的结论，它应该合并的会比你早一点，你可以基于他的结论

## A9

读了 0.1.x 会话的改动：issue-session 按审核 / 设计 / 实现换阶段；issue-verify 新增「打分类」，用 `issues type` 打 `type:父类/子类`，会替换原有的 `type:*`。据此把 Q24 改成：seo-setup 把父类 `seo` 和五个方向子类写进「issue 分类」一节；seo-scan 提 issue 时先打上 `type:seo/<方向>`，审核阶段照常再判、可以替换。

## U10

没问题

## A10

实现落地后提了四个要人定的：外联放哪、page-optimizer 的阈值、seo-scan 只能斜杠调用、GEO 没有跟踪时整方向未采集。核到：外联的跟进表放 `domain/` 违反 wiki-conventions，`raw/` 不能改，`spec/` 了结即删；seo-writing 的对比文核实期限（两个月）和 page-optimizer（90 天）不一致；GEO 的站点自检不花钱。

## U11

Q1 外链草稿和跟进表是指哪些外链需要跟进是吗？然后内容交给AI跟进是吗？这个东西是谁看谁用，看起来是一个单独的执行计划草稿？

Q2 - Q4 同意

## A11

外联产出是给人用的执行清单：AI 找候选、查联系方式、写草稿、建跟进表，人审 PR、发信、改状态，之后 AI 不跟进。核到一个漏洞：扫描只和开着的 issue 去重，issue 关了下个月会再提同一批站点。推荐把跟进表放 `docs/records/outreach/<资产>/`（wiki-conventions 新增 `records/`），backlink-analyst 每次扫描读它去重，「无回应」超过 90 天可再提。

## U12

同意

## 本轮决议

| 议题 | 决议 |
|---|---|
| 分工 | OpenSEO 负责发现，idea-loop 负责解决；SEO issue 走 idea-loop 原有的验证 → spec → 实现流程 |
| 位置 | idea-loop 新开 `skills/seo/` 分类；`idea-loop/skills/seo/README.md` 注明出处（OpenSEO、claude-seo） |
| OpenSEO 插件 | 人自己卸载原插件；idea-loop 声明 OpenSEO 的 MCP |
| 复制方式 | 蒸馏副本：只改「无人时不提问、用 SEO.md 默认值」和「交回统一的发现清单」；issue 逻辑只在 seo-scan 与脚本 |
| 复制哪些 | seo-audit、keyword-research、keyword-clustering、competitor-analysis（吸收 competitive-landscape）、link-prospecting、seo-coach；seo-project-setup 改写成 seo-setup；local-seo 不要 |
| GEO | seo-geo 以 claude-seo 为底，数据换成 OpenSEO，用 writing-for-agents 自己写；付费跟踪在 seo-setup 时由人批一次，扫描只读结果 |
| 命名 | 蒸馏的照上游原名，自己写的保留 `seo-`：seo-setup、seo-geo、seo-scan、seo-brief、seo-writing、seo-outreach、seo-check |
| agent | 每个方向一个薄 agent，方法在 skill 里；不设单独的核验 agent |
| 与 0.1.1 的关系 | 以 0.1.x 会话的结论为准（一个 issue 一个 issue 会话、`type:` 分类），实现排在它合并之后 |
| 分类标签 | seo-setup 把父类 `seo` 和子类 technical / pages / keywords / backlinks / geo 写进项目 AGENTS.md 的「issue 分类」；seo-scan 提 issue 时打 `type:seo/<方向>`，审核阶段可替换 |
| 提 issue | 不带状态标签直接进「待验证」；同类合并、撞上已开的就评论；不设数量上限（调度那边限并发）；正文写证据和复现方法 |
| 内容类 | brief 写进 spec 的「方案」，spec 进「审核中」由人定角度和论点，之后自动写、PR 里过稿 |
| 外链 | 实现产出只改 docs 的草稿 PR，邮件由人发；草稿和跟进表放 `docs/records/outreach/<资产>/`，backlink-analyst 读跟进表去重（「无回应」超过 90 天可再提） |
| 阈值 | page-optimizer 的阈值作为默认值写在 agent 里，先跑再调；对比文超期统一 90 天 |
| seo-scan 调用 | 只能斜杠命令（routine 触发） |
| GEO 无跟踪 | AI 引用数据记未采集，免费站点自检照跑、照常提 issue |
| lint | seo-lint 与 seo-geo-check 合成 seo-check，提炼通用版；PR 的 CI 由项目自己配；构建后 hook 按「SEO.md 的构建产物目录刚被改写」触发 |
| 项目专属 | 全部留项目，经 SEO.md「写作」一节指过去；SEO.md 的格式由 seo-setup 定 |
| 写法 | 所有 skill 与 agent 按 writing-for-agents |
| spec | 两份：先 harold-skills（本份），合并后再写 TOEFLAIR 那份 |
