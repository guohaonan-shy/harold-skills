---
name: architecture
description: 用 Excalidraw 手绘风格生成系统架构图 / 分层组件图 / 模块依赖图。任何提到 architecture / 架构图 / 系统架构 / 分层 / layered / component diagram / 模块图 / 服务拓扑 / 微服务架构 / 前后端架构 / 数据流图 / system topology / 中台架构 / 数据中台 / 三层架构 / 四层架构 的场景都触发本 skill。底层调 npx excalidrawer CLI 输出 .excalidraw / .svg / .png。开 AskUserQuestion 工具先 clarify 系统名 / 分层 / 跨层连接，再拼 JSON 调 CLI。
allowed-tools: Bash(npx excalidrawer@^0.5.3:*), Bash(ls:*), Read, Write(*.json), AskUserQuestion
---

# Architecture skill

把用户的系统组件 / 分层架构画成手绘风架构图。**先 clarify 分层结构再画**——分层错了整图都得重做。

## 0. 必读约定

- CLI 用法 / 输出文件命名 / 覆盖策略 → `${CLAUDE_PLUGIN_ROOT}/references/cli-usage.md`
- 颜色 palette → `${CLAUDE_PLUGIN_ROOT}/references/colors.md`
- 树状图 / 心智图等非分层架构 → `${CLAUDE_PLUGIN_ROOT}/references/custom-api.md`

## 1. 前置检查（会话首次）

```bash
npx excalidrawer@^0.5.3 --version
```

## 2. Clarify 阶段（核心步骤，先问后画）

架构图最容易"画着画着发现该改分层"——一定先 clarify。**用 AskUserQuestion 问 3 个 load-bearing 问题**。

### 必问

1. **系统 / 产品名（标题）** —— 自由文本
   - 例："Order Service Architecture" / "数据中台架构"

2. **分层方式 + 各层名字** —— 自然语言模板
   - 提示用户用以下模板提供：
     ```
     - <层名>: <这层包含的组件>
     - <层名>: <这层包含的组件>
     ```
   - 例：
     ```
     - Frontend: Web App, Mobile App
     - Service Layer: API Gateway, Order Service, User Service
     - Data Layer: MySQL, Redis, ElasticSearch
     ```
   - 一般 2-5 层；超过 5 层要建议拆图

3. **是否要画跨层连接箭头** —— AskUserQuestion 二/三选一
   - 选项：
     - "不画箭头，只看分层结构"
     - "画主要数据流（3-5 条关键箭头）"
     - "画完整调用关系（>5 条）" → 提醒用户太多箭头会乱，建议保留 5-8 条主线

### 可选追问

- 跨层箭头是否区分 solid（同步） / dashed（异步 / 旁路），默认全 solid
- 某些组件是否需要副信息（用 `desc` 字段，小灰字显示在 box 下方）

### 跳过 clarify 的条件

用户已经清晰列出层 + 组件 + 连接（粘了结构化清单或 ASCII），直接进 §3。

## 3. 拼 JSON

Schema：

```json
{
  "title": "Order Service Architecture",
  "sections": [
    {
      "label": "Frontend",
      "color": "yellow",
      "items": [
        { "label": "Web App",    "desc": "React SPA" },
        { "label": "Mobile App", "desc": "iOS / Android" }
      ]
    },
    {
      "label": "Service Layer",
      "color": "blue",
      "items": [
        { "label": "API Gateway",   "color": "blue" },
        { "label": "Order Service", "color": "green" },
        { "label": "User Service",  "color": "green" }
      ]
    },
    {
      "label": "Data Layer",
      "color": "gray",
      "items": ["MySQL", "Redis"]
    }
  ],
  "connections": [
    { "from": "Web App",     "to": "API Gateway" },
    { "from": "API Gateway", "to": "Order Service" },
    { "from": "Order Service", "to": "MySQL", "style": "dashed" }
  ]
}
```

字段：
- `title` (string, optional) — 顶部标题
- `sections[]` —— 横向分层，从上到下
  - `label` (string) — 层名（如 "Frontend" / "Service Layer"）
  - `color` (string, optional) — 整层背景色键（详见 colors.md）
  - `items[]` —— 该层内的 box，水平排列
    - 简写：`"Label string"`
    - 完整：`{ label, color?, desc? }`
    - `desc` 是小灰字副信息，**别塞进 label**（label 长会撑宽全部 box）
- `connections[]` —— 跨 section 箭头（可选）
  - `from` / `to` — 必须**完全匹配** item 的 `label` 字符串
  - `label` (string, optional) — 箭头上的文字
  - `style` — `"solid"`（默认） / `"dashed"`

写到 `./<diagram-name>.json`（例 `./architecture-order-service.json`）。

## 4. 调 CLI 生成

```bash
npx excalidrawer@^0.5.3 generate \
  -t architecture \
  -i ./architecture-order-service.json \
  -o ./architecture-order-service \
  -s 300000
```

输出 `./architecture-order-service.{excalidraw,svg,png}`。

## 5. 验证 + 给用户

```bash
ls -la ./architecture-order-service.{excalidraw,svg,png}
```

汇报三个路径。架构图特别推荐 `.svg` —— 矢量缩放在 GitHub / 文档站清晰。

## 6. 常见迭代

- "某层要再细分两组" → 把那一层拆成两个 sections
- "字太长 box 都被撑宽了" → 长内容挪到 `desc`，label 留短关键词
- "箭头太乱" → 砍到 5-8 条主线，其余在 README 文字补充
- "异步调用需要标识" → 那条 connection 加 `"style": "dashed"`

每次改 JSON 后用同 `--seed` 重跑，element ID 稳定，diff 干净。

## 7. 不适用本 skill 的场景（建议路由）

- 流程 / 判断分支 → `flowchart` skill
- 时间线 / 路线图 → `timeline` skill
- 多角色交互（按时间顺序） → `sequence` skill
- 树状结构 / 组织架构 / 心智图 → `references/custom-api.md` 写自定义
