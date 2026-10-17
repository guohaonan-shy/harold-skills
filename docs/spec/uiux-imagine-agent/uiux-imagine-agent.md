---
type: spec
status: 审核中
tags: [idea-loop, uiux-imagine, agent]
summary: uiux-imagine 的执行抽成专职 imaginer agent，会话只编排和摆结果
related: ["[[design-research-agent]]", "[[0002-design-loop-v2-imagine-refine]]"]
issues: [47]
---

# uiux-imagine 抽成专职的 imaginer agent，会话只编排和摆结果

> 需要 grill：这是一个新能力（多一个 plugin 自带的 agent，imagine 改成编排者 + 执行者），issue 自己列了六处要一起定的细节（生图、调研、模型、意见分流、预览服务、恢复点）；另外 issue 写的「方向说明写回 spec」跟现在的约定相反，要人定。

## 1 问题

本次复现在 2026-10-18 做，对象是 main（idea-loop 0.0.24）和 2026-10-17 Toeflair（本地 TOFEL-demo）里两场真实的 imagine → refine 会话。这几条都是「缺一个能力」，没有可截的界面，证据是对会话记录的统计和对插件现状的核对。

### 1.1 一场 imagine 把会话上下文从十几万撑到四十万

**复现到的**：按会话里调用 `uiux-imagine` 和 `uiux-refine` 的时刻把记录切成两段，数每段会话亲自做的事：

| spec | 阶段 | 会话的工具调用 | 其中 Refero / 看图 / 生图 | 会话上下文 |
|---|---|---|---|---|
| 结束练习确认（`qb-app-lr-end-session-confirm`） | imagine，约 1.5 小时 | 160 次 | 13 / 28 / 9 | 13.6 万 → 41.0 万 |
| 同上 | refine | 39 次 | — | 41.4 万 → 47.1 万 |
| 报告页失败状态（`qb-app-analysis-stream-unmount`） | imagine，约 1.5 小时 | 140 次 | 7 / 20 / 5 | 17.6 万 → 40.0 万 |
| 同上 | refine | 22 次 | — | 40.4 万 → 43.2 万 |

第一场在 refine 之后续开的会话里压缩了一次。imagine 一段就占了会话增长的绝大部分；之后 to-ticket、implement 还要在这个会话里接着用。

**本该是**：imagine 的思考、写变种板、截图、调研、渲染都留在一个专职 agent 里，会话每轮只收一份短交回（板地址、每个变种的构成说明、改了什么、要人判的取舍、参考图路径）。

### 1.2 refine 已经这样拆过，拆完会话这边很轻

**复现到的**：同两场的 refine 段，干活的是 designer 子代理：一场 219 次工具调用、上下文峰值约 50 万；另一场 203 次、峰值约 45 万。会话这边同期只有 39 次和 22 次，上下文只涨了 5.7 万和 2.8 万。人的交互没变：会话在内嵌浏览器里打开画布、转人的意见。

imagine 现在没有对应的执行者：插件自带的六个 agent 里没有它，imagine 的全部步骤写给调用会话执行；唯一交出去的是「每个随机种子独立派一个子代理想方向」，只出想法，不渲染。

**本该是**：imagine 照 refine 的结构做，一个 agent 活过整个 imagine 阶段，人的每条意见都转给同一个 agent。

### 1.3 会话被压缩或重开后，imagine 没有恢复点

**复现到的**：imagine 的工作目录里，方向说明只在收工时才写；每一轮人选了什么、变种板改了什么没有约定的落盘位置。其中一场会话临时写了一个记第一、二轮裁决的文本文件，另一场没有。refine 的恢复点（画布、ledger、方向说明）是写明了的。

**本该是**：每轮的交回落盘在 `.tmp/uiux-imagine/<spec-slug>/`，新起的 agent 从变种板和这些记录接着做。

复现材料：`.tmp/to-spec/uiux-imagine-agent/repro/2026-10-18-findings.md`

### 1.4 根因

- 1.1、1.2：imagine 写成了「调用会话亲自执行」的 skill；refine 在 #27 时拆成了编排者加 designer，imagine 没跟着拆。
- 1.3：执行都在会话里，会话本身就是记忆，所以从没需要过落盘的每轮记录。
- 修正：issue 说「生图不能放进 agent」，依据是子代理里跑 `codex exec` 生图会被自动化权限拦下。实测这条只针对 `codex exec`：两场 imagine 的生图用的都是 Toeflair 项目自己的生图工具（一个 MCP 工具），2026-09-22 一个后台子代理调这个工具 5 次、5 次都成功。所以项目有这类工具时，agent 可以自己生图；只有 `codex exec` 这条路要交回编排者。插件本身没有生图工具，这一点不变。
- 修正：issue 写「收工时 agent 写方向说明并写回 spec」。现在的约定是方向说明**不写进 spec**，只放 `.tmp/uiux-imagine/<spec-slug>/direction-note.md`，refine 冻结后删；见 §4.1。

