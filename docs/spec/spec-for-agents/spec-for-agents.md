---
type: spec
tags: [idea-loop, to-spec, spec-structure]
summary: spec 只给下游 agent 读，照 Matt 的七节写；人读的现状→目标→要你定挪到会话
issues: [451]
changes_agent_docs: true
related: ["[[451]]", "[[skill-change-verify]]", "[[skill-structure-checks]]", "[[evidence-forms]]"]
---

# spec 只给下游 agent 读，人读会话

## 问题陈述

`idea-loop:to-spec` 的模板把 spec 的读者定成人（「读者清楚方向和高层设计，不清楚实现细节，要快速看懂问题、看到证据、做出决定」），同时又要下游 agent 照它做。模板骨架取自 mattpocock/skills 的 to-spec（`idea-loop/README.md` 第 4 行注明来源；Matt 那份写完直接打 `ready-for-agent`，只给 agent），三个月里在上面加了给人看的东西：开头每个 issue 一行判词、复现图、「根因」小节、方案开头的时序图、后端 / 前端内部子小节、User Stories 树、各处照 `idea-loop:evidence` 写。

结果（2026-11-24 对着 `release/idea-loop-0.2.0` 的 `5ef9a09a` 量 15 份 spec，UTF-8 字符数）：一份 4000–20500 字，最长 `idea-loop-cli` 20536 字；「方案」占全部字数 34%、「实现决策」19%、「问题陈述」16%、「测试决策」15%。人要的三件事散在第一、三、五节：现状在「问题陈述」，目标在「方案」开头，要人定的题在「实现决策」的「待定」里。例：`evidence-forms`（#438）12787 字，人要从第 13 行读到第 175 行才拼出这三件事。

可是人每次拍板都发生在会话里（triage 会话把题摆给人、人答、答案写进 spec），人不回头通读 spec。spec 里给人看的部分，按节名在插件和 `dyna` 里查过，没有下游 agent 读：

| 现在 spec 里的 | 谁在读 |
|---|---|
| 开头判词 `> #<号> 存在：…` | `dyna` 的 `Verdicts` 解析它，唯一调用者 `AllAbsent` 没有任何地方调用 |
| 复现图、选项配图 | 没有 agent 读图 |
| 方案开头的时序图 | 没有；PR 描述的时序图由 `idea-loop:pr` 自己画 |
| 「后端」「前端内部」子小节 | 没有 |
| User Stories 树 | 没有；被引用的是编号（目标用例的 `goal_from`、review 引 spec 原文） |

另有一处缺口：改 skill 的 spec 要有「杠杆诊断」（每处改动一行「验证：」，`to-ticket` 照抄），没有检查拦。15 份里只有 3 份有；`evidence-forms`（#438，重写了 `evidence/SKILL.md`）、`skills-read-home`（#333，改了一批 skill）都没有。

## 方案

spec 只给下游 agent（切工单、探路、实现、review）读，照 Matt 的七节写成中文：问题陈述、方案、User Stories、实现决策、测试决策、Out of scope、关联。人读的是会话：to-spec 交 spec 时在会话里写一段「现状 → 目标 → 要你定」，照 `idea-loop:evidence`。这个顺序跟 #452 的 PR 描述一致（共享笔记 `451-452-align.md`）。

模板每节保留和删掉的（Harold 2026-11-24「照表定」）：

- **留**：「方案」下的「前端交互」子小节（`uiux-imagine`、`uiux-refine`、designer 读，`dyna` 按它判断碰不碰 UI）；同一行为的其他入口（纳入还是排除）；开头的 `> 需要 grill` 与「实现决策」里的「待定」小节（`dyna issues set todo` 核它们清零）；「测试决策」的 seam 与「照着谁写」（`to-ticket`、`tdd`、implementer 读），测试表只写这次碰到的行；「杠杆诊断」（改 agent 文档时）；Out of scope；关联。
- **删**：开头判词；复现图（问题陈述只写文字现状和复现材料路径）；「根因」小节（并进问题陈述的文字）；方案的时序图；「后端」「前端内部」子小节；User Stories 树（留编号列表）；spec 里的 evidence 写法要求。

机械检查：`dyna spec check` 加两条结构规则，写 spec 时由 PostToolUse hook 触发（Write/Edit 到 `docs/spec/<slug>/<slug>.md`），to-spec 开工时的全量跑也报：

