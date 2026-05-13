# Custom diagrams via npm library API

4 个内置模版（flowchart / timeline / architecture / sequence）覆盖不到的图，用 npm 包的 elements API 写自定义脚本。

**触发场景**：用户描述的图明显不属于 4 类（如组织架构树、心智图、时空轨迹、自定义对比表）；或者 4 类都凑合得不像。

## 安装（自定义脚本场景才需要）

```bash
npm install excalidrawer
```

模版工作流不需要——`npx excalidrawer@^0.5.4 generate ...` 会自动拉。

## API 速览

```javascript
import {
  setSeed,            // setSeed(n) — 设置 seed，确定性 ID
  box,                // box(rid, tid, x, y, w, h, bg, text, fontSize?) → [rect, text]
  diamondBox,         // 同 box 但形状为菱形
  arrow,              // arrow(id, x, y, points, extra?) → arrow element
  textEl,             // textEl(id, x, y, w, h, text, fontSize, extra?) → text element
  rect,               // rect(id, x, y, w, h, bg, extra?) → 仅形状
  diamond,            // 仅菱形
  ellipse,            // 椭圆
  colors,             // 语义颜色 palette（见 colors.md）
  excalidraw,         // excalidraw(elements) → .excalidraw JSON 字符串
  toSvg,              // toSvg(elements) → SVG 字符串
  toPng,              // toPng(elements, scale?) → Promise<Buffer>
  wrapText,           // wrapText(text, maxWidth, fontSize) → 含 \n 的字符串
  estimateTextWidth,  // estimateTextWidth(text, fontSize) → 像素宽度估算
  // 也可以直接调模版函数：
  timeline, flowchart, architecture, sequence,
} from 'excalidrawer';
```

## 颜色（详见 colors.md）

```javascript
colors.yellow / blue / green / purple / red / orange / gray
colors.bgBlue / bgGreen / bgYellow / bgPurple              // 浅色背景
colors.strokeBlue / strokeGreen / strokeYellow / strokeOrange  // 描边
```

## 最小脚本骨架

```javascript
import { writeFileSync } from "fs";
import { setSeed, box, arrow, textEl, colors, excalidraw, toSvg, toPng } from "excalidrawer";

setSeed(100000);
const CY = 150, BH = 56, BY = CY - BH / 2;

const elements = [
  textEl("title", 20, 12, 500, 28, "My Diagram", 22),
  ...box("s1", "s1t", 20, BY, 130, BH, colors.yellow, "Start", 15),
  arrow("a1", 150, CY, [[0,0],[40,0]]),
  ...box("s2", "s2t", 190, BY, 150, BH, colors.blue, "Process", 14),
];

writeFileSync("diagram.excalidraw", excalidraw(elements));
writeFileSync("diagram.svg", toSvg(elements));
writeFileSync("diagram.png", await toPng(elements, 2));
```

执行：`node diagram.mjs`

## 视觉设计规则（写自定义脚本时遵守）

### Z-order（渲染层）

避免箭头盖住文字——分桶 spread：

```javascript
const bg = [], conn = [], fg = [];
// bg.push(...背景块)
// conn.push(...arrow)
// fg.push(...box / textEl)
const elements = [...bg, ...conn, ...fg];
```

模版内部已处理；自定义脚本必须显式分层。

### Labels & Titles

- 长 label 自动换行（box 内），高度自动撑高
- title 控制在 ~60 字符内，过长会超出 canvas 被裁
- 副信息用 `desc` 字段（小灰字），不要塞进 label

### 连线

- 同列垂直连线（直线）优先
- 跨列对角连线渲染成 L 形折线；多了视觉混乱

### 常见坑

- `box(...)` 返回数组，必须 spread：`...box(...)`
- 不要复用 element ID——不同图用不同 `setSeed()`
- `arrow(id, x, y, points, extra?)` 中 `x, y` 是起点；`points` 是**相对偏移**

## 何时升级回模版

如果你写的自定义脚本最终就是"flowchart 加几个 swimlane"或"architecture 加箭头"——停下来，看是不是模版字段没用全。比如 architecture 的 `connections` 支持跨层箭头，flowchart 支持 `direction: vertical/horizontal`。

模版能覆盖就别写脚本，参数化更适合复用。
