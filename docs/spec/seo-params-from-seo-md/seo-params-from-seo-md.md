---
type: spec
status: 完成
tags: [idea-loop, seo, seo-md, seo-scan, conventions]
summary: seo skill 要用的项目信息由 setup 推测确认写入；scan 缺了先停下给人确认，补进 SEO.md 再跑
related: ["[[2026-10-31-seo-params-confirm-gate]]", "[[seo-cannibalization-sitelinks]]", "[[idea-loop-seo]]"]
issues: [142]
---

# seo：skill 要用的项目信息缺了，先推测、经人确认补进 SEO.md，不在运行时自己推着用

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #142 idea-loop seo：判定要用的项目参数写进 SEO.md 由人确认，插件不在运行时自己推 | 存在 | 2026-10-31 对着 `main`（cb11785）读 `SEO.md` 的格式定义和 seo 分类全部 skill、agent：「由人写、没写不自己推」只落在品牌词一个参数上，没有通用约定；seo-scan 无人值守时，四个方法 skill 会从站点推断竞品、业务、定位直接拿去用，详情在「问题」 |

## 问题

### 1. 下一个项目信息没有约定可循

`SEO.md` 的格式定义（seo-setup 的 `references/seo-md.md`）列了七节、每节的键和谁读，末尾一段「不写进 SEO.md 的」列了插件固定的东西。它没有说：一个因项目而异、skill 要用的值，该由人确认写进 `SEO.md`，还是由 agent 运行时自己推。

现在唯一照「由人写」做的是品牌词，规则分散在三处，都只说品牌词：`seo-md.md`「品牌」那行（「没写读成空，蚕食判定不排除任何查询」）、seo-setup 第 3 步（「留空就是不排除，不自己从域名推一个写进去」）、page-optimizer 与 keyword-clustering 的「蚕食判定排除品牌查询」。这条做法来自 #81：没填品牌词怎么办，推荐的是「从域名推」，人选了「不排除」（`docs/raw/decisions/81.md` 题 1、题 3）。下一个给 seo 加参数的人读格式定义看不到它，会再面对同一道题。

### 2. 定时扫描缺信息时，agent 拿自己推的值直接用

seo-scan 由桌面 app 的定时任务每周触发，规则写着「可能没有人在场：任何一步缺数据，照下文写的记下来、接着往下走」，只有「没有 SEO.md」「项目 id 为空」两种情形停下。它派出的方向 agent 调四个方法 skill，这四个 skill 的「项目上下文」第 3 步在无人值守时会自己推：

| 方向 agent | 调的 skill | 缺什么时推断 | 推断出来的去哪 |
|---|---|---|---|
| technical-auditor | seo-audit | `business_overview`（OpenSEO 项目上下文） | 写进 `assumptions`，这次照用，不写回 |
| page-optimizer | competitor-analysis | 竞品（`SEO.md`「竞品」），调用方没点名时用 `find_serp_competitors` | 同上 |
| keyword-miner | keyword-research | `business_overview`、`current_goal` | 同上 |
| backlink-analyst | link-prospecting | `positioning`；竞品（用 `find_serp_competitors`） | 同上 |

例子：`SEO.md` 的「竞品」节为空，周一定时扫描跑 backlinks 方向。backlink-analyst 用 `find_serp_competitors` 推出一个竞品，拿它的外链档案挖候选、提成 issue。人没确认过这个竞品，下周照样再推一遍，推出来的可能不一样。

复现材料：`.tmp/to-spec/seo-params-from-seo-md/repro/grep-infer.txt`

### 根因

- 问题 1：#81 只修了品牌词，做法没有上升成格式定义里的通用约定。
- 问题 2：seo-scan 的「缺数据记下、接着走」和四个方法 skill 的无人值守推断，早于 #81 定的方向；扫描开场只查 `SEO.md` 在不在、项目 id 有没有，不查方向要用的信息齐不齐。

## 方案

改完后，seo skill 要用的项目信息只有一个来路：推测出推荐值 → 人确认或补充 → 写进它的存放处 → skill 只读写着的。分两个关卡：

