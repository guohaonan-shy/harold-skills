---
name: uiux-refine
description: 设计收敛——方向定了之后由人跑它。从方向说明重建画布，跑评委与执行者的双模型打磨环收敛到可发布，再各跑一轮减法与 AI tells 清理，人签字后冻结进 raw 桶、spec 翻在飞。要求一个全新会话。
disable-model-invocation: true
---

# uiux-refine

**收敛，准出一块冻结的画布。** 方向已经定了，这一段只把它做对。

> 先读一次 `../../references/wiki-conventions.md`（spec / raw 的位置与状态约定）。

## 0 什么时候跑

- spec 状态是 `等设计冻结`，且 `## 4 实现决策` 下有 **「设计方向」** 小节（`uiux-imagine` 的准出）。
- **这是一个全新会话。** 上一段留在上下文里的落选变种与半成品渲染会让你续写它的执行，而不是照那封信重建。

它**只能人调**（与 `grill` / `uiux-imagine` / `implement` 同档）：环的每一次停都停在人身上——方向级 finding、plateau、签字。

## 1 输入只有三样

1. **spec**，含 §4 那份方向说明（七节）。
2. **目标项目根的 `DESIGN.md` 与 `PRODUCT.md`**，有就读。没有 `DESIGN.md` 不中止：用本 plugin 的内置底线继续，并**明说**项目没有设计法、建议建一份。
3. **本 plugin 的 `references/`**，按需加载。

**不读发散那一段的任何渲染物**（变种、style tile、contact sheet）。**handoff 是一封写完整的信，不是「如上所述」**：读不出来的东西是那份说明写漏了一句，回去补它，不是翻图猜。

## 2 从 prompt 重建画布

工作文件落**目标项目的 `design-preview/<surface>.html`**（素材放 `design-preview/assets/`）。**路径不是随便选的**：lint hook 只认 `design-preview/` 与 `design-motion-preview/` 下的 HTML，落在别处等于把 Gate 1 悄悄关掉。

重建的依据只有方向说明的七节，**在项目自己的 `DESIGN.md` 之下**——不是给某个变种加保真度，那个变种你根本没看见。

静态设计怎么做：`../../references/design/static-ui-protocol.md`。浏览器调用之前读 `../../references/design/browser-usage.md`。

### 三条环境约定——这一段执行，全文见 `../../references/ui-implementation-standard.md` §3.1

1. **稳定锚点**：块与关键元素带 `data-anchor`，名字是契约，不随构图调整改。
2. **字体走目标项目自己的加载方式**，不走公共 CDN；截图前等 `document.fonts.ready`，关动画与过渡。
3. **每个状态用查询参数切**：`?state=<名字>`，名字进冻结摘要的矩阵。

破一条，下游 `implement` 比的就不再是同一个东西。

## 3 第一轮先清待打磨清单

方向说明的「待打磨清单」是 `uiux-imagine` 拦下来的执行层意见——人说过，当时**故意**没改。**进评委环之前先消费掉**——带着一份已知的遗留清单去跑评委，等于花钱买一份你手上已经有的 finding。

## 4 打磨环：评委与执行者

### 评委——另一个模型，每轮新开上下文

收到的**只有三样**：本轮当前截图、方向说明「意图」那节的那句话、`../../references/design/critic-rubric.md`。

明确**不给**：画布代码、历史评语与分数、项目的 T1 底线。前两样会让它去迎合上一轮的自己；T1 是 lint 与 drift check 的活（§8），塞进来只会让一条对比度失败和一个怯懦的字阶在同一个 7 分里互相抵消。

它吐一份 **finding 列表**和**一个分数**。finding 字段是闭集（五维度 / 四严重度 / 三 kind / 受限的 kind×严重度组合），schema 在 `scripts/critic-score.mjs`。

### 执行者——更强的模型，就是这个会话

**思考强度默认高；本轮最差为 P1、或判到 plateau 时再高一档。**

每轮第一个动作是**把散点 finding 聚成「本轮核心问题」一句话**。聚不出来，说明你在逐条打补丁——一簇细碎的 note 底下通常只压着一条规则。然后按 kind 路由：

| kind | 去哪 |
|---|---|
| `direction` | **停环交人。** 不自己改方向（§7） |
| `pattern` | 带那个**具名问题**查参考研究（`../../references/design/research-backend.md`：三层路由与 reference-averaging 禁令）再改 |
| `craft` | 在当前画布里直接改 |

**ledger 每轮落一行**（`/tmp/uiux-refine/ledger.md`）：核心问题、查了哪一层、选了哪个参考、改了什么。

## 5 校验与收敛

