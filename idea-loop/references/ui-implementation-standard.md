# UI 实现标准 —— 把设计画布落成代码，并让"像不像"变成一个会红的测试

`implement` 接到一张 **UI ticket** 时读这份。非 UI ticket 不读。

这一环跟 `uiux-refine` 的收敛环**形状不同**：refine 是执行者对评委的双 agent 环，判据是品味；这里是 TDD 的红绿环，**判据是脚本**，没有审查 agent。"做得像不像"不再是另一个模型的意见，而是一串带严重度的 finding。

---

## 0 输入

来自 ticket 的「设计冻结」字段（由 `to-ticket` 从 spec §4 的冻结摘要誊写）：

- **HTML 画布**的指针（raw 桶里那份）——它是这一刀的**真值**
- **验收矩阵**：要逐格比对的 viewport / 主题 / 状态组合，以及每格的容差覆盖
- **ledger 摘要**：收敛过程里做过哪些决定，防止你把一条已经被否掉的方案又实现回来
- 状态矩阵与**数据契约变更**

`⛔ 未冻结` 就停。没有画布的 UI ticket 没有真值，这一环跑不了。

---

## 1 把画布读成项目自己的组件树

**画布的角色相当于 Figma 画布**，不是一份等着被 import 的代码。它的 DOM 结构是为了让一个人在浏览器里看清楚设计，不是为了表达你项目的组件边界。

### 1.1 按状态归属找组件，不按画布的 DOM 嵌套找

画布是扁的：一个 `<div>` 套一个 `<div>`，因为它没有状态。你的项目不是——**某个视觉块该住在哪个组件里，由"谁拥有它依赖的状态"决定**，跟它在画布里被谁包着无关。

- 一个视觉上嵌在卡片里的下拉，如果它的开合状态由列表页持有，它就是列表页的子组件，不是卡片的。
- 画布里并列的两块，如果共享同一份数据加载状态，它们在项目里可能是同一个组件的两个分支。

先列出这个 surface 上**所有会变的东西**（数据、开合、选中、加载、错误、空），标出每样归谁，再决定组件怎么切。

### 1.2 识别数据契约变更

**画布里出现了项目当前渲染不出来的内容，就不是样式改动。** 一个新的副标题、一个"上次编辑于"的时间、一个来源标签——这些要的是**真的契约变更**（类型 + 后端 schema 或 prompt），不是在 JSX 里补一个写死的字符串。

判别动作：拿一条**真实数据**（真跑一次，不是画布里手写的 mock）渲染你的实现。画布上有、真实数据里没有的字段，就是一条数据契约变更，**在 ticket 里没写**的话回去补 ticket，不要在这一刀里顺手造假数据糊过去。

### 1.3 token 映射到项目 DESIGN.md 的名字

画布上的每个具体值（`#0a0a0a`、`14px`、`8px` 圆角）在项目里都要落成**项目自己的 token 名**，来源是目标项目根的 `DESIGN.md`。

- 项目里已有对应 token → 用那个名字。
- 项目里没有 → 先确认它是不是该有。一个一次性的边角值用行内任意值（Tailwind 的 `text-[15px]` 这类）是对的；一个会复用的值该进 DESIGN.md，那是一条 Distill-back，不是一个魔法数。
- **token 归因要写得出来**：任何一个视觉值，你都要能说出它是哪个 token、出处在 DESIGN.md 哪一行。说不出来，就是在项目里新开了一套没人知道的样式。

### 1.4 硬禁令：不要把 preview 的 CSS 原样搬进项目

**画布的 `<style>` 块不进项目。** 它整个是画布的脚手架：为了在一个单文件 HTML 里复现设计而写的类名和规则，在你的项目里一个都不存在。把它复制进去，等于在项目里建了**第二套样式系统**——跟项目真正的 token 平行、没人维护、下一次改版必然漂开。

分类动作，改任何一行代码之前做：把画布里用到的每条 CSS 规则分成两桶。

| 桶 | 它是什么 | 怎么处理 |
|---|---|---|
| **画布自造** | 只存在于画布那个 `<style>` 里的类 | **翻译**成项目的表达方式（utility / CSS module / 组件 prop），类名不要带过去 |
| **项目已有** | 项目本来就加载、别的组件已经在用的类 | **原样复用**，不要照着它的样子再造一个看起来像的 |

分不清就 grep 项目。假设一个 utility 存在而不查，是这一步最常见的错。

---

## 2 各栈附录

**先探测栈**：读目标项目的 `package.json` 依赖。**项目自己的约定读它的 `CLAUDE.md`**——本节只讲"token / 状态 / 断点在这个栈里用什么机制表达"，不是属性对照表，更不覆盖项目自己写下来的规矩。