- **seo-setup 做初始化**（现状已是这样，只补说明）：用已有工具和内容推测推荐值，提问让人确认，确认后写入。
- **seo-scan 开场检查**：派方向 agent 之前，查这次要跑的方向要用的信息齐不齐。缺了就推测，**停下**把推测结果摆给人，等人确认或补充；人回复后写进存放处，再往下跑。人没回复，这次扫描就停在那里，不派任何方向。

例子（同问题 2）：周一定时扫描开场发现 backlinks 要用竞品、「竞品」节为空。它用 `find_serp_competitors` 推出 `recipebox.example`、`panfry.example`，发一条桌面通知，在会话里问「竞品推测为这两个，确认、改、还是补充？」。人回「留第一个，再加 `cookpad.example`」，scan 把这两个写进 `SEO.md` 的「竞品」，接着派五个方向；下周开场竞品已齐，不再问。

同类入口：

- `seo-md.md`：**纳入**，写下这条约定和「每个方向要用的信息」表。
- seo-setup：**纳入**，第 3 步品牌那条改成引用约定；人明确留空的键写成「无」（见实现决策）。
- seo-scan：**纳入**，开场加检查关卡。
- 四个方法 skill 的无人值守分支：**纳入**，不再推断着用（见实现决策）。人在场的分支已是「推测 → 问人 → 写入」，不改。
- page-optimizer、keyword-clustering 的品牌词判定：**纳入**，只改它们读「无」的方式（读成空，照旧不排除）。
- 插件写死的判定阈值：**排除**，见 Out of scope。

## User Stories

只修问题、不加能力，不画树。

1. 期望行为（对应问题 1）：作为给 idea-loop seo 加一个新参数的维护者，我读 `SEO.md` 的格式定义就知道这个值要由 seo-setup 推测、人确认后写入，skill 只读写着的，以便不再重新面对「自己推还是让人写」这道题。
2. 期望行为（对应问题 2）：作为站长，定时扫描要用的竞品、业务这类信息缺了时，我在扫描开始前收到通知和推测结果，确认或补充后它写进 `SEO.md` 再跑，以便每一条扫描发现都建立在我确认过的信息上，同一个缺口不会每周被推出不同的值。
3. 期望行为（对应问题 2）：作为站长，我在 setup 时明确说「品牌词留空」，之后的扫描不再每周问我品牌词，以便关卡只拦真没问过的。

## 实现决策

### 约定写进 SEO.md 的格式定义

依据：issue 指定的落点；这份文件是 `SEO.md` 唯一的格式定义，加参数的人一定会改它。放在「每节读的人」表之后、「不写进 SEO.md 的」之前，两段对照着读。内容：

- 约定本身：seo 的 skill 要用的项目信息，由 seo-setup 推测推荐值、人确认后写入；skill 只读写着的；扫描开场缺了，推测、停下等人确认，写入后再跑。不在运行时推一个值直接拿去用。品牌词是第一个实例。
- 一张「每个方向要用的信息」表，扫描开场的检查照它查（下一节）。

### 每个方向要用的信息

依据：照现存的四个方法 skill「项目上下文」第 3 步写着「这个 skill 需要 X」的原文，加上 page-optimizer 判蚕食要读的品牌词：

| 方向 | 要用的信息 | 存放处 |
|---|---|---|
| technical | 业务概述 `business_overview` | OpenSEO 项目上下文 |
| pages | 竞品；品牌词 | `SEO.md` |
| keywords | 业务概述、当前目标 `current_goal` | OpenSEO 项目上下文 |
| backlinks | 定位 `positioning`；竞品 | 定位在 OpenSEO 项目上下文，竞品在 `SEO.md` |
| geo | 不新增 | — |

存放处沿用现状：业务、目标、定位是 seo-setup 写进 OpenSEO 项目上下文的，竞品、品牌词在 `SEO.md`。人在审核会话里说的是「补充在seo.md」，这里按「写进它的存放处」做：`SEO.md` 没有业务、目标、定位这几个键，把它们挪进 `SEO.md` 是两套存储的重排，单独起（「自己定的四条」第 4 条），列进 Out of scope。

