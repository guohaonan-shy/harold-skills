---
type: spec
tags: [idea-loop-0-2-0, skill-writing, dyna, structure-checks]
summary: skill 文件的常驻检查：写文件时 hook 对 home 下全部 skill 跑字数线 4500、对 idea-loop 跑行内命令绊线、review 报主文件增长、retro 先判能不能做成检查、全量在 review 本机跑
issues: [341]
related: ["[[341]]", "[[skill-rewrite]]", "[[idea-loop-cli]]", "[[skills-no-tool-commands]]", "[[skill-body-limit-backlog]]"]
---

# skill 文件的结构检查

> #341 存在：#340 刚把 idea-loop 的 52 份主文件压到 4500 字以内，可是能拦住它们再长回去的只有 4 份逐份写的测试，review 也看不到一个 PR 让主文件多了多少字。对着 `release/idea-loop-0.2.0` 的 `f12f7edc`（2026-11-22）查，详情在「问题陈述」。

## 问题陈述

### 1. 字数线只守着几份文件，增长没人看见

idea-loop 有 36 份 SKILL.md、16 份 agent 定义。#340 重写后主体（量法照仓库 `AGENTS.md`「要点」第一条）最长 4497（`writing-for-agents`），13 份超过 4000。

守着字数的只有 `implement`、`implementer`、`pr-review`、`design-modeling` 四个 `*-slim-doc.test.mjs`，每份各写一遍上限；其余 48 份没人量。线也有三个说法：`writing-for-agents` 的核对表和这几个测试是 4500，仓库 `AGENTS.md`、`REVIEW.md`「额外要求」和 `dyna test skill-doc`（`dyna/internal/skilldoc/skilldoc.go` 的 `MaxBodyChars`）是 5000。

增长谁也看不见：`implement` 的主体从 10-14 的 3885 字涨到 11-13 的 9589 字，中间约 25 个功能提交每次内联一个分支，单看哪个 diff 都合理（[[skill-rewrite]]「问题陈述」1）。review 时没人报「这个 PR 让哪份主文件多了多少字」。

### 2. 行内 `gh` / `git` 命令清一次还会长回来

[[skills-no-tool-commands]] 定了 skill 和 agent 定义里适配层以外不写行内 `gh` / `git` 命令，#340 清了一遍。现在 `idea-loop/skills`、`idea-loop/agents` 的 `.md` 里还剩 28 处，集中在适配层（`issues/references/github.md` 8 处、setup 的两份模板各 5 处）。新写进来的没人拦。

### 3. retro 把能做成检查的纠正写成文字

`retro` 第 3 节的落点表里「能机械判定 → 优先做成检查」是第三行，跟另外两行并列，也没说做成检查后原来那段文字怎么办。Harold 在 #137 第二条 idea-loop 评论里给的方向：反复出现的纠正做成检查，文字删掉。

### 4. 全量测试在哪跑，三处说法对不上（并进的 #376）

仓库没有 `.github/workflows`，PR 上从来没有检查（PR #371 上 `gh pr checks` 回「no checks reported」）。`REVIEW.md`「验证命令」第 5 行写「写代码时常跑前两条，提交前跑全量」；`idea-loop/agents/implementer.md` 第 39、46 行写「全量交给 CI」；`pr-review` 的 `references/review-standards.md` 第 90 行写「PR 上没有检查时，全量测试照旧本机跑」。上面两类检查要靠全量跑到，在哪跑得先定。

## 杠杆诊断

改四处给 agent 读的文字，其余是 `dyna` 命令和测试。

- **`dyna spec skill-lint --hook` 的报错**（读者：刚写完 skill 或 agent 定义的会话，PostToolUse 把 stderr 交给它）。引导词：报错只说事实（哪份文件、多少字、线多少；哪一行写了什么命令）和下一步「调 `idea-loop:writing-for-agents` 精简这份文件」，不写具体修法：挪进 references 是最常见的一种，但不是唯一的（Harold 2026-11-22：「并非完全一定是将分支移动到reference」）。验证：检查，命令的测试钉住报错里有 `idea-loop:writing-for-agents`、没有「references」。

