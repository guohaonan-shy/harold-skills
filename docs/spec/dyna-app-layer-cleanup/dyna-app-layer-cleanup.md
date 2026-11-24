---
type: spec
issues: [490]
tags: [issue-workflow, runtime, dyna, dyna-app-layer-cleanup]
summary: 运行环境说明搬出插件、由 setup 照模板生成；dyna 去掉写死的桌面端默认和应用层叫法
related: ["[[2026-11-24-runtime-docs-location-grill]]", "[[runtime-ops-in-docs]]", "[[runtime-local-override]]", "[[0026-runtime]]", "[[idea-loop-cli]]"]
---

# 运行环境说明搬出插件，dyna 不再带应用层的东西

> #490 存在：`release/idea-loop-0.2.0`（5ef9a09a，2026-11-24）上从源码构建的 dyna，在一个没有 `runtime/selected`、没有 `MAGI_SESSION_ID` 的 home 里跑 `dyna runtime name` 打印 `claude-desktop`；`dyna home dispatch` 输出 `"sections": ["triage","in-progress","in-review"]`；`dyna runtime record` 写的字段是 `desktopSessionId`；插件 `idea-loop/runtime/` 带着桌面端和 magi 两份说明。详情在「问题陈述」

三层边界是 Harold 2026-11-24 定的（#490 正文「背景」）：harness（claude、codex）跑模型和工具；**应用层 = 运行环境**（Claude 桌面端、t3code、magi/Dawn）管分组、标题、归档、定时、会话间发消息，**应用层的东西不进 dyna**，只写在各自的运行环境说明里；项目层（worktree、分支、PR）由 dyna 做。这次 triage 里 Harold 又定了：说明也不放在插件里，插件只留模板，每台机器由 setup 生成自己的（grill 记录见「关联」）。

## 问题陈述

核对方式：2026-11-24 在 `release/idea-loop-0.2.0`（5ef9a09a）上 `git grep` dyna 的非测试代码，再从源码构建 dyna 跑命令。dyna 不执行任何应用层的命令（外部程序只有 git、gh、node、top、vm_stat、dyna 自己，以及 `dyna agent` 起的 claude、codex），但下面几处把应用层的名字或概念写进了逻辑、输出或插件。

### 1. 认不出运行环境时，dyna 当作桌面端

**现状**：`dyna runtime` 认环境的顺序是 `IDEA_LOOP_RUNTIME` → 标记有值的说明 → home 里 `runtime/selected` 写的名字 → 写死的 `claude-desktop`（`dyna/internal/runtime/envs.go` 的 `DefaultName`，`dyna runtime --help` 的第 4 条）。`selected` 写了一个不认识的名字，也落回 `claude-desktop`。

**例子**：一台新机器跑在 t3code 里、还没跑 setup，开场注入会写「当前运行环境：claude-desktop」，再注入整份桌面端说明，会话照着去调 `mcp__ccd_*` 工具。本该是：认不出就说认不出，注入一行「没有运行环境说明，跑 `/idea-loop:setup`」，能力都走退路。

术语表已经把「默认运行环境」定义成「人在 setup 里给这台设备选的运行环境」（`GLOSSARY.md`），代码里写死的 `claude-desktop` 跟这个定义不一致。

### 2. 调度的输出说的是「侧边栏的三个分组」

**现状**：`dyna home dispatch` 输出末尾是 `"sections": ["triage","in-progress","in-review"]`，Go 里注释写「the sidebar sections the dispatch counts open sessions in」（`dyna/internal/home/dispatch.go`），帮助写「三个分组名」（`home/cmd.go`）。`dyna issues queues` 的帮助写「侧栏的三个分组名」（`issues/cmd.go`），`issues/state.go` 的 `Working` 直接取这个变量。

值是三个 issue 状态，没问题；「侧边栏分组」是桌面端的概念，magi 没有分组，t3code 的分组还要自己 fork 改。桌面端说明照这个字段名建分组（`idea-loop/runtime/claude-desktop.md`「会话管理」的「分组」和「怎么数开着的会话」）。

### 3. 调度记录的会话 id 叫 `desktopSessionId`

**现状**：`dyna runtime record --session <id>` 往 `~/.idea-loop/dispatch/<仓库名>.json` 追加 `{issue, desktopSessionId, openedAt, period}`（`runtime/record.go`），帮助写「桌面端是 local_<id>，其他环境是它自己的会话 id」。magi 开出的会话也写进 `desktopSessionId`。这台机器上已有的记录：`harold-skills.json` 44 条、`Tofelair.json` 41 条，全是旧名。

### 4. 三处注释还写着已删的做法

