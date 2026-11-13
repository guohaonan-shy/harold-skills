---
type: spec
tags: [agents-md, release]
summary: 说插件 PR 可以合并、或交它的审核报告时，一并说它合并后随哪个版本发
related: []
issues: [178]
---

# AGENTS.md：说插件 PR 可以合并时，一并说它随哪个版本发

> #178 存在：根目录 `AGENTS.md` 里没有「说 PR 可以合并时一并说随哪个版本发」的规则，人在 #168 会话里听到「#162 可以合并」后只能再追问版本，详情在「问题陈述」

## 问题陈述

### 说「可以合并」时没说版本，人要再追问一次

这个仓库一个仓库里放了多个插件，`plugin.json` 的 `version` 不是每个 PR 都升，而是攒几个 PR 后单独发版：`idea-loop/.claude-plugin/plugin.json` 最近几次升版本都是只改这一个文件的 `chore(idea-loop): 0.1.x` 提交（例：`f630496` 升 0.1.13），0.1.8 走的是单独的 `release/idea-loop-0.1.8` 分支（PR #176，合并提交 `5e414ca`）。所以一个 PR 合并后会以哪个版本到用户手里，光看 PR 看不出来。

真实例子：2026-10-30，#168 的会话里回答 #162「可以合并」，人接着问「那这个合并之后的patch版本是什么？」。实际是 #162 没升版本（合并提交 `edbe10e`），合并后 main 上仍是 0.1.7，后来跟 #165、#131 一起作为 0.1.8 发出（`5e414ca`）。

现在的规则里没有要求说这件事：根目录 `AGENTS.md` 只在目录结构那段提到 `plugin.json` 带 version；`REVIEW.md`、`DEVELOPMENT.md`、`idea-loop/AGENTS.md`、`idea-loop:pr` 的 SKILL.md 也没有。

出处：分拣评论 https://github.com/guohaonan-shy/harold-skills/issues/178 （「🤖 idea-loop：」那条，2026-11-13，对着 origin/main）；本次对着 origin/main `cacdec5` 重读了根目录 `AGENTS.md` 和 `git log`，结论不变。来历见 `docs/raw/decisions/168.md` 候选 2（人批了）。

### 根因

本仓库「版本不随每个 PR 升」的发版方式只体现在 git 历史里，没写进任何会话开场会读的文件，会话说「可以合并」时不知道该顺带交代版本。

## 方案

改完后：在这个仓库里，会话说某个插件的 PR 可以合并、或交它的审核报告时，同一段话里就写明它合并后随哪个版本发——这个 PR 升不升 `version`；不升的，跟哪个版本一起发。人不用再追问。

改动只有一处：把 issue 正文的「新文」原样加进根目录 `AGENTS.md`「Repository Purpose」一节的末尾（在「改了某个 plugin 的 … `README.md`，不是这里。」之后、「### idea-loop 的约定与刻意例外」之前）：

> 说一个 plugin 的 PR 可以合并、或交它的审核报告时，一并说它合并后随哪个版本发：这个 PR 升不升 `plugin.json` 的 `version`；不升的，写明它会跟着哪个版本一起发（例：『不升版本，main 上仍是 0.1.7，跟 #165、#131 一起作为 0.1.8 发』）。

对的杠杆（`idea-loop:writing-for-agents`）：根目录 `CLAUDE.md` 只有一行 `@AGENTS.md`，所以这个仓库里每个会话开场都读到它；这是一条「做 X 时顺带做 Y」的行为规则，只跟本仓库的发版方式有关，放在常驻的 `AGENTS.md` 里正好，不需要挪进 skill。读它的是这个仓库里会说「可以合并」的会话：`idea-loop:issue-session` 的 todo 会话（经 `idea-loop:pr-review` 出 Review 汇报、问人合不合并），以及人直接在普通对话里问「能合了吗」的会话。

同一行为的其他入口：

- `idea-loop:pr` / `idea-loop:pr-review` 里的 Review 汇报格式：排除。这条规则只对本仓库成立（一个仓库多个插件、版本单独发），写进插件会把一个项目的发版方式带给所有装了 idea-loop 的项目，违反本仓库「插件里不出现任何项目的信息」。
- `REVIEW.md`：排除。它管验证命令和 review 要求，不管跟人说话时交代什么；放 `AGENTS.md` 一处就够，两处写会漂。

## User Stories

1. 期望行为：在这个仓库里，会话说某个插件的 PR 可以合并、或交它的审核报告时，同一处写明它升不升 `plugin.json` 的 `version`；不升的，写明跟着哪个版本一起发。

## 实现决策

- 文字照 issue「新文」，一字不改：#168 的 retro 里人批过（`docs/raw/decisions/168.md` 候选 2，结果「批」）。
- 例子里的 0.1.7、#165、#131、0.1.8 保留原样：它是一次真实发生过的发版（`edbe10e` → `5e414ca`），作为历史例子不会过时；分拣评论提到「例子已过时」，指的是现在 main 上已是 0.1.13，不影响例子本身成立。这个文件是本仓库自己的 `AGENTS.md`，不在插件里，用真实编号不违反防泄漏规则。
- 这个 PR 只改根目录 `AGENTS.md` 和本 spec，不碰任何插件，不升任何 `version`；交审核报告时照新规则自己说一遍。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改的是根目录 `AGENTS.md` 的一句规则；不加 eval、不留回放用例，验收靠下面的文字核对 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：根目录 `AGENTS.md` 的「Repository Purpose」一节。不写文档测试：仓库的文档测试都在 `idea-loop/scripts/` 下、随插件发出去，给本仓库根目录文件写的测试放进插件就是把项目信息带进插件。
- **增量功能测试**：前置：分支上的根目录 `AGENTS.md`。步骤：取「Repository Purpose」到「### idea-loop 的约定与刻意例外」之间的文字。期望：含新文全文，且位于「改了某个 plugin 的 …」那行之后。覆盖：期望行为 1。
- **照着谁写**：`implement-resume-landed`（同样是把 retro 批过的一句新文原样加进规则文件）。

## Out of scope

- 把「版本怎么发」（什么时候升、走不走 release 分支）写成一节发版流程：这次只要求说「随哪个版本发」，不定发版流程。

## 关联

- raw：`docs/raw/decisions/168.md` 候选 2（这条规则的来历）。
- 相关 spec：无。
- 相邻未完成的 issue：查了开着的 issue 里搜「AGENTS.md」和「版本 合并」的结果，#137、#302（SKILL.md 超长）、#234、#235（idea-loop 插件内的问题）都不改根目录 `AGENTS.md`，无重叠。