- **retro 第 3 节**（调用方：`issue-session` 收尾、人说「retro 一下」；每次都读这一节）。引导词：先判「能不能做成检查」，能的落点是检查，「新文」写删掉原文字；用正向写法写目标行为。验证：判不了：没有一次历史 retro 把可机械判定的纠正写成文字的决策点可回放；文档测试钉住第一步是这一判。
- **pr-review 的 `references/run-a-round.md`「机械检查」**（只在跑一轮时读）。步骤：命令清单多一条增长报告，结果原样进 `checks.md`，不加新步骤。验证：检查，文档测试钉住清单里有这条命令。
- **仓库 `REVIEW.md` 与 `AGENTS.md`**（读者是在这个仓库里改 plugin 的 agent）。只改说法：全量在哪跑、idea-loop 的字数线以哪条命令为准。验证：不改行为，给人和 agent 读的规矩。

## 方案

改完，idea-loop 的 skill 或 agent 定义一写超线、一写进行内命令，写文件的会话当场就收到报错，调 `writing-for-agents` 精简；不经 hook 的改动由 review 每轮兜一次。review 还看得到这个 PR 让哪几份主文件变长了多少。检查都落在 `dyna` 命令里，不新写 `.mjs`。

| 检查 | 命令 | 谁触发 | 结果 |
|---|---|---|---|
| 主体字数线 4500 | `dyna spec skill-lint [文件]... [--hook] [--changed <base-ref>]`（新） | 写文件时：`hooks.json` 的 PostToolUse（Write / Edit）加 `skill-lint --hook`（Harold 2026-11-22 定「放在 hook 里做」）；兜底：`REVIEW.md`「验证命令」加一行 `skill-lint --changed origin/<基准分支>`，review 每轮对这个 PR 改到的文件跑 | 主体超过 4500：`--hook` 时退出 2、报错写到 stderr 交给会话，下一步是调 `idea-loop:writing-for-agents` 精简；不带 `--hook` 时列完全部问题退出 1 |
| 行内命令绊线 | 同上一条命令 | 同上，只对 idea-loop 插件的文件 | 行内代码以 `gh <子命令>` / `git <子命令>` 开头：报文件和行号，下一步同上（照它的命令归类改写）；适配层文件、带「坑」字的行、frontmatter 的 `allowed-tools` 行放行 |
| 主文件增长报告 | `dyna pr skill-growth <base-ref>`（新） | `run-a-round.md`「机械检查」 | 只报事实：每份变了的 SKILL.md 或 agent 定义改前、改后、差值；永远退出 0，由 Standards 轴判这次增长合不合适 |
| retro 先判能不能做成检查 | 不是命令 | retro 第 3 节 | 能机械判定的纠正，候选落点是检查，「新文」是删掉原文字 |

字数线和绊线只看一份文件、写完就能判，是 lint，照 [[idea-loop-cli]]「lint 只由自动触发器跑」放在 hook 上，skill 里不调它。增长报告要拿分支跟基准比，等一组改动做完才算得出，不是 lint，留在 review。

**hook 管 home 下所有给 agent 看的 skill 和 agent 定义，一律 4500**（Harold 2026-11-22 定：idea-loop、其他插件、项目自己的 skill 以后都放进 home，都在范围内；选「扩到 home，一律 4500」）。范围按位置认：被写的文件在 home 目录下（`dyna home` 认的那个），是 `skills/**/SKILL.md` 或 `agents/*.md`，搬进来就自动纳入。搬进 home 之前的过渡：harold-skills 里带 `.claude-plugin/plugin.json` 的插件根下的同类文件也算。别的文件静默放行。已经超线的存量（2026-11-22 量：harold-skills 其他插件 11 份里 3 份超，如 `content-creator/thumbnail-gen` 15224 字；TOFEL-demo 自己的 20 份里 18 份超，如 `.claude/skills/announcement/SKILL.md` 29736 字）不豁免：哪次改到它，hook 就报，会话照报错调 writing-for-agents 把它精简到线内。绊线只管 idea-loop 插件的文件：「适配层以外不写行内 `gh` / `git`」是 idea-loop 的写法规矩（[[skills-no-tool-commands]]），项目自己的 skill 不受它约束。

