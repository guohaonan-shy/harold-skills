---
type: spec
status: 审核中
tags: [idea-loop, uiux-imagine, uiux-refine, research, agent]
summary: 把 Refero 设计调研抽成单独的调研 agent，参考图落本地给人看
related: ["[[uiux-imagine-agent]]", "[[0002-design-loop-v2-imagine-refine]]"]
issues: [46]
---

# 设计调研交给一个单独的调研 agent，参考图落到本地给人看

> 需要 grill：这是一个新能力（多一个 plugin 自带的 agent），issue 给的边界是草案；谁来起它（imagine 会话、designer、还是将来的 imaginer）要和 #47 一起定，模型和工具范围 issue 没写。

## 1 问题

本次复现在 2026-10-18 做，对象是 main（idea-loop 0.0.24）和 2026-10-17 Toeflair（本地 TOFEL-demo）里两场真实的 `uiux-imagine` 会话。这几条都是「缺一个能力」，没有可截的界面，证据是对会话记录的统计和对插件现状的核对。

### 1.1 每查一个具名问题，imagine 会话就多出两三万 token 的调研过程

**复现到的**：把会话记录里相隔 10 分钟内的 Refero 调用算成「一次调研」，数这次调研期间会话的工具调用和上下文增长：

| 会话（spec） | 调研的问题 | 工具调用 | 会话上下文 |
|---|---|---|---|
| 报告页失败状态（`qb-app-analysis-stream-unmount`，imagine 第 4 轮） | 失败页 / 出错插图怎么做 | 7 次（搜 3 次、取图 4 次） | 29.7 万 → 31.6 万 |
| 结束练习确认（`qb-app-lr-end-session-confirm`，第 2 轮） | 退出确认弹窗怎么摆 | 9 次（搜 5 次、取图 4 次） | 20.6 万 → 22.8 万 |
| 同上（第 3 轮） | 暂停后怎么恢复 | 4 次（流程、截图各查一次） | 30.0 万 → 33.1 万 |

取图那一步把参考截图整张塞进会话（单次 1.2–6.5 万字符）。这些图人看过一次就没用了，但它们一直留在会话里，跟着 imagine 后面的每一轮，再跟着 refine、to-ticket、implement。

**本该是**：会话只发一个具名问题、收一份短结果（每个来源三行记录、参考图的本地路径），查的过程留在别处。

### 1.2 参考图有没有摆给人看，靠每次临场发挥

**复现到的**：同一天两场 imagine：一场在第 4 轮把四张 Refero 参考临时拷到对比页旁边摆出来；另一场第 2 轮把调研结论写成聊天里的一段文字，人看不到原图。插件里没有「参考图落到哪、怎么摆给人」的约定——研究契约只规定三行记录写进方向说明。

Toeflair 的项目记忆里写着当初刻意把调研留在主会话的原因：人要亲眼看参考图和从中提炼的取舍，才能自己判断、中途纠偏；交给子代理只回一段文字，人就看不到原图了。

**本该是**：每次调研的参考图都下载到调用方约定的本地目录，调用方拿着路径摆到对比页或发给人。

### 1.3 调研怎么查，三个调用方各自从同一份契约里读一遍

**复现到的**：引用研究契约的有三处——imagine 的「参考研究」一节、designer 遇到 `pattern` 类 finding 时、静态 UI 协议的 C 段。每处都要求执行者自己读契约、自己选层、自己查、自己写三行记录。

**本该是**：调用方只写一句具名问题和选定的层，怎么查、怎么记由同一个执行者负责。

复现材料：`.tmp/to-spec/design-research-agent/repro/2026-10-18-findings.md`

### 1.4 根因

