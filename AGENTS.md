# AGENTS.md

在这个仓库里工作的 agent 先读这份。`CLAUDE.md` 只有一行 `@AGENTS.md`。

## Repository Purpose

这个仓库是 Harold 的 Claude Code skills 集合，按 **Claude Code marketplace plugin** 规范维护。

- **顶层 = marketplace**（`.claude-plugin/marketplace.json`）
- **每个顶层目录 = marketplace 下的一个 plugin**
- **每个 plugin 下 `skills/` = 该 plugin 包含的多个 skill**
- plugin 之间相互独立、可单独安装分发

当前 plugins（每个做什么、有哪些 skill、怎么用、文件放哪，以各自的 `README.md` 为准，这里不复述）：
- `excalidrawer/` — code-first 的 Excalidraw 图表生成
- `content-creator/` — 短视频 / 社交 feed 内容创作
- `idea-loop/` — 从 idea 到工程落地的闭环：grill → spec → 设计 → 工单 → 实现 → review
- `interview-coach/` — AI 工程方向的面试陪练
- `happy-life/` — 个人生活小仪式

改了某个 plugin 的 skill、agent、hook、脚本或产物位置，同步改的是它自己的 `README.md`，不是这里。

### idea-loop 的约定与刻意例外

idea-loop 是从一个真实项目（Toeflair）里通用化出来的，也是这个仓库自己用的开发流程。在它上面工作时：

- **本仓库的 `docs/` 也按 idea-loop 管**：spec 状态只走 `idea-loop/scripts/spec-status.mjs`，issue 的 `status:*` label 只走 `idea-loop/scripts/issues.mjs`，不手改 frontmatter 的 `status` 和 label。
- **不硬编码 Toeflair**：写进插件的规则读目标仓库自己的 `CLAUDE.md` / AGENTS.md 与配置；Toeflair 只作为举例出现。
- 下面五处跟本仓库其它 plugin 的约定不同，都是决定，不是遗漏：
  1. **调用方式按出口定**：`uiux-imagine` / `uiux-refine` / `dreaming` / `setup` / `agent-builder` / `seo-setup` / `seo-scan` 设 `disable-model-invocation: true`（`seo-scan` 由 routine 以斜杠命令触发）——它们每个出口都停在人身上，不该在无关对话里被触发。其余可被模型调用，是为了让上游能调起下游（`grill` 收工调 `to-spec`、调度自己排的定时 job 调 `issue-dispatch`、调度出的会话卡片调 `issue-session`、一张工单一路做到已 review 的 PR）；解锁的是「谁能调」，不是各自的前置。`uiux-research` 同理可被模型调——普通对话里人说「查一下别人怎么做」就该起它——但**查不查由人定**：imagine / refine 的执行者（uiux-imaginer、designer）不调研，只写「建议调研的问题」；它们的编排者也只在人说要查时才调。`grill` 和 `writing-for-agents` 也可被模型调：普通对话里人说要拷问一个想法、要写一份给 agent 的文档，就该起它们；`agent-builder` 也靠它调到 `writing-for-agents`。
  2. **唯一在目标仓库 PR 上以 bot 身份发言**：只在合并时贴归档评论，从不以人的身份说话。
  3. **唯一带 `hooks/`、`.mcp.json` 与 `agents/`**：agent 的模型与思考强度钉在定义里。`.mcp.json` 里的 OpenSEO 是远程 MCP，装了 idea-loop 的项目都会多一个它的连接；没连上时只有 seo 分类受影响。
  4. **唯一带 `evals/`**：理由见下面 §5。
  5. **skill 按分类目录放、没有 plugin 级 `references/`**：`skills/{engineering,design,productivity,seo}/<slug>/`，每份参考资料归一个 skill；规则在 `idea-loop/AGENTS.md`。

## 标准 plugin 目录结构

```
<plugin-name>/
├── .claude-plugin/
│   └── plugin.json                 # name / version / description / author
├── README.md                        # plugin 介绍 + 安装 + skill 用法示例
├── references/                      # plugin 级共享内容（按需）
│   ├── conventions.md              #   跨 skill 行为约定（提问方式 / 覆盖策略 / 语言切换）
│   └── *.md                         #   其他共享参考（如 cli-usage / colors / palette）
├── evals/                           # 可选 —— 钉住的 baseline（只有 idea-loop 有，见 §5 的有意例外）
├── hooks/hooks.json                 # 可选 —— 事件钩子，如 idea-loop 的 design-lint（只有 idea-loop 有）
├── .mcp.json                        # 可选 —— plugin 自带的 MCP server，如 idea-loop 的 headless Playwright
├── agents/                          # 可选 —— plugin 自带的 subagent 定义（<plugin>:<name>），如 idea-loop 的 designer / implementer
└── skills/
    └── <skill-name>/
        ├── SKILL.md                 # 主体 < 5000 字
        ├── references/              # skill 自己的深度参考（按需，如 cases.md）
        └── scripts/                 # 可执行模板（按需，如 R/Python）
```

**`references/` 灵活布局**：
- 只 plugin 级（如 `excalidrawer/` —— 4 个 skill 共享同一组 references，每个 skill 自己没 references/ 子目录）
- 两级都有（plugin 级 conventions.md + 每个 skill 自己的 cases.md）
- 只 skill 级（如 `idea-loop/` —— 每份参考资料归一个 skill，见 `idea-loop/AGENTS.md`）
- 看内容是否需要 skill 特异性