## 2 方案

插件新增一个 imagine 的执行者（暂名 `idea-loop:imaginer`），做法照 refine 的 designer：

- 调 imagine 的会话当编排者：起静态服务、起 imaginer、每轮在内嵌浏览器里打开变种板、把人的意见分流后转回同一个 imaginer。
- imaginer 的生命周期等于整个 imagine 阶段：定高度、出变种、写变种板、调研、摆 frontier 要的内容、收工时写方向说明草稿并跑校验。每轮交回一份短结果，同时落盘作恢复点。
- 人这边不变：只和会话对话，在内嵌浏览器里看变种板。

imagine 的 SKILL.md 改成只写调用机制（同 refine 现在的写法），设计的活搬进 agent 定义。

## 3 User Stories

backlog 模式不画场景树，每条问题一行期望行为，编号对应 §1。

1. **会话只编排**：作为跑 imagine 的人，我照旧在会话里看变种板、说方向性的话；会话里每轮只多出一份交回（板地址、每个变种一两句构成说明、这轮改了什么、要我判的取舍和推荐、参考图路径），imagine 跑完之后会话还能直接接 to-ticket / implement，不用先压缩。
2. **同一个执行者接着改**：作为跑 imagine 的人，我的每条意见都转给同一个 imaginer，它在上一轮的基础上改，不重来；跟方向本身有关、要回 spec 或 grill 的意见，编排者先判断，拿不准就问我。
3. **能从中断处接上**：作为跑 imagine 的人，会话压缩或重开后，新起的 imaginer 读变种板和每轮的交回记录就能接着做，不用我把前几轮重新说一遍。

## 4 实现决策

issue 已经定下的（编排者 / agent 的分工、生命周期、每轮交回的内容、不跟人对话、不提交、不改 spec 状态、不在 imagine 之外被调用）不在这里重复，以 #47 原文为准。下面只列还没定、或修法有分歧的。

### 4.1 方向说明写回 spec，还是照旧只放 `.tmp`

issue 写「写回 spec」。ADR 0002 当初定的是写进 spec §4，后来改成了现在的约定（imagine 收工第 3 步）：不写进 spec，只交给 refine。

- **A**：照旧。方向说明只在 `.tmp/uiux-imagine/<spec-slug>/`，imaginer 写完跑校验、交回编排者核对；spec 不动。
- **B**：改成写回 spec。要改 refine 读方向说明的位置、冻结时的清理，和 [[ui-state-archive]] 正在改的产物位置冲突。

推荐 A：issue 要的「写全、refine 能重建」由现有的七节加构成清单和校验脚本保证，跟写在哪无关；B 会把一份中间产物变成 spec 的常驻内容。

### 4.2 生图

- **A**：imaginer 自己调项目里能用的生图工具（MCP 工具）；只有走 `codex exec` 的才交回编排者，由编排者生成后把图放进约定目录、告诉 imaginer。
- **B**：照 issue 的流程，一律交回编排者生成。

推荐 A：§1.4 的修正说明 MCP 生图在子代理里能跑；一律交回会让插图风格探索（这次试了线稿、卡通、黏土 3D）每轮多一次来回。生图会话的 id 和 prompt 照现有规则记录，不管谁生成。

### 4.3 调研谁起

和 [[design-research-agent]] 的 §4.1 是同一个决定：推荐 imaginer 自己起调研 agent，参考图落 `.tmp/uiux-imagine/<spec-slug>/research/`，路径放进交回，编排者摆给人。

### 4.4 种子子代理

imagine 现在每个随机种子独立派一个子代理想方向。imaginer 本身是子代理，再派就是子代理的子代理（designer 起 ui-master 已经这样跑着）。

- **A**：imaginer 照旧每个种子派一个；
- **B**：imaginer 自己连着想。

推荐 A：独立派是为了避免「第三套是前两套的平均」，这个理由跟谁来派无关。

### 4.5 模型

issue 写「不降级，继承会话的模型和思考强度」；refine 的 designer 是钉在定义里的 `opus` · high。

- **A**：继承会话（issue 的写法）；
- **B**：钉 `opus` · high，跟 designer 一致。

推荐 B：refine 的经验是「换成较弱的模型，同一个基准从能冻结退成连续 plateau」，钉住比跟着会话走更不容易被悄悄降级；要临时换版本用环境变量覆盖别名。

### 4.6 预览服务与每轮记录

- 静态服务归编排者，活到 imagine 收工；imaginer 自己起的服务（抓线上组件时的开发服务器、接收抓取的服务）自己停。app 在回合结束时会停掉 `preview_start` 起的服务，所以编排者每次打开变种板前先探端口，不通就重起。
- 每轮交回原文追加进 `.tmp/uiux-imagine/<spec-slug>/` 下一份固定的记录文件，作为 §1.3 的恢复点；收工时随渲染物一起删，方向说明留着。

