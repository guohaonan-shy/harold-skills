---
type: spec
tags: [idea-loop-0-2-0, skill-writing, writing-for-agents, dyna, structure-checks]
summary: 改 skill 的改动有常驻检查：spec 必有杠杆诊断、主文件字数线与增长报告、行内命令绊线
issues: [341]
related: ["[[341]]", "[[skill-rewrite]]", "[[idea-loop-cli]]", "[[skills-no-tool-commands]]", "[[skill-body-limit-backlog]]"]
---

# 改 skill 的结构检查

> #341 存在：2026-11-20 对着 `release/idea-loop-0.2.0` 的 `e30dcd8a` 查，30 份 spec 里只有 1 份有「杠杆诊断」一节；57 份 idea-loop 主文件只有 4 份有字数测试，详情在「问题陈述」

## 问题陈述

### 1. 改 skill 的 spec 跳过杠杆诊断，没有东西拦

`to-spec` 第 3 步写着：改给 agent 读的文档时，先调 `writing-for-agents` 逐条杠杆下诊断，「方案」从诊断推出。这一步只靠起草的人记得。

真实例子：#303（测试按阶段分层）的 spec `test-layering-ci-full`，它的 PR #304（合并提交 `c47cc097`）改了 `implement`、`pr-review` 的 SKILL.md 和 implementer agent 定义，可 spec 全文一次「杠杆」都没出现。#304 第 1 轮 review 时，它靠删句子凑字数被打回（S2）。

量的结果（集成分支 `e30dcd8a`，2026-11-20）：`docs/spec/` 下 30 份 spec 里，有 25 份提到 skill 或 agent 定义的路径，其中只有 `skill-body-limit-backlog` 一份带「杠杆诊断」小节。

### 2. 字数只有 4 份逐份写的测试，增长没人看见

主体字数（量法照仓库 `AGENTS.md`）只有 `implement`、`implementer`、`pr-review`、`design-modeling` 四份有测试（`*-slim-doc.test.mjs`），每份各写一遍上限；其余 53 份没人量。`e30dcd8a` 上 idea-loop 有 26 份主文件超过 4500 字，1 份超过 5000。

没有测试时，增长谁也看不见：`implement` 的主体从 10-14 的 3885 字涨到 11-13 的 9589 字，中间约 25 个功能提交每次往主文件里内联一个分支，单看哪个 diff 都合理（[[skill-rewrite]]「问题陈述」1）。有测试的几份又是另一种问题：测试只有一条线，过线就红，于是逼出删句子的修法（#304 第 1 轮 S2）。review 时没人报「这个 PR 让主文件多了多少字」，审查者看不出该不该把新内容挪到指针后面。

### 3. 行内 `gh` / `git` 命令清一次还会长回来

[[skills-no-tool-commands]] 量过：对着 main `f300d8f`，54 个文件里有 124 行行内 `gh` / `git` 命令。#340 会逐份清一遍（它的核对表最后一行），可是清完之后，新写进来的命令没人拦。

### 4. retro 把能做成检查的纠正写成文字

`retro` 的落点表（第 3 节）写了「能机械判定 → 优先做成检查」，但没说做成检查后原来那段文字怎么办，候选的「新文」照样往 skill 里加一段。人在 #137 的第二条 idea-loop 评论里给的方向是：反复出现的纠正做成检查，文字删掉。

### 根因

写法规则（`writing-for-agents`、`AGENTS.md` 的字数线、[[skills-no-tool-commands]] 的归类表）都写下来了，可是没有一处是自动执行的：杠杆诊断靠起草人记得，字数靠逐份补测试，命令靠 #340 清一次。规则在，结构没跟上，skill 就会长回去（#137 第二条评论「为什么原则在，还是长成这样」）。

## 杠杆诊断

这份 spec 只改三处给 agent 读的文字：`to-spec`、`retro`、`pr-review` 的「跑一轮」参考。其余全是检查（`dyna` 命令和仓库测试）。

