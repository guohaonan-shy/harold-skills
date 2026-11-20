---
type: spec
tags: [idea-loop, ui-measure]
summary: ui-measure 补三样能力（只比一个锚点区域、颜色换算后再比、减弱动效格）并去掉两类假红（小数像素、margin/gap）
related: ["[[2026-11-19-ui-measure-matrix-gaps]]"]
issues: [223]
---

# ui-measure 补齐矩阵的三处缺口、去掉两类假红

> #223 存在：oklch 写的颜色和 hex 写的同一个颜色字符串永远不等；同一行字挪 0.4px 像素层就报 4.30%；margin-top 与 space-y 排出的同一位置报两条 position-drift；矩阵格没有「只截一个锚点」和「减弱动效」的写法。详情在「问题陈述」

## 问题陈述

`idea-loop:ui-measure` 是 UI 工单的视觉红绿测试：一个浏览器开两个标签页，一边是冻结的画布，一边是项目的实现，按验收矩阵（一份 JSON，每格一个 viewport × 主题 × 状态）逐格比。它分两层：测量层按 `data-anchor` 锚点量盒子位置和样式值（位置容差 ±1px，颜色、字号这类 token 值精确匹配）；像素层截整个视口比像素，差异超过 1% 报一条 P2。

issue 来自一个目标项目的一张 UI 工单（2026-11-03，51 格矩阵）：实现方照冻结记录写的按格规则跑不起来，只好把脚本复制到本地临时改。分拣评论（2026-11-13，对着 a7c8129 读代码）坐实了三处能力缺口，另两处没复现；这次（2026-11-19，Playwright 无头 Chromium 158，用 `setContent` 造的最小页面）把能跑的都跑了一遍。

### 1. 像素层只能比整个视口

冻结记录要求某一格「只比 `issues-slot` 那一块」，脚本做不到：像素层两边都是整个视口截图，矩阵格里也没有指定区域的字段。SKILL.md 只说「像素层看的是 viewport 那一帧」。区域外的差异（比如这张工单不负责的侧栏）会把整格推红，只能靠放宽这一格的像素阈值，那样区域里的真问题也一起放过去了。

### 2. oklch 写的颜色和 hex 写的永远对不上

测了什么：同一个元素，一次写 `color: oklch(0.623 0.214 259.815)`（Tailwind v4 的颜色写法），一次写 `#3b82f6`，读 `getComputedStyle` 的结果。看到什么：前者原样返回 `oklch(0.623 0.214 259.815)`，后者返回 `rgb(59, 130, 246)`。测量层对颜色做字符串精确比较，所以只要画布写 hex、实现用 Tailwind v4，同一个 token 每个锚点都报一条 token-mismatch。本该是：两边换算成屏幕上的同一个颜色，就算一样。

### 3. 不能比减弱动效下的样子

脚本只模拟深浅色（`colorScheme`），不模拟 `prefers-reduced-motion: reduce`。设计里给减弱动效单独定了样式（比如不位移、只淡入）的，那一格没法比，只能标「人看」。

### 4. 小数像素位置造成像素层假红

测了什么：一行文字加一条色块，左边距 20px 截一张，再挪一点截一张，用脚本同样的像素比对（YIQ 色距 0.1）算差异。看到什么：

| 挪多少 | 现在报的差异 | 本该 |
|---|---|---|
| 0.4px | 4.30% | 绿：在 ±1px 位置容差内 |
| 横竖各 0.5px | 7.85% | 绿 |
| 1px | 6.66% | 绿 |
| 2px | 8.19% | 红：超出位置容差 |

挪不到一个像素，字形落在不同的子像素位置上，边缘那一圈像素的灰度全变了，超过 1% 的阈值。issue 说的「约 3%」是 51 格视口截图里的数字，这里截的是一窄条，比例更高，现象一样。

### 5. margin 和 space-y 排出的同一位置报成不同

