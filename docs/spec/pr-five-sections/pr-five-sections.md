---
type: spec
tags: [idea-loop, pr, pr-review, evidence, home, evals]
summary: PR 描述改成问题、概要、证据、合并风险、要你做的事五节，evidence 照 show-me 出视图菜单
issues: [452]
changes_agent_docs: true
related: ["[[452]]", "[[evidence-forms]]", "[[edge-case-known-limit]]", "[[skill-structure-checks]]"]
---

# PR 描述只写五节：问题、概要、证据、合并风险、要你做的事

## 问题陈述

### 1. PR 描述太长，人要读很久才找到现状、目标和要做的事

`idea-loop:pr` 规定的 PR 描述有十节（一句话、问题、怎么修、怎么验证、能否回滚、上线自查的网址、夜里替你定的、等你定的、要你做的事、参考），每节都写满。2026-11-24 对着 GitHub 上的 PR 正文量（UTF-8 字符）：

| PR | 总字数 | 折叠区 | 折叠区外 |
|---|---|---|---|
| harold-skills#432 | 9705 | 4628 | 5077 |
| harold-skills#387 | 9262 | 0（参考没折叠） | 9262 |
| harold-skills#426 | 8450 | 4944 | 3506 |
| harold-skills#458 | 5515 | 2064 | 3451 |

一半是折叠的「参考」；真正要读的是折叠外 3500–9000 字、六节，「现在是什么样」散在「问题」里，「改完是什么样」散在「怎么修」里，没有改前改后对比；最近 80 个已合并 PR 里画了时序图的 0 个（旧格式要求后端放时序图）。

### 2. 「要你做的事」里混着跟合并无关的东西

最近 80 个已合并 PR 里带这一节的 14 个（2026-11-25 查）：只「说合并」5、合并前只有人能验的 2（#482 录屏、#484 真机交出）、合并后要人做的 4、术语表缺词问要不要 grill 4（每次都写「不挡合并」）、夜里替你定的 2、还没批的决定题 0。

### 3. 夜间两节重复 review loop 文件

「夜里替你定的」写的每一题，`night-mode.md` 已规定作为批示记进 review loop 文件、合并时随归档评论贴出；「等你定的」最近 200 个 PR 里出现 0 次。

### 4. 给人看的证据怎么选，没有按「要讲清什么」的菜单

`idea-loop:evidence` 的「证据的几种形态」只列采集来的形态（截图标注、UI 流程图、图表、动图、录屏、表），没有代码形状的视图（伪代码、调用树、文件树、diff）；pr 与 evidence 的分工也没写清，PR 描述里证据写成什么全凭各会话自己判断。

### 5. review 汇报的格式写在 pr 里，跟别处要人定的题各写一套

`pr/references/review-report.md` 自定一套「现状 · 对用户的影响 · 证据 · 选项 · 推荐」；triage 会话摆题、实现卡住停下、交 spec 的那段话照的是 home 固定文案「要我定的事写成一道题」。同一类东西（给人的、要决策的内容）两处写法。

### 6. 没有样本能看出一份 PR 描述写得好不好

`idea-loop/evals/pr/` 不存在；AGENTS.md §5「标注样本」已点名 #452 往这一条里加 `idea-loop/evals/pr/`。

### 根因

pr 的格式按「每个写入方各写一节」长出来，没有一个「读者要什么」的上限；证据写法没有菜单，各会话各写各的。

## 方案

以 Matt Pocock 的 pr skill（Summary / Evidence / Merge Danger，Summary 的视图清单取自 Humanlayer 的 show-me）为底，按 Harold 在 #452 会话里逐块定的（`docs/raw/decisions/452.md` 题 1–27）改成五节，并用 5 个真实 PR 跑了四轮样本收敛（`idea-loop/evals/pr/rounds/`，第四轮去掉代码块后 1486–2263 字）。

**PR 描述的模板**（草稿已在 `idea-loop/skills/engineering/pr/references/description.md`）：