1. 七节都在、按上面的顺序（「杠杆诊断」可插在任意两节之间）。
2. frontmatter 有 `changes_agent_docs: true` 的，要有标题为「杠杆诊断」的一节（`##` 或 `###`）。

评测：`idea-loop/evals/to-spec/` 下 5 个标注样本，分两组（Harold 2026-11-24）。

- **样式组**：历史上调 to-spec 的现场，重放看产出合不合新定义（七节、没有给人看的图和判词、该有「杠杆诊断」的有）。
- **好用组**：下游 agent 因 spec 有错有漏而返工的现场，看新 spec 还会不会让它返工。

同一行为的其他入口：

- `idea-loop:issue-session` triage 会话起草后交给人：纳入，走 to-spec 交 spec 的那段话。
- todo 会话自己起草 spec（夜里、人不在）：纳入，那段话写进停下时的最后一段回复，人回来读。
- `seo-brief` 起草内容类 SEO spec：纳入，同一模板；brief 的配图属于文章内容，照旧放 spec 目录的 `assets/`。
- `idea-loop:pr` 写 PR 描述时取 spec「问题陈述」当素材：纳入，不改；PR 描述的结构归 #452。

## User Stories

样式与检查

1. 作为切工单的 agent，我想要每份新 spec 都是同样七节、同样顺序，以便按节名找到要的内容。
2. 作为 to-spec，我想要写完 spec 时 hook 立刻报出缺节、顺序错、改 agent 文档却没「杠杆诊断」，以便当场补上。
3. 作为写新 spec 的 agent，我想要模板里没有判词、复现图、时序图、story 树的要求，以便篇幅只花在下游要读的内容上。

人读会话

1. 作为 Harold，我想要 spec 交到我面前时会话里有一段「现状 → 目标 → 要你定」，以便不读 spec 就能拍板。
2. 作为 Harold，我想要夜里起草的 spec 在会话最后一段回复里同样有这一段，以便回来时直接读它。

评测

1. 作为维护 to-spec 的人，我想要改了 to-spec 就能对着 5 个标注样本改前、改后各跑一遍，以便看出 spec 样式和对下游的可用性有没有变好。

## 实现决策