测了什么：两个上下排的元素，画法 A 给下面那个写 `margin-top: 16px`，画法 B 给上面那个写 `margin-bottom: 16px`（Tailwind v4 的 `space-y-4` 就落成这个）。看到什么：两种画法下面那个元素的 `top` 都是 120，盒子完全重合；但测量层逐个比 `marginTop`、`marginBottom`，会报两条 position-drift（0 → 16、16 → 0）。同理，父元素用 `gap` 还是子元素用 margin，也会报。

复现材料：`.tmp/to-spec/ui-measure-matrix-gaps/repro/README.md`

### 根因

- 1：`ui-measure.mjs` 两边都调整页 `screenshot()`，没有元素截图；矩阵格的字段里没有区域。
- 2：测量取的是 `getComputedStyle` 的原字符串，`ui-compare.mjs` 对 token 类做 `===`；浏览器按作者写的色彩空间输出，没有换算到同一个空间。
- 3：`prepare` 只调 `emulateMedia({ colorScheme })`，矩阵格没有减弱动效的字段。
- 4：像素层只有逐像素的色距判断，同一位置的两个像素必须颜色相近；子像素位移让整圈边缘都不相近。
- 5：margin、gap 列在测量属性和位置类里逐个比。它们是排版手段，不是结果；结果是盒子的 top/left/width/height，已经在比了。

## 方案

改完，实现方照冻结记录写的按格规则直接跑脚本，不用复制改脚本：

- 一格可以只比一个锚点区域的像素（#346 已做）；
- 同一个颜色不管写成 oklch 还是 hex 都算一样，差一个色阶照样报；
- 减弱动效可以单独成格；
- 挪不到一个像素的字不再让像素层变红，挪了 2px 照样红；
- 用 margin、space-y 还是 gap 排出同一个位置，不再报。

不画时序图：只改脚本内部的测量和比对，脚本跟浏览器、跟调用方之间的消息没变。

五处，第 1 处 #346 已做，这次改另外四处，都在 `ui-measure.mjs`（浏览器那一侧）、`ui-compare.mjs`（纯函数，带单元测试）和 `ui-measure` 的 SKILL.md：

1. **只比一个锚点区域**：已由 #346 做掉（2026-11-20 核 main 1e0c2b92），字段叫 `shotAnchor`，两边按同一个框裁，尺寸一定相同。这次不再改它。
2. **颜色换算后再精确比**：测量层比颜色之前，两边都换成 8 位 sRGB（每个通道 0–255 的整数）加透明度，再精确比。不放宽：差 1 也报。
3. **矩阵格加 `reducedMotion`**：值 `"reduce"` 或 `"no-preference"`（缺省），两个标签页都按它模拟，写法照现有的 `colorScheme`。
4. **像素层加邻域比对**：一个像素跟另一张图同位置不相近时，再看另一张图在它周围 1 个物理像素以内的颜色范围；落在范围里就算同一个。
5. **不再比 margin 和 gap**：位置只看锚点盒子的 top/left/width/height，padding 照比。

调用方逐个过了一遍：

- `idea-loop:implement` 的 UI 工单（`references/ui-tickets.md`）、`ui-reviewer` agent、`/idea-loop:uiux-refine` 的冻结（`references/freeze.md`）：纳入。三处都照 ui-measure 的 SKILL.md 写矩阵、跑脚本，不复述字段和容差，SKILL.md 改了它们就跟着变；冻结记录的「矩阵」一行列每格的维度，补上「减弱动效」。
- 设计档案的拍图（`idea-loop:design-archive`）：排除。它不走 ui-measure 的比对（SKILL.md「三条环境约定」写明了）。
- `pr-review`：排除。它只把 ui-measure 的瓶颈当停点，不碰矩阵。

## User Stories

只修问题、不加能力的 spec 不画树。编号对「问题陈述」的小节：