| 节 | 写什么 | 规矩 |
|---|---|---|
| 问题 | 一两句现状和为什么改 + 一个视图证明问题真实发生过、有多常见 | 视图取自真实发生过的事，带出处和数字 |
| 概要 | 一句短文字 + 视图画这次改了什么 | 最多两个视图；可写路径、命令名、函数名；人定的事让方案多做的一块画在这里；没有对应问题的改动（搬文件、重构、为方案才做的）画在这里 |
| 证据 | 之前 / 之后：同一个操作在基准分支和本分支各做一遍，之前看到问题、之后问题没了；问题几件就几组 | 只放两边都真做过的组；没复现的合进末尾「没验成」一行；没有对应问题的改动只写一行「行为没变：同一个操作两边结果一样」；测试写成伪代码，全量只写结果；不放 review 轮次 |
| 合并风险 | 门（双向 / 单向，单向写清退不回的部分）、影响面（一个词 + 可选说明）、要特别注意的（迁移、兼容约束、刻意没做的，最多 3 条） | 人定的事带来的风险写在这里；顺带开的 issue 不写 |
| 要你做的事 | 合并前只有你能验的、合并后要你做的（复选框），末尾「说『合并』即可」 | 要人跑的命令放代码块 |
| 上线自查的网址 | 只 `type:seo/*` 的 PR | 照旧 |

通用的：不写开场白，文字短，像人对人说话，不超出模板；叫法用 `GLOSSARY.md`；代码叫法（提交号、函数名、文件路径、接口地址）只在概要，人自己会敲的名字（skill 名、斜杠命令、dyna 命令名）各节都能写；已经定了的事不进描述（人批的在 review loop 归档评论里，Claude 定的不写），它改变的东西照常写；五节之外只留每个关联 issue 一行 `Refs <owner>/<repo>#<号>`，不加署名行；删掉一句话、怎么修、怎么验证、能否回滚、参考、夜里替你定的、等你定的。

**pr 与 evidence 的分工**：照拆工单与 tdd 的关系。pr 只写每节要讲清什么，写之前用 Skill 工具调 `idea-loop:evidence`；evidence 开头照 show-me 那句（帮人看懂，不写开场白，挑最小的视图），一份视图菜单按「要讲清的是什么」排（代码形状视图 + 采集来的形态 + 频率），摆法照 show-me 的指引。草稿已在 `idea-loop/skills/productivity/evidence/SKILL.md`。不复制进 pr（Matt、visual-pr 都是复制，因为 show-me 不许模型调用；我们的 evidence 能调）。

**pr-review 的两样交付**：PR 描述归 `idea-loop:pr`；会话里要人决策的内容（一道题 = 问题 · 选项 · 推荐，加「已按规则处理」）写法归 home 固定文案，扩写 `setup/references/home-rules.md` 已有的「要我定的事写成一道题」。review 自己的部分（S / C 编号、折叠区放什么、review loop 文件、归档）挪进 pr-review。

**写的那一刻的保底**：模型可能不调 evidence（#438 回放样本 option-current-state-shown 两次改后都没读改动的文件），所以 `dyna pr body set` 写入时机械检查结构，问题、证据节没有视图时拒写并在输出里打印 evidence 的视图菜单；review 的要人决策内容经 `dyna pr candidates submit` 同样拒收。

同一行为的其他入口：
- 纳入：`idea-loop:implement`（开工补 `reference`、停下更新执行记录）、`idea-loop:pr-review`（交报告写各节、合并前核要你做的事、SEO 自动合并读 `live-check`）、issue-session 夜间模式、issue-dispatch 早上汇总（读 PR 描述里的审核结论和「夜里替你定的」条数）。
- 排除：已合并 PR 的旧描述不迁移；`dyna pr body set` 碰到旧节名照旧折叠进新结构（同 `issues`、`review`、`links` 旧节的做法），不报错。

## User Stories

1. 作为 Harold，我想要打开 PR 一屏内看到问题的证据、改了什么、之前之后，以便不读细节就能决定合不合并
2. 作为 Harold，我想要证据节的之前之后是同一个操作两边各做一遍，以便一眼看出问题没了
3. 作为 Harold，我想要「要你做的事」里只有只有我能做的事，要跑的命令能直接复制，以便照着做
4. 作为 Harold，我想要我定的事以评论留在 PR 上、它带来的风险写进合并风险，以便描述里不重复决策过程又不漏后果
5. 作为写 PR 描述的会话，我想要按「要讲清什么」查一份视图菜单，以便挑最小的视图
6. 作为写 PR 描述的会话，我想要写错结构时当场被拒、拒写输出里就有菜单，以便没调 evidence 也能写对
7. 作为 Harold，我想要 review 里摆给我的题跟讨论中摆的题同一种写法，以便不用切换读法
8. 作为维护 idea-loop 的人，我想要一组取自真实 PR 的标注样本，以便改了 pr 后重跑、看描述是不是还写得好

