---
name: flowchart
description: 用 Excalidraw 手绘风格生成流程图 / 决策流 / 分支判断图。任何提到 flowchart / 流程图 / 决策树 / decision flow / branching / 判断分支 / yes-no 流程 / 表单校验流 / 业务流转 / 审批流 / pipeline 流程 / process diagram 的场景都触发本 skill。底层调 npx excalidrawer CLI 输出 .excalidraw / .svg / .png。开 AskUserQuestion 工具先 clarify 用户的目标 / 节点 / 分支 / 方向，再拼 JSON 调 CLI。
allowed-tools: Bash(npx excalidrawer@^0.5.4:*), Bash(ls:*), Read, Write(*.json), AskUserQuestion
---

# Flowchart skill

把用户描述的流程画成手绘风 flowchart。**不要直接拼 JSON**——先问清几个 load-bearing 问题。

## 0. 必读约定

- CLI 用法 / 输出文件命名 / 覆盖策略 → `${CLAUDE_PLUGIN_ROOT}/references/cli-usage.md`
- 颜色 palette → `${CLAUDE_PLUGIN_ROOT}/references/colors.md`
- 4 类模版都覆盖不到时 → `${CLAUDE_PLUGIN_ROOT}/references/custom-api.md`

## 1. 前置检查（会话首次）

```bash
npx excalidrawer@^0.5.4 --version
```

## 2. Clarify 阶段（核心步骤，先问后画）

用户描述往往很模糊（"帮我画个流程图"）。**不要猜**——用 AskUserQuestion 工具问 2-4 个 load-bearing 问题。

### 必问

1. **流程的核心场景是什么** —— 一句话目标（自由文本，自然语言模板）
   - 例："用户提交表单到数据落库的全过程" / "Code review 通过到合并主干的步骤"

2. **哪些节点是判断 / 分叉点** —— AskUserQuestion 单选或多选
   - 选项示例（按场景动态生成）：
     - "0 个，直线流程"
     - "1 个，单一 yes/no 判断"
     - "2-3 个，多重判断"
     - "我自己列出来"
   - 判断点决定 `type: "decision"` 节点数

3. **方向** —— AskUserQuestion 二选一
   - 选项：`horizontal`（默认，节点宽度多） / `vertical`（节点列数少时更紧凑）

### 可选追问（看场景）

- 是否有失败 / 异常分支需要单独画终点
- 起点和终点是否需要特殊形状（默认 `start`/`end` 圆角矩形）

### 跳过 clarify 的条件

用户已经粘了完整结构化数据（节点列表 + 连接关系），直接进 §3。

## 3. 拼 JSON

Schema：

```json
{
  "title": "Form Submission Validation",
  "direction": "horizontal",
  "nodes": [
    { "id": "start",  "label": "Submit Form",     "type": "start" },
    { "id": "valid",  "label": "Validate Fields", "type": "process" },
    { "id": "check",  "label": "All Valid?",      "type": "decision" },
    { "id": "save",   "label": "Save to Storage", "type": "process" },
    { "id": "done",   "label": "Success",         "type": "end" },
    { "id": "fail",   "label": "Show Errors",     "type": "end", "color": "red" }
  ],
  "edges": [
    { "from": "start", "to": "valid" },
    { "from": "valid", "to": "check" },
    { "from": "check", "to": "save", "label": "Yes" },
    { "from": "check", "to": "fail", "label": "No" },
    { "from": "save",  "to": "done" }
  ]
}
```

字段：
- `title` (string, optional) — 图顶标题
- `direction` (string, optional) — `"horizontal"`（默认）或 `"vertical"`
- `nodes[]`
  - `id` (string) — edge 引用键，必须唯一
  - `label` (string) — 节点显示文本，自动换行
  - `type` (string, optional) — `"process"`（默认，矩形）/ `"decision"`（菱形）/ `"start"`/`"end"`（圆角）/ `"io"`（矩形）
  - `color` (string, optional) — 覆盖默认色，详见 `colors.md`
- `edges[]`
  - `from` / `to` — node `id`
  - `label` (string, optional) — 边上文本（如 `"Yes"` / `"No"`）

写到 `./<diagram-name>.json`（例 `./flowchart-form-submit.json`）。

## 4. 调 CLI 生成

```bash
npx excalidrawer@^0.5.4 generate \
  -t flowchart \
  -i ./flowchart-form-submit.json \
  -o ./flowchart-form-submit \
  -s 100000
```

输出 `./flowchart-form-submit.{excalidraw,svg,png}`。

## 5. 验证 + 给用户

```bash
ls -la ./flowchart-form-submit.{excalidraw,svg,png}
```

把三个路径告诉用户。`.svg` 适合贴 Markdown / GitHub，`.png` 适合 Notion / 飞书 / slides，`.excalidraw` 留给用户继续编辑。

## 6. 常见迭代

用户看完图常会要：
- "把 X 节点拆成两步" → 改 nodes[] 加新节点 + 调整 edges
- "X 走成功路径，但还得回到 Y 重试" → edges[] 加循环边
- "字太挤" → label 改短，副信息没法放（flowchart 不支持 desc，需要时升级到 architecture）

每次改 JSON 后用同一个 `--seed` 重跑 CLI，element ID 稳定，diff 干净。

## 7. 不适用本 skill 的场景（建议路由）

- 时间轴 / 路线图 / 里程碑 → `timeline` skill
- 系统架构 / 分层组件 → `architecture` skill
- 多角色交互 / API 调用顺序 → `sequence` skill
- 4 类都不像（树状 / 心智图 / 自定义） → `references/custom-api.md`
