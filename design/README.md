# design plugin

面向真实产品 surface 的人机协同设计流水线。一个入口（`/design`）把需求带过目标项目 truth 载入、澄清、2-3 个独立生成的灰盒 wireframe 候选、一次人工选择闸门，再路由进静态 UI 设计（`design-ui`，按 Surface/Module/Component 三档 altitude 路由）与——当确有需要时——已验证的动效（`design-motion`），最后由端口保真度闸门（`design-port`）收尾。`design-brief` 是它的上游：项目还没有 `DESIGN.md` 时先跑这个，把设计语言（T1 底线 / T2 判例 / T3 禁令）定下来。

Project-agnostic 且自包含：品牌与 token 法则在运行时从目标项目的 `DESIGN.md` 读取，缺失时降级到本 plugin 自带的 taste layer（`references/`）。自带一个确定性 lint hook，对 `design-preview/` 与 `design-motion-preview/` 下的 HTML 写入自动触发。

## 入口

```text
/design <要设计的东西>
  ├─ 0 路由（surface / 组件 / 只做动效 / 只验端口）
  ├─ 1 载入目标项目 truth（DESIGN.md · PRODUCT.md · 现有代码）
  ├─ 2 澄清（只问会改变产出的）
  ├─ 3 wireframe 候选 ── workflows/wireframe-candidates.js 并行生成 + 差异审计
  ├─ 4 ⏸ 你选一个          ← 本 skill 唯一新增的闸门
  └─ 5 路由到下游 skill（各自保留原有 sign-off）
```

`/design-brief` 是它的上游：项目还没有 `DESIGN.md` 时先跑这个。

## Skills

| Skill | 职责 |
|---|---|
| `design` | 端到端入口：需求 → 候选 → 人工选择 → 路由 |
| `design-brief` | **写** DESIGN.md：三层法（T1 底线 / T2 判例 / T3 禁令），Establish/Infer 两种模式。其余 skill 都只读它 |
| `design-ui` | 产品 surface 静态 UI：按最高影响高度路由 Surface → Module → Component |
| `design-motion` | 在已批准静态稿上设计动效与原生交互，浏览器内验证后再 port |
| `design-port` | 把签字通过的 preview 改动译成真实 React（分类 CSS、映射 Tailwind、识别数据契约变更、按状态归属找组件），再验证端口保真度：preview HTML 为真相，比对真实 React 路由 |

## Workflows

- `wireframe-candidates.js` —— 给定 brief，并行生成结构上真正不同的灰盒候选，再跑一次差异审计。

  审计存在的理由：同一个 agent 连出三个方案，很容易变成「左图右文 / 右图左文 / 居中」——看着三个，结构一个。审计会明确报告哪两个塌成了同一个，宁可交两个诚实的候选也不交三个假的。

  它**不与用户对话**：澄清和选择都发生在 `/design` skill 里（workflow 跑在后台，无法 AskUserQuestion）。

## Lint hook

`hooks/hooks.json` 在 `Write|Edit` 后触发 `scripts/design-lint-hook.mjs`：只对 `design-preview/` 与 `design-motion-preview/` 下的 HTML 文件生效，跑内置的品牌/anti-slop 规则（`scripts/design-lint.mjs`，含原生的 `layout-transition`/`bounce-easing` 检测，不链式调用任何外部工具）。P0/P1 发现会以非零退出码把问题带回模型；非 preview 文件与全部通过时静默退出。

## 未搬入的部分

来自 design-lib 消费侧 plugin，本轮刻意不搬：

- **落地页专属的两个技能**（`design-landing` / `design-landing-plan`）——它们的方法论已拆分：page taxonomy、Hero 七槽模型整理进 `design-ui` 专用的 `references/landing-ia.md`（走 Landing/IA 这档路由时才读），证明地图、响应式改稿、运行时/降级状态模型这类任何 altitude 都用得上的通用工艺并入了 `references/design-core.md` §7。
- **视频背景生成技能**（`video-bg-section`）——按讨论明确排除，留到下一版单独展开。

`port-to-react` 未单独出现在这份列表里：它的翻译机制已并入 `design-port`，不再作为独立技能存在。

搬迁与去耦记录见 design-lib 仓库自己的 `MIGRATION.md`；本次是同一批技能第二次搬家，只换 marketplace 位置，不重做那一轮已经做过的工作。
