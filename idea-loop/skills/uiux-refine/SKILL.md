---
name: uiux-refine
description: 设计收敛——方向定了之后由人跑它。从方向说明重建画布，跑评委与执行者的双模型打磨环收敛到可发布，静态构图冻结之后按需接动效段（评委看定格帧序列，seek-frame / restraint budget / reduced-motion 三样验证照旧）与素材段（营销 register 才开），再各跑一轮减法与 AI tells 清理，人签字后冻结进 raw 桶、spec 翻在飞。要求一个全新会话。
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

明确**不给**：画布代码、历史评语与分数、项目的 T1 底线。前两样会让它去迎合上一轮的自己；T1 是 lint 与 drift check 的活（§10），塞进来只会让一条对比度失败和一个怯懦的字阶在同一个 7 分里互相抵消。

它吐一份 **finding 列表**和**一个分数**。finding 字段是闭集（五维度 / 四严重度 / 三 kind / 受限的 kind×严重度组合），schema 在 `scripts/critic-score.mjs`。

### 执行者——更强的模型，就是这个会话

**思考强度默认高；本轮最差为 P1、或判到 plateau 时再高一档。**

每轮第一个动作是**把散点 finding 聚成「本轮核心问题」一句话**。聚不出来，说明你在逐条打补丁——一簇细碎的 note 底下通常只压着一条规则。然后按 kind 路由：

| kind | 去哪 |
|---|---|
| `direction` | **停环交人。** 不自己改方向（§9） |
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
| `pass` | 分达标（阈值 9，rubric 里公开写着） | 停。**静态构图到此冻结**，进 §6 判要不要动效 |
| `plateau` | 最差严重度**连着两轮没降**（同一档连着出现三轮） | 停下交人 |
| `direction` | 出现方向级 finding（P0） | **立即**停下交人 |
| `continue` | 还在降 | 下一轮 |

后两条都停在人身上：**人不该为一个评委修不了的方向问题付无限轮次。**

`pass` 那一刻就是**静态构图冻结**，也是下面两段唯一的前置——构图还在动就配时间轴，是给一个会变的布局做动效。**§6 动效与 §7 素材都是可选的，默认都不开**：判下来两段都不开就直接进 §8，这条循环一步没多。

## 6 动效（可选，静态构图冻结之后）

### 6.1 开不开：块的 job 是闭集四值

动效服务于**块的 job**，job 取自方向说明「结构」那节写的内容责任。四值闭集，命中一条才开：

| job | 动效在这里做什么 |
|---|---|
| **状态** | 让"现在是哪个状态、刚从哪个状态来"可读（加载、禁用、展开、选中的切换） |
| **结果** | 让一次用户意图的结果被看见（提交成功、删除可撤销、计数变化） |
| **身份** | 让品牌的性格在一次动作里可感（营销 register 的签名动作） |
| **氛围** | 让环境活着而主体不动（**只在营销 register**；in-app 的 ambient loop 预算是零，见 motion-spec §4） |

**"看起来更活"不是 job，也不是这四条里任何一条的别名。** 它是这一节唯一点名排除的理由——没有 job 的动效是 slop，缺的不是数量。四值都不命中就**不开动效**，如实说一句，进 §7。

每个要动的元素都欠**一句话理由**，绑在那个 job 上（motion-protocol 的 Principle 一节）。写不出那句话的元素是删掉，不是留着调参数。

### 6.2 做：在冻结的画布上叠一层，不重画

工作文件是 `design-motion-preview/<surface>.html`，从 §5 冻结的那份静态画布起手（lint hook 也盯这个目录）。**动效是叠上去的一层**：做动效时发现构图有问题，停下来说，回 §4，不在这里顺手重新排版。

怎么做、要暴露什么句柄（`window.__maTimeline` 的 `seek` / `duration` / `resume`）、reduced-motion 怎么写：`../../references/design/motion-protocol.md` 的 A 段，法在 `../../references/design/motion-spec.md`。**token 不自己编**——duration 与 easing 取 motion-spec §2–3，项目 `DESIGN.md` §4 有自己的动效先例库就用它的。

### 6.3 评委看的是帧序列，不是一张截图

打磨环照 §4 跑，评委那三样输入**只换第一样**：

- 静态：本轮当前截图。
- 动效：**定格帧序列或 GIF**——`__maTimeline.seek(t)` 在 t = 0 / 中 / 末（外加你在意的关键帧）各截一张，按时间顺序给它；时间轴盖不住的滚动与指针交互，给交互前 / 中 / 后三张。

另两样不变（方向说明「意图」那句、`critic-rubric.md`），**不给**的三样也不变（画布代码、历史评语与分数、T1 底线）。finding schema、分数自洽校验、收敛规则**原样用 §5 那一套**——不为动效另起一套判据，也不加第二个脚本。ledger 照 §4 每轮一行。