**to-spec**：调用方是 `issue-session` 的 triage / todo 会话，以及人；每次都读「过程」和 `<spec-template>`。

- **步骤与完成条件**：第 3 步要求「逐条杠杆下诊断」，可是诊断不落在 spec 的哪个地方，所以完成与否没法核。改成：模板里固定有「杠杆诊断」一节，第 3 步的完成条件就是这一节写好了（不涉及就写「不涉及」）。命令靠这一节判，跟「前端交互」是同一种做法。
- **信息层级**：模板只多一节，每份 spec 都要写，所以内联在模板里，不进参考文件。

**retro**：调用方是 `issue-session` 的「收尾」，以及人说「retro 一下」；每次都读第 3 节「候选的形状」。

- **引导词**：落点表里「能机械判定」排在第三行，跟另外两行并列。改成第一步先判「能不能做成检查」，能做成的，「新文」写删掉原来的文字。用正向写法：写出目标行为，不写「不要加文字」。

**pr-review 的 `references/run-a-round.md`**：只有跑一轮的时候读，在「机械检查」一节。

- **步骤与完成条件**：机械检查的命令清单多一条主文件增长报告，结果原样交给 Standards 进程，跟现在的几条检查一样。不加新步骤。

## 方案

改完，每个改 skill 的改动在三个点被自动核：spec 翻 todo 时、工单落地时、review 跑一轮时。没人记得也照样核。另外加一个仓库测试，全量测试一跑就量全部主文件、扫行内命令。

![检查在哪里触发](assets/sequence-check-points.png)

图里四方：会话（照 skill 做的主会话或子代理）、`dyna` 命令、仓库测试、Codex 的 Standards 进程。红色的是新增或改动的。

| 检查 | 触发点 | 结果 | 范围 |
|---|---|---|---|
| spec 有「杠杆诊断」一节 | triage 翻 todo（`dyna issues set todo`） | 没有就拒绝翻，说出该补哪一节 | 每份 spec |
| 改了 skill 的工单，spec 的杠杆诊断不能写「不涉及」 | 工单落地（`dyna spec skill-edit`，implement 落地时已经在跑） | 提交改了 skill 或 agent 定义、spec 却写「不涉及」或缺这一节，就拒绝落地 | 每个项目 |
| 主文件增长报告 | review 跑一轮的机械检查（新命令 `dyna pr skill-growth <base-ref>`） | 只报事实：每份变了的 SKILL.md 或 agent 定义，改前多少字、改后多少字、差多少；退出 0，由审查者判这次增长是不是该挪到指针后面的分支 | 每个项目 |
| 主体字数线 4500 | 仓库全量测试 | 任何一份 idea-loop 的 SKILL.md 或 agent 定义主体超过 4500 字就红，报文件和字数 | 只管 harold-skills 的 idea-loop |
| 行内 `gh` / `git` 绊线 | 仓库全量测试 | `skills/`、`agents/` 里写了行内 `gh` / `git` 命令就红，报文件和行号；适配层文件，以及标了「坑」的行放行 | 只管 harold-skills 的 idea-loop |

触发点照 [[idea-loop-cli]] 定下的原则：lint 只由自动触发器跑，skill 不调 lint；要等一组改动做完才能判的检查，放进落地命令当护栏。「杠杆诊断」要等 spec 写完才能判，所以不做成写文件时的 hook，放在翻 todo、工单落地这两个落地命令里。增长报告不判对错，只是给 review 的输入，跟现有的 `dyna pr diagnostics filter` 同一类。

一个真实例子：#303 的 spec 如果放在今天，triage 翻 todo 时会被拒：「spec 里没有『杠杆诊断』一节：改了给 agent 读的文档，就逐条杠杆下诊断；不涉及写『不涉及』」。补上之后它的第一张工单落地，提交改了 `implement/SKILL.md`，诊断写的不是「不涉及」，放行。review 跑一轮时，机械检查里多一行：`implement/SKILL.md 3885 → 4310（+425）`。