1. 期望行为：一格写了 `shotAnchor: "issues-slot"`，像素层只比两边 `issues-slot` 的区域；盒子外的差异不算进这一格的百分比。（#346 已上线）
2. 期望行为：画布写 `#3b82f6`、实现写成换算后同一个 8 位 sRGB 颜色的 oklch，不报 token-mismatch；换算后有一个通道差 1，照样报，发现里同时给出两边的原写法和换算结果。
3. 期望行为：一格写了 `reducedMotion: "reduce"`，两边都在减弱动效下截图和测量；不写的格跟现在一样。
4. 期望行为：同一画面只差不到 1 个像素的子像素位移，像素层是绿的；挪 2px 仍超过 1%，是红的。
5. 期望行为：同一个盒子位置，一边用 margin-top、一边用 margin-bottom 或 gap 排出来，测量层不报；盒子的 top 真的偏了超过 ±1px，照样报 position-drift。

## 实现决策

- **颜色换算后仍精确比，不放宽**。依据：SKILL.md「默认容差」表 token 类「精确匹配」，以及「颜色差一个色阶是一条发现，不是舍入误差」。issue 的临时改法（每通道差 ≤3 算同一个）违反这两条，不采用。换算到 8 位 sRGB 是因为截图和屏幕上的就是它，两种写法落到同一组 0–255 才是「同一个颜色」。
- **颜色换算是 `ui-compare.mjs` 里的纯函数**，不在页面里让浏览器转：这样能用单元测试先红后绿，结果不依赖浏览器版本。认得 `rgb()`/`rgba()`、`oklch()`、`oklab()`、`color(srgb …)`；sRGB 色域外的值按通道截到 0–255，跟实测里浏览器画出来的一致（`oklch(0.623 0.214 259.815)` 画出来是 43,127,255，蓝通道被截到 255）。认不得的写法照现在按原字符串比。`boxShadow`、`borderColor` 这类值里嵌着的颜色同样换算。
- **锚点区域用 #346 的 `shotAnchor`，不另加 `pixelAnchor`**：triage 时人定了字段名 `pixelAnchor`（2026-11-19），之后 #346 先合进 main，用 `shotAnchor` 做了同一件事（两边按同一个框裁，尺寸相同，所以「两边盒子大小不同」那条边界不存在了；两边都没有这个锚点时报错退出）。夜间模式按推荐沿用已上线的 `shotAnchor`，不改名、不加别名：改名是术语，护栏里只由人定；加别名会让同一件事有两个字段。
- **`reducedMotion` 的写法照 `colorScheme`**：都是矩阵格上的一个值，原样交给 Playwright 的 `emulateMedia`。关闭动画与过渡的冻结样式照旧加：减弱动效格比的是这种偏好下的静止样式，不是动画过程。
- **邻域比对**：半径固定 1 个物理像素（截图的像素，不是 CSS 像素），不暴露成容差字段。它跟抗锯齿容差同一类，回答的是「光栅化意义上算不算同一个颜色」，不跟 ±1px 位置容差共用一个数，SKILL.md 里「它跟位置容差是两回事，各管各的」那句不动。判法照 pixelmatch 的抗锯齿检测：A 的像素落在 B 同位置 3×3 邻域的逐通道范围里，并且反过来 B 的像素也落在 A 的范围里，才算同一个。依据是实测：0.4px 从 4.30% 降到 0.29%，2px 仍是 3.55%。
- **不再比 margin 和 gap**：人定（2026-11-19，「不再比 margin 和 gap（推荐）」）。`marginTop/Right/Bottom/Left`、`gap`、`rowGap`、`columnGap` 从测量属性里删掉；padding 照比，因为它决定元素自己背景的范围。没有锚点的子元素排偏了，靠像素层兜底，跟现在没有锚点的地方一样。SKILL.md「默认容差」位置类那一行同步改。
- **老矩阵照样能用**：两个新字段都可以不写，不写跟现在一样。margin/gap 不再出发现、像素层少报假红，是行为变化，但不用改任何矩阵。
- **版本档位：patch**（从 main 上的当前版本升一个 patch：合并时 main 是 0.1.42，升到 0.1.43）。按 `REVIEW.md`「额外要求」本该是 minor（新增能力，老用法照样能用），但从当时的 0.1.30 升 minor 会撞上发布线 `release/idea-loop-0.2.0` 在用的 0.2.0。人定（2026-11-19）：「还是patch吧」，跟 #297 的先例一样。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 颜色换算（hex / rgb / oklch / oklab / 色域外 / 嵌在 boxShadow 里 / 认不得的写法）；换算后精确比；邻域比对（子像素位移绿、2px 红）；margin/gap 不进比较 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：只改脚本和 SKILL.md 的规则文字，不改 prompt；SKILL.md 文字改动不走 eval（`AGENTS.md` §5） |
| 视觉正确性 | UI 实现环 | 不涉及：这次改的就是这个仪器本身，它自己的验收见下面的增量功能测试 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：
  - `ui-compare.mjs` 导出的比对函数（`compareMeasurements`、`comparePixels`），加一个导出的颜色换算函数。喂测量数据或解码后的像素，读发现或百分比。能抓到换算、比对、邻域判断的每条规则；漏掉浏览器那一侧（`reducedMotion` 有没有传给浏览器），由下面的 CLI 验收补。
  - `ui-measure.mjs` 的命令行：喂一份矩阵，读 `--json` 输出和退出码。它按设计不带单元测试（文件头写明「靠实际跑来覆盖」），这次照样靠跑。
