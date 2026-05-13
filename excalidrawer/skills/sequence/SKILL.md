---
name: sequence
description: 用 Excalidraw 手绘风格生成时序图 / sequence diagram / 交互图 / swimlane 流程。任何提到 sequence diagram / 时序图 / 交互图 / swimlane / 多角色交互 / API 调用顺序 / 客户端服务端交互 / 跨服务调用链 / 协议握手 / handshake / 异步消息流 / message flow / 谁先谁后 的场景都触发本 skill。底层调 npx excalidrawer CLI 输出 .excalidraw / .svg / .png。开 AskUserQuestion 工具先 clarify 参与方 / 步骤顺序 / 同步异步，再拼 JSON 调 CLI。
allowed-tools: Bash(npx excalidrawer@^0.5.4:*), Bash(ls:*), Read, Write(*.json), AskUserQuestion
---

# Sequence skill

把多角色之间按时间顺序的交互画成手绘风时序图（横向 actors + 纵向 steps）。**先 clarify actors 和步骤再画**。

## 0. 必读约定

- CLI 用法 / 输出文件命名 / 覆盖策略 → `${CLAUDE_PLUGIN_ROOT}/references/cli-usage.md`
- 颜色 palette → `${CLAUDE_PLUGIN_ROOT}/references/colors.md`
- 自定义场景（非时序）→ `${CLAUDE_PLUGIN_ROOT}/references/custom-api.md`

## 1. 前置检查（会话首次）

```bash
npx excalidrawer@^0.5.4 --version
```

## 2. Clarify 阶段（核心步骤，先问后画）

时序图错一个 actor 或步骤顺序，整图都得重做。**用 AskUserQuestion 问 3 个 load-bearing 问题**。

### 必问

1. **参与方（actors）有哪些** —— 自然语言模板
   - 提示用户列出参与方，从左到右顺序就是图上 actor 列顺序：
     ```
     - <actor 1>
     - <actor 2>
     - <actor 3>
     ```
   - 例：`Client / Service / Storage` 或 `User / Frontend / Backend / Database`
   - 一般 2-5 个；超过 5 列建议拆图或简化

2. **整体流程一句话目标** —— 自由文本
   - 例："用户提交请求到拿到响应的全过程" / "Token 刷新流程"
   - 决定 title 和步骤主线

3. **是否包含失败 / 异步返回路径** —— AskUserQuestion 二/三选一
   - 选项：
     - "只画成功路径（同步主线）"
     - "包含返回 / 响应路径（用 dashed 箭头）"
     - "包含失败分支" → 提醒用户复杂分支建议拆成多个时序图

### 可选追问

- 步骤数大约多少（3-5 / 6-10 / >10），>10 建议拆段
- 是否要标识"成功终态"（最后一步 `color: green`）

### 跳过 clarify 的条件

用户已经粘了结构化的 actor 列表 + 步骤序列，直接进 §3。

## 3. 拼 JSON

Schema：

```json
{
  "title": "Request Response Flow",
  "actors": [
    { "label": "Client",  "color": "yellow" },
    { "label": "Service", "color": "blue"   },
    { "label": "Storage", "color": "gray"   }
  ],
  "steps": [
    {
      "actor": "Client",
      "text":  "1. Send request"
    },
    {
      "actor": "Service",
      "text":  "2. Validate + lookup",
      "from":  "Client",
      "arrow": "POST /resource"
    },
    {
      "actor": "Storage",
      "text":  "3. Query data",
      "from":  "Service",
      "arrow": "SELECT ..."
    },
    {
      "actor": "Service",
      "text":  "4. Format response",
      "from":  "Storage",
      "arrow": "rows",
      "style": "dashed"
    },
    {
      "actor": "Client",
      "text":  "5. Receive response",
      "color": "green",
      "from":  "Service",
      "arrow": "200 OK"
    }
  ]
}
```

字段：
- `title` (string, optional) — 图顶标题，居中
- `actors[]` —— 参与方列，从左到右
  - `label` (string) — actor 名（也作为 step 里 `actor` / `from` 的引用键）
  - `color` (string, optional) — 表头 box 色键（详见 colors.md）
- `steps[]` —— 按时间顺序，每条占一行
  - `actor` (string) — 这步落在哪个 actor 列（必须匹配某个 actor `label`）
  - `text` (string) — box 内文本，自动换行；可用 `\n` 强制换行
  - `color` (string, optional) — 覆盖 box 色（如 `"green"` 标终态）
  - `from` (string, optional) — 源 actor label；填了就画**水平箭头**从那条 lifeline 进入本步
  - `arrow` (string, optional) — 箭头上的文本；`""` 表示无文本箭头
  - `style` (string, optional) — `"solid"`（默认）/ `"dashed"`（返回 / 异步）

写到 `./<diagram-name>.json`（例 `./sequence-request-response.json`）。

## 4. 调 CLI 生成

```bash
npx excalidrawer@^0.5.4 generate \
  -t sequence \
  -i ./sequence-request-response.json \
  -o ./sequence-request-response \
  -s 400000
```

输出 `./sequence-request-response.{excalidraw,svg,png}`。

## 5. 验证 + 给用户

```bash
ls -la ./sequence-request-response.{excalidraw,svg,png}
```

汇报三个路径。

## 6. 常见迭代

- "中间多一步" → steps[] 插入对应位置，重跑同 seed
- "返回值要画虚线" → 那个 step 加 `"style": "dashed"`
- "失败分支怎么画" → 简单情况单独再画一张失败时序；复杂分支建议升级 flowchart 或拆图
- "actor 顺序要换" → 改 actors[] 顺序，整图列重排

## 7. 不适用本 skill 的场景（建议路由）

- 单线性流程 / 决策分支 → `flowchart` skill
- 时间线 / 项目阶段 → `timeline` skill
- 系统分层架构（不是按时间） → `architecture` skill
- 状态机图 / 树形结构 → `references/custom-api.md` 写自定义
