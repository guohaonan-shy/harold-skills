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
- `memex/` — 多源个人记忆 wiki（anti-olden v2 重构）。动词导向 4 skill：`ingest`（读 config 选 connector → fetch raw → render sources，自动接 recap）/ `recap`（distill sources → 人/事 memory，kind-aware chat·meeting，triage 准入，connector 无关）/ `comm-memory`（口述 CRUD + lint 体检）/ `reply-coach`（消费者：3 候选 + 分支预判，混合取数，末尾 offer 回填）。connector 是**运行时加载的驱动**（`references/connectors/<name>.md`，固定四节契约 identity/fetch/render/send）不是 skill；只 lark 实现，wechat/slack stub。`references/` 装 conventions / memory-index / render-spec / connectors / olden-patterns / diff-format / prompts / templates。Memory 用 **obsidian 原生标记**（`#tag` 4 类闭合 [profile/event/behavior/strategy] + Dataview `(key:: val)` 自由字段 + `[[wikilink]]` + `^anchor` provenance），实体含 persons（跨 connector `identities` map 合并）/ groups（`connector`+`chat_id` 平台独立）/ events / topics + index.md 导航 + log.md 审计；**用户数据落 `~/.memex/`**（config.json / raw / sources / memory，不在 plugin 目录）。借 OpenHuman + Karpathy LLM Wiki 的数据模型概念但 agent-driven（无 daemon）。详见 `memex/README.md` 与 `memex/docs/refactor-v2-obsidian-wiki.md`。
- `content-creator/` — 短视频 / 社交 feed 内容创作工具集（当前 1 skill: thumbnail-gen，roadmap: title-writer / post-writer / tag-gen / video-script）。thumbnail-gen 走交互式 HTML/CSS composer，自带多平台 spec 预设（3:4 小红书/视频号封面 / 4:3 视频号分享卡片 / 9:16 Shorts / 16:9 YouTube）、人像照片 layout math（cover/contain/auto + 关键区域 y 百分比驱动 `background-position`）、多比例衍生流程（基于已有封面派生其他比例不重新设计）、Playwright headless 截图、bundled Smiley Sans (得意黑) 字体。Scripts 用 `uv run --script` inline metadata（playwright/rembg 按需自动装到 uv 缓存，不污染 plugin 目录）。中间产物落 `/tmp/thumbnail-gen/`，最终交付 PNG 落用户 cwd。详见 `content-creator/README.md`。

## 标准 plugin 目录结构

```
<plugin-name>/
├── .claude-plugin/
│   └── plugin.json                 # name / version / description / author
├── README.md                        # plugin 介绍 + 安装 + skill 用法示例
├── references/                      # plugin 级共享内容（按需）
│   ├── conventions.md              #   跨 skill 行为约定（提问方式 / 覆盖策略 / 语言切换）
│   └── *.md                         #   其他共享参考（如 cli-usage / colors / palette）
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