全量在哪跑（Harold 2026-11-22 选「不加 CI，review 每轮本机跑」）：这个仓库不加 CI。`REVIEW.md` 第 5 行改成「执行方只跑改动涉及的（前两条）；review 每轮在本机把每一条都跑一遍，全量也在这里」。插件里的说法不动：`implementer`「全量交给 CI」配合 `review-standards`「PR 上没有检查时，全量测试照旧本机跑」，对有 CI 和没 CI 的项目都成立。

一个真实例子：`writing-for-agents` 现在 4497 字。执行方用 Edit 往里加一句 20 字的话，hook 当场退出 2，会话收到「idea-loop/skills/productivity/writing-for-agents/SKILL.md 主体 4517 字，线 4500。调 `idea-loop:writing-for-agents` 精简这份文件」；它调 writing-for-agents，可能删掉一句重复的规矩，也可能把一个分支挪到指针后面，改回线内后 hook 静默。review 跑一轮时 `checks.md` 里多一行 `productivity/writing-for-agents/SKILL.md 4497 → 4499（+2）`，由审查者判这 2 字合不合适。

同一行为的其他入口：

- **目标项目自己的 skill**：搬进 home 之后受字数线管；还留在项目仓库里的（如现在 TOFEL-demo 的 `.claude/skills/`）不在范围内，只有增长报告（`run-a-round.md` 对每个项目都跑）。
- **不经 hook 的改动**（Codex、人手改、`git` 合并带进来的）：由 `REVIEW.md` 那一行在 review 时兜住，跟 hook 调的是同一条命令。
- **其他插件**（`content-creator/thumbnail-gen` 15224 字、`happy-life/daily-coffee-oracle` 13064 字）：纳入字数线，取代 [[skill-body-limit-backlog]] 里「留作存量」的决定（2026-11-16）。本次不主动压它们，改到哪份时再由 hook 逼着精简。
- **`AGENTS.md` / `CLAUDE.md`**：不算主文件。路径规则沿用 `dyna spec skill-edit` 现有那条（`SKILL.md`、`agents/` 下直接的 `.md`），两处认的是同一个集合。
- **字数棘轮**（11-16 issue 评论：只要求不再变长）：被 4500 的线加增长报告取代。#340 做完每份都在线内，线以下的增长交给审查者判，不靠红灯。

## User Stories

只修问题，不加能力：

1. 期望行为（对应问题 1）：home 下（过渡期含 harold-skills 的插件）任何一份 skill 或 agent 定义改完超过 4500 字，写它的会话当场收到报错和下一步（调 `writing-for-agents`）；不经 hook 的超线 review 时红；review 的机械检查列出这个 PR 让哪几份主文件变长了、各多少字。
2. 期望行为（对应问题 2）：有人往 idea-loop 的 skill 或 agent 定义里写了行内 `gh` / `git` 命令，写它的会话当场收到报错，报出文件和行号；不经 hook 的 review 时红。
3. 期望行为（对应问题 3）：retro 遇到能机械判定的纠正，候选的落点是检查，「新文」是删掉原来的文字。
4. 期望行为（对应问题 4）：`REVIEW.md` 说清全量在 review 每轮本机跑，跟插件里的说法不再冲突。

## 实现决策

