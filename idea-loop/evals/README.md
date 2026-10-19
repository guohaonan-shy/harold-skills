# baseline eval

这几个 skill 会长期改 rubric、改 prompt、改 SKILL.md。**没有基准就没法判断一次改动是好是坏**——
改完读一遍觉得"更顺了"，跟改之前读一遍觉得"挺顺的"，是同一种感觉。

所以这里钉了一个 baseline：**一个真实 case，一次跑完存档，此后每次改都对着它重跑。**

## 这是对本仓库那条约定的有意例外

仓库根 `CLAUDE.md` 的 §5 写着：这些 skill 输出主观性强，**跳过 quantitative eval**，vibe-based iteration 即可。

那条约定在绝大多数 skill 上是对的——一份研究方案、一张图表的风格，跑十遍拿一个平均分说明不了什么，
而建 eval 的成本会压过它带来的判断力。

**这三个 skill 是例外，理由不是"它们更重要"，是它们的迭代形状不同**：

| 一般的 skill | `prototype` / `uiux-imagine` / `uiux-refine` |
|---|---|
| 写完基本定型，偶尔补一条 | rubric 的分数带、评委 prompt、种子指令、方向说明的七节——**这几样注定要反复改** |
| 改动的影响当场就看得出来 | 改一条 rubric 的措辞，影响落在**下一次收敛环第几轮停**上，当场看不出来 |
| 输出是一次性的交付物 | 输出是**下游 skill 的输入**（方向说明喂 refine，冻结摘要喂 to-ticket），形状错了要到两步之后才炸 |

所以这里存的不是"分数"，是**形状的基准线**：断言只判"环还接着吗、契约还守着吗"，
不判"这个设计好不好看"。好不好看要人自己去看 `run-baseline.mjs` 留下的产物，那是这一层不该替他做的判断。

**不为评语和方向说明的质量建 promptfoo 套件。** 质量走这个 baseline：跑完的画布、评语、方向说明都在
产物目录里，人对着上一次的存档看差别。再建一套按语义打分的 LLM judge，等于再引入一个需要自己被
校准的东西，而校准它的成本比它省下的判断力更高。

## 整条环的接通检查是断言，不是干跑

`spec` 的 §5 seam 3 把"整条环还接不接得上"的验收并进了这个 baseline，**不另做一次性干跑**。

理由是：**干跑的结论会随会话消失，断言不会。** 一次手工干跑跑完，结论住在当时那个会话的最后一段话里；
三周后有人改了 `to-ticket` 的一行，没有任何东西会红。

写成断言的那几条（全文在 `assert.mjs`）：

- 原型的 HTML 与裁决落进 raw 桶，页面顶部那句问题与裁决记录里的是同一句
- grill 来的 spec 落进 `docs/spec/<slug>/<slug>.md`、状态 `审核中`，§4 把结构决策挂在原型证据上，技术方案总览三小节齐、前端交互标着待补图
- 设计还没冻结的 `设计中` spec，人说了同意，`to-ticket` 也一张票都不切、不翻状态
- 发散准出方向说明与交接画布两样（方向说明过 `direction-note-check`，落在项目根 `.tmp/uiux-imagine/<slug>/`；`handoff/` 能单独打开、素材都在、读 `?state=`），不改 spec、不翻状态，对比页与落选变种清掉，不往仓库里留渲染物
- **会话只编排**：整条 imagine 那一格里，调用会话自己的工具调用里没有写变种板、截图、Refero 调用（证据取自事件流，子代理的调用不计），并且起过 `uiux-imaginer`；收工时会话自己跑过方向说明校验、之后才放 agent 结束
- 每轮交回都追加进了每轮记录（`rounds.md` 收工会被清掉，所以读的是 agent 写它的那几次调用），轮号连续，脚本化的人的七条反应逐字落在记录里
- 构成清单每项行末带来源标记，且至少有一项是人选定的；方向没定前的四条执行层话进了待打磨清单、对应那几轮的交回说「记进待打磨」
- **`uiux-imaginer` 直跑**（不经过 skill）：从前两轮的记录与变种板接着做第三轮，不重做；交回带齐约定的几项；方向定下后人说「这个改在 B 上给我看」，改在选中那一版上、构成清单里对应项是人选定；收工导出交接画布，方向说明过校验
- **refine 从交接画布起手**：ledger 第一行有「起手：交接画布…没有重抓线上组件」，画布保留着交接画布的锚点，designer 没有重抓线上组件；评委碰到人选定的项时交回里有「与人选定冲突」，人说保留后那一项进 `excluded` 不计分、ledger 记「人保留（日期）」
- **没有交接画布的退路**：会话先告诉人，designer 第一次交回里明说走了从文字重建的退路
- 收敛冻结之后：`docs/design/<spec-slug>/` 里有画布、矩阵每格截图、带 ledger 全文的 `<spec-slug>-design.md`；spec §4 写入「冻结摘要」、§5.3 换成 `assets/flows/` 下的交互图；`/tmp` 两个目录清掉；状态留在 `设计中`
- 全仓无跨 plugin 的 skill 调用