- `runtime/runtime.go` 包注释：还写「把 `claude -p` 会话交到桌面端」，那是 #471 删掉的 `dyna runtime handoff`。
- `worktree/worktree.go` 包注释：说 worktree 放哪「照 runtime/magi.md、claude-desktop.md」；放哪本来就是 dyna 自己的规则（项目层）。
- `pr/loop.go` 注释：「在桌面端或手机的 Claude 会话里审」。

### 5. 插件带着具体运行环境的说明

**现状**：插件 `idea-loop/runtime/` 带 `claude-desktop.md`（加它的细节文件 `claude-desktop-mic.md`）和 `magi.md`，开场注入时 dyna 从插件目录读；home 里的 `~/home/runtime/<名>.md` 只能按小节覆盖插件里的同名说明（spec `runtime-local-override`），或补一份插件里没有的环境。setup 照模板生成新说明时，格式样例也读插件里这两份。

**本该是**（Harold 2026-11-24 定）：插件只留能力清单和能力模板；每台机器的说明由 setup 让 AI 照模板和当前运行环境生成，放在人习惯的地方，以 home 为主路，单个项目、用户根目录也支持。插件现有两份搬进 home，插件里删掉。

### 根因

#471 把开会话这类操作挪出了 dyna，但 dyna 里剩下的默认值、字段名、注释还是按「只有桌面端」时写的，插件也还按「插件自带已知环境」组织，没有按三层边界再过一遍。五个问题都是这一条。

## 方案

改完以后：

- **说明放在人选的地方**：插件 `idea-loop/runtime/` 只剩 `capabilities.md`（能力清单与能力模板）。每台机器的说明由 setup 生成，可以放三处，dyna 按这个顺序找，先找到的那份整份生效：
  1. 项目：`<主 checkout>/.idea-loop/runtime/<名>.md`
  2. home：`~/home/runtime/<名>.md`（主路，setup 推荐它）
  3. 用户根目录：`~/.idea-loop/runtime/<名>.md`

  人选的默认运行环境 `selected` 也按同一顺序找。调度会话开在 `~/home`，只看得到后两处。
- **认不出就说认不出**：dyna 按说明的标记和人选的名字认环境；都没有，开场注入说一句「没有运行环境说明，跑 `/idea-loop:setup`」，所有能力走能力清单的退路。
- **dyna 的输出里没有应用层的叫法**：调度给出「按状态数会话的三个状态」，字段叫 `states`；调度记录的会话 id 字段叫 `sessionId`。各运行环境怎么按这三个状态数会话、会话 id 长什么样，写在各自的说明里。

改前改后，按命令列：

| 命令或文件 | 改前 | 改后 |
|---|---|---|
| `dyna runtime name`（无标记、没选） | 打印 `claude-desktop`，退出 0 | 报「认不出运行环境：…跑 /idea-loop:setup」，退出 1 |
| `dyna runtime inject runtime` / `reference`（同上） | 注入能力清单和整份桌面端说明 | 能力清单照注入，头一行「当前运行环境：没有（跑 /idea-loop:setup）」；`reference` 只注入这一行 |
| `selected` 写了找不到说明的名字 | 提示一句，用 `claude-desktop` | 提示一句，当作没选，同上一行 |
| 说明从哪读 | 插件 `runtime/`，home 同名文件按小节覆盖 | 项目 → home → 用户根目录，整份生效，不再按小节合并 |
| `dyna runtime check`（不带文件） | 核插件和 home 里全部说明 | 核三处找得到的全部说明 |
| `dyna home dispatch` | `"sections": [...]` | `"states": [...]`，值不变 |
| `dyna issues queues` | 帮助写「侧栏的三个分组名」 | 帮助写「调度按状态数会话的三个状态」 |
| `dyna runtime record --session` | 写 `desktopSessionId` | 写 `sessionId` |
| 插件 `idea-loop/runtime/` | `capabilities.md`、`claude-desktop.md`、`claude-desktop-mic.md`、`magi.md` | 只有 `capabilities.md` |

同一行为的其他入口：