### 6.4 三样验证，一条不能少

判据全在迁移过来的 protocol 里，这里只指路，**不复述、不放宽**：

| 验证 | 判据在哪 | 不过就是没做完 |
|---|---|---|
| **seek-frame 确定性 gate** | `motion-protocol.md` B 段 Gate 3 | 帧必须**互不相同**且合乎编排。`getComputedStyle` 读到的是目标值，一个从没播过的动画也能读出"对"的结果——它不算证据 |
| **restraint budget** | `motion-spec.md` §4 | 按**可见视口**结算，拼起来的各部分算总和；in-app 的 ambient loop 为零 |
| **reduced-motion** | `motion-spec.md` §6 | 每条动效都有 `prefers-reduced-motion: reduce` 的退路；内容的**可见性不许**挂在过渡上 |

再加 motion-protocol B 段的 Gate 1（lint，写文件时 hook 自动跑）、Gate 2（motion-craft 与 a11y 审计，含动效进行中的键盘与焦点）、Gate 4（DoD 逐条），以及 §10 那张表上本来就要过的东西。**两个 skill 合成一个不是放宽验证的理由。**

### 6.5 动效也停在人身上

摆给人看的是**跑起来的 preview**，配一份清单：每条动效的那句理由与用的 token、reduced-motion 怎么退、本视口的 restraint 结算、帧证据、偏离 `DESIGN.md` 的地方和为什么。**你写完不自己宣布通过**（同 §9）。人给的 note 照 §9 按性质分流；方向性的那类同样回 `uiux-imagine`，不在这里拧。

签字过的**新** in-app 动效模式，带日期进项目 `DESIGN.md` 的动效先例库——这就是它的准入流程（Distill-back，见 §10）。新模式悄悄上线、不进先例库，是这一段的失败模式。

## 7 素材（可选，营销 register 才开）

### 7.1 闸门：两条同时成立

| 条件 | 判据 |
|---|---|
| register 是**营销** | 方向说明里记的 register；**in-app surface 默认不开** |
| 块的 job 是**身份**或**氛围** | §6.1 那张表的后两行。状态与结果这两个 job **不**解锁素材 |

**做 in-app surface 时整段跳过**，零环境的循环保持原样：没有生成、没有外部工具、没有多出来的一步。

### 7.2 refine 在这里做判定和写单，不做生成

**不重写既有的视频背景生产管线**，这一节只定义它的**接入闸门**。refine 的产出是一份**素材单**：每个素材的用途（绑到哪个块的哪个 job）、构图约束（文字安全区在哪、哪一块必须留白低细节）、必须静止的东西、验收条件（文字区对比度、首尾运动是否恒定）。素材单进 ledger，随冻结活下去。

### 7.3 调用通道：**待接入**（这是开工时确认过的结论，不是占位）

本仓库**没有任何素材生成工具的接入痕迹**：`idea-loop/.mcp.json` 里只有 playwright，`scripts/` 里没有生成类脚本。既有的那条管线是机器上的用户级 skill `video-bg-section`（不在本 plugin 里，也不是它的依赖），**它自己的笔记记的通道是人在平台网页里跑**——网页出图、网页做 image-to-video、下载到本地、`ffmpeg` 压缩、它自带脚本做对比度与运动质检；API 在那份笔记里是"下次优先考虑"，不是已接通。

所以如实记成两条：

1. **生成这一步没有自动化通道。** 没有 MCP，没有一条能直接出素材的 CLI。**待接入**——写到它真的接上为止，**不要在这里编一个调用方式**。
2. **refine 的接法是移交。** 素材单交给那条管线跑（人在环里），产物回到画布。那条管线**不在**这台机器上就说清"素材段跑不了"然后往下走：**缺素材不中止收敛**，它是一条要告诉人的事实。

### 7.4 素材进同一个桶

生成出来的图片与视频**随冻结一起**进 `docs/raw/<topic>/assets/`，和画布、矩阵截图、ledger 同一个桶（§11.1）——不另开目录，不留在下载目录或 `/tmp`。画布引用它们走 `design-preview/assets/`，冻结时一并搬过去。每个素材在冻结记录里带一行：用途、哪个块的哪个 job、谁生成的、验收过了什么。

## 8 收敛之后：两轮独立的 pass

**各自是独立的一轮**——顺手做的减法永远只删掉最不碍事的那个。

