---
type: spec
status: 实现中
tags: [idea-loop, uiux-imagine, uiux-refine]
summary: imagine / refine 的设计过程目录改按当前 worktree 根定位，不再用 CLAUDE_PROJECT_DIR
related: ["[[uiux-imagine-agent]]", "[[design-research-agent]]"]
issues: [77]
---

# uiux-imagine / uiux-refine 的设计过程目录按当前 worktree 根定位

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #77 uiux-imagine / uiux-refine 在 worktree 会话里把设计产出写进主 checkout | 存在 | 2026-10-27 在 worktree 会话里复现：skill 文本里的 `${CLAUDE_PROJECT_DIR}` 加载时被替换成主 checkout 的路径，不是当前 worktree；同一会话的 Bash 里这个变量为空。详情在「问题」 |

## 问题

### 1. 设计过程产物落进主 checkout，或落到磁盘根目录

`uiux-imagine` 说 `imagine/`、`canvas/`、`research/` 都在 `${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/` 下，收工前的方向说明校验命令也用这个前缀拼路径；`uiux-refine` 同样有三处（目录约定、方向说明校验、评分命令）。两份 skill 一共五处（后来实现时发现是六处：imagine 开工前把 issue 翻成「设计中」的命令也用这个变量拼 `docs/` 路径，见 review 第 1 轮），仓库里别的 skill、agent、hook、脚本都没有用到这个变量（2026-10-27 对 `origin/main 8491043` 用 `git grep` 核过）。

本次复现（2026-10-27，本仓库的 worktree 会话 `gracious-fermat-d727e8`）：

- 用 Skill 工具调一个 idea-loop skill、参数里写字面的 `${CLAUDE_PROJECT_DIR}`，加载后它变成了 `/Users/guohaonan/projects/harold-skills`，即主 checkout；当前 worktree 根是 `…/TOEFLAIR-worktree/harold-skills/gracious-fermat-d727e8`。所以 imagine 读到的目录是主 checkout 下的 `docs/design/tmp/<spec-slug>/`。
- 同一会话的 Bash 里 `CLAUDE_PROJECT_DIR` 是空的。skill 文本要是没被替换、命令原样交给 shell，方向说明校验会去读 `/docs/design/tmp/<spec-slug>/imagine/direction-note.md`，一个不存在的根目录路径。

两种情形都不是当前 worktree。issue 里的实例（2026-10-22，TOEFLAIR #407）就是第一种：imagine 第一轮约 37MB、161 个文件写进主 checkout，之后调研子代理按 `git rev-parse --show-toplevel` 写进了 worktree，同一份设计的产出拆成两半。主 checkout 里的那份在 worktree 归档后成了孤儿；`rounds.md` 是 imagine 中断后接着做的依据，它不在 worktree 里，恢复时找不到。

复现材料：`.tmp/to-spec/design-tmp-worktree-root/repro/env.txt`（本地，不提交）

### 根因

`CLAUDE_PROJECT_DIR` 是会话的项目目录。worktree 会话的项目目录是主 checkout，所以 skill 文本里的这个变量被替换成主 checkout；Bash 环境里它则没有设置。两份 skill 用它当「当前工作区根」，而它两种情况下都不是。

修正：issue 的「相关」一节说合并前钩子（`merge-gate-hook`）只看本地有没有 `docs/design/tmp/`、会拦下无关 PR。这个钩子已在 `a4e3662`（「删合并前钩子，合并前归档从最终画布加实现整份写出 delta」）整个删掉，仓库里有测试断言它不再存在，这一节的问题已不存在，本 spec 不处理。

## 方案

在 worktree 会话里跑 imagine 或 refine，设计过程产物（变种板、生图素材、`rounds.md`、方向说明、画布各版本、评分记录）全部写进这个 worktree 自己的 `docs/design/tmp/<spec-slug>/`，跟调研子代理写的 `research/` 在同一处；主 checkout 里不出现任何文件。worktree 归档时，这份目录随它一起清掉；中断后再调 imagine 能在同一处找到 `rounds.md` 接着做。

目录由「当前 worktree 根」决定，取 `git rev-parse --show-toplevel`，跟 `uiux-research` 定落图目录的写法一致。交给子代理（uiux-imaginer、designer）和校验脚本的路径都写成以它为前缀的绝对路径。

同类入口：

