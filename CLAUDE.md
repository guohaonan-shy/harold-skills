# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

这个仓库是 Harold 的 Claude Code skills 集合，按 **Claude Code marketplace plugin** 规范维护。

- **顶层 = marketplace**（`.claude-plugin/marketplace.json`）
- **每个顶层目录 = marketplace 下的一个 plugin**
- **每个 plugin 下 `skills/` = 该 plugin 包含的多个 skill**
- plugin 之间相互独立、可单独安装分发

当前 plugins:
- `clinical-research/` — 临床医学回顾性队列研究工作流（study-design / variable-coding / stat-analysis / paper-draft）。4 skill 完成，含 plugin 级 `references/conventions.md` 和每个 skill 的 `references/cases.md`（共 15 个真实研究案例）。详见 `clinical-research/README.md`。
- `excalidrawer/` — Code-first Excalidraw 图表生成（flowchart / timeline / architecture / sequence）。4 skill 完成，plugin 级 `references/` 装 cli-usage / colors / custom-api fallback；底层调 npm 包 `excalidrawer` CLI。详见 `excalidrawer/README.md`。
- `memex/` — 多源个人记忆 wiki（anti-olden v2 重构）。动词导向 **5 skill（写 3 读 2）**：写入侧 `ingest`（读 config 选 connector → fetch raw → render sources，含图片 caption，自动接 recap）/ `recap`（distill sources → 人/事 memory，kind-aware chat·meeting，triage 准入 + 防瞎猜三铁律）/ `comm-memory`（口述 CRUD + lint 体检）；读取侧 `recall`（**模糊 query → 相关上下文 + 作答的唯一前门**，引擎用 Claude Code 自带 grep/Read、无 embedding）/ `reply-coach`（recall 的回复型消费：3 候选 + 分支预判）。connector 是**运行时加载的驱动**（`references/connectors/<name>.md`，固定四节契约 identity/fetch/render/send）不是 skill；只 lark 实现，wechat/slack stub。`references/` 装 conventions / memory-index / render-spec / connectors / olden-patterns / diff-format / prompts / templates。Memory 用 **obsidian 原生标记**（`#tag` 4 类闭合 [profile/event/behavior/strategy] + Dataview `(key:: val)` 自由字段 + `[[wikilink]]` + `^anchor` provenance），实体含 persons（跨 connector `identities` map 合并）/ groups（`connector`+`chat_id` 平台独立）/ topics（话题/项目线/重大事件 hub；**无独立 events 类型**，一次性事件行内 `#event`、时序流落 log.md 按日 digest）+ index.md 导航 + log.md 事件 digest；**用户数据落 `~/.memex/`**（config.json / raw / sources / memory，不在 plugin 目录）。借 OpenHuman + Karpathy LLM Wiki 的数据模型概念但 agent-driven（无 daemon）。详见 `memex/README.md` 与 `memex/docs/refactor-v2-obsidian-wiki.md`。
- `content-creator/` — 短视频 / 社交 feed 内容创作工具集（当前 1 skill: thumbnail-gen，roadmap: title-writer / post-writer / tag-gen / video-script）。thumbnail-gen 走交互式 HTML/CSS composer，自带多平台 spec 预设（3:4 小红书/视频号封面 / 4:3 视频号分享卡片 / 9:16 Shorts / 16:9 YouTube）、人像照片 layout math（cover/contain/auto + 关键区域 y 百分比驱动 `background-position`）、多比例衍生流程（基于已有封面派生其他比例不重新设计）、Playwright headless 截图、bundled Smiley Sans (得意黑) 字体。Scripts 用 `uv run --script` inline metadata（playwright/rembg 按需自动装到 uv 缓存，不污染 plugin 目录）。中间产物落 `/tmp/thumbnail-gen/`，最终交付 PNG 落用户 cwd。详见 `content-creator/README.md`。
- `idea-loop/` — 从 idea 到工程落地的闭环，从一个真实项目（Toeflair）里通用化出来。**9 个 skill**：`grill`（设计树访谈，frontier round）/ `prototype`（一次只回答一个问题的丢弃式原型，`grill` 会在会话内调它）/ `to-spec`（转录 + spec；碰 UI 的 spec 落 `等设计冻结`）/ `uiux-imagine`（设计发散：只打开还没定的那一档高度，最低可分辨保真度出变种，只接方向性 note、不打分、不提保真度，准出一份七节方向说明写回 spec，形状由 `scripts/direction-note-check.mjs` 校验）/ `uiux-refine`（设计收敛：只从方向说明重建画布，评委与执行者双模型打磨环，评委的分数由 `scripts/critic-score.mjs` 对着它自己的 finding 复算，静态构图冻结后按需接动效段与素材段，再各跑一轮减法与 AI tells，人签字后冻结进 raw 桶、spec 翻 `在飞`）/ `to-ticket`（tracer-bullet 拆卡，守设计冻结闸门）/ `implement`（一卡一 commit，TDD；UI 卡多跑一道测量/像素比对，让「像不像」变成会红的测试）/ `pr-review`（开或复用 PR 后自动跑至多两轮：Codex `gpt-6-sol` 并行审 Correctness / Standards / Spec，Claude Sonnet 5 逐条复现、去重，并在 merge-base 上重跑判定是否本次引入——本次引入的带回归测试修掉，存量的进目标仓库 `docs/quality-backlog.md`，另一个 agent 按原验证手段做先红后绿的复验；每轮在 PR 上发一个轮次帖，finding 字段由 helper 机械校验；到 mergeReady 停下等人下令合并）/ `dreaming`（知识库对账）。前向环是 `grill → to-spec → [uiux-imagine → uiux-refine] → to-ticket → implement → pr-review`，**方括号那两段只在 spec 落成 `等设计冻结` 时才走**——没碰 UI 的 spec 从 `to-spec` 直接进 `to-ticket`。**设计侧整个住在这个 plugin 里，没有第二个 plugin**：taste/craft references 全在 `references/design/`（core 法则、DESIGN.md 八节格式、surface / module / component 三档 altitude protocol，加上静态 UI 与动效两份 protocol），全部按需加载、没有一个是入口；确定性 design-lint hook 与其脚本、单测落 `hooks/` 与 `scripts/`；浏览器（headless Playwright MCP）落 `.mcp.json`。**跟本仓库其它 plugin 的约定不同的四处，都是刻意的**：① 不走「pushy description 抵御 undertrigger」那套——`grill` / `uiux-imagine` / `uiux-refine` / `dreaming` 四个的 frontmatter 是 `disable-model-invocation: true`：`grill` 是人做决策的访谈、`dreaming` 提议销毁性处置、`uiux-imagine` 每一轮都要人给方向性反应并由人宣布方向定了、`uiux-refine` 的每一个出口——方向级 finding、plateau、签字——都停在人身上，它们都不该在无关对话里被动触发；其余五个模型可调，`prototype` 尤其要能被 `grill` 在访谈中途调起，`implement` / `pr-review` 解锁给调用方是为了让一张 ticket 能被派出去做到一个已 review 的 PR——解锁的是「谁能调」，不是它们各自的前置（`implement` 仍然要一个只装着那张 ticket 的全新上下文）；② 第一个带 `workflows/`（Workflow 工具的 `.mjs` 脚本，不是 `skills/`）的 plugin，标准目录结构里已经标成可选项；③ 唯一带 `hooks/` 与 `.mcp.json` 的 plugin；④ 唯一带 `evals/` 的 plugin——`prototype` / `uiux-imagine` / `uiux-refine` 钉了一个真实 case 当 baseline，整条环的接通检查写成它的断言项，理由见下面 §5。三轴 review 的 Standards 轴读**目标仓库自己**的 `CLAUDE.md` 和 lint/typecheck 配置，不硬编码 Toeflair 那套。详见 `idea-loop/README.md`。
- `interview-coach/` — AI Engineer / AI Agent Engineer / Harness 方向的面试陪练，从一场真实面试教练录音里蒸馏出四类问题框架和领域知识点清单。**2 个 skill**：`mock-interview`（AI 扮演面试官，基于简历 + 目标方向进行模拟面试，面试官对项目背景"零了解"的人设完全靠提问本身体现而不显式声明，全程只提问不给反馈）/ `interview-review`（消费一场面试转录——mock-interview 产物或用户贴的真实录音转写，能处理带时间戳/多说话人/教练实时点评的原始转写——逐题四维点评内容结构/表达/hook/技术准确性，并把暴露出的知识漏洞按知识点归类系统讲透，讲解是独立章节、和逐题点评平级）。两个 skill 职责严格分离：mock-interview 只提问不点评，interview-review 只点评不提问。plugin 级 `references/question-taxonomy.md` 装四类问题框架 + 领域知识点清单，两个 skill 共享。详见 `interview-coach/README.md`。