要点：
- SKILL.md 主体保持精简（< 5000 字），把长篇领域知识、真实案例放 `skills/<name>/references/`
- 跨 skill 共享约定（提问方式、文件覆盖、语言切换、文件名约定等）写到 plugin 级 `references/conventions.md`，每个 SKILL.md 在 §0 必读约定 段引用
- skill 运行时产物分两类，按性质选位置：
  - **任务产物（per-project）** → 用户当前工作目录的固定语义文件名（gstack 风格，下游 skill 通过文件名 Read 衔接，**不用** `outputs/<timestamp>/` 子目录）
    - 文本：`./design-brief.md` / `./paper-results.md`
    - 二进制：`./flowchart-<name>.png` / `./timeline-<name>.svg`
    - 中间数据：可走 `/tmp/`（如 excalidrawer 的中间 JSON），不污染 cwd
  - **跨会话持久的用户数据（不绑定 cwd）** → `~/.<plugin-name>/`（如 `~/.idea-loop/github-apps.json`）
    - plugin 目录是只读的（marketplace 升级会换路径），所以 runtime-mutable 状态必须落用户主目录
    - 适用场景：用户画像 / 长期档案 / 跨会话的原始数据缓存——不属于"某个项目"的产物

## SKILL.md 编写约定（跨所有 plugin）

### 1. Frontmatter description 只做路由

description 常驻在每一轮的上下文里，只写触发它需要的东西。写法见 `idea-loop/skills/productivity/writing-for-agents/`（`SKILL-MECHANICS.md` 的「调用方式」）：
- 模型可调用：写它是什么，每个分支一个触发词（同义词合并），必要时加一句「X 的情况用 Y」。流程、产物格式、模型名不写。
- 只能由人调用（`disable-model-invocation: true`）：一行给人看的摘要。
- agent：写它的职业身份和交付，不写谁起它（调用方按名字起它）。

### 2. 必填没拿到不要猜不要默认

按 plugin 的 `references/conventions.md` 规定的"AskUserQuestion vs 自然语言模板"标准追问。规则要点：
- AQ 适用于：单一离散选择 / 2-4 个选项 / 短 label / 不需要复合信息
- 自然语言模板适用于：粘贴 / 复合信息 / 自由描述 / 文件路径 / 选项 > 4

一次最多 3 个问题；自然语言模板始终保留"自定义"逃逸通道。

### 3. 数据输入三种形态

文件路径 / 粘贴文本 / 项目内已有文件——三种都要支持。具体怎么处理（结构化数据要不要先看列名、图表要不要 clarify 节点结构、对话型要不要先 confirm 意图）按各 plugin 的 `conventions.md` 自己定，顶层不一刀切。

### 4. 输出语言

按用户场景定。具体规则在各 plugin 的 `conventions.md` 写一次：
- excalidrawer：跟随用户输入语言，不强制切换（图表里 label 短，混语言风险低）

### 5. Eval 策略

这些 skill 输出主观性强（研究方案、文本、图表风格、代码风格）—— **跳过 quantitative eval**，不做 baseline run 对比，vibe-based iteration 即可，所有 plugin 都一样。

**唯一的有意例外：`idea-loop` 的 `uiux-research`**（baseline 在 `idea-loop/evals/uiux-research/`）。
理由不是它更重要，是它的**产物形状还在跟人一起收敛**：它交出一页给人看的 HTML，这一页该包含什么、怎么写才对，现在没人能先写成断言。
所以那里不判好坏、不打分：钉一组取自真实设计会话的 default prompt 加一份最小的产品上下文，一条命令跑，每个 case 把页面留在固定位置、旁边放一个文件让人标注问题，
标注留档，逐步收敛出产物该包含什么。改了调研 agent、契约或 skill，就对着同一组问题再跑一遍给人看。
写这条例外是为了让下一个读到它的人知道这是决定，不是遗漏；等产物形状稳了，标注收敛出的东西该变成 `research-check` 的机械检查，这个例外就可以收掉。

### 6. allowed-tools 收窄到具体命令模式

避免每次新文件名都重新触发 permission prompt。例如：
- excalidrawer：`Bash(npx excalidrawer:*), Bash(ls:*), Read, Write(*.json), AskUserQuestion`——CLI 调用零 prompt，custom 脚本（`node *.mjs`）保留摩擦
- 收窄到具体模式（`Bash(<cmd>:*)`）比纯 `Bash` 更清晰，也起文档作用——告诉读者这个 skill 该跑什么

## 构建新 skill 的工作流

1. 写设计稿（用途、触发场景、必收集信息、工作流程、输出格式、领域要点）
2. 用 `skill-creator` skill 来构建 SKILL.md，跳过正式 eval / baseline 对比
3. 一次只构建一个 skill；先让用户审 SKILL.md 草稿，确认后再写下一个 —— **不要一次性吐多个**
4. 有依赖关系的 skill 按上游 → 下游顺序构建
5. 全部 skill 完成后再生成 plugin 的 `README.md`
6. plugin 级共享参考统一放 `<plugin>/references/`；如有原始对话 / 真实案例可蒸馏到 `skills/<name>/references/cases.md`，没案例可跳过该步（excalidrawer 模式）