- **增量功能测试**（CLI 验收，在 `.tmp/` 下造两份静态页当画布和实现，起静态服务器，装了 playwright 的目录里跑）：
  - 前置：两页同一组锚点，实现页的颜色写 oklch、画布写对应的 hex；实现页给 `hero` 下面的块用 margin-bottom、画布用 margin-top；实现页有一行字挪了 0.4px；实现页在 `issues-slot` 外多一块侧栏。
  - 步骤与期望：
    - 不写新字段跑一次：没有 token-mismatch、没有 margin 的 position-drift，像素层报侧栏造成的 P2。覆盖 2、4、5。
    - 那一格加 `shotAnchor: "issues-slot"` 再跑：全绿。覆盖 1（#346 的能力，跟本次的改动一起再跑一遍）。
    - 把实现页一个颜色改成差一个色阶：报一条 token-mismatch，发现里有两边原写法和换算值。覆盖 2。
    - 把实现页那行字挪 2px：像素层报红。覆盖 4。
    - 两页加 `@media (prefers-reduced-motion: reduce)` 下的不同样式，加一格 `reducedMotion: "reduce"`：这一格量到的是减弱动效下的样式。覆盖 3。
- **照着谁写**：`idea-loop/scripts/ui-compare.test.mjs`（`node:test`，造测量对象和 RGBA 数组直接喂比对函数）。

## Out of scope

- 不加别的媒体模拟（`prefers-contrast`、`forced-colors`、打印）：这次没有用到它们的格。
- 不改设计档案拍图的做法。
- 不放宽任何 token 类的精确匹配。

## 关联

- raw：`docs/raw/idea-loop-decisions/2026-11-19-ui-measure-matrix-gaps.md`（两道题和人的选择）。
- 相关 ADR：`0002-design-loop-v2-imagine-refine`（UI 实现环的判据是脚本，不是模型的意见）。这次的改动都在脚本里，守着它。没有相关的 spec（2026-11-19 查 `docs/spec/`）。
- 相邻还没完成的 issue：#241（把 design、seo 拆成单独的插件，ui-measure 会搬进 design 插件）。会改同一组文件的位置，内容不重叠；没有先后依赖，谁后合并，谁就按另一个的新路径解冲突。其余开着的 issue 里没有提到 ui-measure 的（2026-11-19 `gh issue list --search ui-measure`）。