- **起点是集成分支 `release/idea-loop-0.2.0`**：#280（home 固定文案）、#438（evidence 按形态）、#341（`skill-lint`）已合入。PR 的 base 是集成分支。
- **to-spec 正文**：读者改成下游 agent；模板换成七节中文版，每节一行「给下游什么」，保留项照「方案」。第 3 步探代码时照 `idea-loop:evidence` 的「证据是什么」核现状（现状要对，下游照它找代码），不再照它写给人看。第 5 步改成「交 spec」：在会话里写现状 → 目标 → 要你定（题的写法照 `idea-loop:decision-rules`「要人定的写成一道题」，证据照 `idea-loop:evidence`），再列还剩的「需要 grill」「待定」。主体守 4500 字线（`skill-lint`）。
- **to-spec 的 references**：删 `figures.md`、`issue-verdicts.md`、`plan-subsections.md`（「前端交互」那一行并进模板）；`agent-docs.md` 加一句「frontmatter 写 `changes_agent_docs: true`」。`raw-template.md`、`land-on-main.md` 不动。
- **issue-session 的 `references/draft-spec.md`**：删「结论行」一节，保留「起草时发现已被做掉就翻 canceled」；自校验第 2 条去掉「标题下有结论」，第 3 条复现写进问题陈述的文字，第 5 条期望行为编号对问题陈述的小节。
- **issue-session 正文 triage 第 2 步**：「几句话告诉人」改成指到 to-spec 第 5 步交 spec 的那段话。
- **home 固定文案**（`setup/references/home-rules.md`）：「在交付物（spec、PR 汇报、停下汇报）里列进『已按规则处理』」改成「交 spec 的那段话、PR 汇报、停下汇报」。依据：Harold 2026-11-24「spec 只给 agent」，已按规则处理是给人看的。setup 下次写 home 时生效。
- **evidence 的 description**：「（对话、spec、PR）」改成「（对话、交 spec 的那段话、PR）」。
- **evidence 组两个样本的停点**：`spec-option-goal-figure`（#65）、`example-from-real-material`（#68）的题问「spec 里要人定的那道待定题…」，改问「交 spec 时会话里摆的那道题…」，`stop_at` 改成「交 spec 的那段话写完」；题的原话不变。依据：题对的是人当时读到的东西，现在人读的是会话。
- **`dyna`**：`spec check` 加两条结构规则和 `--hook`（照 `spec skill-lint --hook`：PostToolUse 事件从标准输入读，不在范围内或干净时静默，有问题退出码 2、报错写 stderr，报错写缺什么和下一步「照 `idea-loop:to-spec` 的模板补」）；`hooks.json` 的 PostToolUse `Write|Edit` 加一行。删 `Verdicts`、`AllAbsent` 及其测试。15 份存量 spec 七节齐、顺序对（已查），全量跑不会多报；存量不迁移。升 `dyna/internal/version/version.go` 一档（合入时取集成分支上的下一档）。
- **「杠杆诊断」只在写 spec 时核**：Harold 2026-11-24「先只在to-spec加」；review 时不按实际改动兜底。已知限制：to-spec 漏写 `changes_agent_docs` 时漏检。
- **标注样本**：加进仓库 `AGENTS.md` §5 已有的「标注样本」一条（原文点名「#451（to-spec）……往这一条里加自己的一组（`idea-loop/evals/to-spec/`）……不另写例外」），格式与 runner 同 evidence 组（`case.json` + `sample.md` + `annotations.md`，`retro-replay.mjs --cases-root idea-loop/evals/to-spec`）。五个现场：
  - 样式组 `skill-change-has-diagnosis`：#438 起草 evidence-forms（`957553fe` 之前），改了 skill，题：「有没有『杠杆诊断』、frontmatter 有没有 `changes_agent_docs: true`？」
  - 样式组 `ui-spec-shape`：#65 起草设计档案滚动段（`1444794` 起，输入同 evidence 组的 `spec-option-goal-figure`），碰 UI，题：「有没有『前端交互』，且正文没有给人看的配图和判词？」
  - 样式组 `bugfix-spec-shape`：#398 起草 dispatch-triage-per-round（`32e23d72` 之前），只修问题，题：「七节齐、期望行为编号对得上问题陈述，且没有复现图和『根因』小节？」
  - 好用组 `one-stop-point`：#379 起草 dispatch-day-night-modes（`4c49b35b` 之前）；PR #382 review 第 1 轮 S2 发现 spec 前后两处说法不一致，Harold「第二件 统一」（`docs/raw/decisions/379.md` 题 8）。题：「夜里会话做到哪一步停，spec 里只有一种说法吗？」
  - 好用组 `guard-four-covered`：同一现场，S1 发现 spec 只列夜里停的五类事、漏了护栏四样，Harold「第一件 我选择A」（题 7）。题：「夜里要停的事，spec 有没有把护栏里的四样也列进去？」（Harold 2026-11-25 定删掉：改前的插件已把四样列全，测不出改动；组里剩四个）
- **`plugin.json` 升 minor**：模板结构变了、新增一组评测样本（档位规则见 `REVIEW.md`「额外要求」）。

## 杠杆诊断

改五处给 agent 读的文字，其余是 `dyna` 命令和测试。

- **to-spec SKILL.md**（调用方：issue-session 起草、seo-brief、人直接调；每次读全文）。信息层级：读者从人改成下游 agent，模板每节只写「给下游什么」；剪枝：删判词、复现图、时序图、story 树、后端 / 前端内部；步骤：第 5 步交 spec 的那段话写成一步，完成条件「会话里有现状、目标、要你定，还剩的标记都点了名」。验证：样式组三个样本（回放：`skill-change-has-diagnosis`、`ui-spec-shape`、`bugfix-spec-shape`）；结构部分另有检查 `dyna spec check`，先在 `evidence-forms` 上见红（它改了 skill、没有「杠杆诊断」，补上 `changes_agent_docs: true` 后报错）。
- **to-spec 的 `references/agent-docs.md`**（只在改 agent 文档时读）。步骤：多一步写 frontmatter 标记。验证：检查，`dyna spec check` 的测试钉住有标记没「杠杆诊断」退出 2。
- **issue-session 的 `references/draft-spec.md` 与正文 triage 第 2 步**（triage 会话每次起草读）。剪枝：删「结论行」；上下文指针：交给人的那段话指到 to-spec 第 5 步，不复述。验证：好用组两个样本（回放：`one-stop-point`、`guard-four-covered`）；文档测试钉住 draft-spec 里没有「结论行」、triage 第 2 步指到 to-spec。
- **home 固定文案 `home-rules.md`「已按规则处理」一句**（每个会话开场注入）。只改交付物名单。验证：不改行为，「已按规则处理」本来就在人读的地方写，名单换成人现在读的那几处。
- **evidence 的 description 与两个样本的停点**。只改说法和题的对象。验证：不改行为；样本的题从人原话写出，原话不变。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `dyna spec check` 的两条结构规则、`--hook` |
| LLM 输出质量（prompt 改动） | 标注样本回放 | 见「杠杆诊断」各处的验证 |