## 实现决策

- **起点是集成分支 `release/idea-loop-0.2.0`**，PR 的 base 是它。分支 `issue/452-pr-structure` 上已有两份草稿（`pr/references/description.md`、`evidence/SKILL.md`），实现在它们上面收尾，不重写。
- **`pr` SKILL.md**：description 改成只讲 PR 描述；正文的节表换成五节加 `live-check`；「Review 汇报」「在会话里给人看」「review loop 文件」三节挪走（见下）；开 draft PR 第 2 步只写 `Refs` 行和问题节的起头。`references/description.md` 用分支上的草稿；`delivery-evidence.md` 留，「之前 → 之后」改成「同一个操作两边各做一遍」。
- **`pr/references/review-report.md`**：一道题的形状并进 home 固定文案；其余（结论一句、已按规则处理、S / C 编号、合并风险一项、要你看的、折叠区内容、编号只在本次有效）挪进 `pr-review/references/`，题的写法改成照 home「要我定的事写成一道题」。**`review-loop.md`** 整份挪进 `pr-review/references/`。按 `idea-loop/AGENTS.md`「参考资料归谁」，只服务 pr-review 的归 pr-review。
- **home 固定文案 `setup/references/home-rules.md`**：扩写「要我定的事写成一道题」：一道题 = 问题（短文字 + 最小视图，用什么视图照 `idea-loop:evidence`）· 选项（各带代价、能否撤回）· 推荐和一句理由。setup 下次写 home 时生效（要每台设备升级插件、重跑 setup）。桌面端开场注入约 9700/10000 字（#471 量），home 固定文案走 home 的 `AGENTS.md`、不走开场注入，扩写前后量一次 home 固定文案字数写进 PR。
- **`evidence` SKILL.md**：用分支上的草稿（开头 show-me 那句、视图菜单、怎么摆）；节名「证据是什么」保留（#451 的 to-spec 第 3 步引用它）。description 改成「帮人看懂……有哪些视图可挑……」。原「证据的几种形态」表的守卫测试跟着改成守视图菜单。
- **`pr-review`**：`deliver.md` 按五节写（问题、概要取自 spec 与落地结果，证据取自执行方的复现，合并风险对着整个 PR 判，要你做的事收人验素材和合并后的事）；`other-directives.md`「上线前要注意的」追加进 `your-todo` 的合并后一类；`merge.md`、`seo-auto-merge.md` 读 `your-todo`、`live-check` 不变；`run-a-round.md` 指向挪过来的汇报格式。
- **`implement`**：开工不再补 `reference`、停下不再更新执行记录（工单表与执行记录留在 review loop 文件）；执行方对问题节的每一件在基准分支和本分支各做一遍同一个操作，结果写进交回，供证据节用（题 27：样本里证据缺的都出在没做这一步）。
- **issue-session `night-mode.md`**：去掉写 PR 描述「夜里替你定的」「等你定的」两处；按推荐定的只记进 review loop 文件（原有），停下的事在 issue 上留评论（`dyna issues note`，原本 PR 没开时就这么做）。
- **issue-dispatch `morning-summary.md`**：「review 结论（取 PR 描述里的审核结论）；『夜里替你定的』一节有几条」改成取 review loop 文件最近一轮的结论和按推荐定的条数。
- **`dyna pr body`**（`dyna/internal/pr/body.go` 及测试）：节名 `problem`、`outline`（概要）、`evidence`、`risk`、`your-todo`、`live-check`，顺序固定；旧节 `summary`（一句话）、`changes`、`verification`、`rollback`、`night-decided`、`night-waiting`、`reference` 写入时照「旧节折叠」的做法并入或丢弃，不报错。写入时检查，不满足退出码非 0、报错写缺什么：
  - 问题、证据节至少一个视图（图片、代码块或表），否则拒写并打印 evidence 的视图菜单（dyna 读插件里 evidence 的文件，不另存副本）
  - 概要节最多两个视图
  - 证据节「之前」「之后」成对；问题节几件，证据节几组，少的必须出现在「没验成」那一行里
  - 合并风险有「门：双向 / 单向」「影响面」两行，「要特别注意的」不超过 3 条
  - 要你做的事只有复选框和末尾「说『合并』即可」
  - 代码叫法：问题、证据、合并风险、要你做的事四节拦提交号、函数名、文件路径、接口地址；放行 skill 名、斜杠命令、dyna 命令名，以及要你做的事里的代码块
  - 不设字数线（题 19）