## case

`case/` 是 Toeflair 的练习记录页——本 plugin 被通用化出来的那个真项目，自带最小的 `DESIGN.md` 与
`PRODUCT.md`。为什么是它、"最小"最小在哪、`stages/` 是干什么的，见 [`case/README.md`](./case/README.md)。

## 怎么跑

```bash
node idea-loop/evals/run-baseline.mjs                      # 全跑，产物落 /tmp/idea-loop-eval/<时间戳>/
node idea-loop/evals/run-baseline.mjs --only refine-freeze # 只跑一格
node idea-loop/evals/run-baseline.mjs --out <dir> --grade-only   # 不重跑，只重判（改了断言时用）
node idea-loop/evals/run-baseline.mjs --archive idea-loop/evals/baseline   # 跑完顺手更新存档
```

> **存档落后于 skill（2026-10-09）**：#25–#27 改了 to-spec 的模板（技术方案总览）、imagine 的准出（方向说明落 `/tmp`、构成清单）、
> refine 的执行方式（designer agent + 编排者、交互图写回 spec），断言与 fixture 已同步，**`baseline/` 里的存档还是改动之前那一跑**，
> 新加的断言（`spec-has-technical-overview` / `imagine-leaves-spec-untouched` / `freeze-writes-interaction-flows` / `freeze-clears-tmp`）在存档里没有记录。
> 下次重跑时连同 `--archive` 一起更新。
>
> **存档落后于 skill（2026-10-19，uiux-imagine-agent）**：imagine 拆成会话编排加 `uiux-imaginer`、收工多交一张交接画布、refine 从交接画布起手、
> 构成清单每项标来源、评委的 finding 碰到人选定项时 designer 拦下摆给人。断言、fixture、runner 已同步，**`baseline/` 里的存档仍是 2026-09-13 那一跑**：
> `imagine-ships-only-the-note` 改名为 `imagine-ships-note-and-handoff`；新加的 13 条断言与两个新格（`imaginer-resumes-round-3`、`refine-no-handoff-fallback`）在存档里没有记录。
> 那一跑也没有会话记录（runner 当时用 `--output-format json`），所以依赖会话记录的断言对旧存档只会报「没有会话记录」。**整跑一次、`--archive` 更新存档之后，这段说明就该删。**
>
> refine 的两个 agent 写的是模型**别名**（designer `opus`、ui-master `fable`），解析到哪个版本取决于跑的那份命令行 `claude`。所以每格的 `run.meta.json` 记下这一跑实际调用过的模型（`usage.models`，含 subagent），`benchmark.json` 记 `claude_version`——两次 baseline 对不上时，先看是不是模型换了，再看 prompt。

**跑一次要多久、多少钱**（存档那一跑的实测，Opus 5）：

| 格 | 时长 | 花费 |
|---|---|---|
| `prototype-state-model` | 270s | $1.66 |
| `to-spec-ui-freeze` | 241s | $1.06 |
| `to-ticket-unfrozen-gate` | 249s | $1.13 |
| `imagine-direction-note` | 552s | $2.39 |
| **`refine-freeze`** | **3052s** | **$22.28** |
| `repo-static` | — | — |
| 合计 | ~75 min | **$28.53** |

