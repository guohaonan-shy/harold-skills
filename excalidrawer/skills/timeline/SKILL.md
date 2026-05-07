---
name: timeline
description: 用 Excalidraw 手绘风格生成时间线 / 路线图 / 项目里程碑图。任何提到 timeline / 时间线 / 路线图 / roadmap / milestone / 里程碑 / 项目阶段 / phase / 季度规划 / 年度计划 / Q1Q2Q3Q4 / 周计划 / 时间节点 / chronology 的场景都触发本 skill。底层调 npx excalidrawer CLI 输出 .excalidraw / .svg / .png。开 AskUserQuestion 工具先 clarify 时间跨度 / 粒度 / 关键里程碑，再拼 JSON 调 CLI。
allowed-tools: Bash(npx excalidrawer:*), Bash(ls:*), Read, Write(*.json), AskUserQuestion
---

# Timeline skill

把用户的项目阶段 / 路线图 / 里程碑序列画成手绘风时间轴。**先 clarify 再画**。

## 0. 必读约定

- CLI 用法 / 输出文件命名 / 覆盖策略 → `${CLAUDE_PLUGIN_ROOT}/references/cli-usage.md`
- 颜色 palette → `${CLAUDE_PLUGIN_ROOT}/references/colors.md`
- 自定义图（非时间轴形态）→ `${CLAUDE_PLUGIN_ROOT}/references/custom-api.md`

## 1. 前置检查（会话首次）

```bash
npx excalidrawer --version
```

## 2. Clarify 阶段（核心步骤，先问后画）

时间线信息密度大、粒度敏感——画错粒度全图重做。**用 AskUserQuestion 问 2-3 个 load-bearing 问题**。

### 必问

1. **时间跨度 + 粒度** —— AskUserQuestion 单选
   - 选项示例：
     - "按月（覆盖 1 年内项目）"
     - "按季度（覆盖 1-3 年规划）"
     - "按年（多年战略路线）"
     - "按周（短期冲刺）"
     - "自定义粒度"
   - 决定 `time` 字段的格式（`Jan` / `Q1` / `2026` / `W1`）

2. **里程碑列表** —— 自然语言模板（粘贴友好）
   - 提示用户用以下模板提供：
     ```
     - <时间>: <里程碑名> — <一句话描述>
     - <时间>: <里程碑名> — <一句话描述>
     ```
   - 例：
     ```
     - Jan: Kickoff — 立项 + 需求收敛
     - Mar: Alpha — 内部小流量验证
     - Jun: GA — 全量上线
     ```

### 可选追问

- 是否要**高亮当前进度** / **today 标记**（用 `color: red` 染红那一项）
- 里程碑之间是否要颜色区分阶段（默认按 palette 循环上色，相邻里程碑天然不同色）

### 跳过 clarify 的条件

用户已经粘了结构化里程碑列表（带时间 + 描述），直接进 §3。

## 3. 拼 JSON

Schema：

```json
{
  "title": "Project Timeline 2026",
  "items": [
    { "label": "Kickoff", "time": "Jan", "desc": "立项 + 需求收敛" },
    { "label": "Alpha",   "time": "Mar", "desc": "内部小流量验证\n关键功能 ready" },
    { "label": "Beta",    "time": "May", "desc": "外部 50 用户灰度", "color": "orange" },
    { "label": "GA",      "time": "Jun", "desc": "全量上线",         "color": "green" }
  ]
}
```

字段：
- `title` (string) — 图顶标题
- `items[]` —— 按时间顺序
  - `label` (string) — 里程碑名（彩色 box 内显示）
  - `time` (string) — 时间标签（轴上显示，如 `"Jan"` / `"Q1"` / `"W3"`）
  - `desc` (string) — 描述文字，`\n` 换行
  - `color` (string, optional) — box 填色；不填按 palette 循环（详见 colors.md）

写到 `./<diagram-name>.json`（例 `./timeline-2026-roadmap.json`）。

## 4. 调 CLI 生成

```bash
npx excalidrawer generate \
  -t timeline \
  -i ./timeline-2026-roadmap.json \
  -o ./timeline-2026-roadmap \
  -s 200000
```

输出 `./timeline-2026-roadmap.{excalidraw,svg,png}`。

## 5. 验证 + 给用户

```bash
ls -la ./timeline-2026-roadmap.{excalidraw,svg,png}
```

汇报三个路径：`.svg` 贴 Markdown / GitHub，`.png` 贴 Notion / slides，`.excalidraw` 留给用户继续编辑。

## 6. 常见迭代

- "再加一个里程碑在中间" → items[] 插入对应位置 + 调 desc，重跑同 seed
- "颜色都按阶段分组" → 同阶段 items 显式给同色（`color: "blue"` × N，`color: "green"` × N）
- "标记 today" → 在对应里程碑加 `"color": "red"` + `desc` 加 `"(current)"`

## 7. 不适用本 skill 的场景（建议路由）

- 流程 / 决策分支 → `flowchart` skill
- 系统层级架构 → `architecture` skill
- 多方角色交互 → `sequence` skill
- 甘特图 / 多任务并行带条 → 模版不覆盖，走 `references/custom-api.md` 写自定义脚本