同一行为的其他入口：

- **todo 会话自己起草的 spec**（不经过 triage 翻 todo）：纳入，但只在工单落地时核（第二条）。已知限制：这类 spec 如果改 skill 又没写诊断，要等第一张工单落地才被拦。
- **`dyna spec check`**：排除。它扫全部 spec，现有 30 份都没有这一节，加进去会对每份旧 spec 永远报问题。issue 里写的「`spec check` 拒绝」改由翻 todo 时核那一份 spec 来做。
- **`AGENTS.md` / `CLAUDE.md`**：排除在落地核对和增长报告之外。路径规则沿用 `spec skill-edit` 现有的那条（`SKILL.md`、`skills/` 下的 `.md`、`agents/` 下直接的 `.md`），让两处认的「这类文件」是同一个集合。spec 的诊断仍然覆盖它们（`to-spec` 第 3 步本来就点了名）。
- **其他插件的 SKILL.md**（`content-creator/thumbnail-gen` 15224 字、`happy-life/daily-coffee-oracle` 13064 字）：排除，因为 issue 只管 idea-loop；[[skill-body-limit-backlog]] 已经定过这两份留作已知存量（2026-11-16 人定只改 idea-loop）。
- **字数的棘轮**（11-16 issue 评论：全部 SKILL.md 都量，只要求不再变长）：被 4500 的线取代。棘轮是为了不逼当时超过 5000 的文件压回去；#340 做完之后每份都在 4500 以内，[[skill-rewrite]] 写明「#341 用一个通用的字数检查替掉四个逐份写的字数测试时，线照这里的 4500」。这条线以下的增长交给增长报告，由审查者判，不再靠红灯。

## User Stories

只修问题，不加能力：

1. 期望行为（对应问题 1）：改 skill 的 spec 没写杠杆诊断，翻 todo 时被拦，提示说出补哪一节；改了 skill 的工单，spec 的诊断写「不涉及」，落地时被拦。
2. 期望行为（对应问题 2）：任何一份 idea-loop 主文件超过 4500 字，全量测试就红；review 的机械检查列出这个 PR 让哪几份主文件变长了、各多少字。
3. 期望行为（对应问题 3）：有人往 skill 或 agent 定义里写了行内 `gh` / `git` 命令，全量测试就红，并报出文件和行号。
4. 期望行为（对应问题 4）：retro 遇到能机械判定的纠正，候选的落点是检查，「新文」是删掉原来的文字。

## 实现决策