评委给完分，把 `{ findings, score, history }` 写成 JSON 再跑：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/critic-score.mjs" /tmp/uiux-refine/round-<N>.json
```

`history` 是**之前每一轮**的最差严重度，从旧到新。退出码 `0` 有效、`2` 无效。

**无效就作废本轮、重跑评委**，不要把分数谈下来。判据（分数区间、kind×严重度、plateau 怎么数）全住在那个脚本里，这份文件只调它、不复述。

收敛规则只有三条，就是脚本 `stop` 的四个取值：

| `stop` | 意思 | 做什么 |
|---|---|---|
| `pass` | 分达标（阈值 9，rubric 里公开写着） | 停，进 §6 |
| `plateau` | 最差严重度**连着两轮没降**（同一档连着出现三轮） | 停下交人 |
| `direction` | 出现方向级 finding（P0） | **立即**停下交人 |
| `continue` | 还在降 | 下一轮 |

后两条都停在人身上：**人不该为一个评委修不了的方向问题付无限轮次。**

## 6 收敛之后：两轮独立的 pass

**各自是独立的一轮**——顺手做的减法永远只删掉最不碍事的那个。

1. **减法 pass**：评委带**减法 brief** 再跑一轮。问的不是"哪里不够好"，是"**哪里可以没有**"——去 glow、去渐变、去多余容器；图能说清就删标签；原生控件能用就不自造。
2. **AI tells 清理**：对着 `../../references/design/design-core.md` §5.1–5.4（反 slop 清单、布局纪律、文案与数据 tell、em-dash 禁令）与 `../../references/design/ui-craft-checklist.md` §2（视觉 slop 目录）逐条过。

两轮各自照 §5 校验、各自落 ledger 一行。

## 7 人签字：反馈按性质分流

摆给人看：画布 URL、ledger、矩阵覆盖、finding 处置、T2 偏离。**你写完自己不宣布通过**，闸门是人的。人给的 note 按**性质**分流，不按语气：

| note 是什么 | 去哪 |
|---|---|
| **执行性**（"这条分隔线太重"） | 带着它**再跑一轮评委**，回 §4 |
| **方向性**（"不该像个 dashboard"） | 回 `uiux-imagine`，**在对应的那一档高度**重开 |

**refine 永不改方向。** 方向是人在一排真正不同的变种之间选出来的；在这里顺一句话拧过去，等于用一个没有备选项的选择替换掉那次选择。

## 8 既有 gate，一条不少

签字之前全部要过，判据在各自文件里（路径相对 `../../references/`）：

| gate | 在哪 |
|---|---|
| 确定性 lint | 写 preview 时 hook 自动跑，收尾再跑一次 `scripts/design-lint.mjs`；**P0 清零** |
| Nielsen 启发式 / 认知负荷 / 五角色红旗 | `design/heuristics-checklist.md` |
| 对比度与 a11y，**从真 DOM 的 computed style 读**，不肉眼估 | `design/accessibility-baseline.md`，读法见 browser-usage |
| `DESIGN.md` drift check | `design/ui-craft-checklist.md` §5 |
| 验收矩阵逐格看过 | 矩阵取自方向说明的「验收矩阵」 |

**Distill-back 只追加带日期的 T2 判例，不改 T1 与 T3**——那两层是人写的法。空的 Distill-back 合法，但要**明说**。

## 9 冻结

### 9.1 进 raw 桶

画布 HTML 与**矩阵每格截图**（按格名）进 `docs/raw/<topic>/assets/`，配一份 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`——frontmatter 按 wiki-conventions §3，`source_type: design-freeze`。

正文四节，短：**意图**（取自方向说明，逐字一致）· **冻结了什么**（画布 wikilink、矩阵每格、mismatch 阈值）· **打磨轨迹**（ledger 全文搬进来，随冻结活下去，不留在 `/tmp`）· **签字**（人的原话，以及被分流回发散那一段的 note）。

落完刷新 `docs/raw/index.md`。

### 9.2 改 spec

「设计方向」小节**被「冻结摘要」取代**——是取代不是并排；留着它，下游会同时看到两份真值。

冻结摘要固定五样，`to-ticket` 原样誊写、不改写：

- **画布指针** —— raw 桶那份 HTML 的 wikilink。
- **矩阵** —— 每格的 viewport × 主题 × 语言 × 状态，标「人看」的格照标。
- **mismatch 阈值** —— 沿用 `ui-implementation-standard.md` §3.2 的默认；按格覆盖的写覆盖值**和理由**。
- **一行 ledger 摘要**。
- **状态矩阵与数据契约变更** —— 画布上有、项目现在渲染不出来的字段逐条列出。

### 9.3 翻状态

spec 的 `status`：`等设计冻结` → **`在飞`**。这一翻就是闸门本身——`to-ticket` 认「在飞 **且** §4 有冻结摘要」，`implement` 认 ticket 上那行 ⛔。

然后告诉人：还没切票去 `/idea-loop:to-ticket`；票已切过（落的 ⛔）就回去补那几张的「设计冻结」字段。

## 不做

- **不改方向**（§7）。不给评委看代码、历史或 T1。不自己宣布签字通过。
- 不动 spec 的 scope、不写 ticket、不把画布的 CSS 搬进项目代码——画布不是实现。
- 动效、原生交互与营销素材不在这一段：**静态构图的冻结就是终点**。