### seo-scan 开场的检查关卡

依据：人的原话「关于scan时候发现某些信息不存在的时候，我觉得在执行之前可以将自己的推测结果向用户确认，如果确认或者得到用户的补充之后，这部分信息可以补充在seo.md」，以及在「先跑、事后确认 / 停下等我」两种做法里选了「停下等我」。

- 时机：定下方向列表之后、预算和派 agent 之前。方向列表为空就不查。
- 判「缺」：照上表，这次要跑的方向要用的信息里，`SEO.md` 的键没写、或 OpenSEO 项目上下文的字段为空。判定由脚本做（读 `SEO.md` 和 `context.json`，给方向列表，交回缺的项），跟挑方向、算预算一样不靠 agent 读规则判断。读不到 `context.json` 时，项目上下文那几项不查，照现状继续（不因为 OpenSEO 不通而卡住扫描）。
- 推测：竞品用 `find_serp_competitors`（花 credits，从这次的预算里出；预算不放行就不推，只问人要）；品牌词从域名去掉后缀；业务、目标、定位从站点首页推。每项带出处。
- 停下：发一条桌面通知（「seo-scan 缺 <几项>，等你确认」），在会话里列出缺的项、推测值和出处，一次最多三个问题，人一句「照推荐」就算确认。然后停下，不派任何方向。
- 人回复后：确认或补充的值写进存放处（`SEO.md` 改在工作区，跟 seo-setup 一样不提交，交回里写明改了 `SEO.md`；项目上下文用 `update_project_context`），再从预算那步往下跑。人说某项「留空」的，按下一节写成「无」。
- 手动带参数跑的扫描同样过这道关卡，人在场就是当场问。

扫描的开场从「两种情形停下」变成三种，交回模板加一种「停下等确认」的形状。

### 人明确留空写成「无」

依据：seo-setup 第 3 步的完成条件已经区分「人确认过的值」和「人明确说留空」，但写进 `SEO.md` 后两者都是空，扫描分不出「没问过」和「问过、人说不要」，会每周再问一次品牌词。这是关卡带出的必要边缘情形，按代价最小定：人明确留空的键写成 `- <键>：无`。读 `SEO.md` 的脚本把「无」读成空值、同时标成「已确认」；检查关卡只拦没写的键。品牌词写「无」，蚕食判定照旧不排除任何查询（#81 的决定不变）。

后来改了（review 第 1 轮 S3，2026-10-31）：「无」不只用在 `SEO.md` 的键上。人在提问里明确说某一项不需要，就在这一项**自己的存放处**记下来：竞品、品牌词写进 `SEO.md` 对应的节；业务概述、当前目标、定位写进 OpenSEO 项目上下文对应的那一节，内容也是「无」。缺口检查对两处一视同仁：写着「无」就是问过、不要，不再问；四个方法 skill 读到「无」当作没有这项信息。依据：人的原话「比如品牌词和竞品，如果提问过程明确选择这个步骤不需要，或者某个选项不需要，我觉得是需要在对应章节提及的」。

### 四个方法 skill 的无人值守分支不再推断着用

依据：人的方向「推测要经人确认」；扫描开场的关卡在派 agent 之前已经把要用的信息补齐，方法 skill 无人值守时就不该再碰到缺口。万一碰到（关卡被跳过、项目上下文那次读不到），推出来的值没经过人，按约定不拿来用：第 3 步的「无人值守」改成「缺了不推断，在 `assumptions` 里写明缺什么、哪部分因此没做」。例：link-prospecting 无人值守时竞品为空，就不挖竞品外链档案，assumptions 写「SEO.md 竞品为空，未挖竞品外链」。competitor-analysis 被点名竞品的情形不受影响。

## 技术方案总览

### 后端

不涉及：没有服务端。扫描会话与 OpenSEO 的调用顺序只多一段：开场 `get_project_context` 之后，跑缺口检查脚本；有缺口时调 `find_serp_competitors`（只在缺竞品时）、停下等人、人回复后 `update_project_context` 或写 `SEO.md`，再进预算。