- **基准分支与起点**：`release/idea-loop-0.2.0`。等 #340 的 PR 合进集成分支之后再开始做：`to-spec`、`retro`、`pr-review`、四个 slim 测试、`writing-for-agents` 都会被 #340 重写，这里改的是重写之后的样子。一条分支、一个 PR，开到集成分支。
- **「杠杆诊断」这一节**（人 2026-11-20 选「每份 spec 都写」）：`to-spec` 的模板在「问题陈述」与「方案」之间固定加 `## 杠杆诊断`。改给 agent 读的文档时，逐份写调用方、各读哪几块、每条改动对哪条杠杆；不改的写一行「不涉及：不改给 agent 读的文档」。怎么判「不涉及」，跟「前端交互」用同一条规则（这一节以「不涉及」开头）。理由：从正文猜一份 spec 改不改 skill 不可靠。回测对着 `e30dcd8a` 的 30 份 spec 漏判 7 份（例如 `dispatch-day-night-modes` 只写裸名 `issue-dispatch`），对着 TOFEL-demo 的 16 份误判 5 份（`motion-reduce:animate-none`、`node:test` 也被当成 skill 引用）。
- **翻 todo 的护栏**：`dyna issues set todo` 在 triage → todo 的前提里加一条，放在「等人定的」「冻结摘要」两条旁边：spec 没有「杠杆诊断」一节就拒绝。只核这一次要翻的 issue 覆盖的那份 spec，旧 spec 不受影响。
- **落地的护栏**：`dyna spec skill-edit <commit> <交回文件>` 已经会算出这个提交改到哪些 skill 文件，并核交回文件。新加一条：改到的文件里有 SKILL.md 或 agent 定义时，通过提交的 Ticket 行找到工单所在的 spec，它的「杠杆诊断」缺失或写「不涉及」就拒绝，报错说出 spec 路径和下一步（补诊断再落地）。只改 skill 参考文件的提交也算在内，因为路径规则不变。
- **增长报告**：新命令 `dyna pr skill-growth <base-ref>`，调用方是会话。对 `<base-ref>...HEAD` 里变了的每份 SKILL.md 和 agent 定义（路径规则同上，参考文件不算主文件），按 `AGENTS.md` 的量法输出改前、改后、差值；新增的文件改前记 0，删掉的改后记 0；没有变的不列。永远退出 0。`pr-review` 的 `references/run-a-round.md`「机械检查」列上它，结果原样进 `checks.md`。
- **字数线**：仓库加一个测试，量 `idea-loop/skills/**/SKILL.md` 和 `idea-loop/agents/*.md` 的主体，线是 4500，只写在这一处。四个 `*-slim-doc.test.mjs` 里量字数的断言删掉，其余断言（某节在不在、指针对不对）留着。`dyna test skill-doc` 里「主体不到 5000 字」那一条去掉，只保留小节指针的核对，免得同一条线有两个来源。仓库 `AGENTS.md`「要点」和 `REVIEW.md`「额外要求」里写 idea-loop 字数线的地方指向这个测试；其他插件仍按 `AGENTS.md` 的 < 5000。
- **行内命令绊线**：照 [[skills-no-tool-commands]]「方案」的最后一段，以及 `no-project-leak.test.mjs`、`runtime-tripwire.test.mjs` 的写法：扫 `idea-loop/skills/`、`idea-loop/agents/` 的 `.md` 里行内代码开头是 `gh <子命令>` 或 `git <子命令>` 的地方。放行两类：一是适配层文件（issues 的 GitHub 参考、setup 写进目标仓库的 issue-tracker 模板与前置检查表；具体文件以 #340 合并后的树为准，测试里逐个列出并写明理由）；二是同一行带「坑」字的行。frontmatter 的 `allowed-tools` 行也放行，跟 runtime 绊线一样。`dyna …` 不在扫描范围，归登记表的扫描测试管。
- **retro**：第 3 节先判「能不能机械判定」。能判的，落点是检查（`dyna` 的护栏或仓库测试），「旧文 / 新文」写成删掉那段文字（或收成一句指向检查报错的话），「验证」写检查的名字并在历史错误上看它红（现有写法）。不能判的再按问题出在哪选落点。
- **版本**：改了 `dyna/` 就照 `DEVELOPMENT.md`「命令行 dyna」升 dyna 版本、存登记表；`pr-review` 开始写 `dyna pr skill-growth`，插件的 `dyna-version` 下限要提到那一版。登记表扫描测试会钉住顺序：那一版必须已经发布，提了下限的 skill 改动才能合。发不发、什么时候发由人定（0.0.4 还没发，父会话的推荐是 0.2.0 收尾时一起发）。插件 `plugin.json` 升 minor：翻 todo 和工单落地会多拒绝一种情况，是流程行为的改动。
- **已知限制**：
  - todo 会话自己起草的 spec 只在落地时核（见「方案」）。
  - 字数线和绊线只管 harold-skills 的 idea-loop。目标项目自己的 skill 只有增长报告和杠杆诊断两道。
  - 增长报告不判对错，增长该不该挪走靠 review 的 Standards 轴判。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到（`go test`）：翻 todo 前提多一条、`spec skill-edit` 的新规则、`pr skill-growth` 的计算（新增、删除、没变、参考文件不算） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 碰到：`pr skill-growth` 的输出形状、登记表多一条命令（登记表测试守着） |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 碰到：`to-spec`、`retro`、`run-a-round.md` 的文字。不加 eval（`AGENTS.md` §5）；改到的硬规矩由文档测试钉位置（模板有「杠杆诊断」一节、retro 先判能不能做成检查） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：两个。
  - `dyna` 命令本身（测试起子进程调编出来的二进制，读输出和退出码，照现有各模块的 `cmd_test.go`）：能抓到护栏判错、报告算错、报错里没有下一步；漏掉的是 skill 有没有真的在那个时候调它。
  - 插件文档树（仓库测试读 `skills/`、`agents/` 的文本）：能抓到超线、行内命令、模板缺节；漏掉的是诊断写得对不对，那部分交给 review。
