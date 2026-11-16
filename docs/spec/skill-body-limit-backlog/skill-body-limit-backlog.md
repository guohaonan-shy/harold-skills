---
type: spec
tags: [skill-writing, skill-body-limit-backlog]
summary: 4 份超 5000 字的 SKILL.md 把部分运行才走到的分支挪进 references，压回线内
issues: [137]
related: ["[[2026-11-16-issue-137-scope]]"]
---

# 4 份 SKILL.md 主体压回 5000 字

> #137 存在：对着 origin/main `a032e45`（2026-11-16）按 `AGENTS.md` 的量法重量，4 份 SKILL.md 主体仍超 5000 字，详情在「问题陈述」

## 问题陈述

### 4 份 SKILL.md 主体超过 5000 字

`AGENTS.md`「标准 plugin 目录结构」和 `REVIEW.md`「额外要求」都写着 SKILL.md 主体 < 5000 字。对着 origin/main `a032e45`（2026-11-16）量（去掉 frontmatter，`LC_ALL=en_US.UTF-8 wc -m`），超线的：

| 文件 | 插件 | 主体字数 | 超出 |
|---|---|---|---|
| `skills/thumbnail-gen/SKILL.md` | content-creator | 15224 | 10224 |
| `skills/daily-coffee-oracle/SKILL.md` | happy-life | 13064 | 8064 |
| `skills/design/design-modeling/SKILL.md` | idea-loop | 5485 | 485 |
| `skills/engineering/pr-review/SKILL.md` | idea-loop | 5108 | 108 |

`idea-loop/skills/productivity/wiki-conventions/SKILL.md`（7854）也超，归 #302。

超线的代价是每次调用都把只有部分运行才走到的内容一起读进上下文，把每次都走的步骤淹没（`writing-for-agents`「信息层级」）。例：thumbnail-gen 的「CSS Art Text Effects」六种字效、「Font Setup」一次性装字体的步骤，在只换一个比例的运行里也都读一遍；daily-coffee-oracle 每次推荐都读七种咖啡的 ASCII 卡片模板，但一次只画一张。

### 字数测试守的不是 5000

- `idea-loop/scripts/pr-review-slim-doc.test.mjs` 的上限是 5108（#303 为了恢复被压掉的原句，把「< 5000」改成了「不比 5108 长」，注释写明「压回 5000 是 #137 的」）。
- `idea-loop/scripts/implement-replay-large-doc.test.mjs` 还有一条「implement 不比 9589 字长」。implement 已由 #311 压到 4874，并由 `implement-slim-doc.test.mjs` 守 < 5000，这一条已经没有约束力（#137 第三条评论）。

## 方案

改完：4 份 SKILL.md 主体都在 5000 字以内；调用方读到的每次都走的步骤和改前一样，只有部分运行才走到的内容挪到 `references/` 下，主文件在原处留一行指针，写明什么情况下去读。

做法对的杠杆是 `writing-for-agents` 的「信息层级」：每个分支都要的内联，只有部分分支走到的放到指针后面。**挪，不删**：内容原样搬进参考文件，不靠删句子凑字数（#304 第 1 轮 S2 就是删句子凑字数被打回的）。被调用方按小节名点到的小节（如 design-modeling 的「一次写入怎么走」、pr-review 的「设计变更」）保留标题，正文换成指针，调用方不用改。

### 杠杆诊断与每份的挪法

**pr-review**（调用方：`implement` 全部落地后、`issue-session`、人调 `/idea-loop:pr-review`；每轮都读「前提」「跑一轮」「处理条目」「回工单」「一轮之后往哪走」）

- 「设计变更」（299 字）只在人接受了跟冻结画布不同的设计时走到。挪进 `references/design-change.md`，主文件这一节留一句：人接受了跟冻结画布不同的设计时，读它。照 implement 的先例（`implement` 的「设计变更」也是指针，`design-change-final-version-doc.test.mjs` 把参考文件拼进来测）。预计主体约 4880。

**design-modeling**（调用方：design-steward、dreaming 的对账与蒸馏、uiux-imagine 的新建、uiux-refine 与 ui-reviewer 写候选；判断「该不该进」的都读「是什么」「五条写法规则」「准入分层表」「明确不进」「设计法候选的形态」）

- 「一次写入怎么走」（753 字）只有真的写 `DESIGN.md` 的运行走到（imagine 新建、dreaming），写候选、判准入的不走。挪进 `references/write.md`，这一节留指针，标题不变（dreaming、design-steward、uiux-imagine 按这个小节名点它）。预计主体约 4800。

**thumbnail-gen**（人调；每次都走 §2 的六步工作流和 §12 出图检查）

- 主文件留：§0 约定（含产物放哪）、§1 何时用、§2 工作流六步、§12 检查清单。
- 挪进 `references/`，在用到它的那一步写指针：照片处理 §3 与布局数学 §4（第 5 步，只在用照片时）、多比例派生 §5（第 2 步，只在已有封面要换比例时）、HTML 模板 §6 与字效 §7 与版式原型 §8 与通用设计规则 §9（第 3、6 步写 HTML 时）、字体安装 §10 与脚本 §11（一次性安装、第 3、6 步跑脚本时）。
- 按调用方要的东西切成几份参考文件，具体几份由执行方按上面的分支定；主体压到 5000 以内。