- 1.1：调研的执行写在 imagine 的流程里，由调用 imagine 的会话亲自跑；Refero 取图工具的返回是图片本身，不落盘，所以只能进会话上下文。
- 1.2：研究契约只规定了文字记录（三行）落在哪，没规定参考图落在哪、谁摆给人。
- 1.3：契约是一份「怎么做」的说明，没有执行者；每个调用方都得自己当执行者。
- 修正：issue 认为 refine 的 C 段调研也全在主会话。实测 refine 里的调研由 designer 自己做——在 designer 这个子代理的上下文里，不在编排会话（同一天 designer 子代理调了 Refero 搜索 2 次、取详情 1 次）。所以「吃会话上下文」只发生在 imagine；refine 那边的收益是 designer 自己的上下文变轻、和 1.3 的统一。
- 可行性：子代理能调 Refero（上一条就是）；搜索结果里带参考截图的下载地址，参考图能落到本地。

## 2 方案

插件新增一个调研 agent（和 designer、ui-master 同一类：调用方起、交回结果就结束）。调用方给它一句具名问题、选定的层（styles / screens / flows）、平台、产品上下文（`DESIGN.md` 路径、当前选中变种的一句话描述）和一个本地目录；它查完把每个来源的三行记录、参考图的本地路径和 Refero 的 screen / flow id 交回。几个具名问题可以各起一个、并行查。

研究契约保留，改成写给这个 agent 读；三个调用方那里只留「什么时候可以查」（第一批变种出现之前不查，仍由调用方守）和「怎么起它、拿到结果之后摆给人」。

## 3 User Stories

backlog 模式不画场景树，每条问题一行期望行为，编号对应 §1。

1. **会话只收结果**：作为跑 imagine 的人，查一个具名问题之后，会话里只多出一份短结果（三行记录、图的本地路径和 id），没有搜索和取图的过程，也没有塞进会话的整张截图。
2. **参考图每次都看得到**：作为跑 imagine / refine 的人，每次调研的参考图都在本地目录里，调用方把它们摆到对比页或发给我，我能对着原图看它们的取舍。
3. **一处执行**：作为维护 idea-loop 的人，imagine、designer、静态 UI 协议 C 段都通过起这个 agent 调研，怎么选层、怎么查、怎么记只写在一处。

## 4 实现决策

issue 已经定下的（输入、输出、不下方向结论、不做 reference-averaging、不改画布、不跟人对话、参考图必须落本地）不在这里重复，以 #46 原文为准。下面只列还没定、或修法有分歧的。

### 4.1 imagine 抽成 agent 之后（#47），谁起调研 agent

- **A**：执行设计的那个 agent 自己起（imagine 的执行者、designer），跟 designer 每轮起 ui-master 一样；参考图落到约定目录，执行者把路径放进交回，编排者摆给人。
- **B**：执行者交回一个具名问题，由编排会话起调研 agent，拿到结果再转回执行者。

推荐 A：编排会话只多读一份交回，图照样摆给人；B 多一次来回，执行者要停下等。代价是调研 agent 成了子代理的子代理——designer 起 ui-master 已经这样跑着。#47 没落地之前，imagine 会话自己起它。

### 4.2 模型与思考强度

issue 没写。调研是检索加判断（选来源、写取舍），不是发散。

- **A**：`sonnet` · high，省额度；
- **B**：继承调用方。

推荐 A，钉在 agent 定义里（同 implementer 的写法）；审核时人若认为三行记录的质量对模型敏感，改 B。

### 4.3 参考图落在哪、怎么命名

- 目录由调用方给：imagine 是 `.tmp/uiux-imagine/<spec-slug>/research/`，refine 是 `.tmp/uiux-refine/<spec-slug>/research/`，随各自目录的生命周期删。
- 文件名带问题序号和 Refero id，同一个问题的几张图排在一起；交回里每张图跟它那份三行记录对应。
- 与 [[ui-state-archive]] 的关系：那份 spec 要把 refine 的过程产物挪进 `docs/design/tmp/<spec-slug>/`；两份谁先合，后合的那份跟着改路径。

### 4.4 工具范围