- **基准分支**：`release/idea-loop-0.2.0`（#340 已合入，`f12f7edc`）。一条分支、一个 PR，开到集成分支。
- **`dyna spec skill-lint [文件]... [--hook] [--all <插件根>]`**：放在 `dyna/internal/spec`（这个模块已经有管 skill 改动的 `skill-edit`），量法复用 `skilldoc.BodyChars`。线 4500 写在这条命令里，只此一处（Harold 2026-11-22 选 4500）。`--hook` 从标准输入读 PostToolUse 事件取被写的文件，范围见「方案」，有问题退出 2、报错写到 stderr，没问题或不在范围内静默，回话方式照 `design lint --hook`；版本不对时照 [[idea-loop-cli]] 不拦，只在 stderr 留一行。`--changed <base-ref>` 只查 `<base-ref>...HEAD` 里改到的、在范围内的文件，列完全部问题退出 1，供 `REVIEW.md` 兜底；只查改到的，是为了跟 hook 同一个口径（改到才逼精简），存量不会让每个 PR 都红。报错格式：`<文件> 主体 <n> 字，线 4500。调 idea-loop:writing-for-agents 精简这份文件`；`<文件>:<行> 写了行内命令 <命令>。调 idea-loop:writing-for-agents，照它的命令归类改写；确实是坑就在同一行标「坑」`。不写「挪进 references」这类具体修法。绊线的放行清单写在命令里，逐个列出适配层文件并写明理由（`issues/references/github.md`、setup 的 `issue-tracker.md`、`preflight-table.md`、`development.md`；以当时的树为准），判据照 `no-project-leak.test.mjs`、`runtime-tripwire.test.mjs`；`dyna …` 不扫，归登记表的扫描测试管。登记表的调用方标 hook 与 `REVIEW.md`。
- **线只写一处**：`skilldoc.MaxBodyChars` 和 `dyna test skill-doc` 的字数那条去掉，`skill-doc` 只留小节指针的核对。四个 `*-slim-doc.test.mjs`，以及 `design-archive-skill-doc`、`cover-skill-doc`、`og-skill-doc` 里量主体字数的断言删掉，其余断言留着。`AGENTS.md`「要点」和 `REVIEW.md`「额外要求」里的「< 5000」改成「线 4500，`dyna spec skill-lint` 在写文件时和 review 时核」，所有插件一样。
- **`dyna pr skill-growth <base-ref>`**：放在 `dyna/internal/pr`。对 `<base-ref>...HEAD` 里变了的每份 SKILL.md 和 agent 定义输出改前、改后、差值；新增的改前记 0，删掉的改后记 0，没变的不列，参考文件不列。永远退出 0。`run-a-round.md`「机械检查」列上它。
- **retro 第 3 节**：落点表之前加第一步「先判能不能机械判定」；能的，落点是检查（`dyna` 的护栏或仓库测试），「旧文 / 新文」写成删掉那段（或收成一句指向检查报错的话），「验证」写检查名并先在历史错误上看它红（现有写法）；不能的再按问题出在哪选落点。表里「能机械判定」一行删掉。
- **版本**：改了 `dyna/` 就照 `DEVELOPMENT.md`「命令行 dyna」升 dyna 版本（现在 0.0.5）、存登记表。`hooks.json` 开始写 `dyna spec skill-lint --hook`、`run-a-round.md` 开始写 `dyna pr skill-growth`，`idea-loop/dyna-version` 下限要提到那一版；那一版必须已发布（`scripts/dyna-scan.test.mjs` 守着），发不发、什么时候发由人定。插件 `plugin.json` 升 minor：写 idea-loop 文件时多一个 hook、review 的机械检查多一条、retro 的落点判法变了，是流程行为的改动。
- **已知限制**：
  - 改一份已超线的存量文件，哪怕只改一个字，也要先精简到 4500 才不再报；这是 Harold 选的口径。
  - 还没搬进 home 的项目 skill 不在范围内。
  - hook 每次 Write / Edit 都跑：精简途中文件还超线时，每改一次都会报一次，改回线内才静默。
  - hook 只在 Claude Code 会话里触发；其余改动靠 review 兜底，这个仓库没有 CI（Harold 选的）。
  - 增长报告不判对错，增长该不该挪走靠 Standards 轴判。
  - retro 的改动没有回放用例可验，靠文档测试钉位置；skill 改动的评测整体在 #456。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到（`go test`）：`spec skill-lint` 的量与扫描、放行规则、`--hook` 的范围判定（home 内外、过渡期的插件根、绊线只对 idea-loop）；`--changed` 只查改到的；`pr skill-growth` 的计算（新增、删除、没变、参考文件不算） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 碰到：两条新命令的输出形状与退出码、`--hook` 的回话（退出 2、stderr）、登记表多两条命令（登记表测试守着）、`hooks.json` 多一行 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 见「杠杆诊断」各处的「验证」 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：两个。`dyna` 命令本身（起子进程调编出来的二进制，读输出和退出码，照各模块的 `cmd_test.go`）：抓得到判错、算错、报错没有下一步；漏掉的是 review 有没有真的跑它。插件文档树（现有文档测试读 `skills/` 文本）：抓得到 `run-a-round.md` 清单缺命令、retro 第 3 节第一步不对。
