# excalidrawer

Code-first Excalidraw 图表生成的 Claude Code plugin。4 个 skill 各自负责一种图类型——AI 先用 AskUserQuestion 问 2-3 个 load-bearing 问题,然后读 skill 的 recipe(diagram-kind 知识),用 sugar 短写法拼元素数组,调 `excalidrawer-mcp` 服务的 `render_diagram` 工具输出 `.excalidraw` / `.svg` / `.png`。

**目标用户**:写文档 / 出 slides / 在飞书/Notion/GitHub 贴图的开发者、研究者、产品。**不是图表设计师**——输出是手绘风(Excalidraw 风格),适合工程文档而不是商业海报。

---

## 4 个 skill

| Skill | 用途 | 触发关键词 | 主要产物 |
|---|---|---|---|
| **flowchart** | 决策流 / 流程图 / 分支判断 | flowchart / 流程图 / 决策树 / yes-no / 判断分支 / 业务流转 / 审批流 | `./flowchart-<name>.{excalidraw,svg,png}` |
| **timeline** | 时间线 / 路线图 / 项目里程碑 | timeline / 时间线 / 路线图 / roadmap / milestone / 里程碑 / 阶段 / Q1Q2 | `./timeline-<name>.{excalidraw,svg,png}` |
| **architecture** | 系统架构 / 分层组件 / 模块拓扑 | architecture / 架构图 / 分层 / 三层架构 / 微服务 / 数据中台 | `./architecture-<name>.{excalidraw,svg,png}` |
| **sequence** | 时序图 / 多角色交互 / 调用链 | sequence diagram / 时序图 / 交互 / 调用顺序 / handshake / OAuth | `./sequence-<name>.{excalidraw,svg,png}` |

每个 SKILL.md 的 frontmatter `description` 写满了中英触发关键词——自然语言描述需求就能命中对应 skill。显式 `/flowchart` / `/timeline` / `/architecture` / `/sequence` 也能直接调。

---

## 安装

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install excalidrawer
/reload-plugins
```

plugin 在 `plugin.json` 里声明了 MCP server:

```json
"mcpServers": {
  "excalidrawer": {
    "command": "npx",
    "args": ["-y", "-p", "excalidrawer@^0.5.7", "-c", "excalidrawer-mcp"]
  }
}
```

`npx` 在首次启动时自动拉取底层 `excalidrawer` npm 包并缓存。如果想加快冷启动,可以全局装一份:`npm install -g excalidrawer`,MCP server 会优先用全局 binary。

---

## 单次会话长什么样

```
1. cd ~/<your-project>/             # 产物落 cwd
2. "帮我画一个用户注册流程图"      # 自然语言触发
   → flowchart skill 启动
   → AskUserQuestion 问场景 / 判断点 / 方向
   → Read skills/flowchart/recipes/flowchart.md(读 diagram-kind 知识)
   → 拼 sugar 元素数组(+ compute_layout 算 chain x 坐标)
   → call mcp__excalidrawer__render_diagram(elements, output)
   → 写出 ./flowchart-user-registration.{excalidraw,svg,png}
3. 用户拿 .svg 贴 Markdown 或 .png 贴 Notion / 飞书 / slides
4. "把判断节点 X 拆成 Y 和 Z"
   → AI 改 sugar 数组重 render,文件名不变 → diff 干净
```

---

## 目录结构

```
excalidrawer/
├── .claude-plugin/plugin.json
├── README.md                              # 本文件
├── references/                            # plugin 级共享
│   ├── conventions.md                     # clarify / 文件命名 / MCP fallback / 语言 / 路由
│   ├── sugar.md                           # sugar schema 速查(shape / arrow L1-L4 / 自动路由 / helper)
│   └── colors.md                          # palette
└── skills/
    ├── flowchart/
    │   ├── SKILL.md
    │   └── recipes/flowchart.md           # diagram-kind 模式(节点 / back-edge / decision)
    ├── timeline/
    │   ├── SKILL.md
    │   └── recipes/timeline.md            # 两种轴/圆点风格 / 文字三件套 / 配色循环
    ├── architecture/
    │   ├── SKILL.md
    │   └── recipes/architecture.md        # 单 lane / 多 lane / 列对齐 / 连线开关
    └── sequence/
        ├── SKILL.md
        └── recipes/sequence.md            # actor + 虚线生命线 / 方向区分 / 跨 lifeline label
```

---

## 设计要点

- **MCP-first**:`render_diagram`(sugar/raw → 文件)+ `compute_layout`(几何 helper)。CLI 是 MCP 不可用时的兜底。
- **Sugar 短写法**(`references/sugar.md`):agent 直接拼简短 JSON,raw Excalidraw 元素仍可穿透。不再手写完整 schema。
- **Recipe vs 模板**:diagram-kind 意见("API Gateway 自成一 tier"、"back-edge 用垂直边对")写在 `skills/<name>/recipes/*.md`,agent 在 clarify 之后读。早期版本把这些固化进引擎模板,新增变体得改引擎;现在新变体 = 新 recipe,引擎不动。
- **AskUserQuestion 是必经步骤**:动手画前先问 1-3 个 load-bearing 问题,降低"画着画着发现该改"的成本。
- **gstack 风格命名**:产物固定语义命名落 cwd(`./<type>-<name>.{ext}`),不用 `outputs/<timestamp>/`。下游工具按名读。

---

## 与 npm 包版本解耦

本 plugin 的 `version`(`plugin.json` 里)只跟 **plugin 内容变动**(SKILL.md / recipe 改写、布局参数调整)。底层 npm 包 `excalidrawer` 独立版本化,plugin 在 `mcpServers.args` 里用 `^` 范围 pin 它的**最低能力要求**,只有需要新能力时才 re-pin。

当前 pin:`excalidrawer@^0.5.7`(sugar mode + 自动正交路由 + arrow 风格选项 + MCP server)。

---

## 反馈

issue 提到 [harold-skills repo](https://github.com/guohaonan-shy/harold-skills/issues)。

底层 npm 包源码:https://github.com/guohaonan-shy/excalidrawer(独立仓库)

**Author**: Harold