**uiux-imagine-agent 之后新增与加重的格**——下面是**估计，不是实测**：按存档里同类的格（agent 加评委环那一格 3052s / $22.28）折的量级，**第一次整跑后用实测回填，并把「估计」两个字删掉**：

| 格 | 起始状态（seed） | 估计时长 | 估计花费 | 变了什么 |
|---|---|---|---|---|
| `imagine-direction-note` | raw、spec、（无） | 30–60 min | $8–15 | 原来 552s / $2.39 是会话亲自做；现在要起 `uiux-imaginer`（opus · high）渲染八轮变种板并截图自检，再导出交接画布 |
| `imaginer-resumes-round-3`（新） | 前两轮的 `board.html` 与 `rounds.md`（`imagine-resume`） | 10–25 min | $3–7 | 不经过 skill，起 agent 做第三轮加收工 |
| `refine-freeze` | 方向说明 + 交接画布（`handoff`） | 25–55 min | $10–20 | 从交接画布起手，省掉基线克隆与重建；评委环与冻结不变 |
| `refine-no-handoff-fallback`（新） | 只有方向说明 | 15–30 min | $6–11 | 走退路从文字重建，第一次交回后人说停 |

整跑一次（**只跑 imagine 两格与 refine 那一格**；`claude -p` 花钱，按惯例晚上跑，不在白天由会话跑）：

```bash
node idea-loop/evals/run-baseline.mjs \
  --only imagine-direction-note,imaginer-resumes-round-3,refine-freeze \
  --out /tmp/idea-loop-eval/imagine-agent-$(date +%F)
```

退路那一格是可选的第四格，另给一个 `--out`（`benchmark.json` 每次整份重写，同一个目录会被后一次盖掉）：

```bash
node idea-loop/evals/run-baseline.mjs --only refine-no-handoff-fallback --out /tmp/idea-loop-eval/imagine-agent-fallback-$(date +%F)
```

跑完后**用同一个 `--out` 加 `--grade-only` 重判**（改断言时也这样，不用再花钱）：

```bash
node idea-loop/evals/run-baseline.mjs --only imagine-direction-note,imaginer-resumes-round-3,refine-freeze \
  --out /tmp/idea-loop-eval/imagine-agent-<日期> --grade-only
```

`--grade-only` 要求 `--out` 里那一格有 `<格名>/project/` 与 `before.json`（整跑时写下的），本机没有任何一次整跑留下的目录，所以**必须先整跑一次**。

**`uiux-refine` 是长杆**，一格占掉四分之三的时间和钱——完整的评委环、五格矩阵截图、
减法与 AI tells 两轮。`--timeout-min` 默认 120 就是按它定的；砍小了它会在评委环中途被墙钟切断，
留下一块没冻结的画布和五条红断言，而那五条红的是**预算，不是环**。
只改了发散侧的 prompt 就别全跑，`--only imagine-direction-note` 三块钱解决。

三件事值得知道：

1. **`--plugin-dir` 指向工作树里的 `idea-loop/`，不是装好的那份。** 装好的那份是上一次发布的版本；
   对着它跑出来的结果说明不了这次改动是好是坏。
2. **prompt 里那份「人的回答」是脚本化的人。** 这条环每一段都停在人身上——发散要人一轮一轮给方向性
   反应，收敛的每一个出口（方向级 finding、plateau、签字）都是人。没有这个脚本，一次无人值守的跑会停在
   第一个闸门上。脚本给的**只是方向性反应，不是答案**：它不替模型做设计，它只扮演那个会说
   "这个不行，手机上折线会把标题挤到第二行"的人。
3. **一格一份干净副本。** 每格从 `case/project` 复制起步，按 `seed` 补上它该有的起始状态。
   收敛那一格不先跑一遍发散——它红了你得分得清是谁红的。

## 怎么读结果