- **增量功能测试**：
  1. 前置：夹具 idea-loop 插件根里一份 SKILL.md 主体 4501 字。步骤：把它的路径包成 PostToolUse 事件喂给 `dyna spec skill-lint --hook`。期望：退出 2，stderr 有文件、4501、线 4500 和 `idea-loop:writing-for-agents`，没有「references」；改到 4500 静默退出 0。同样 4501 字的文件放在夹具 home 的项目 `skills/` 下：同样退出 2；放在 home 外、没有插件根的 `.claude/skills/` 下：静默退出 0。别的插件里写了行内 `gh` 命令：不报。覆盖：期望行为 1。
  2. 前置：一个分支在基准上把一份 SKILL.md 加了 300 字，新增一份 agent 定义，改了一份参考文件。步骤：`dyna pr skill-growth <base>`。期望：列两行（SKILL.md +300，agent 定义 0 → N），参考文件不列，退出 0。覆盖：期望行为 1。
  3. 前置：夹具 SKILL.md 正文一行写 `` `gh issue view 1 --comments` ``。步骤：`dyna spec skill-lint --hook`（喂这份文件的事件）。期望：退出 2，报文件和行号；同一行加「坑：…」，或文件在放行清单里，退出 0。覆盖：期望行为 2。
  4. 前置：本分支的 `idea-loop/`。步骤：`dyna spec skill-lint idea-loop/skills/*/*/SKILL.md idea-loop/agents/*.md`。期望：退出 0（现有 52 份都在线内、剩下的行内命令都在适配层）。覆盖：期望行为 1、2。
  5. 前置：改后的 `retro`、`run-a-round.md`、`REVIEW.md`。步骤：对应的文档测试。期望：retro 第 3 节第一步是「能不能机械判定」；清单里有 `dyna pr skill-growth`；`REVIEW.md` 第 5 行写全量在 review 本机跑。覆盖：期望行为 3、4。
- **照着谁写**：`spec skill-lint` 的 `--hook` 照 `design lint --hook` 及其测试，量法照 `skill-doc`；`pr skill-growth` 照 `dyna pr diagnostics filter`；绊线判据照 `no-project-leak.test.mjs`、`runtime-tripwire.test.mjs`。

## Out of scope

- spec 的「杠杆诊断」一节与它的检查：#451（Harold 2026-11-22 定）。
- skill 改动的评测（「验证：」行、回放 runner 的 `goal` 用例、落地时核用例、`AGENTS.md` §5）：#456（Harold 2026-11-22 定另开）。
- 给这个仓库加 CI：不做（Harold 2026-11-22 定）。
- 把已超线的存量（其他插件 3 份、项目 skill）主动压到 4500：改到时由 hook 逼着做。
- 其他插件和项目 skill 的行内命令绊线。

## 关联

- 决定记录：[[341]]。
- [[skill-rewrite]]（#340，已合入集成分支）：清一次存量、定 4500 线；这里加常驻检查。
- [[idea-loop-cli]]（#339）：检查落在 `dyna` 命令、登记表的做法照它。
- [[skills-no-tool-commands]]（#356，随 #340 关）：绊线的放行判据出自它的「方案」。
- [[skill-body-limit-backlog]]（#137）：拆出本 issue 的地方；它「其他插件留作存量」的决定被本 spec 取代。
- #376（已关，并进本 issue）、#451（spec 结构）、#452（PR 结构）、#456（skill 评测）：没有重叠。