## 标准 plugin 目录结构

```
<plugin-name>/
├── .claude-plugin/
│   └── plugin.json                 # name / version / description / author
├── README.md                        # plugin 介绍 + 安装 + skill 用法示例
├── references/                      # plugin 级共享内容（按需）
│   ├── conventions.md              #   跨 skill 行为约定（提问方式 / 覆盖策略 / 语言切换）
│   └── *.md                         #   其他共享参考（如 cli-usage / colors / palette）
├── workflows/                       # 可选 —— Workflow 工具脚本（.mjs），如 idea-loop 的 PR review 闭环
├── evals/                           # 可选 —— 钉住的 baseline eval（只有 idea-loop 有，见 §5 的有意例外）
├── hooks/hooks.json                 # 可选 —— 事件钩子，如 idea-loop 的 design-lint（只有 idea-loop 有）
├── .mcp.json                        # 可选 —— plugin 自带的 MCP server，如 idea-loop 的 headless Playwright
└── skills/
    └── <skill-name>/
        ├── SKILL.md                 # 主体 < 5000 字
        ├── references/              # skill 自己的深度参考（按需，如 cases.md）
        └── scripts/                 # 可执行模板（按需，如 R/Python）
```

**`references/` 灵活布局**：
- 只 plugin 级（如 `excalidrawer/` —— 4 个 skill 共享同一组 references，每个 skill 自己没 references/ 子目录）
- 两级都有（如 `clinical-research/` —— plugin 级 conventions.md + 每个 skill 自己的 cases.md）
- 看内容是否需要 skill 特异性