- **增量功能测试**：
  1. 前置：一份没有「杠杆诊断」一节的 spec，`issues:` 列着一个 triage 状态的 issue。步骤：`dyna issues set <docs> todo <号>`。期望：拒绝，提示里点名「杠杆诊断」。补上「不涉及：…」后再翻，放行。覆盖：期望行为 1。
  2. 前置：spec 的诊断写「不涉及」，一个带这张工单 Ticket 行的提交改了某份 SKILL.md。步骤：`dyna spec skill-edit <commit> <交回文件>`。期望：退出 2，说出 spec 路径。诊断写成真的诊断后，退出 0。覆盖：期望行为 1。
  3. 前置：一个分支在基准上把一份 SKILL.md 加了 300 字，新增一份 agent 定义，改了一份参考文件。步骤：`dyna pr skill-growth <base>`。期望：列出两行（SKILL.md +300，agent 定义 0 → N），参考文件不列，退出 0。覆盖：期望行为 2。
  4. 前置：把某份 idea-loop SKILL.md 补到 4501 字。步骤：全量测试。期望：字数测试红，报文件和字数。覆盖：期望行为 2。
  5. 前置：在某份 SKILL.md 正文写一行 `` `gh issue view 1 --comments` ``。步骤：全量测试。期望：绊线红，报文件和行号；同一行加上「坑：…」就放行。覆盖：期望行为 3。
  6. 步骤：读改后的 retro 第 3 节。期望：第一步是判能不能机械判定，能判的「新文」是删除。由文档测试钉住。覆盖：期望行为 4。
- **照着谁写**：护栏照 `issues` 包里「冻结摘要」那条前提及其测试；`skill-edit` 照它现有的测试；绊线照 `no-project-leak.test.mjs`、`runtime-tripwire.test.mjs`；字数照 `implement-slim-doc.test.mjs` 的量法。

## Out of scope

- 把现有 skill 压到 4500 以内、清掉现有的行内命令：#340。
- 给 `docs/` 里已有的 spec 补「杠杆诊断」一节：它们是当时的记录，护栏只核翻 todo 的那一份。
- 其他插件的字数与命令检查。

## 关联

- 决定记录：[[341]]（本会话 Harold 定的一题）。
- [[skill-rewrite]]（#340，todo，实现会话在跑）：本 issue 在它之后；分界照它「实现决策」里的「跟 #341 的分界」，没有重叠：它清一次存量，这里加常驻检查。
- [[idea-loop-cli]]（#339，已合入集成分支）：登记表、「lint 只由 hook 触发，组改动的检查放进落地命令」的原则、`issues set` 和 `spec skill-edit` 的护栏写法都照它。
- [[skills-no-tool-commands]]（#356，随 #340 关）：归类表与绊线的放行判据出自它的「方案」。
- [[skill-body-limit-backlog]]（#137）：拆出本 issue 的地方；字数棘轮的原始提法，以及其他插件留作存量的决定。
- #376（给仓库加 CI，backlog，人定排在 #339 之后再商量）：没有重叠。这里的字数线和绊线是仓库测试，现在由 review 的全量测试跑；CI 上线后它们随全量测试自动进 CI，不用改。
- #247（迁移，todo）：最后做，不碰检查，没有重叠。四个子 issue 都被父 issue #331 挡着。
