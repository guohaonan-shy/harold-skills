# excalidrawer

Code-first Excalidraw 图表生成的 Claude Code plugin。4 个 skill 各自负责一种图类型——AI 通过 AskUserQuestion 先问关键问题、补全缺失上下文，再拼 JSON 调底层 `excalidrawer` npm CLI 输出 `.excalidraw` / `.svg` / `.png`。

**目标用户**：写文档 / 出 slides / 在飞书/Notion/GitHub 贴图的开发者、研究者、产品。**不是图表设计师**——SKILL 输出的是手绘风（Excalidraw 风格），适合工程文档而不是商业海报。

---

## 4 个 skill

| Skill | 用途 | 触发关键词 | 主要产物 |
|---|---|---|---|
| **flowchart** | 决策流 / 流程图 / 分支判断 | flowchart / 流程图 / 决策树 / yes-no / 判断分支 / 业务流转 / 审批流 | `./flowchart-<name>.{excalidraw,svg,png}` |
| **timeline** | 时间线 / 路线图 / 项目里程碑 | timeline / 时间线 / 路线图 / roadmap / milestone / 里程碑 / 阶段 / Q1Q2 | `./timeline-<name>.{excalidraw,svg,png}` |
| **architecture** | 系统架构 / 分层组件 / 模块拓扑 | architecture / 架构图 / 分层 / 三层架构 / 微服务 / 数据中台 | `./architecture-<name>.{excalidraw,svg,png}` |
| **sequence** | 时序图 / 多角色交互 / 调用链 | sequence diagram / 时序图 / 交互 / swimlane / 调用顺序 / handshake | `./sequence-<name>.{excalidraw,svg,png}` |

每个 skill 都开 `AskUserQuestion`——动手画之前先问 2-3 个 load-bearing 问题（场景 / 节点 / 分层 / actors），减少"画着画着发现该改"。

---

## 安装

本 plugin 通过 **harold-skills marketplace** 分发。在 Claude Code 中：

```text
/plugin marketplace add guohaonan-shy/harold-skills    # 加入 marketplace
/plugin install excalidrawer                           # 装这一个 plugin
/reload-plugins                                        # 让 4 个 skill 生效
```

底层 npm 包 `excalidrawer`（[npm registry](https://www.npmjs.com/package/excalidrawer)）通过 `npx` 自动拉取，不需要用户手动 `npm install`。

---

## 典型工作流

```text
1. cd ~/<your-project>/         # 在你想存图的目录下打开 Claude
2. claude  →  "帮我画一个用户注册流程图"
   → flowchart skill 触发
   → AskUserQuestion 问场景 / 判断点 / 方向
   → 拼 JSON → 调 npx excalidrawer generate
   → 写出 ./flowchart-user-registration.{excalidraw,svg,png}
3. 用户拿 .svg 贴到 Markdown，或 .png 贴 Notion
4. 想改细节 → "把判断节点 X 拆成 Y 和 Z"
   → AI 改 JSON 重跑同 seed，diff 干净
```

每个 skill 自动按 SKILL.md 的 frontmatter description 触发——直接用自然语言描述需求即可，无需手动 `/skill-name` 调用。当然显式 `/flowchart` / `/timeline` / `/architecture` / `/sequence` 也能直接命中。

---

## 不属于 4 类的图（fallback）

如果用户描述的图明显不属于 flowchart / timeline / architecture / sequence 任何一种（如组织树、心智图、自定义对比表），AI 会引导走 `references/custom-api.md` —— 用 npm 包提供的 elements API（`box` / `arrow` / `textEl` 等）写一个短脚本。

```bash
npm install excalidrawer    # 自定义脚本场景才需要装
```

模版工作流不需要 `npm install`——`npx` 自动处理。

---

## 跨 skill 共享约定

`references/` 目录下：

| 文件 | 内容 |
|---|---|
| `cli-usage.md` | CLI flags / 输出文件命名 / 覆盖策略 / `--seed` 推荐值 |
| `colors.md` | 7 色 palette + 配色建议 + 默认循环顺序 |
| `custom-api.md` | npm 库 API 速查 + 自定义脚本骨架 + 视觉设计规则 |

每个 SKILL.md 顶部 `§0 必读约定` 段指向这 3 个文件。

---

## 目录结构

```
excalidrawer/
├── .claude-plugin/plugin.json
├── README.md                              # 本文件
├── references/
│   ├── cli-usage.md
│   ├── colors.md
│   └── custom-api.md
└── skills/
    ├── flowchart/SKILL.md
    ├── timeline/SKILL.md
    ├── architecture/SKILL.md
    └── sequence/SKILL.md
```

---

## 设计要点（给后续维护者）

- **每个 SKILL.md ~150 行**：聚焦单一图类型，触发关键词中英都列，避免被 description 字段稀释
- **AskUserQuestion clarify 是核心步骤**：动手画之前必须问 2-3 个 load-bearing 问题（场景 / 结构 / 方向 / 异常路径），否则画错了重做成本大
- **gstack 风格语义文件名**：所有产物固定语义命名写到 cwd（`./<type>-<name>.{ext}`），不用 `outputs/<timestamp>/` 子目录
- **底层 CLI 解耦**：plugin 不嵌入 npm 包源码，通过 `npx excalidrawer` 调线上 registry。npm 包独立维护、独立发版
- **--seed 分段固定**：flowchart=100000 / timeline=200000 / architecture=300000 / sequence=400000，避免不同图 element ID 撞车

---

## 反馈

issue 提到 [harold-skills repo](https://github.com/guohaonan-shy/harold-skills/issues)。

底层 npm 包源码: https://github.com/guohaonan-shy/excalidrawer (独立仓库)

**Author**: Harold
**Version**: 0.5.2