### 2.1 共通三问

不管什么栈，落地之前答这三个：

1. **token 怎么表达**：CSS 自定义属性？Tailwind theme？设计 token 包？——找到项目已经在用的那条路，别新开一条。
2. **状态怎么表达**：画布上一个状态是一帧；项目里它是 props、路由参数，还是 store？§1.1 的归属分析给答案。
3. **断点怎么表达**：媒体查询、Tailwind 前缀，还是容器查询？矩阵里每个 viewport 都要落到项目已有的断点上，**不要为了对齐画布新开一个断点**。

### 2.2 栈速查

| 栈 | 探测信号 | token | 状态 | 断点 |
|---|---|---|---|---|
| **React (Vite)** | `react` + `vite` | `:root` 自定义属性或 Tailwind theme | props / context / store | 媒体查询或 Tailwind 前缀 |
| **Next.js** | `next` | 同上，常在 `app/globals.css` | Server Component 取数 + Client Component 持交互态 | 同上；注意 RSC 里没有 `window` |
| **Vue** | `vue` + `vite` | 自定义属性 + SFC `<style>` 里的 `v-bind()` | `ref` / `provide` / Pinia | 媒体查询；SFC scoped style |
| **Nuxt** | `nuxt` | `app.config` / 自定义属性 | `useState` / composable | 同 Vue |
| **Svelte / SvelteKit** | `svelte` | 自定义属性 + 组件 `<style>` | `$state` / store / `load` | 媒体查询；组件样式默认 scoped |

**混栈或不在表里**：按共通三问自己找机制，把答案写进目标项目的 `CLAUDE.md`，下一张 ticket 就不用再找一次。

### 2.3 dev 专用状态 harness（每栈的守卫机制）

矩阵里每个状态是一帧，本地侧靠 `?state=` 切（见 §3.1 第 3 条）。这需要目标项目提供一条**只在开发构建里注册**的路由：按 `?state=` 用 fixture 数据把 surface 渲染到指定状态。

**生产构建里这条路由必须不存在，并且有一个测试断言它在 prod 模式下 404。** 这个断言属于目标项目自己的测试套件，不属于本 plugin。

| 栈 | 守卫机制 |
|---|---|
| **Next.js** | harness 路由段的 `page` 在模块顶层判 `process.env.NODE_ENV !== 'production'` 时 `notFound()`；或把整个路由段放在只在 dev 生效的 rewrite 后面。构建时常量会被 bundler 折叠，prod 产物里那条分支消失。 |
| **Vite (React / Vue / Svelte)** | 路由注册处包 `if (import.meta.env.DEV)`。Vite 在生产构建里把它替换成 `false` 并 tree-shake 掉整段，harness 与它的 fixture 都不进产物。 |
| **Nuxt** | 页面里 `if (!import.meta.dev) throw createError({ statusCode: 404 })`；或把 harness 页面放进一个只在 dev 加进 `modules`/`extends` 的层。 |
| **SvelteKit** | `+page.server.ts` 的 `load` 里 `if (!dev) error(404)`（`dev` 来自 `$app/environment`）。 |
| **其它** | 判据一致：守卫必须是**构建时**可折叠的常量，不能是运行时的环境变量读取——后者意味着代码还在产物里，只是被一个 if 挡着。 |

prod 404 断言的形状（栈无关）：以生产模式构建并启动，请求 harness 路径，断言状态码 404。

---

## 3 校验环怎么跑

### 3.1 三条环境约定

两个 tab 比的必须是同一个东西，否则比对没有价值。这三条**由写画布的那一段（`uiux-refine`）执行**，实现侧负责不破坏它们。

1. **锚点**：画布里的块和关键元素带稳定的 `data-anchor` 属性。**port 到项目框架时必须原样保留**（跟 test id 同理）——两个 DOM 靠它对齐。锚点丢了，测量层报的是最高严重度的缺失 finding，不是"差一点"。
2. **渲染环境一致**：画布的字体走**目标项目自己的加载方式**（自托管文件或项目已有链路），**不走公共 CDN**；两个 tab 同 viewport、同 DPR、同色彩模式；截图前等 `document.fonts.ready`，并关闭动画与过渡。
3. **状态格靠 URL，且只在 dev 存在**：画布每个状态是一帧，用 `?state=<名字>` 切；本地侧由 §2.3 的 dev-only harness 提供同名状态。冻结摘要的矩阵每格记状态名，脚本按名拼 URL。**harness 覆盖不了的格标「人看」，不假装绿。**

### 3.2 默认容差

写在这里，**ticket 可以按格覆盖**，覆盖要在 ticket 里写明理由。