只给 Refero 的几个工具、下载参考图要用的命令、读写本地文件。不给浏览器、不给起子代理。

## 5 技术方案总览

### 5.1 后端

这里的「后端」是插件里的 agent、Refero 和本地目录。

![调研 agent 时序](assets/sequence-research-agent.png)

红色是本 spec 新增的消息，虚线是响应。

- 新增调研 agent 的定义。输入：具名问题、层、平台、产品上下文、落图目录。输出：每个来源的三行记录、参考图本地路径、screen / flow id。
- 研究契约改成写给这个 agent；imagine 的「参考研究」一节、designer 的 `pattern` 路由、静态 UI 协议 C 段改成「起调研 agent」。
- 「第一批变种出现之前不查」仍由调用方守，agent 不判断。

### 5.2 前端内部

不涉及。

### 5.3 前端交互

不涉及。参考图摆在 imagine 的对比页上，那是 imagine 已有的产物，本 spec 不改对比页的设计。

## 6 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑 / 数据转换 | TDD 单元 | 碰到一处：如果交回形状交给脚本校验（每个来源三行齐、每张图路径存在、id 非空），照现有脚本旁的 `*.test.mjs` 写。不加脚本就不涉及。 |
| API 契约 | TDD API 测试 | 不涉及。 |
| DB schema / 迁移 / 并发 | 真 DB 测试 | 不涉及。 |
| LLM 输出质量 | eval | 碰到但不新建套件：新 agent 和改动的说明是提示词改动，按仓库约定走 vibe 迭代；imagine / refine 改了调研那一步，对 `idea-loop/evals/` 的 baseline 重跑一次，断言「环还接着」。 |
| 视觉正确性 | UI 实现环 | 不涉及。 |
| 端到端用户流程 | 浏览器测试 | 碰到：在 Toeflair 上跑一轮 imagine，提一个具名问题，走一遍「起调研 agent → 图落本地 → 对比页摆出来」。 |

- **seam**：调研 agent 的交回（一份文本加一个目录）是唯一的 seam；有校验脚本的话，seam 是脚本的命令行入口和退出码。
- **增量功能测试**：
  - 会话只收结果：前置——imagine 已出第一批变种；步骤——人提一个具名问题；期望——会话里只出现调研 agent 的交回，没有 Refero 调用和整张截图。覆盖 1。
  - 参考图落本地：同上；期望——约定目录下有交回里列的每张图，对比页上摆出来了。覆盖 2。
  - 不在第一批变种之前查：前置——imagine 刚开工；期望——调用方不起调研 agent。覆盖 1。
  - 三处调用：designer 遇到 `pattern` finding 时起的是同一个 agent，交回形状一致。覆盖 3。
- **prompt / eval 变动**：新增调研 agent 的定义；改研究契约、imagine 的说明、designer 的说明、静态 UI 协议 C 段。不新建 eval 轴，只重跑现有 baseline。
- 先例：`agents/ui-master.md`（调用方每次新起、交回即结束）、`agents/explorer.md`（钉 `haiku` 的写法）。

## 7 Out of scope

- 把 imagine 本身抽成 agent（#47，另一份 spec [[uiux-imagine-agent]]）。
- `design-modeling` 的 styles 压力测试接这个 agent（issue 提到「以后」，现在 `design-modeling` 不引用研究契约）。
- 改「第一批变种出现之前不查」这条硬规则。
- 换掉 Refero 或加别的调研来源。

## 8 关联

- #46 idea-loop：把设计调研（Refero research）抽成单独的 agent——本 spec 的来源。
- [[uiux-imagine-agent]]（#47）：imagine 抽成 agent；§4.1 谁起调研 agent 要和它一起定。
- [[ui-state-archive]]（#28）：改 refine 过程产物的位置，影响 §4.3 的落图目录。
- [[0002-design-loop-v2-imagine-refine]]：imagine / refine 现在的结构。
