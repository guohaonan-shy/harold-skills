---
type: raw
source_type: conversation
captured: 2026-08-28
title: grill —— 把 design 工作流迁入 harold-skills 并接入 idea-loop
tags: [design-workflow, idea-loop, design-plugin, plugin-migration]
related: ["[[design-plugin-idea-loop-integration]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现，取证过程/工具调用/中间推演略去。外部产物留链接不复制正文。末尾一张「本轮决议」表。

## U1

@docs/design-workflow-architecture.md 我们现在像基于这个doc里面对于我们日常build以及design的工作流进行重构，基于toefl-demo/ design-workflow的plugin、refero-skills当前最新的内容、甚至open-design的设计（这个你可能得更新下本地open-design的代码到最新），然后将design融合到我们idea-loop这个我们日常的开发工作流内。

> 引用材料：`docs/design-workflow-architecture.md`（本仓库既有文件，记录了上一轮讨论收敛的结论，见本 spec §7）。

## A1

核实了 `docs/design-workflow-architecture.md` 里的关键事实主张：`idea-loop` 本地已存在（文档以为不存在，是过时信息）；`design-lib/plugins/design`(0.2.0) 确认是唯一无损的迁移源，TOFEL-demo 实际装的是 0.0.9（不是文档说的 0.0.7），逐文件 diff 后确认它是 design-lib 的严格子集，没有任何独有内容；`design-lib` README 目前并未真的把 `landing-page/` 标"冻结"，仍是活跃的三层知识库框架（原文档说的是待办不是现状，不矛盾）。

新发现：open-design（`nexu-io/open-design`）本地 checkout 落后 origin/main 138 个 commit，工作区干净；它的 HEAD 正好停在一次"结构化 runtime workflow"的 revert（#7110）上——这块东西是把生成的 UI 对着选定的设计系统做程序化 adherence 校验，已经上线又 revert 两次，现在在一条未合并回 main 的分支上第三次重启，上游自己都没定型。它的 `design-systems/`(156 个品牌包) 是别人家产品的参考语料，性质上更接近 Refero 的 styles 研究，不是跟 `google-labs-code/design.md` 竞争的格式。

发现原文档一处错误：refero-design 现在的 SKILL.md 并没有"direct build/visual exploration/audit/asset generation"这个四路由，实际路由只按三层研究本身分（styles-first/screens-for-patterns/flows-for-journeys）。

给出第一轮 frontier（7 个问题）：plugin 位置命名 / DESIGN.md 规范维持原方案 / open-design 要不要做运行时依赖 / open-design 的程序化 adherence 校验要不要抄 / wireframe-candidates 逃生舱保不保留 / to-ticket 设计冻结字段的产物格式 / TOFEL-demo 装机动不动。

## U2

1. Q1: 这个plugin之间的平级调用，我有个问题，就是skill 调用skill是以一种什么样的交互和协议通信的，我理解这个是决策分开还是融合的一个卡点问题
2. Q2: Google lab那个仓库是官方对于design.md结构的一个约束，我认为需要将这个内容整理成一个reference，方便我们init或者modify design.md时候进行format的约束。另外，我们现在这个T1/T2/T3我觉得是需要保留的，方便我们在feature迭代的过程中迭代design.md 同时遵守design.md的规范，避免design.md结构失控。
3. Q3: refero-skills下的reference以及open design craft/ 这些规则以及现在design-workflow下的一些与项目无关的规则我们整理下，参考refero-skills那样针对规整出一个个md文件。你提到的od.craft.requires是open design内容的一些注入机制？
4. Q4: 我理解这个应该是在设计preview产物的时候需要有一些通用的lint规则，避免我们的产物输出是违背一些规则的。我觉得这个我们可以仪器做（我记得design-workflow现在就有一个hook在做这个事儿），但我们需要讨论什么样的规则适合进入lint，lint里面最后应该保留什么。
5. Q5: wireframe-candidate在现在design-workflow的设计里吗？
6. Q6: 没问题
7. Q7: TOEFL-demo这个不动

## A2

读了 design 总入口 SKILL.md：它内部路由到兄弟 skill 就是模型在同一会话里直接调用 Skill 工具，跨 plugin 只是寻址加前缀（`design:design`），机制上不区分同 plugin/跨 plugin；真正的开关是各 skill 自己的 `disable-model-invocation`。结论：维持独立 plugin，`grill` 遇到设计形状分叉时直接跨 plugin 调用 `design:design` 即可，不需要目录合并。

抓了 `google-labs-code/design.md` 的 `docs/spec.md` 和 `PHILOSOPHY.md` 原文核实：固定八节顺序、YAML frontmatter schema、"未知标题保留不报错"逐字确认，原文档 §6 映射表基本站得住；唯一偏差是 PHILOSOPHY.md 并未明文要求"每条 ban 必须带理由"，它的立场是"强参考+有意图的 do/don't 搭配"就够，但这跟我们更严格的 T3 写法不冲突。

回答 `od.craft.requires`：那是 open-design 自己私有的 skill 加载机制（他们的 agent daemon 按 frontmatter 声明选择性注入 `craft/` 里的内容进 system prompt），Claude Code 没有对应能力；我们已有的等价做法是 SKILL.md 里显式写"先读一次 xxx.md"，不需要新机制。

读了 `design-lint.mjs` 全文和 `hooks/hooks.json`：确认是 PostToolUse hook（匹配 Write|Edit），不是按需调用的仪器。列出完整规则表（7 条 P0 / 11 条 P1 / 3 条 P2），指出其中 `retired-ink`/`warm-action-tint`/`instrument-serif` 三条 P0 是硬编码进通用脚本的 Toeflair 项目专属决定，脚本自己的注释也承认这点，现有应对是"人工在 review 时标 brand-overridden"的逃生舱。给出选项：(a) 维持现状 (b) 让 lint 动态解析目标项目 DESIGN.md 的 T3 bans。推荐 (a)。

确认 wireframe-candidates 只存在于 design-lib(0.2.0)，TOFEL-demo(0.0.9) 没有——再次印证 design-lib 是唯一该抄的源。

## U3

Q4: 这些跟项目关联的内容我倾向于先暂时移除，这块我理解需要通过design.md来进行处理吧？我们现在设计的是一个比较general的框架，我觉得应该去掉。通过project-based的一些"context"注入，比如design.md 你觉得呢

## A3

核对 `design-ui/SKILL.md` 确认：target project 的 DESIGN.md 在 build 前（§3）就被读进当前会话上下文，且已有专门一节 `## DESIGN.md governance`，写着"T1 identity floors and T3 bans: never relax silently"，人工签字环节（§H）要求逐条对账 T2 偏离。也就是说"project-based context 注入"这条路径已经存在，不用新造。结论：`design-lint.mjs` 删除三条 Toeflair 专属 P0 规则，脚本只留跨项目通用的 AI-tell 检查；任何具体项目自己的品牌红线，走已存在的 DESIGN.md governance（agent 判断 + 人工签字对账），不新增结构化解析引擎，DESIGN.md 的 T3 bans 保持自由文本（跟 spec 本身立场一致）。

## U4

收工，调 to-spec 落盘。然后你给我总结一个artifacts吧，我来看看你的理解以及相关内容是否跟我的理解一致

## U5

1. grill我理解是基于一个frontier进行提问的，这个frontier是什么
2. to-spec看起来只会落下来md文档，设计我看你是在to-ticket开始实现的？我在想按照一般的开发流程，product manager一般需要和designer协作，我理解是不是grill的frontier需要有一些设计的内容，to-spec就要绘制出design的产物？

## A5

解释 frontier 定义:决策树里所有前置已经落定、现在就能回答的节点;答完一轮,依赖它的子问题解锁,进入下一轮;判断一个问题算不算本轮 frontier,标准是"依不依赖本轮还开着的另一个问题"。

指出流程图确实有个洞:只画了 to-ticket 处的设计冻结检查,没画出 grill 自己也能更早触发 design(mid-session 跨 plugin 调 `design:design`)这条路径。梳理三层分工:grill 遇到设计形状分叉时移交给 design(不自答,因为 chat 里给"推荐答案"就是凭 vibe 设计),design 走完研究+候选生成+人工选择产出"结构"作为这条分支的答案;to-spec 只落 md,§5 测试决策表"点名"是否碰到视觉正确性缝;to-ticket 只是检查设计冻结产物存不存在的关卡,不是设计发生的时间点。

## U6

我同意你关于grill只讨论产品功能以及关键决策，不跟设计细节关联；但是，我有个考虑的点，就是如果没有设计产物，有些产品的决策不一定能准确的决策出来；所以我在想转交给design阶段（我称这个阶段还是discover、research的阶段），我理解应该会讲一些设计相关的问题告诉告诉用户（design需要决策的frontier我同意由design负责）。我理解，grill结束之后，对于产品功能、关键决策以及设计"稿"我们应该是达成一致的，to-spec更多是沉淀raw以及spec（no design involve），to-ticket应该会根据tdd拆分成一个/多个fronted的ticket（基于design-port）。

所以，我理解design-ui/design-motion/design-brief/design-landing 这些可能并不需要分散成这么多了？可能类似于refero_skill，将motion/typography/icon/color/anti-slop/craft-detail等拆分成单独reference之类的？

## A6

确认 grill→design 移交的产出是"结构稿"(灰盒线框,§3 明文"No color, type, or imagery"),不是视觉稿——跟用户说的"grill 结束后该对设计稿达成一致"吻合,只是精度是结构级。指出 spec 有个洞:没写"grill 期间已经拿到 design 产物时,to-spec 该怎么引用"。

关于 skill 粒度:craft 知识内容(motion/typography/color/anti-slop)方向上确认拆成独立 reference,跟 Q3 已定的方向一致。但 design-ui/design-motion 不建议合并——不是内容话题不同,是两套独立、有先后依赖的验证协议(motion 的 `__maTimeline.seek(t)` 确定性帧检查、reduced-motion 回退检查,只能靠可执行验证拿到,而且明文要求 design-ui 签字后才能进入)。design-brief 也建议保留独立入口(调用频率跟 design 总入口不同)。

新发现:读了 `design-landing`/`design-landing-plan` 原文,它们深度耦合 `$DESIGN_LIB_ROOT/landing-page/skill/index.md`——正是原讨论稿 §1 已判死刑的自建知识库。建议 (a) 折进 design-ui 的 altitude 路由,方法论保留、allow-list 依赖去掉换 Refero 研究。

## U7

1. grill期间我觉得和design下面一个"grill"将对于定稿设计稿所需的frontier以自然语言形式告诉idea-loop（实际上可能不是这么交互的，其实就是加载了两端skill内的prompt），idea-loop通过聊天询问我。待idea-loop:grill + "design:grill" frontier都已被cover我觉得这一个阶段就应该结束了。然后，我们应该讨论，design的预览版本应该在哪个阶段产出，to-spec/grill，我倾向于to-spec，设计是最直接的一个产物（是否理解我的需求，因此这个产物应该也结合design.md，component库，motion库甚至各种asset将设计以极高的标准实现）
2. design-brief 我觉得保留没问题，如果基于#1我们的讨论，那我认为这个步骤应该放在to-spec，毕竟生成高保真的design产物是需要design.md/product.md的。同时，我理解grill阶段关于design的frontier有个部分就应该给予design.md的框架以及product.md框架结构询问用户（如果没有这两个文件）
3. landing-page的设计跟app阶段会有什么区别吗？我理解差别应该主要是一些craft rule，其他的应该都是从refero 根据page/ux pattern/视觉语言进行research。我理解如果有必要landing-page的rule可以单独拆分reference，但是不用单独拆分skill slash了。
4. design-ui/design-motion这两个是否需要合并

## A7

确认吸收机制:design 自己 §2 clarify 用 AskUserQuestion(卡片式),跟 grill 的连续编号问答是两套格式,被嵌套调用时会割裂;应该把 design 的 clarify 判据当成同一棵决策树新解锁的节点,用 grill 格式继续问,design 自己那轮 clarify 被 grill 覆盖后跳过。

产出时机做了个调和,不直接选 to-spec:to-ticket 契约明文"设计冻结是开工前置条件,不是规格完成度指标",wiki-conventions 本来就有 `等设计冻结` 这个合法 spec 状态——如果把高保真产物做成 to-spec 落盘的硬前提,会跟这条既有契约冲突。改成:grill 收工判据里,涉及 UI 的分叉不能只停在结构选择,要等 design→design-ui(→design-motion)链跑完拿到高保真预览才算清空;生产动作发生在 grill 会话内部(嵌套调用),to-spec 保持纯沉淀,但因为 grill 不提前收工,落盘时默认已有产物可引用;`等设计冻结` 留作逃生舱。

design-brief 位置:同意跟 design-ui 构建绑在一起前置,grill 的 design 子树检测到 DESIGN.md/PRODUCT.md 缺失时,把 Establish 模式判据也当新解锁的 frontier 节点问出来。

landing vs app:读完原文确认用户判断成立且更彻底——page taxonomy 分类、Hero 七槽模型是真 landing 专属,拆成单独 reference;proof map、responsive re-edit 方法论、runtime/fallback 状态模型其实是通用 craft,不该锁在 landing 里,直接并入 design-ui 通用 craft reference。不单独开 skill/slash。

design-ui/design-motion 维持不合并:动效那几道 gate 测的是时间维度上的行为正确性,只能靠"真实浏览器里 seek 到不同时间点、断言帧确实不同"这类可执行验证拿到,不是读文档能替代的判断,而且有先后依赖(design-ui 签字后才能进 design-motion),合并等于把这个先后依赖藏进一个 skill 内部的隐藏状态机,更不清楚。

## U8

1. #1有两个点我强调下，design 的 clarify 判据(who/what/proof/constraint那几条)有些内容应该是放在product.md，比如who 产品的用户群体，what 这个产品是什么？clarify依据这里我觉得需要进一步明确，这个clarify的核心目的是基于需求描述，将从refero上明确research flow/screen/style过程中不确定内容通过grill形式告诉我(需求 -> 产品功能grill -> 基于本期功能、产品描述进行grill，grill的根据应该是方便refero research的内容，比如ux pattern/page types/color/ui elements)，最终以design产物作为是否可以进入to-spec的判定(我)。我满意，我理解可以进入to-spec后面的技术实现；如果不满意我理解就要进入新的一轮grill了。design research/design implement我理解都用subagent/workflow的方式进行调用 不进入main agent的上下文，避免过程执行数据快速填充上下文窗口。
2. 你认同，我没什么补充的
3. 你认同，我没什么补充的
4. 如果分开的话，我没问题，但是上层的design orchestrator需要先UI后motion来设计，对于调用方来说，将二者分开的细节不需要暴露

## A8

确认 1a:who/what 这类 PRODUCT.md 已有的东西不该重问,呼应 design §2 现有的"anything visible in the codebase 不问"原则,补一条对称规则:先读 PRODUCT.md/DESIGN.md,只问文档答不了的。

确认 1b 是这轮最关键的重定义:clarify 问的不是设计判断本身,是让 Refero 研究能问得准的检索参数(ux pattern/page type/color/ui elements),真正的设计判断留给候选生成后的人工选择。确认"设计产物是否满意"就是"进 to-spec / 回新一轮 grill"的真正关口,且不满意时回 grill 而不是回 design 内部迭代——把这个信号当成"可能是产品判断需要重审",不是默认当"视觉细节没调好"。

指出 1c 的真实技术约束:subagent/Workflow 都没有跟真人对话等回答的通道,而 design 自己的 §2 clarify、§4 候选人工选择、design-ui §H 人工签字都要求 live 交互,不能整段塞进后台 subagent。提出交替形态:自动执行段(研究+构建)派 subagent/workflow,人工决策点留在 grill 主会话,复用 grill 本身"一轮一轮清 frontier"的节奏。

确认 4:orchestrator 抽象已经在 `design` 总入口现有职责里(§5"Motion is not automatic"),UI→motion 先后顺序判断权本来就归 `design`,调用方(grill 派发的 subagent/workflow)只调 `design` 一个入口。

## U9

1b 这一步我做一些补充，我觉得refero研究需要的信息有一部分跟product.md是一样的，就不需要以grill的方式提问我，更多还是以产品功能、用户路径/交互/体验这些点来grill我。我觉得实际上应该是这样，一个idea输入，应该会有几个纬度需要grill，设计这部分应该是产品功能frontier中的一个子树，为了确认某些产品决策，我理解ai需要多维度design research，而research又需要结合product.md、我提出的产品功能grill（如果现有信息完全足够，就不需要，但是核心的原则是不允许vibe，不能有任何假设），当frontier已经完全空了，我理解应该是可以完全handoff subagent / workflow跑任务了。

1c 我理解在1b我的补充中，应该是帮你解答了你的担忧吧（human-in-the-loop)的交互