- **setup 的「运行环境」**（`setup/references/runtime-env.md`）：纳入。第 1 步「列出认识的环境」改读三处；第 2 步「照模板生成」不再只在「要用的环境不在列表里」时做，而是三处都没有这台机器的说明时就做：AI 读能力模板，再查当前运行环境（会话里有哪些工具、有哪些环境变量、命令的 `help`），人给了文档就一起读；生成前问人放哪（推荐 home），逐节给人批，写进去跑 `dyna runtime check`。
- **读 `sections` 的**：桌面端说明「会话管理」的「分组」「怎么数开着的会话」两处，改读 `states`；改在搬进 home 的那份里。
- **读调度记录的**：`issue-dispatch` 的早上汇总（`references/morning-summary.md` 第 1 步）。写明会话 id 取 `sessionId`，旧记录是 `desktopSessionId`，两个都认。dyna 自己不读记录，所以「新旧都认」只落在这份参考里。
- **读插件说明的检查**：仓库里 7 个检查文件直接读插件里的说明（如 `idea-loop/scripts/dispatch-one-per-device-doc.test.mjs` 断言桌面端说明写着「名字取 `dyna home dispatch` 返回的 `sections`」）。纳入：断言具体环境做法的删掉（那些内容不再归插件）；要一份说明才能跑的（如开场注入的检查）改用测试自己写的样例说明。
- **SessionStart 钩子**：调的是 `dyna runtime inject`，纳入（上表第 2 行）。
- **README、`dyna runtime --help`**：讲「插件自带两份说明」「本机覆盖」的地方，纳入，改成三处和生成。
- **排除**：`dyna agent claude|codex run`、`claudestream`（harness 层，边界内）；`runtime show`（只读找到的说明，跟着查找顺序走，不另改）。

版本：dyna 在集成分支当时的版本（现在 0.0.14）上升一档，存 `dyna/registry/<新版本>.json`；`idea-loop/dyna-version` 下限跟到新版本（说明开始读 `states`，旧 dyna 给不出）。插件 `plugin.json` 的 `version` 按 `REVIEW.md`「额外要求」的档位升。

## User Stories

只修问题，不加能力，每个问题一行期望行为：

1. 认不出运行环境时，开场注入说「没有运行环境说明，跑 `/idea-loop:setup`」，不冒充桌面端；dyna 代码里没有任何运行环境的名字。
2. `dyna home dispatch` 给出 `states`，dyna 的帮助和注释不提侧边栏、分组；桌面端说明照 `states` 建分组、数会话。
3. 新写的调度记录用 `sessionId`；早上汇总对新旧两种记录都能取到会话 id。
4. 三处注释只写 dyna 自己做的事，不再提已删的 handoff、运行环境说明里的 worktree 规则和「桌面端或手机」。
5. 插件不带任何具体运行环境的说明；一台新机器跑 setup，AI 照模板和当前环境生成一份，人选放项目、home 或用户根目录（默认推荐 home），dyna 从那里读到它。

## 实现决策

- **说明放哪、几处同时有怎么办**（Harold 2026-11-24 定，原话见 raw）：「home仓库，～/根目录，项目目录都应该支持」「我之后肯定是想往home这一套走的，但是单个项目、用户纬度这种感觉还是得支持吧」。所以三处都支持，home 是主路、setup 推荐它；查找顺序越具体越优先（项目 → home → 用户根目录），先找到的整份生效。用户根目录取 `~/.idea-loop/`，依据是仓库 `AGENTS.md`「跨会话持久的用户数据 → `~/.<plugin-name>/`」。
- **插件安装范围不用来定位置**：这台 Mac 上 idea-loop 没有一处装在用户级，项目级装在 4 个项目、local 级在 harold-skills；按安装范围放要 5 份以上，开在 `~/home` 的调度会话一份也读不到。安装范围也只有 Claude Code 有，读它等于把 harness 层的东西放进 dyna。Harold 在 U4 没要求按它定。
- **项目那一处取主 checkout**：「项目」取当前目录所在仓库的主 checkout（`git rev-parse --git-common-dir` 的上一级），不取 worktree 自己的根，因为 issue 会话都开在 worktree 里，而 setup 写的文件不提交。setup 写进项目时，把 `.idea-loop/` 加进这个仓库的 `.git/info/exclude`：说明是这台机器的，不该提交给别人。不在 git 仓库里就跳过这一处。
- **不再按小节覆盖**：插件里没有说明了，本机覆盖没有可覆盖的底本。`runtime-local-override` 的按小节合并删掉；三处之间也不合并，整份生效，读的人一眼知道生效的是哪份文件。
- **现有两份搬进 home、插件删掉**（Harold 2026-11-24 定：「搬进 home，插件删掉」）：
  - 这台 Mac：实现时把改完字段名的 `claude-desktop.md` 和 `claude-desktop-mic.md` 写进 `~/home/runtime/`，`dyna home commit`，再在 `~/home/runtime/selected` 写 `claude-desktop`（桌面端标记是「没有」，靠它认）。
  - magi（Dawn 那台机器）：插件删掉之后那台机器拿不到。PR 的「要你做的事」里给一条命令，从合并前的提交取出 `magi.md` 放进那台机器的 `~/home/runtime/`。
  - 已知限制：别的新桌面端机器只照模板和官方文档生成，PR #489 那种实测才踩出来的做法（`claude --desktop --resume` 在 Bash 工具里要套 `script -q /dev/null`）不会自动带过去，要再踩一次或从这台 Mac 的 home 抄。这是 Harold 选「插件删掉」时已经看到的代价（A2 的例子）。