要点：
- SKILL.md 主体保持精简（< 5000 字），把长篇领域知识、真实案例放 `skills/<name>/references/`
- 跨 skill 共享约定（提问方式、文件覆盖、语言切换、文件名约定等）写到 plugin 级 `references/conventions.md`，每个 SKILL.md 在 §0 必读约定 段引用
- skill 运行时产物分两类，按性质选位置：
  - **任务产物（per-project）** → 用户当前工作目录的固定语义文件名（gstack 风格，下游 skill 通过文件名 Read 衔接，**不用** `outputs/<timestamp>/` 子目录）
    - 文本：`./design-brief.md` / `./paper-results.md`
    - 二进制：`./flowchart-<name>.png` / `./timeline-<name>.svg`
    - 中间数据：可走 `/tmp/`（如 excalidrawer 的中间 JSON），不污染 cwd
  - **跨会话持久的用户数据（不绑定 cwd）** → `~/.<plugin-name>/`（如 `~/.memex/{config.json,raw,sources,memory}/`）
    - plugin 目录是只读的（marketplace 升级会换路径），所以 runtime-mutable 状态必须落用户主目录
    - 适用场景：用户画像 / 长期档案 / 跨会话的原始数据缓存——不属于"某个项目"的产物

## SKILL.md 编写约定（跨所有 plugin）

### 1. Frontmatter description 要 "pushy"

显式列出触发关键词（中英文都列、覆盖多个目标领域），抵御 undertrigger。例如：
- clinical-research 不要只写"用于变量编码"，要写"任何提到变量标准化、编码规则、ISGPS、Clavien-Dindo、NYHA、KDIGO、APACHE 等场景"
- excalidrawer 不要只写"画时间线"，要写"任何提到 timeline / 时间线 / 路线图 / roadmap / milestone / 里程碑 / 项目阶段 / Q1Q2Q3Q4 / 时间节点 / chronology 的场景"

### 2. 必填没拿到不要猜不要默认

按 plugin 的 `references/conventions.md` 规定的"AskUserQuestion vs 自然语言模板"标准追问。规则要点：
- AQ 适用于：单一离散选择 / 2-4 个选项 / 短 label / 不需要复合信息
- 自然语言模板适用于：粘贴 / 复合信息 / 自由描述 / 文件路径 / 选项 > 4

一次最多 3 个问题；自然语言模板始终保留"自定义"逃逸通道。

### 3. 数据输入三种形态

文件路径 / 粘贴文本 / 项目内已有文件——三种都要支持。具体怎么处理（结构化数据要不要先看列名、图表要不要 clarify 节点结构、对话型要不要先 confirm 意图）按各 plugin 的 `conventions.md` 自己定，顶层不一刀切。

### 4. 输出语言

按用户场景定。具体规则在各 plugin 的 `conventions.md` 写一次：
- clinical-research：默认中文 / SCI 切英文 / 不混用
- excalidrawer：跟随用户输入语言，不强制切换（图表里 label 短，混语言风险低）

### 5. Eval 策略

这些 skill 输出主观性强（研究方案、文本、图表风格、代码风格）—— **跳过 quantitative eval**，不做 baseline run 对比，vibe-based iteration 即可。

**唯一的有意例外：`idea-loop` 的 `prototype` / `uiux-imagine` / `uiux-refine`**（baseline 在 `idea-loop/evals/`）。
例外的理由不是"它们更重要"，是**迭代形状不同**：这三个的 rubric 分数带、评委 prompt、种子指令、方向说明的七节
注定要反复改；改一条 rubric 的措辞，影响落在"下一次收敛环第几轮停"上，当场看不出来；而它们的输出是**下游 skill 的输入**
（方向说明喂 `uiux-refine`，冻结摘要喂 `to-ticket`），形状错了要到两步之后才炸。所以那里钉了一个真实 case
（Toeflair 的练习记录页，自带最小 `DESIGN.md` 与 `PRODUCT.md`），跑一次存档，**此后每次改 rubric、prompt 或 SKILL.md 都对着它重跑**。
断言只判形状（环还接着吗、契约还守着吗），不判好不好看——好不好看仍然是人对着产物看。
**不为评语和方向说明的质量另建 promptfoo 套件**，质量走这个 baseline。
写这条例外是为了让下一个读到它的人知道这是决定，不是遗漏。

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
6. plugin 级共享参考统一放 `<plugin>/references/`；如有原始对话 / 真实案例可蒸馏到 `skills/<name>/references/cases.md`（clinical-research 模式），没案例可跳过该步（excalidrawer 模式）