| 入口 | 纳入 / 排除 |
|---|---|
| `uiux-imagine` 的目录约定、方向说明校验命令、开工前把 issue 翻成「设计中」的命令 | 纳入 |
| `uiux-refine` 的目录约定、方向说明校验命令、评分命令 | 纳入 |
| `uiux-research` 的落图目录 | 已经按 `git rev-parse --show-toplevel` 定，不改 |
| refine 的冻结、`design-change-sync`、`ui-reviewer`、`implementer` 里相对写的 `docs/design/tmp/<spec-slug>/` | 排除：它们在 worktree 根下按相对路径用，或由编排者给绝对路径，不经过 `CLAUDE_PROJECT_DIR`，没有这个问题 |
| idea-loop 的 hook 与脚本 | 排除：没有一处读 `CLAUDE_PROJECT_DIR`；`seo-check-hook`、`design-archive-mcp` 已经按 `git rev-parse --show-toplevel` 取根 |

## User Stories

只修问题，每个问题一行期望行为：

1. 在 worktree 会话里跑 `uiux-imagine` / `uiux-refine`，它们写的、读的、交给子代理和校验脚本的设计过程目录都是这个 worktree 根下的 `docs/design/tmp/<spec-slug>/`；主 checkout 里不出现这份目录，命令里不出现空前缀拼出的 `/docs/...`。

## 实现决策

1. **「当前 worktree 根」怎么取**：`git rev-parse --show-toplevel`。依据：产品已有统一做法，`uiux-research` 的「定落图目录」写「项目根 = `git rev-parse --show-toplevel`」，`wiki-conventions` 的「中间产物」写「`<worktree 根>` 取 `git rev-parse --show-toplevel`」。两份 skill 沿用「worktree 根」这个叫法，在目录约定那一句定义一次，后面的命令用它当前缀。
2. **不在 skill 里再用 `CLAUDE_PROJECT_DIR` 拼 `docs/` 下的路径**：它在 worktree 会话里指主 checkout、在 Bash 里为空，两种都错（「问题」1）。依据：本次复现。
3. **范围只到这六处**：其余入口逐个看过，不经过这个变量（见「方案」的表）。依据：自己定的四条之「默认改动最小」。
4. **issue 的「相关」一节不做**：钩子已删（见「根因」的修正）。

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：skill 文本的约束，用文本绊线测试钉住 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：路径前缀是确定的文本约束，不需要 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：插件里 skill 与 agent 的 Markdown 文本，用 `node:test` 读文件断言。能抓到：有人再用 `CLAUDE_PROJECT_DIR` 拼路径、或 imagine / refine 丢了「worktree 根取 `git rev-parse --show-toplevel`」这句。漏掉：执行方实际跑命令时是否照做，这只能在真实的 worktree 会话里看。
- **增量功能测试**：
  - 前置：idea-loop 插件目录。步骤：扫 `skills/` 与 `agents/` 下全部 Markdown。期望：没有一处出现 `CLAUDE_PROJECT_DIR`；`uiux-imagine`、`uiux-refine` 的 SKILL.md 都写明设计过程目录在 worktree 根（`git rev-parse --show-toplevel`）下的 `docs/design/tmp/<spec-slug>/`。覆盖：期望行为 1。改之前这条测试是红的（六处命中）。
  - 人验（不自动）：下一次在 worktree 会话里跑 imagine，看主 checkout 的 `docs/design/tmp/` 下没有新目录。
- **prompt / eval 变动**：两份 SKILL.md 的路径前缀改写，无 eval 变动。
- **照着谁写**：`idea-loop/scripts/dreaming-incremental-doc.test.mjs`（读 skill 文本断言步骤在场）；`seo-check.test.mjs` 里断言 `merge-gate-hook` 不再存在的那段（断言某个东西不出现）。

## Out of scope

- issue「相关」一节的合并前钩子：已删，问题不存在。
- `uiux-research` 的落图目录：已按 worktree 根定。
- 设计侧其他相对路径写法（冻结、设计变更同步、UI 审查、实现者）：不经过 `CLAUDE_PROJECT_DIR`，没有这个问题。
- 清理别的仓库主 checkout 里已经留下的孤儿目录：是一次性的本地清理，不进插件；TOEFLAIR 那份 2026-10-27 已经不在了。

## 关联

- 覆盖的 issue：#77 uiux-imagine / uiux-refine 在 worktree 会话里把设计产出写进主 checkout
- 相关 spec：[[uiux-imagine-agent]]（实现中，imagine 交给 uiux-imaginer 的那一版；没有工单在做，不改这六处，无重叠）、[[design-research-agent]]（实现中，`uiux-research` 已按 worktree 根定落图目录，本 spec 沿用它的写法，无重叠）
- 相邻还没完成的 issue：#87 retro 的 session-digest locate 换了当前目录后找到别的会话的记录，同属「会话位置取错」一类，但在 retro 脚本里、取的是会话记录不是工作区根，无重叠，不分先后