| 属性类别 | 判据 |
|---|---|
| 位置类（top / left / width / height / padding / margin / gap） | **±1px** |
| token 类（颜色、字号、行高、字重、字距、圆角、边框、阴影、透明度） | **精确匹配**，不吃容差 |
| 像素层每格 mismatch | **≤ 1%** |
| 抗锯齿容差 | 与位置容差**是两个概念**，各走各的：位置容差说"这个盒子可以偏一个像素"，抗锯齿容差说"这两个像素在光栅化意义上是同一个颜色"。默认取感知色距 0.1（YIQ 归一化，与 pixelmatch 同源）。 |

"颜色差一个色阶"是一条 finding，不是舍入误差——差一个色阶意味着用错了 token。

### 3.3 矩阵怎么写

矩阵是一份 JSON，喂给测量脚本。`canvas` 指画布的本地 URL，`local` 指项目 dev server 上的 harness 路由：

```json
{
  "canvas": "http://localhost:8000/canvas/settings.html",
  "local": "http://localhost:5173/__design/settings",
  "dpr": 2,
  "tolerance": { "position": 1, "antialias": 0.1, "pixel": 1 },
  "cells": [
    { "name": "desktop/light/default", "viewport": { "width": 1440, "height": 900 }, "colorScheme": "light", "state": "default" },
    { "name": "mobile/dark/empty", "viewport": { "width": 390, "height": 844 }, "colorScheme": "dark", "state": "empty",
      "tolerance": { "pixel": 2 }, "byAnchor": { "chart": { "position": 3 } } },
    { "name": "desktop/light/live-data", "viewport": { "width": 1440, "height": 900 }, "state": "live", "review": "human" }
  ]
}
```

- 格的 `name` 用在每条 finding 的位置字段里，写得让人一眼知道是哪一格。
- `review: "human"` 的格脚本**跳过**，单独列出来，不计入绿。
- 像素层看的是 **viewport 那一帧**（不是整页），所以两张截图必然同尺寸；折叠线以下的覆盖靠锚点，需要单独看就再加一格。

### 3.4 跑，然后照 finding 改

```
node <plugin>/idea-loop/scripts/ui-measure.mjs matrix.json        # 人读
node <plugin>/idea-loop/scripts/ui-measure.mjs matrix.json --json  # 机读
```

退出码：`0` 全绿，`2` 有 finding。

finding 的形状与本仓库 lint 输出同构，字段是闭集：

| 字段 | 含义 |
|---|---|
| `id` | 缺陷类型，闭集：`missing-anchor` / `position-drift` / `token-mismatch` / `pixel-mismatch` |
| `severity` | `P0` / `P1` / `P2` |
| `cell` · `anchor` · `property` | 位置：哪一格、哪个锚点、哪个属性 |
| `expected` · `actual` · `delta` · `detail` | 缺陷：画布是多少、你的实现是多少、差多少 |
| `why` | 这条为什么算缺陷 |

严重度是机械的，不是感觉：

- **P0 `missing-anchor`** —— 画布有这个锚点、你的路由上没有。**两边根本不在比同一个东西**，这一格其余所有数字都不作数，先修它。
- **P1 `position-drift` / `token-mismatch`** —— 测量层报的，点名了锚点和属性，改哪里是明确的。
- **P2 `pixel-mismatch`** —— 像素层报的兜底，它知道有东西不一样但说不出是什么。要么在那儿补一个锚点让测量层接手，要么解释为什么这个差异是可以接受的。

**测量层为主，像素层为辅**：像素层永远不压过一条点名了锚点的 finding。

### 3.5 终止条件

- **全绿**：finding 为空（`review: human` 的格不算绿，它们等人看）。
- **plateau**：**同一批 finding 两轮不变**——脚本自己判（比对上一轮的缺陷指纹，不是比对数字），判到了就在输出里打 `PLATEAU`。这时**停下交人**，并说明你判断残留差异是哪一种：
  - **实现问题** —— 还没找到对的做法，人来看一眼。
  - **设计决策** —— 项目的组件库出不了那个样子。这种回 `uiux-refine` 把设计弯一下并记进 ledger，**不在 implement 里硬磨**。
- 不设轮数上限。plateau 是机械判定，不需要拍一个"最多修三轮"。

### 3.6 触发时机

- **在 TDD 环里主动跑**，它就是「视觉正确性」那一行的红绿测试，跟真 DB 测试、eval 同级。
- **不挂在每次 Write/Edit 的 hook 上**：它要一个跑着的 dev server、每次要几秒、而且半成品状态下会大片假红——挂上去只会训练你忽略它。
- 收工时那一道检查**只查一件事：最后一轮是绿的**（或者剩下的都是标了「人看」的格）。
