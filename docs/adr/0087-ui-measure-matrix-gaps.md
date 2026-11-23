---
type: adr
status: 生效
tags: [idea-loop, ui-measure, ui-measure-matrix-gaps]
summary: ui-measure 颜色换算后精确比、加减弱动效格、像素层加邻域比对、不再比 margin 与 gap，容差一律不放宽
related: ["[[223]]", "[[2026-11-19-ui-measure-matrix-gaps]]"]
---

# ADR-0087 — ui-measure 补矩阵缺口、去掉两类假红，不放宽容差

> 由 spec `ui-measure-matrix-gaps` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:ui-measure` 是 UI 工单的视觉红绿测试：一个浏览器开两个标签页，一边是冻结的画布，一边是项目的实现，按验收矩阵（一份 JSON，每格一个 viewport × 主题 × 状态）逐格比。分两层：测量层按 `data-anchor` 锚点量盒子位置和样式值（位置容差 ±1px，颜色、字号这类 token 值精确匹配）；像素层截视口比像素，差异超过 1% 报一条 P2。

issue #223 来自一个目标项目的一张 UI 工单（2026-11-03，51 格矩阵）：实现方照冻结记录写的按格规则跑不起来，只好把脚本复制到本地临时改。2026-11-19 用 Playwright 无头 Chromium 158 造最小页面复现，坐实五处：

| 现象 | 实测 |
|---|---|
| 像素层只能比整个视口，不能只比一个锚点区域 | 区域外的差异把整格推红 |
| 同一个颜色，oklch 与 hex 永远对不上 | `oklch(0.623 0.214 259.815)` 读回原字符串，`#3b82f6` 读回 `rgb(59, 130, 246)`，字符串精确比一定报 |
| 不能模拟减弱动效 | 只调了 `colorScheme` |
| 小数像素位置造成像素层假红 | 字挪 0.4px 报 4.30%，横竖各 0.5px 报 7.85%，1px 报 6.66%，2px 报 8.19% |
| margin 与 space-y 排出的同一位置报两条 position-drift | 盒子 top 都是 120，却报 0→16、16→0 |

后两处的根因：像素层只有逐像素色距，子像素位移让整圈字形边缘都不相近；margin、gap 是排版手段不是结果，结果是盒子 top/left/width/height，早已在比。issue 里的临时改法（每通道差 3 以内算同一个色）违反 `ui-measure` 的 token 类「精确匹配」，不采用。决定记录见 [[223]]，题目与选择见 [[2026-11-19-ui-measure-matrix-gaps]]。

## 2 决策（how）

- **颜色换算后仍精确比，不放宽。** 两边都换成 8 位 sRGB（每通道 0–255 整数）加透明度再比，差 1 也报，发现里同时给两边原写法和换算值。换算是 `ui-compare.mjs` 里的纯函数，不让浏览器转：能先红后绿地测，结果不依赖浏览器版本。认得 `rgb()`/`rgba()`、`oklch()`、`oklab()`、`color(srgb …)`，sRGB 色域外按通道截到 0–255（与浏览器画出来一致），阴影、边框这类复合值里嵌的颜色同样换算，认不得的写法按原字符串比。
- **矩阵格加 `reducedMotion`**：`"reduce"` 或 `"no-preference"`（缺省），两个标签页都按它模拟，写法照 `colorScheme`；关动画与过渡的冻结样式照加，比的是这种偏好下的静止样式。冻结记录的「矩阵」一行补上这一维。
- **像素层加邻域比对**：同位置不相近时，再看另一张图在它周围 1 个物理像素（3×3 邻域）的逐通道颜色范围，双向都落在对方范围里才算同一个（判法同 pixelmatch 的抗锯齿检测）。半径固定，不暴露成容差字段，也不与 ±1px 位置容差共用一个数。实测 0.4px 从 4.30% 降到 0.29%，2px 仍是 3.55%。
- **不再比 margin 和 gap**（人定，2026-11-19）：`marginTop/Right/Bottom/Left`、`gap`、`rowGap`、`columnGap` 不进比较，padding 照比（它决定元素自己背景的范围）。没有锚点的子元素排偏了靠像素层兜底。
- **只比一个锚点区域**：字段名 triage 时定的是 `pixelAnchor`，但同一能力已由更早合并的 PR #346 以 `shotAnchor` 上线（两边按同一个框裁，尺寸相同）。夜间模式按推荐沿用 `shotAnchor`，不改名、不加别名：改名是术语，只由人定，别名会让同一件事有两个字段；人看审核报告后回「合并」，没有推翻。
- **老矩阵照样能用**：两个新字段都可不写。**版本档位 patch**：按 `REVIEW.md` 本该是 minor，但会撞上发布线占着的 0.2.0，人定「还是patch吧」，同 #297 先例。

取舍（没做）：不加别的媒体模拟（`prefers-contrast`、`forced-colors`、打印），不改设计档案拍图的做法，不放宽任何 token 类精确匹配。`implement`、`ui-reviewer`、`uiux-refine` 的冻结都照 `ui-measure` 的 `SKILL.md` 写矩阵，不复述字段，所以只在冻结记录补一行；`design-archive` 与 `pr-review` 不碰矩阵，排除。

## 3 结果（result）

- 脚本：`idea-loop/scripts/ui-compare.mjs`（颜色换算、`LAYOUT_ONLY_PROPS` 排除 margin/gap、3×3 邻域比对）；`idea-loop/scripts/ui-measure.mjs`（`emulateMedia` 传 `reducedMotion`、`shotAnchor` 区域截图）。
- 文字：`idea-loop/skills/engineering/ui-measure/SKILL.md` 写了抗锯齿邻域、margin/gap 不比、颜色换算、`reducedMotion` 字段；`idea-loop/skills/design/uiux-refine/references/freeze.md` 的矩阵一行含「减弱动效」。
- 合并在 PR #414（ui-measure 补齐矩阵的三处缺口、去掉两类假红）；issue #223 已关闭；决定记录补在 PR #425。`shotAnchor` 来自 PR #346（标题「设计收敛改由人定：评委降为顾问，每轮交设计评审报告」，正文列了 ui-measure 只截锚点区域，该 PR 主题不是它）。
- 守护：`idea-loop/scripts/ui-compare.test.mjs`、`idea-loop/scripts/ui-measure-skill-doc.test.mjs`；本次对账两个文件共 37 条全过。`ui-measure.mjs` 按设计不带单元测试，靠实际跑来覆盖。
