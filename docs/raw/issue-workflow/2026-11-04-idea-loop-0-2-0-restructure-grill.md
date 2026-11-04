---
type: raw
source_type: conversation
captured: 2026-11-04
title: grill —— idea-loop 0.2.0 改成一次重构：issue 为唯一真相、分拣单独成步、业务的知识库仓库、拆成 idea-loop / design / seo 三个插件
tags: [issue-workflow, release, idea-loop-0-2-0]
related: ["[[2026-11-03-idea-loop-0-2-0-grill]]", "[[idea-loop-0-2-0-release]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现，取证过程略去。题号 Q1–Q43 是会话里出题的编号。末尾一张「本轮决议」表。
>
> 讨论在 harold-skills#220 的 issue 会话里进行。前一天的 0.2.0（[[2026-11-03-idea-loop-0-2-0-grill]]）被人叫停：F5 已 revert，F1、F2、F4 的分支保留未合。这一场从人重看架构图开始，把 0.2.0 改成一次重构。事实对着 origin/main 9a33407（idea-loop 0.1.9）、Claude Code 2.1.299 与本机取，日期 2026-11-04。

## A0

按调用层次画了 idea-loop 的架构图：入口、阶段 skill、子代理、共用规则 skill、SEO skill、底座六层，41 个 skill、15 个 agent（[architecture-idea-loop-skills.svg](assets/2026-11-04-idea-loop-0-2-0-restructure/architecture-idea-loop-skills.svg)）。另查到：共用规则那层并不纯，`wiki-conventions` 正文点名 15 个别的 skill 或 agent，`spec-status` 点名 10 个，含 issue-session、issue-dispatch 这些入口。

## U1

我重新review了下架构，并结合我的想法给出我的意见：
1 spec的状态机还需要维护吗？其实一直以来spec得状态都是跟issue的状态保持一致的，issue的状态作为唯一真相源即可。issue的概念我来做更进一步的阐明，我觉的之前我一直做的有点问题，就是issue和sub issue到底是什么。基于我们控制issue生成的入口，我觉的sub issue应该是为了issue里面拆解出来的。如果issue之间没有很明确的关系，我觉的不用拆分subissue。
2 design 相关的skill、seo的skill 以及 相关的mcp能否在idea-loop里面一个统一的setup让用户可选，比如seo如果需要，我们在安装对应的mcp以及skills。design、seo并非必须
3 我提出一个新的workspace的概念，一个workspace可以对应一个甚至多个仓库，像知识库、seo.md、code_stardard.md、review.md、docs/这些文件就要放在workspace里面。对于harold-skill、toeflair这两个仓库，一个仓库就是workspace，所以这些文件放到了根目录；如果是多个仓库就可以放到workspace的根目录（比如{workspace}/{repo1}、{repo12}、{repo3}）或者知识库的目录根据worksapce的agent.md确定？如果一个workspace下有多个repo，每个repo都是有自己的agent.md
4 decision-rules 我想改成decision的一些原则，我不太想告诉模型这个应该是什么？除非是很笃定的内容。evidence 我也想简化下，不要告诉ai什么情况下出什么，而是支撑观点的论据统一写法。
5 问题的验证这个步骤我在想是否可以放到一个单独的步骤，比如最开始的问题都是backlog，loop定时验证backlog的问题是否存在，如果存在将问题状态更新为todo(待完成)，然后loop调度待完成的issue 走我们的流程？

根据我们现在issue的需求，以及我提出来的一些简化架构、skill的内容，我们开始grill。

## A1

出题前取的事实：

- **spec 状态已经跟 issue 脱节**：34 份 spec，未完成的 9 份里 7 份 frontmatter 还写「实现中」，它们的 issue（#28 #34 #46 #47 #48 #49 #50）都已关闭为完成。34 份全都挂了 issue，没有一份不挂 issue 的 spec。
- **子 issue 被当成「整合」用**：开着的 10 个根、27 个子 issue。例如根 #184「设计档案：长页面的分段」下挂着 #192「测试在 darwin 本机卡住」，并不是从 #184 拆出来的；#220 下的 7 个也是整合进来的。
- **「workspace」撞名**：`GLOSSARY.md` 已有「业务」（共用一份知识库的一组仓库），跟人说的 workspace 是一个东西；cmux、Linear、以及 0.2.0 里的 `idea-loop:workspace` skill 都已用了 workspace。
- **插件能开关的最小单位是整个插件**（Claude Code 官方文档）：`skillOverrides` 不管插件里的 skill；`plugin.json` 支持 `dependencies`，装 A 会连同装上并启用 B；`enabledPlugins` 可以按项目写。
- **跨插件调 skill 实测可行**：本机两个临时插件 `pa`、`pb`（Claude Code 2.1.299、haiku），`pa` 的 skill 调 `pb:hello`：两个都装时拿到 `pb` 给的暗号；只装 `pa` 时它判断出 `pb` 不在、按 skill 写的回了 `PB-MISSING`。

第一轮出了 Q1–Q10。

## U2

Q1 删掉吧，减轻负担吧

Q2 B 没问题

Q3 基于Q2，我觉的最起码issue 之间的关联可以保留，但是subissue是一个单独可以交付pr的单元，issue主要是作为发布版本或者模块，将一块的subissue进行聚合。关于issue和sub issue在linear、github上的标准使用姿势是什么？其实我之前也不太用过

Q4 那就先保持业务

Q5 我倾向于A，这样单个仓库是不是也可以不耦合知识库？我倾向于这个知识库可以现在本地维护（不进git）。毕竟刚加入新公司，我倾向于对应的repo维护还是先按照统一标准，我们自己的这一套可以先放在不进入git的部分。

Q6 这个问题，我先来提出我的预期，我倾向于除了仓库自己的agent.md，其他的内容都跟业务走吧。这样我们的plugin 也可以使用，并且这些文件也不会进入业务内的每一个仓库。TOEFLAIR/harold-skill这两个仓库就是单独的业务，所以放在仓库里，也是跟着业务走。

Q7 decision rule 这个我给出一些偏好，我们的核心的目的是按照spec内的方案来解决spec提出的问题。

* 依据就像你现在skill内提及的，但是不要像你说的有依据就照办。如果依据之间出现了冲突，你来告诉我，我来现场做出判断，对项目的上下文做出纠正。
* 有些必要的"guardrail"必须是需要告诉我的，比如术语、动生产数据、真实的支付等


Q8 首先，evidence是用来支持某个观点、想法以及决策的证据，证据的存在是为了让阅读它的人快速明白evidence支持的内容是什么。然后，讲述整体的风格是图文结合，文字部分的像你说的，可以有一些通用的规则。配图我更倾向于，将我们的配图方式交给AI，让AI 判断。单个UI页面的标注、UI flow的标注，excalidrawer绘制的不同图表。我希望evidence只局限证据是什么，证据的整体风格是什么。具体怎么用证据、我觉的是更上层的调用场景来决定的。

Q9 这个可以参考multica，看看它有没有todo的状态，尝试思考这个状态存在的意义是什么？

Q10 我倾向叫idea-loop、design、seo，拆分成3个插件。

## A2

查到的事实：

- **GitHub**：子 issue 官方用途是「把大 issue 拆小」，一个父 issue 最多 100 个、最多 8 层；版本那种分组是 milestone（「一组 issue 或 PR 的进度」）。文档没说一个子 issue 对应一个 PR。
- **Linear**：模块 / 功能是 Project；版本是 Releases（Business 及以上）或 Project milestone；子 issue 适合「一个 issue 装不下、又不到一个 Project」的工作；PR 与 issue 多对多。
- **multica 的 todo**：`backlog` 是「停放」，指派给 agent 也不开跑；不在 backlog（新 issue 默认 todo）一指派就排队执行，移出 backlog 就是放行。Linear 官方没解释 Backlog 与 Todo 的区别。
- **上层目录的 CLAUDE.md 会被读到**：本机 `biz/CLAUDE.md` 写暗号，在 `biz/repo/.claude/worktrees/w1` 启动 Claude，读到了。

第二轮出了 Q11–Q20：知识库不进 git 指哪种、多仓库时文件怎么写、decision 里「有依据没冲突」怎么办、护栏留哪些、evidence 的边界、三个插件各装什么、issue 怎么分组、todo 谁放行、新状态清单、会话怎么找到业务根目录。

## U3

Q11 我是这么想的，公司的文件我也会放到虚拟机上，本地git仓库也可以。然后本地这些项目的知识库 我也想放到一个单独的仓库。

Q12 同意

Q13 我理解照标准做

Q14 issue 分类我觉的暂时不需要，如果我们对于issue的分类是明确定义的。对外发布我倾向于也交给我

Q15 证据放在哪由用证据的skill或者说调用方决定，excalidrawer设置为依赖，如果没有就用mermaid吧。setup的时候可以询问

Q16 implementer 我记得现在应该是不用了吧？我记得之前应该是改成了通用agent？。设计部分，我在想design-change-sync、design-steward、ui-measure都是干什么的？ui-master我记得是ui-reviewer的升级吧？

Q17 没问题，这样我们的issue 实体其实可以是一个通用的部分，顶多是针对特定平台增加一个reference。另外，如果拆成父子关系，那我们会话是否需要拆分成父会话和子会话？

Q18 关于issue的生成以及变成todo，这段流程放在哪比较合适？

Q19 这套没什么问题

Q20 同意

## A3

- **implementer 仍是专用 agent**：`implement/SKILL.md` 第 36 行每派一张工单仍起 `idea-loop:implementer`（sonnet），没有改成通用 agent。
- **设计部分各管什么**：ui-master 是设计阶段只看截图打分的评审（fable）；ui-reviewer 是实现后拿画面对冻结画布和设计档案；ui-measure 把实现和画布逐格量成会红的测试；design-change-sync 把人接受的偏差改回画布；design-steward 维护 `DESIGN.md`。ui-master 不是 ui-reviewer 的升级。
- **说明文件实测**（Claude Code 2.1.299）：业务根放 CLAUDE.md、仓库只有 AGENTS.md → 仓库的 AGENTS.md 读不到；业务根放 AGENTS.md、仓库只有 AGENTS.md → 两份都读到；业务根放 AGENTS.md、仓库有 CLAUDE.md（`@AGENTS.md`）→ 业务的读不到。在仓库 `.claude/settings.json` 写 `instructionFiles` 不生效，「两份都读」的开关不在这里，位置未查到。
- harold-skills 是公开仓库。

第三轮出了 Q21–Q26。

## U4

Q21 那就选择A

Q22 我倾向于harold-skill和toeflair都搬出去

Q23 A

Q24 A

Q25 这个是matt的triage的描述，你看看能不能参考什么https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/SKILL.md 
这块我们和开issue的入口可能会有哪些一起梳理梳理

Q26 我觉的可以一起讨论，0.2.0就应该大hhh

## A4

- **Matt 的 triage**：每个 issue 一个分类（bug / enhancement）加一个状态（等评估、等补信息、可交 agent、要人做、不做）；先查是否已实现、再复现、需要时 grill、最后写给 agent 的说明；拒掉的需求记进 `.out-of-scope/`；AI 写的评论带前缀。
- **idea-loop 开 issue 的入口有 7 处**：会话里顺手发现（spec-status「开一个待验证的 issue」，issue-session、pr-review 调）、implement 的存量问题自动开、to-spec 的 `issues open`（「spec：」issue）、seo-scan 的 `seo-issues.mjs`、retro 批了开 issue、dreaming 的「缺陷」与 design-modeling 提炼的原则、整合时新开根 issue；外加人直接在 GitHub / Linear 开。各写各的正文。
- **设计部分体量与用量**：design 的 skill 加 ui-measure 约 283KB，其中 uiux-refine 168KB、22 个文件；设计 agent 共 62KB，ui-reviewer 36KB。TOEFLAIR 从 2026-08-01 起 1232 个提交里带设计字样的 23 个，37 份 spec 只有 2 份走到冻结，设计档案 `docs/design/prod` 里 3 个页面。

第四轮出了 Q27–Q30。

## U5

Q27 同意

Q28 我倾向于retro 还是只关注聊天会话的内容对于我们的工作流的改进；关于issue的是否要从backlog 进入todo，我觉的每周应该有一个schedule 让我们进行讨论

Q29 我倾向于全留，但是我希望对于design内的一些内容做优化和提升

Q30 现在这里面我记得留了很多设计原则的reference我记得，这些内容现在是designer实现用还是ui-master打分用？

## A5

`uiux-refine/references/design/` 下 16 份设计原则约 140KB，只有 designer 读（直接读 6 份，其余由它们链出；动效段另读 2 份）；ui-master 只拿截图和方向说明的「意图」一句，`agents/ui-master.md` 第 22 行写明不给它画布代码、旧分数和 `DESIGN.md`，有意盲评。第五轮出了 Q31–Q34。

## U6

设计部分我们最好将这些文件聚焦整合成更少的文件，现在这么多文件，ai读也是一个大头

Q31 优先级我记得我们之前讨论过标准，定时分拣我倾向于定时任务每周给我一个汇总，我来判断即可，这样我理解就不需要放在dreaming里面了

Q32 我自己开的会话进行完grill之后，可以创建一个直接进todo或者关闭/搁置的issue

Q33 是的，然后我提一个建议就是harold-skills这个仓库的skill 最好按照plugin + skill 作为issue单元，方便渐进迭代。

Q24 a/c 是要做的，b/d 先不改。这样我们整个工作流issue 只会出现一个卡点那就是设计（不算pr和grill的话）

## A6

之前定的优先级标准（[[issue-intake-priority]] 第 105–107 行）：P0 线上坏了或安全问题，来了就出卡片；P1 是「本期焦点」里的模块；P2 其余，留给夜里自动跑。第六轮出了 Q35–Q40。

## U7

Q35 同意

Q36 OK

Q37 同意

Q38 先选A，linear、cmux以及codex先放到0.2.x的某个patch版本吧

Q39 可以

Q40 同意按照A

## A7

汇总时漏了「知识库和设计的改动经 PR 合进主分支」这一块：现有 17 个文件写着这条流程（to-spec 的 `land-on-main.md`、uiux-refine 的 `freeze.md`、pr-review 的 `merge.md`、`decision-rules`「只改 docs/ 的 PR 检查全过就合并」等），它默认知识库和代码在同一个仓库。

## U8

知识库、设计每次修改要提pr的那个修改在哪个需求里面

## A8

不在任何一个需求里，补成 Q41，归需求 3。

## U9

知识库的我倾向于无论是什么仓库都先分支，最后跟着代码pr 先后或者一起合入main，可以不提PR，我是担心如果在修改中就合入main，会影响到其他worktree。

## A9

由此出 Q42（父 issue 的知识库分支什么时候合）、Q43（没有代码 PR 的 issue 怎么合）。

## U10

按推荐

## U11

开始收工

## 本轮决议

| 主题 | 决议 | 出处 |
|---|---|---|
| spec 状态 | 删掉 spec 的状态机（frontmatter `status`、`spec-status.mjs`、`docs/spec/index.md` 状态列），issue 状态是唯一真相源；spec 只留 `issues:` | Q1 |
| 子 issue | 从一个父 issue 拆出来、能单独交一个 PR 的一块；工单仍是一个 PR 里的切片 | Q2 |
| 版本与模块 | 不用父子关系：版本用 milestone（Linear 用 Release），模块用分类 label（Linear 用 Project）；issue 之间的关联用正文链接（Linear 用 related） | Q3、Q17 |
| 整合 | 解散现有 10 个整合出来的组，停掉整合；issue 实体写成通用的，平台差异各放一份 reference | Q3、Q17 |
| 叫法 | 继续叫「业务」，不引入 workspace；新词业务根目录、backlog、todo、子 issue 已写进 `GLOSSARY.md` | Q4 |
| 业务根目录 | 业务根目录就是知识库所在的 git 仓库，代码仓库 clone 在它下面并忽略；单仓库也照此，知识库不再放进代码仓库 | Q5、Q21 |
| 知识库仓库 | 公司业务在虚拟机上，本地 git 仓库不连远端；个人业务每个业务一个私有仓库 | Q11、Q21 |
| 现有知识库 | harold-skills 和 TOEFLAIR 的 `docs/` 都搬到各自的知识库仓库 | Q22 |
| 文件归属 | 除了各仓库自己的 AGENTS.md，其余（docs/、PRODUCT、GLOSSARY、ISSUE_TRACKER、DESIGN、SEO、DEVELOPMENT、REVIEW、CODING_STANDARDS、issue 分类）都跟业务走；多仓库时各仓库不同处在同一份文件里按「## <仓库名>」分节 | Q6、Q12 |
| 说明文件 | 业务根目录的说明文件由上层目录自动加载；setup 看业务下的仓库用 CLAUDE.md 还是只有 AGENTS.md，决定业务根放哪一种；混用时让人打开「两份都读」（开关位置实现时再找并实测） | Q20、Q23 |
| 知识库落地 | 不开 PR：每个需求在知识库开一个分支，跟着代码 PR 合并（同时或紧接着）合进知识库 main；不在改到一半时进 main，免得影响别的 worktree | Q41 |
| 父 issue 的知识库分支 | 拆完子 issue（spec 与设计定稿）就合进知识库 main，子会话从 main 读 | Q42 |
| 没有代码的 issue | issue 进 done / canceled 时合；搁置的分支留着，恢复后接着用；两个分支改同一份文件时由合并的会话解冲突（已知限制） | Q43 |
| 父子会话 | 父 issue 一个会话：spec、grill、设计、拆子 issue；每个子 issue 一个会话照父 spec 实现、开 PR；没有子 issue 的照旧一个会话从 spec 到 PR | Q24 |
| 状态 | backlog（新进来未验证）、todo（验证过等调度）、spec、design、implement、review（PR 等人看）、blocked、done、canceled；状态名用英文，label 如 `status:todo`；去掉待设计、待实现 | Q19 |
| 分拣 | 新 skill `issue-triage`：所有开 issue 的地方都调它，正文统一写现象、在哪、从哪发现、证据；每周一次定时任务验证 backlog、在 issue 上评论证据、给人一份汇总，人定哪些进 todo、各给什么优先级、哪些关闭；不放进 dreaming，没有每天的验证 loop | Q25、Q31、Q35 |
| 借 Matt 的 triage | 先查是否已实现；记一份「不做」清单（知识库里）；AI 写的评论带前缀；判不了的写「已查清 / 还要你补」两栏，留在 backlog | Q27 |
| 开 issue 的状态 | 人自己开的会话 grill 完，可以直接开出 todo、已关闭或搁置的 issue；agent 自己发现的、人在 GitHub / Linear 上直接开的进 backlog；删 `issues open` 的「spec：」issue | Q28、Q32 |
| 优先级 | 删「本期焦点」；P1 / P2 在每周汇总时由人给；P0（线上坏了、安全）不等周会，直接进 todo 并通知；调度按 P0 → P1 → P2 派 | Q36 |
| 调度 | `issue-dispatch` 只把 todo 派成会话 | Q25 |
| retro | 只管对话里暴露出的工作流改进；它开的 issue 只开在插件仓库，不是业务 issue 的入口 | Q28、Q33 |
| harold-skills 的分类 | 以「插件 + skill」为 issue 单元：父类插件名，子类 skill 名（如 `type:idea-loop/issue-verify`），跨几个 skill 的只打父类 | Q33、Q37 |
| decision | 核心是按 spec 的方案解决 spec 提的问题；依据只认仓库规则原文、人已做的决定、产品已有做法；依据明确、没冲突就照标准做，在汇报里单列、人能推翻；依据冲突就停下问人；护栏：术语、动生产数据、真实支付、对外发布、合并改了代码的 PR；删掉「这种情况就修 / 开 issue」那类给答案的内容 | Q7、Q13、Q14 |
| evidence | 只讲证据是什么（出处、时间、版本、数字、同条件比对）和整体风格（图文结合、结论在前、图贴着它支撑的话）；配什么图交给 AI（UI 页面标注、UI flow 标注、excalidrawer 的各种图）；证据放在哪由调用方定；「要人定的写成一道题」挪进 decision | Q8、Q15 |
| 图表依赖 | idea-loop 依赖 excalidrawer 插件；没装时用 mermaid，setup 时问 | Q15 |
| 插件拆分 | 拆成 idea-loop、design、seo 三个插件；design、seo 依赖 idea-loop；idea-loop 碰到设计、UI review 时看 design 在不在，不在就跳过 | Q10、Q16 |
| design | 内容全留；文件合并成少数几份（16 份设计原则合并去重，ui-reviewer 瘦身）；入口只能人敲、设计档案用得少这两处这次不改；除 grill 和 PR 外，流程里只剩设计一个人工卡点 | Q26、Q29、Q30、Q34 |
| 版本范围 | 0.2.0 只做重构；Linear、cmux、Codex 放到之后 0.2.x 的某个补丁版本 | Q38 |
| 需求拆分 | 7 个需求，各一个 issue、一份 spec、一个 PR，挂 milestone「idea-loop 0.2.0」：issue 模型与状态、issue-triage、业务与知识库、插件拆分、decision 与 evidence、design 整合、迁移；顺序 1 → 2、3 → 7，其余并行；#220 那一组 8 个 issue 关闭，链到这份记录 | Q39 |
| 分支 | 从最新 main 重开 `release/idea-loop-0.2.0`（旧的备份为 `backup/0.2.0-release-old`），7 个需求的 PR 合进它，最后一次合进 main 发版 | Q40 |
| spec 谁写 | 7 份 spec 由各自 issue 的会话写，这场 grill 只留这份记录和术语表 | 收工 |