- **认不出环境是一个结果，不是错误**：`Detect` 返回「没有」时，`inject` 照常成功输出（钩子不能失败，否则会话开场什么都没有）；`runtime name` 退出 1，因为它的调用方（子 agent 自己认环境）要的是一个名字，拿不到就该走退路。依据：能力清单的退路（`capabilities.md`）本来就覆盖「工具实际不在」，认不出环境等于每个能力都不在。
- **字段直接改名，不双写**：`states` 和 `sessionId` 不同时输出旧名。依据：插件和 dyna 靠 `dyna-version` 绑在一起（插件的 `bin/dyna` 拒绝范围外的版本），读字段的只有插件自己的参考和搬进 home 的说明，一起改。
- **ADR-0026 的检测规则**（「否则 claude-desktop」、说明在插件里）已被 #471 和本 spec 取代，订正交给 `/idea-loop:dreaming`，这里不改 ADR。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：认环境（三处查找顺序、认不出时的结果、`selected` 的查找）、`inject` 的输出、`record` 的字段、`home dispatch` 的字段；删按小节合并 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 碰到：命令的 JSON 输出就是契约，用上一行的 Go 测试验字段名；`dyna/registry/<新版本>.json` 由已有的登记表检查核 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | setup 的「运行环境」第 2 步改了生成的触发条件和输入：验证写「目标用例」，从 User Story 5 写：空 home 的桌面端会话跑 setup，是否生成了一份过 `dyna runtime check` 的说明并问了放哪。早上汇总、桌面端说明只改字段名，验证写「不改行为」 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：dyna 的命令行（跑命令、读 stdout 和退出码），复用 `dyna/internal/runtime`、`home`、`issues` 已有的命令级测试。抓得到查找顺序、字段名、认环境的结果；漏掉 setup 生成的说明写得好不好，那一块由目标用例和 `dyna runtime check` 守。
- **增量功能测试**：
  - 前置：空 home、不设 `IDEA_LOOP_RUNTIME`、`MAGI_SESSION_ID`。步骤：`dyna runtime name`、`dyna runtime inject reference`。期望：前者退出 1、提示跑 setup；后者退出 0，只有一行「没有运行环境说明」。覆盖 1。
  - 前置：三处各放一份同名说明、内容不同。期望：在项目里注入的是项目那份；在 home 里注入的是 home 那份；只剩用户根目录那份时注入它。覆盖 5。
  - 前置：项目是一个 worktree，说明只在主 checkout 的 `.idea-loop/runtime/` 里。期望：在 worktree 里也认得到。覆盖 5。
  - 前置：home 的 `runtime/selected` 写 `claude-desktop`，home 里有这份说明。期望：认成桌面端，跟今天一样。覆盖 1。
  - `dyna home dispatch` 的 JSON 有 `states`、没有 `sections`。覆盖 2。
  - `dyna runtime record --session local_x` 写出的条目有 `sessionId: local_x`、没有 `desktopSessionId`。覆盖 3。
  - 插件 `idea-loop/runtime/` 下只有 `capabilities.md`；`git grep` dyna 非测试代码里没有 `claude-desktop`、`desktopSessionId`、「侧栏」「侧边栏」，加进已有的检查。覆盖 1–5。
- **照着谁写**：`dyna/internal/runtime/envs_test.go`（#471 加的，按标记、`selected` 各一组）；`idea-loop/scripts/session-start-inject.test.mjs`（开场注入，改用样例说明）；目标用例照 `idea-loop/evals/retro/` 的用例格式。

## Out of scope

- 写 `t3code.md`：t3code 换环境前要先实测（Harold 2026-11-24），实测和评估接在 #477；以后照本 spec 的 setup 生成。
- dyna 代理 harness 层开会话、结束会话：#490 原先提的，Harold 2026-11-24 定了不做（t3code 本身驱动 claude、codex）。
- 订正 ADR-0026：交给 `/idea-loop:dreaming`。

## 关联

- raw：`docs/raw/issue-workflow/2026-11-24-runtime-docs-location-grill.md`（本次 triage 的 grill，说明放哪的三轮决议）。
- spec：`runtime-ops-in-docs`（#471，已合）——它定的「插件自带桌面端、magi 两份说明」被本 spec 推翻；`runtime-local-override`——按小节覆盖被本 spec 删掉。
- ADR：0026-runtime（检测规则与说明位置已过期，见上）。
- 相邻 issue：#477（t3code 实测与评估，跟本 spec 不重叠；它要的 `t3code.md` 以后照本 spec 的 setup 生成）；#331（0.2.0 父 issue，本 issue 挂在它下面）。同期改 dyna 的 PR 要在集成分支当时的版本上再升一档，谁后合谁升。