- **seam**：两个。`dyna` 命令本身（起子进程调编出来的二进制，读输出和退出码，照 `spec` 模块的 `cmd_test.go`）：抓得到缺节、顺序错、标记没诊断、hook 范围判错；漏掉 to-spec 漏写标记。插件文档树（现有文档测试读 `skills/` 文本）：抓得到模板里还留着被删的要求、draft-spec 还有结论行。
- **增量功能测试**：
  1. 前置：夹具 spec 七节齐、顺序对。步骤：PostToolUse 事件喂 `dyna spec check --hook`。期望：静默退出 0；调换「方案」「User Stories」后退出 2，stderr 写顺序错和「照 `idea-loop:to-spec` 的模板补」。覆盖：样式与检查 1、2。
  2. 前置：夹具 spec frontmatter 有 `changes_agent_docs: true`、没有「杠杆诊断」。步骤：同上。期望：退出 2，报缺「杠杆诊断」；加上 `### 杠杆诊断` 后退出 0；去掉标记、也没有这一节时退出 0。覆盖：样式与检查 2。
  3. 前置：写到 `docs/raw/` 下的文件、写到 `docs/spec/<slug>/tickets/` 下的工单。步骤：同上。期望：都静默退出 0。覆盖：样式与检查 2。
  4. 前置：本分支的 `docs/`。步骤：`dyna spec check docs`。期望：15 份存量和本 spec 都不报结构问题。覆盖：样式与检查 1。
  5. 前置：改后的插件文档。步骤：文档测试。期望：to-spec 模板七节、没有「判词」「时序图」「story 树」「根因」的要求，第 5 步有现状 → 目标 → 要你定；三份 references 已删；draft-spec 没有「结论行」。覆盖：样式与检查 3、人读会话 1、2。
  6. 前置：`idea-loop/evals/to-spec/` 五个样本。步骤：`retro-replay.mjs --cases-root idea-loop/evals/to-spec`，改前用集成分支的插件、改后用本分支。期望：五个都跑出判定，人在各自的 `annotations.md` 标注；`AGENTS.md` §5 的检查（`scripts/root-agents-annotated-samples.test.mjs`）认这一组。覆盖：评测 1。
- **照着谁写**：`--hook` 照 `spec skill-lint --hook` 和它的测试；样本照 `idea-loop/evals/evidence/cases/`；文档测试照 `idea-loop/scripts/to-spec-by-deliverable-doc.test.mjs`（它钉着被删的 references，要改）。

## Out of scope

- PR 描述与 review 汇报的结构：#452。
- review 时按 PR 实际改动兜底核「杠杆诊断」：Harold 定先不做。
- 15 份存量 spec 改成新结构：不迁移，它们覆盖的 issue 多数已完成。

## 关联

- 决定记录：[[451]]。
- 相邻：#452（triage，PR 结构，顺序跟本 spec 的「交 spec 的那段话」一致，共享笔记 `451-452-align.md`）；#456 已合（「验证：」行与目标用例，本 spec 照它写杠杆诊断）；#341 已合（`skill-lint` 与 4500 字线，「杠杆诊断」检查从它挪来）；#438 已合（evidence 组样本，本 spec 改其中两个的停点）。都没有重叠的改动，本 spec 在它们之后。
- #488（回放没隔离文件系统）：影响样本回放的改前改后可比性，跑样本时注意，不在这里修。