之后我们的设计应该都会放在design-preview/这个目录下，design中的hook的监听路径可能需要改下（这是一个小细节）

这些内容你可以补进spec了，看看还有什么需要我补充的吗？

## A9

确认重定义:design 不是跟产品功能平行的独立 frontier,是产品功能 frontier 里挂着的一棵子树——某个产品决策需要设计研究才能问出好的推荐答案时,才长出这棵子树,而不是每次都强制单独走一轮。研究(Refero)是 grill 自身"事实是我的活,决策是人的活"原则的自然延伸:跟核实一个文件是否存在、一段代码是否已实现是同一类动作,只是这次核实对象换成了设计事实——用来支撑 frontier 问题的 ➡️ 推荐答案,不是让人在聊天里替 AI 做设计判断。frontier 完全清空后,一次性 handoff 给 subagent/workflow 跑纯自动的构建段(此时已经没有需要问的东西),这个简化确实解决了上一轮提出的 human-in-the-loop 担忧——不是很多次小的交替派发,是"边问边按需研究"+"问完一次性构建"两段。

核实 `design-lint-hook.mjs`:PostToolUse 的匹配正则 `/(?:design-preview|design-motion-preview)\/[^/]*\.html?$/` 已经正确限定在 `design-preview/`/`design-motion-preview/`,不是本文档最初以为的过宽匹配——这块不用改。但发现一个新的次要项:它链式调用 `impeccable` 探测器时,搜索路径是硬编码的 `~/.claude/plugins/marketplaces/impeccable/...`,不是 `${CLAUDE_PLUGIN_ROOT}` 相对解析——迁移时要核实这条链式调用在新环境下还能不能找到 impeccable,找不到时脚本本身已经优雅降级("not installed, skipped"),不是硬错误,但记一笔。