1. **减法 pass**：评委带**减法 brief** 再跑一轮。问的不是"哪里不够好"，是"**哪里可以没有**"——去 glow、去渐变、去多余容器；图能说清就删标签；原生控件能用就不自造。**跑过 §6 的，动效也进这一轮的清算**——多余的入场、可有可无的 ambient loop 都是"哪里可以没有"的头号候选。
2. **AI tells 清理**：对着 `../../references/design/design-core.md` §5.1–5.4（反 slop 清单、布局纪律、文案与数据 tell、em-dash 禁令）与 `../../references/design/ui-craft-checklist.md` §2（视觉 slop 目录）逐条过。

两轮各自照 §5 校验、各自落 ledger 一行。

## 9 人签字：反馈按性质分流

摆给人看：画布 URL、ledger、矩阵覆盖、finding 处置、T2 偏离。**你写完自己不宣布通过**，闸门是人的。人给的 note 按**性质**分流，不按语气：

| note 是什么 | 去哪 |
|---|---|
| **执行性**（"这条分隔线太重"） | 带着它**再跑一轮评委**，回 §4 |
| **方向性**（"不该像个 dashboard"） | 回 `uiux-imagine`，**在对应的那一档高度**重开 |

**refine 永不改方向。** 方向是人在一排真正不同的变种之间选出来的；在这里顺一句话拧过去，等于用一个没有备选项的选择替换掉那次选择。

## 10 既有 gate，一条不少

签字之前全部要过，判据在各自文件里（路径相对 `../../references/`）：

| gate | 在哪 |
|---|---|
| 确定性 lint | 写 preview 时 hook 自动跑，收尾再跑一次 `scripts/design-lint.mjs`；**P0 清零** |
| Nielsen 启发式 / 认知负荷 / 五角色红旗 | `design/heuristics-checklist.md` |
| 对比度与 a11y，**从真 DOM 的 computed style 读**，不肉眼估 | `design/accessibility-baseline.md`，读法见 browser-usage |
| `DESIGN.md` drift check | `design/ui-craft-checklist.md` §5 |
| 验收矩阵逐格看过 | 矩阵取自方向说明的「验收矩阵」 |

**Distill-back 只追加带日期的 T2 判例，不改 T1 与 T3**——那两层是人写的法。空的 Distill-back 合法，但要**明说**。

## 11 冻结

### 11.1 进 raw 桶

画布 HTML 与**矩阵每格截图**（按格名）进 `docs/raw/<topic>/assets/`，**跑过 §6 的把动效 preview 与那组定格帧（或 GIF）一起放进去，跑过 §7 的把生成素材也放进去**——同一个桶，不分家。配一份 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`——frontmatter 按 wiki-conventions §3，`source_type: design-freeze`。

正文四节，短：**意图**（取自方向说明，逐字一致）· **冻结了什么**（画布 wikilink、矩阵每格、mismatch 阈值；有动效就加每条动效的理由与 token、restraint 结算、帧证据；有素材就每个素材一行）· **打磨轨迹**（ledger 全文搬进来，随冻结活下去，不留在 `/tmp`；素材单在里面）· **签字**（人的原话，静态与动效两次各记一次，以及被分流回发散那一段的 note）。

落完刷新 `docs/raw/index.md`。

### 11.2 改 spec

「设计方向」小节**被「冻结摘要」取代**——是取代不是并排；留着它，下游会同时看到两份真值。

冻结摘要固定五样，`to-ticket` 原样誊写、不改写：

- **画布指针** —— raw 桶那份 HTML 的 wikilink。跑过动效那一段的，**同一条指针**把动效 preview 与帧证据一并带上：它是同一块画布的一层，不是第六样。
- **矩阵** —— 每格的 viewport × 主题 × 语言 × 状态，标「人看」的格照标。
- **mismatch 阈值** —— 沿用 `ui-implementation-standard.md` §3.2 的默认；按格覆盖的写覆盖值**和理由**。
- **一行 ledger 摘要**。
- **状态矩阵与数据契约变更** —— 画布上有、项目现在渲染不出来的字段逐条列出。

### 11.3 翻状态

spec 的 `status`：`等设计冻结` → **`在飞`**。这一翻就是闸门本身——`to-ticket` 认「在飞 **且** §4 有冻结摘要」，`implement` 认 ticket 上那行 ⛔。

然后告诉人：还没切票去 `/idea-loop:to-ticket`；票已切过（落的 ⛔）就回去补那几张的「设计冻结」字段。

## 不做

- **不改方向**（§9）。不给评委看代码、历史或 T1。不自己宣布签字通过。
- 不动 spec 的 scope、不写 ticket、不把画布的 CSS 搬进项目代码——画布不是实现。
- 不在静态构图冻结之前碰动效与素材，不在这两段里重新构图（发现构图问题回 §4）。
- **不自己生成素材，也不编一个不存在的调用通道**（§7.3）：判定该不该开、写素材单、把单子交出去，生成不在这一段。
- in-app surface 不开素材段——那条零环境的循环保持原样。