- `benchmark.json` —— 每格过了几条断言、跑了多久、花了多少钱
- `<eval-name>/grading.json` —— 逐条断言的 `passed` 与 `evidence`（evidence 是证据，不是措辞）
- `<eval-name>/result.txt` —— 那一跑最后说的话
- `<eval-name>/run.stream.jsonl` 与 `session.json` —— 那一跑的事件流，和压出来的摘要（谁调了什么、子代理交回了什么）。**这是「会话只编排」「交回里出现过与人选定冲突」这几条断言的证据来源**，量具在 `session.mjs`；流里有截图的 base64，可能很大，只在 `--out` 那份里，存档不带
- `<eval-name>/project/` —— **跑完的整个项目目录**，画布（`docs/design/`）、方向说明、ticket、raw 桶都在里面（只在 `--out` 那份里，存档不带）

`baseline/` 是存档的那一次：只留 `benchmark.json` 与每格的 `grading.json` / `result.txt` / `run.meta.json`，
不留整个项目目录——那份几十兆的产物属于跑它的那台机器，不属于仓库。**要比的是断言的红绿和证据，不是像素。**

## 新断言红了，先判是环红还是断言写错

第一次整跑后，对每一条红的断言按下表分诊，**把结论逐条写进 PR 或这份 README**。红在「环」上的去改 skill / agent；红在「断言」上的去改 `assert.mjs`，用 `--grade-only` 重判，不用重跑。

| 断言 | 先看什么 | 多半是环红 | 多半是断言写错 |
|---|---|---|---|
| `session-only-orchestrates` | `session.json` 里 `sub` 为 false 的 `tool_use` | 会话自己有 `Write board.html`、截图、`mcp__refero__*` | 没有一条 `sub: true` 的事件、而子代理确实干了活：事件流里子代理的消息没带 `parent_tool_use_id`（本断言按它区分会话与子代理，第一次整跑要核实这一点）；或 Agent 调用的 `subagent_type` 不含 `uiux-imaginer` |
| `imagine-rounds-recorded`、`imagine-parks-execution-remarks` | `rounds.md` 的原文（整条 skill 那格已被清掉，读的是 agent 写它的调用） | 轮号断了、人的话没落进记录、第 4–7 条的交回说「已改在」 | agent 用的不是 `## 第 N 轮` 标题，或把人的话改写了（记录要求逐字） |
| `imaginer-handback-carries-agreed-items` | 第三轮「交回原文」里的字眼 | 约定的几项真的缺了 | 它用了别的说法（断言按「板地址、赌、本轮改动、七节、要人回、取舍」这几个词找）——改断言的词表，别逼 agent 背词 |
| `imaginer-applies-in-place-after-pick` | 构成清单「颜色」一行；第三轮交回有没有「已改在 B」 | 没改在 B 上，或记成了模型代填 | 重试按钮的话被归到了别的构成项（比如「尺寸与字号」）——断言只认「颜色」，需要时放宽 |
| `refine-conflict-held-by-human` | designer 的交回里有没有「与人选定冲突」 | 评委碰了人选定的项，designer 却改了 | **评委这一跑根本没碰种子里那条人选定的项**（组头标签、标题、pill 紧挨着排）——没有冲突就没有证据，换一条更招眼的种子，不是环的问题 |
| `refine-starts-from-handoff` | 冻结记录「打磨轨迹」第一行；锚点保留比例 | 起手行没写、画布从零重建 | designer 合理地改了锚点名（锚点保留比例阈值 0.6） |
| `handoff-canvas-is-standalone` | 它报的第一条问题 | 素材 404、残留 `?variant=`、写死 localhost | 画布没有动效所以没写 `prefers-reduced-motion`（断言要求它有） |

量具对着**造出来的**产物目录演练过（好的一份全绿、每条坏的一份红在该红的那一条上），但没有对着真跑的产物验过——真跑之前，「红」先怀疑量具，再怀疑环。

## 断言自己为什么没有单测

`assert.mjs` 是 eval 的**量具本身**，不是被测的东西。给它灌一个假的项目目录来验它，
验的是那个假目录。它的验证方式是**被真的跑过**：存档里每一条断言旁边都带着它当时读到的证据，
一条断言如果永远绿、证据永远是同一句，那它没在量任何东西——那才是要去看的信号。

（这跟本 plugin 里 `scripts/` 那几个纯函数不同：那几个是被下游依赖的确定性核心，
它们有单测，一条命令跑：`node --test '*/scripts/*.test.mjs'`。）