- **`dyna pr candidates submit`**：每道要你决定的题，问题里至少一个视图、选项至少两个、有推荐，否则拒收并打印菜单。
- **dyna 版本**：升 `dyna/internal/version/version.go` 一档（合入时取集成分支上的下一档，现在 0.0.14），重存登记表，`idea-loop/dyna-version` 下限跟着提。
- **标注样本**：加进 AGENTS.md §5 已有的「标注样本」一条（原文已点名 `idea-loop/evals/pr/`，不另写例外），格式与 runner 同 evidence 组（`case.json` + `sample.md` + `annotations.md`，`retro-replay.mjs --cases-root idea-loop/evals/pr`）。五个现场，输入是那个 PR 合并时的材料（旧描述、diff、review 归档评论；旧描述里的图从素材分支已删，取本地副本存进样本目录），`sample.md` 放四轮产出和 Harold 的批示，题从 Harold 在 #452 会话里的原话写出：
  - `tofelair-1072-frequency`（改提示词）：「问题节用频率证明提示词的问题真实存在吗？」原话：「比如提示词修改时候，就可以用统计学来表示出现问题的频率」
  - `tofelair-1137-ui`（UI）：「音频包搬家只出现在概要的 diff 里、证据里只用一行说行为没变吗？」原话：「没有对应问题的，我觉的内容理论上会在summary中的diff里面，同时之前和之后应该是不变的？」
  - `tofelair-1136-reproduce`（本机服务）：「证据节的之前 / 之后是同一个操作在两边各做一遍（开几个会话、数出题工具进程），而不是拿线上的 71 份跟合并后比吗？」原话：「比如之后就是我创建了多个claude 进程，但是只有一个toeflair mcp的进程了」「你这个71和1的属佛啊，我读下来感觉意义不大」
  - `harold-skills-387-decision-risk`（命令行）：「人在 review 里定的事本身没写进描述，它带出的兼容风险写进了合并风险吗？」原话：「问题的本质是我的决定带来的风险会写入合并风险内？」
  - `harold-skills-432-length`（skill 改写）：「读完问题、概要，说得出现在是什么样、改完是什么样、要我做什么吗？」原话（#452 正文）：「人要读很久才找到『现在是什么样、改完是什么样、要我做什么』」
- **`plugin.json` 升 minor**：PR 描述结构、review 汇报归属、evidence 都变了（档位规则见 `REVIEW.md`「额外要求」）。

## 杠杆诊断