---

## 本轮决议

| 议题 | 决议 |
|---|---|
| plugin 组织形态 | harold-skills 顶层新建独立 `design` plugin（暂定名），不并入 `idea-loop/skills/` |
| 迁移源 | `design-lib/plugins/design`(0.2.0)，确认是 TOFEL-demo(0.0.9) 的严格超集 |
| 跨 plugin 调用机制 | 原生 Skill 工具 + `plugin:skill` 寻址，`grill` 遇设计形状分叉直接调用 `design:design` |
| DESIGN.md 格式 | 采用 `google-labs-code/design.md` 规范（固定八节+frontmatter），T1/T2/T3 作为其上治理层，T2 落自定义 `## Case Law` 节 |
| refero-design 接入 | 三层研究(styles/screens/flows)接成 design-ui 的研究后端；原文档"四路由"描述有误，已订正 |
| open-design 依赖形态 | 不建立机器可读路径依赖；蒸馏 `craft/` 等内容进 design plugin 自己的 references 后即止 |
| 程序化 adherence 校验 | 明确排除在这次迁移范围外（上游自己 revert 两次，还没定型） |
| wireframe-candidates | 机制保留，只重新措辞为"idea-loop 语境下的默认路径，候选生成留给结构真正开放的场景" |
| to-ticket 设计冻结字段格式 | `已冻结（<预览路径> · fidelity <n>% vs <参照> · <n> 条 decision ledger 已锁定）` |
| TOFEL-demo 现存装机 | 不动，出这次重构范围 |
| design-lint 规则集边界 | 删除 3 条项目专属 P0（retired-ink/warm-action-tint/instrument-serif）；项目专属红线改走已有的 DESIGN.md governance 机制 |
| grill 的 design 子树 | design 不是跟产品功能平行的独立 frontier，是产品功能 frontier 挂着的子树；某个产品决策需要设计研究才长出，不强制每次单独走一轮 |
| clarify 的真正目的 | 不是问设计判断本身，是给 Refero 研究定向的检索参数（ux pattern/page type/color/ui elements）；who/what 等 PRODUCT.md 已有的不重问 |
| 研究 dispatch 机制 | Refero 研究是 grill「事实是我的活」原则的延伸，派 subagent 做事实核实，用于支撑 frontier 问题的推荐答案，不是让人在聊天里替 AI 做设计判断 |
| 进 to-spec 的关口 | 高保真设计产物「是否满意」由人判定；满意→进 to-spec，不满意→回新一轮 grill（可能重审产品决策，不只是回 design 内部调视觉） |
| 自动化 vs 人工交互的边界 | frontier 完全清空前，边问边按需派 subagent 做研究；frontier 清空后，一次性 handoff 给 subagent/workflow 跑纯自动构建段（design→design-ui→按需 design-motion） |
| design 嵌套调用时的 clarify | grill 嵌套调用 design 时，design 自己的 AskUserQuestion clarify 视为已被 grill 的 frontier 覆盖，跳过；design 被人直接单独调用时仍走原生流程 |
| design-brief 位置 | 跟 design-ui 构建绑在一起前置；grill 的 design 子树检测到 DESIGN.md/PRODUCT.md 缺失时，把 Establish 模式判据当新解锁的 frontier 节点问出来 |
| design-landing/design-landing-plan | 折进 design-ui 的 altitude 路由（新增 landing/IA 档）；page taxonomy + Hero 七槽模型拆成 landing 专属 reference，proof map/responsive re-edit/runtime-fallback 状态模型并入通用 craft reference；不单独开 skill |
| design-ui/design-motion | 维持不合并——先后依赖 + 动效那几道 gate 测的是可执行验证才能拿到的时间维度行为，不是文档知识；`design` 总入口内部编排 UI→motion 顺序，调用方不需要看见 |
| design-lint hook 路径 | 已核实 `/(?:design-preview\|design-motion-preview)\/[^/]*\.html?$/` 正确限定范围，不用改；但它链式调用 impeccable 探测器用的是硬编码 `~/.claude/plugins/marketplaces/impeccable/...` 路径，不是 `${CLAUDE_PLUGIN_ROOT}` 相对解析，迁移时要核实（已有优雅降级，不是硬错误） |
