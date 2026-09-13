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
- 碰 UI 的 spec 落成 `等设计冻结`，§4 把结构决策挂在原型证据上
- 仍未冻结的 UI ticket，「设计冻结」字段落 ⛔；同一批里非 UI 的票写「不涉及 UI」，不被按住
- 发散只准出一份方向说明（过 `direction-note-check`），不翻状态，不往仓库里留渲染物
- 收敛冻结之后：raw 桶里有画布、矩阵每格截图、ledger 全文；spec §4 的「设计方向」被「冻结摘要」**取代**；状态翻 `在飞`
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
- `<eval-name>/project/` —— **跑完的整个项目目录**，画布、方向说明、ticket、raw 桶都在里面（只在 `--out` 那份里，存档不带）

`baseline/` 是存档的那一次：只留 `benchmark.json` 与每格的 `grading.json` / `result.txt` / `run.meta.json`，
不留整个项目目录——那份几十兆的产物属于跑它的那台机器，不属于仓库。**要比的是断言的红绿和证据，不是像素。**

## 断言自己为什么没有单测

`assert.mjs` 是 eval 的**量具本身**，不是被测的东西。给它灌一个假的项目目录来验它，
验的是那个假目录。它的验证方式是**被真的跑过**：存档里每一条断言旁边都带着它当时读到的证据，
一条断言如果永远绿、证据永远是同一句，那它没在量任何东西——那才是要去看的信号。

（这跟本 plugin 里 `scripts/` 那几个纯函数不同：那几个是被下游依赖的确定性核心，
它们有单测，一条命令跑：`node --test '*/scripts/*.test.mjs'`。）