### 4.7 人的意见怎么分流

照 refine 的分流表写一份 imagine 版：「改这个变种 / 再推一格」转给 imaginer；「这个问题本身要重新想」回 spec 或 grill；拿不准问人。执行层的意见（字号、颜色）照旧进待打磨清单，由 imaginer 记。

## 5 技术方案总览

### 5.1 后端

这里的「后端」是插件里的 agent、调研与生图、内嵌浏览器和静态服务。

![imaginer 时序](assets/sequence-imaginer.png)

红色是本 spec 新增的消息，虚线是响应。

- 新增 imaginer 的定义：输入是 spec 路径、`DESIGN.md` / `PRODUCT.md` 路径、人的原话（编排者不改写），第一轮之后加上一轮选中的变种；每轮交回板地址与 `?variant=` / `?state=` 参数、每个变种的构成说明、本轮改动、取舍与推荐、参考图路径；收工交回方向说明草稿和校验结果。
- imagine 的 SKILL.md 改成编排者的说明：什么时候跑、起服务、起 imaginer、每轮摆给人、意见分流、恢复。
- 第 4 步的调研与生图按 §4.2、§4.3 的决定走。

### 5.2 前端内部

不涉及。

### 5.3 前端交互

不涉及。变种板是 imagine 已有的产物，本 spec 只改谁来写它，不改它给人的样子。

## 6 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑 / 数据转换 | TDD 单元 | 不涉及：方向说明校验脚本不改。若为每轮交回记录加形状校验，照现有脚本旁的 `*.test.mjs` 写。 |
| API 契约 | TDD API 测试 | 不涉及。 |
| DB schema / 迁移 / 并发 | 真 DB 测试 | 不涉及。 |
| LLM 输出质量 | eval | 碰到：imagine 的执行搬进 agent，是 `idea-loop/evals/` baseline 钉住的三个 skill 之一；改完对 baseline 重跑，断言「环还接着」（方向说明过校验、refine 能从它开工）。不新建 eval 轴。 |
| 视觉正确性 | UI 实现环 | 不涉及。 |
| 端到端用户流程 | 浏览器测试 | 碰到：在 Toeflair 上对一份碰 UI 的 spec 跑一次完整 imagine，至少两轮，中途重开一次会话。 |

- **seam**：编排者与 imaginer 之间的交回（每轮一份文本加变种板地址）和收工时的方向说明文件。方向说明那边沿用现有的校验脚本。
- **增量功能测试**：
  - 会话只编排：步骤——跑两轮 imagine；期望——会话里没有写变种板、截图、Refero 调用，只有起服务、起 imaginer、打开变种板、转意见；会话上下文的增长远小于 §1.1 的量级。覆盖 1。
  - 同一个执行者：步骤——第一轮后说「往 B 那边再推一格」；期望——转给的是同一个 imaginer，新板在 B 的基础上改。覆盖 2。
  - 意见分流：步骤——说一句「这块要不要存在都得重想」；期望——编排者不转给 imaginer，先问人是否回 spec / grill。覆盖 2。
  - 恢复：步骤——第二轮后重开会话再调 imagine；期望——新 imaginer 读交回记录和变种板接着第三轮。覆盖 3。
  - 收工：期望——方向说明过校验、交回编排者核对后 imaginer 才结束，渲染物清掉，方向说明留着。覆盖 1。
- **prompt / eval 变动**：新增 imaginer 的定义；imagine 的 SKILL.md 改成编排说明；README 与仓库 CLAUDE.md 里对 imagine 的描述同步。重跑 imagine 的 baseline。
- 先例：`agents/designer.md` 与 refine 的 SKILL.md（编排者 + 执行者的写法、SendMessage 转意见、恢复点）。

## 7 Out of scope

- 调研 agent 本身（#46，另一份 spec [[design-research-agent]]）。
- 改方向说明的七节和构成清单。
- 改 imagine 的三条纪律、高度表、结束判据。
- 给插件加生图工具。

## 8 关联

- #47 idea-loop uiux-imagine：抽成专职 agent，生命周期同整个 imagine 阶段，会话只做编排和摆结果——本 spec 的来源。
- [[design-research-agent]]（#46）：调研抽成 agent；§4.3 要和它一起定。
- [[ui-state-archive]]（#28）：改 imagine / refine 产物的位置，影响 §4.1、§4.6。
- [[0002-design-loop-v2-imagine-refine]]：imagine / refine 的结构；它原本把方向说明写进 spec §4，后来改成只放 `.tmp`（§4.1）。
- issue 原文提到的相关 issue：#26（imagine 默认在内嵌浏览器里开）、#27（refine 起专职执行者）。