**daily-coffee-oracle**（模型按 description 调；每次都走 Core Behavior、Recommendation Logic、Output Shape、Safety、Quality Bar）

- 挪进 `references/`：Profile 模板与 Ambient Coffee Memory 的格式（只在建档或更新档案时）、七种咖啡的 ASCII 卡片（每次只画一张，主文件留怎么选、去哪读）、Paid-Value Formats（只在人要付费格式时）、Feedback Handling 里写档案的细节（只在人反馈时）。
- 具体切几份由执行方定；主体压到 5000 以内。

### 其他入口

- wiki-conventions：排除，归 #302。
- 别的 SKILL.md：排除。现在都在线内；所有 SKILL.md 都量、只要求不再变长的棘轮归 #341。

## User Stories

只修问题、不加能力：

1. 期望行为（4 份超线）：4 份 SKILL.md 主体都 < 5000 字；挪走的内容在 `references/` 下原样可读，主文件在原处有指针写明什么情况下读；调用方按小节名点到的小节都还在。
2. 期望行为（字数测试）：pr-review 的字数测试守 5000；implement 的 9589 旧棘轮删掉。

## 实现决策

- **挪，不删，不改写**：内容原样搬，只改指针那一句和搬过去后需要的标题层级。要顺手改写的，开 issue（归 #340）。
- **指针的写法**：一句话，以触发条件开头（「人接受了跟冻结画布不同的设计时，读 …」），照 `writing-for-agents`「上下文指针」。
- **被点名的小节保留标题**：pr-review 的「设计变更」、design-modeling 的「一次写入怎么走」。依据：dreaming、design-steward、uiux-imagine、design-change-sync 等按小节名点它们（2026-11-16 在 main 上 grep 过）。
- **参考文件放哪**：每个 skill 自己的 `references/`。content-creator、happy-life 都没有插件级 `references/`，这几份内容也只归一个 skill（`AGENTS.md`「`references/` 灵活布局」）。
- **版本**：三个插件各升 patch：content-creator `0.0.1 → 0.0.2`、happy-life `0.0.1 → 0.0.2`、idea-loop 当前版本 +0.0.1。依据：`REVIEW.md`「额外要求」，内容只换位置、行为不变是 patch。
- **README**：content-creator、happy-life、idea-loop 的 `README.md` 有写 skill 文件布局的，同步加上新的 `references/`（`REVIEW.md`「额外要求」第一条）。
- **content-creator、happy-life 不加字数测试**：这两个插件没有测试目录；全仓库的字数守护归 #341，这里不先做一份逐个插件的。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改的是 4 份 skill 文本，但只挪位置不改内容；仓库约定 skill 不做 quantitative eval（`AGENTS.md` §5），不加 eval。确定性的部分（字数、指针、小节还在）走下面的文档测试 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：idea-loop 现有的文档测试（读 SKILL.md 和参考文件的文本、断言结构）。能抓到：字数超线、指针丢了、被点名的小节没了、内容在主文件和参考里各留一份；漏掉：挪完后 agent 是不是真在该读的时候去读参考。content-creator、happy-life 没有测试，用 `AGENTS.md` 的量法命令当验收。
- **增量功能测试**：
  - `pr-review-slim-doc.test.mjs`：上限改回 5000，测试名和注释去掉「棘轮」；「设计变更」那条改成主文件这一节有指向 `references/design-change.md` 的指针，参考文件里有 `idea-loop:design-change-sync` 和「PR 分支」。先在改前的文本上看到 5000 那条红。覆盖：期望行为 1、2。
  - `design-change-final-version-doc.test.mjs`：pr-review 跟 implement 一样，把参考文件拼进「设计变更」再测。覆盖：期望行为 1。
  - `implement-replay-large-doc.test.mjs`：删掉「不比 9589 长」那一条。覆盖：期望行为 2。
  - design-modeling：新加一条文档测试，主体 < 5000，「一次写入怎么走」这一节在且指向 `references/write.md`，参考文件里有备份、lint、diff 三步。覆盖：期望行为 1。
  - thumbnail-gen、daily-coffee-oracle：PR 描述里贴两份改前改后的量法输出，都 < 5000；`references/` 下的每份文件在主文件里都有指针（`grep` 每个文件名）。覆盖：期望行为 1。
- **照着谁写**：`implement-slim-doc.test.mjs`（字数和指针）、`design-change-final-version-doc.test.mjs` 里 implement 拼参考文件的写法。

## Out of scope

- 按写法规则重写这几份的内容（开头写目标、完成条件、删决策历史、否定句）：#340。
- 脚本收成命令行工具：#339。
- 全仓库的字数棘轮、review 报字数增量、spec 的杠杆诊断检查：#341。

## 关联

- raw：[[2026-11-16-issue-137-scope]]
- #302（wiki-conventions 压字数）：同类，不碰同一份文件，谁先合都行。
- #339、#340、#341：从 #137 拆出，随 idea-loop 0.2.0 发布（父 issue #331）。#340 会重写这里动过的 pr-review、design-modeling；本 spec 先合，#340 在挪好的结构上改。
- 开着、也改 pr-review 的：#271（去掉两轮上限，改「一轮之后往哪走」）、#276、#280。本 spec 只动「设计变更」一节，不跟它们改同一节；谁先合，后合的 rebase。