- **pr SKILL.md 与 `references/description.md`**（调用方：issue-session 实现第 1 步开 draft、implement、pr-review 交报告；每次读全文）。信息层级：读者是决定合不合并的人，模板只留五节；剪枝：删五节以外的节和 review 汇报三节；上下文指针：视图选法指到 evidence，不复述。验证：回放 `harold-skills-432-length`、`tofelair-1136-reproduce`；结构部分另有检查 `dyna pr body set`，先在 #458 的旧描述上见红（它有「一句话」「怎么修」等旧节、证据节没有之前 / 之后）。
- **evidence SKILL.md**（调用方：pr、pr-review、triage 会话摆题、交 spec 的那段话；每次读全文）。信息层级：开头一句目的；步骤：先看清要点是哪一类再挑；菜单按「要讲清什么」排。验证：回放 `tofelair-1072-frequency`、`tofelair-1137-ui`。
- **home 固定文案「要我定的事写成一道题」**（每个会话开场在 home 的 `AGENTS.md` 里）。只把题的形状写全（问题带视图、选项带代价与能否撤回）。验证：检查 `dyna pr candidates submit` 拒收没有视图的题，先在 #458 第 1 轮 S2 的原文上见红（它的「证据」是表、能过，但改成只有文字的版本要红）；讨论中的题判不了：没有命令可挂，靠回放样本看。
- **pr-review 的 `deliver.md`、挪过来的汇报格式与 review loop**（pr-review 每轮读）。上下文指针：一道题的形状指到 home；剪枝：删 `verification`、`changes`、`rollback` 的写法。验证：回放 `harold-skills-387-decision-risk`。
- **implement 的 `start-of-run.md`、`stop-and-resume.md`，night-mode、morning-summary**。剪枝：删写 `reference`、夜间两节；步骤：执行方加「两边各做一遍」。验证：文档测试钉住这几处不再提旧节名；「两边各做一遍」回放 `tofelair-1136-reproduce`。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `dyna pr body` 的节表、旧节折叠、六条结构检查、代码叫法放行；`candidates submit` 的三条检查 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | skill 文字改动走 AGENTS.md §5 的回放与标注样本（`idea-loop/evals/pr/` 五个） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`dyna pr body set` / `dyna pr candidates submit` 的命令输入输出（抓得到结构错和拒写时的菜单，抓不到写得好不好）；回放 runner（抓得到 skill 改动有没有让产出变，抓不到没进样本的 PR 类型）。
- **增量功能测试**：
  1. 前置：#458 的旧 PR 描述存成文件。步骤：`dyna pr body set` 写进一个测试 PR 的各节。期望：旧节被折叠或丢弃，写新节时问题节无视图被拒、输出里有 evidence 的视图菜单。覆盖 6。
  2. 前置：第四轮 5 份样本描述。步骤：逐份按节写入。期望：全部通过；把 #1136 的「没验成」一行删掉再写，证据组数对不上，被拒。覆盖 1、2、6。
  3. 前置：要你做的事里有一段安装命令的代码块。步骤：写入。期望：通过；同样的路径写进合并风险，被拒。覆盖 3。
  4. 前置：改后的插件。步骤：`retro-replay.mjs --cases-root idea-loop/evals/pr` 改前改后各跑。期望：五题改前否、改后是，或人在 `annotations.md` 推翻。覆盖 1–5、8。
  5. 前置：改后的插件文档。步骤：文档测试。期望：pr 里没有 review 汇报三节，pr-review 里有；night-mode、implement、morning-summary 不再提旧节名；home-rules 的「一道题」写了问题、选项、推荐。覆盖 7。
- **照着谁写**：dyna 检查照 `dyna/internal/pr/body_test.go` 的旧节折叠用例和 `coderefs` 的测试；样本照 `idea-loop/evals/evidence/cases/`；文档测试照仓库根 `scripts/root-agents-annotated-samples.test.mjs`。

## Out of scope

- 已合并 PR 的旧描述不迁移。
- 旧 PR 描述里的图在 GitHub 上 404（素材分支合并后被删，#1137、#1136 都是）：跟 PR 结构无关，另开 issue。
- spec 的结构归 #451。
- 不设字数线（题 19）。

## 关联

- 决定记录：`docs/raw/decisions/452.md`（题 1–27）；样本过程：`idea-loop/evals/pr/rounds/`（五个 PR 四轮产出与每轮笔记）。
- #451（spec-for-agents，todo，分支 `issue/451-spec-structure`）：有重叠，两边都改 `home-rules.md`（#451 改「已按规则处理」的交付物名单，本 spec 扩写「一道题」，不同段落）和 evidence 的 description（#451 把「spec」改成「交 spec 的那段话」，本 spec 重写整句）；已在 #451 留评论（2026-11-25）和共享笔记 `451-452-align.md`。后合的在先合的基础上改，保留「交 spec 的那段话」。谁先谁后不限。
- #438（evidence-forms，已合）：本 spec 在它的 evidence 上重写形态表；它的五个样本等 #451、#452 改完再跑（#438 决定）。
- #341（skill-structure-checks，已合）：SKILL.md 4500 字线照 `skill-lint`。