### 前端内部

不涉及。

### 前端交互

不涉及：交互发生在桌面 app 的会话里，没有界面要设计。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：读 `SEO.md` 时「无」读成空且标成已确认；缺口检查脚本给方向列表交回缺的项 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 碰到：seo-scan、seo-setup、四个方法 skill 和 `seo-md.md` 的文字；按 `AGENTS.md` §5 不做量化 eval，关键句用文档测试钉住（仓库已有 `*-doc.test.mjs` 先例） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：
  - 读 `SEO.md` 的脚本的输出（JSON）。能抓到：「无」与没写的区分、品牌词读成空；漏掉：skill 是否照着用。
  - 缺口检查脚本：给 `SEO.md`、`context.json`、方向列表，交回缺的项。能抓到：表里每个方向查的是哪几项、读不到 `context.json` 时不查项目上下文；漏掉：agent 停下后怎么问人。
  - skill 文档本身，用文档测试钉关键句。能抓到：关卡和约定写没写；漏掉：真实扫描时会话的表现，要等一次定时扫描看。
- **增量功能测试**：
  - 前置：`SEO.md` 的「竞品」为空、「品牌」写着「无」，`context.json` 的业务概述非空。步骤：对方向 `pages backlinks` 跑缺口检查。期望：交回竞品缺失；品牌词、业务概述不在缺口里；backlinks 的定位为空时也列出。覆盖：期望行为 2、3。
  - 前置：同一份 `SEO.md`，方向列表为 `technical`。期望：不报竞品缺失。覆盖：期望行为 2。
  - 前置：本次改动合并后的 `main`。步骤：只读 `seo-md.md`，回答「要给 seo 加一个『排除的页面』参数，值从哪来、扫描时没写怎么办」。期望：能从原文引出「setup 推测、人确认写入；扫描开场缺了停下等人」。覆盖：期望行为 1。
- **prompt / eval 变动**：改 seo-scan、seo-setup、keyword-research、seo-audit、link-prospecting、competitor-analysis 的 SKILL.md，和 `seo-md.md`；seo-scan 的 allowed-tools 加上关卡要用的工具（通知、`find_serp_competitors`、写 `SEO.md`、缺口检查脚本）。不加 eval。
- **照着谁写**：`seo-scripts.test.mjs`（读 `SEO.md` 的脚本测试）；`setup-single-source.test.mjs` 这类文档测试。

## Out of scope

- 插件写死的判定阈值（page-optimizer 的 ≥ 20 次展现、站内入链不超过 2、对比文超过 90 天）：对所有项目一样，不是项目信息，归「不写进 SEO.md 的」一类；哪天要按项目调，照这条约定进 `SEO.md`，那是另一个 issue。
- 业务、目标、定位从 OpenSEO 项目上下文挪进 `SEO.md`：两套存储的重排，单独起。
- 扫描停下后人一直不回复时的提醒：这次只发一条通知；要不要隔天再提醒，等用过再看。
- page-optimizer、keyword-clustering 的品牌词判定逻辑：只改读「无」，判定不变。

## 关联

- 覆盖：#142 idea-loop seo：判定要用的项目参数写进 SEO.md 由人确认，插件不在运行时自己推
- 讨论：`[[2026-10-31-seo-params-confirm-gate]]`
- 来源：#81 的 spec `[[seo-cannibalization-sitelinks]]`（完成），决定记录 `docs/raw/decisions/81.md` 题 1、题 3
- 相邻还没完成的：
  - `[[idea-loop-seo]]`（正式，seo 分类本身的 spec）：本次在它建的 seo-scan、seo-setup、`seo-md.md` 上加关卡，不冲突。
  - #164 方向 agent 白名单写死 OpenSEO 工具名：本次给 seo-scan 加 `find_serp_competitors` 时会碰到同一类工具名写法，照它届时的结论写，不重叠。
  - #151 issue-verify 审核 seo issue 时先读原则文件：管审核流程，不重叠。
  - #187、#188、#150（seo-writing、seo-brief）：管写作，不重叠。
