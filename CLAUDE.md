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
- skill 运行时产物写到**用户当前工作目录的固定语义文件名**（gstack 风格，下游 skill 通过文件名 Read 衔接，**不用** `outputs/<timestamp>/` 子目录）
  - 文本产物：`./design-brief.md` / `./paper-results.md`
  - 二进制产物：`./flowchart-<name>.png` / `./timeline-<name>.svg`
  - 中间数据：可走 `/tmp/`（如 excalidrawer 的中间 JSON），不污染 cwd

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
