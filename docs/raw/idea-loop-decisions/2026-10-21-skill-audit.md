---
type: raw
source_type: document
captured: 2026-10-21
title: skill 审查：对照 writing-for-agents 审 23 个 skill
tags: [idea-loop, writing-for-agents, skill-audit]
related: []
---

# skill 审查：对照 writing-for-agents

2026-10-21。五个只读子代理按 writing-for-agents、agent-builder 和这一轮定下的规则审了 23 个 skill（writing-for-agents 本身没审）。下面先列跨 skill 的共性问题和真 bug，再按 skill 列明细。字符数是 `wc -m`。

## 真 bug（照着做会出错）

| skill | 问题 |
|---|---|
| grill | 工作区里的改动删掉了 `disable-model-invocation: true`，跟根 AGENTS.md「调用方式按出口定」、README 冲突；第 28–30 行新标题「提出有价值的问题是你的活」和正文对不上，第 30 行句子断了；第 62 行「确认前不动手做任何事」和第 36 行「直接去验证」打架 |
| ui-measure | 「终止条件」判到瓶颈后「停下交人」「实现问题——人来看一眼」，但用它的是不跟人对话的 implementer、ui-reviewer；implementer 第 54 行又写实现问题「接着改」，两边相反 |
| design-modeling | 「Layout」第 101 行「放 6.9」、第 222 行「按 10.2 走」指向已不存在的编号；第 313 行两处被替换成同一个节名「新建」 |
| pr-review | 「合并」第 2 步「走 §4.1」、「合并前归档」第 6 步「回到 §4 的第 3 步」都指错；「不通过」那条「按 §3 处理」应是「人批示之后」 |
| design-archive、evidence、uiux-refine | `node scripts/…` 没有 `${CLAUDE_PLUGIN_ROOT}` 前缀，在目标仓库里跑会找不到 |
| browser | 「找不到测试账号就问人」，但主要用户是不跟人对话的 subagent |
| agent-builder | 「写之前读 `/idea-loop:writing-for-agents`」：两个都只能由人调用，agent 执行不了这一步 |
| setup | 去读 `agents/pr-reviewer.md` 的「第 2 节第 3 步」找 Codex |
| tdd | 「什么时候不该用 TDD」写死了 Toeflair 的 `promptfoo`、`qa:*` |
| to-ticket | 「收工」那节切票时永远走不到（合并时才执行），还提到 dreaming 的旧名 maintain |

## 共性问题（适合一次机械清扫）

- **编号标题和 § 引用**：pr-review、implement、to-ticket、wiki-conventions、glossary、dreaming、issue-dispatch、uiux-research、setup、tdd 还在用；跨 skill 的「§2」「§2.1」「§5」「纪律 5」要一起换成节名。
- **引用块前言 / H1 复述 description**：pr-review、implement、to-ticket、wiki-conventions、glossary、dreaming、issue-dispatch、uiux-research、tdd、design-modeling、design-archive。
- **别的 skill 写成裸名**：只能由人调用的 `grill`、`uiux-imagine`、`dreaming`、`setup` 要写 `/idea-loop:<名字>`；模型可调用的写 `idea-loop:<名字>`；to-spec 里的「spec-figures」不是 skill 名。
- **维护者的话**：样本统计（design-modeling）、签字修订史（wiki-conventions）、上游差异与许可（glossary）、「这里原来禁止…现在不禁了」（to-ticket）、「实测落后 24 个 commit」（dreaming）、设计理由（ui-measure、design-archive、pr-review）。
- **同一件事写了好几处**：
  - 合并后的清理清单：pr-review、pr 的 review-loop、implement「合并之后」、to-ticket「收工」，四处；
  - 测试仪器表：tdd、to-spec、implementer，三处；
  - 三条环境约定：ui-measure、refine-canvas、ui-reviewer，三处；
  - refine 里冲突项怎么处理，四处；
  - `research/` 不算设计产物：pr-review 四处、wiki-conventions 一处；
  - 「人机分工 / 删 spec 先写 ADR / link sweep」：wiki-conventions 和 dreaming 各一份。
- **流程放错地方**：uiux-research「接回 imagine / refine」整节归编排者；pr 的 review-loop 参考里「人回复之后」「合并」归 implement / pr-review；glossary 的出题时机归 grill；decision-rules 里「谁去找、谁来开 issue」归 pr-review / implement；implementer、designer、issue-explorer 里描述调用方流程的句子。
- **黑话**：frontier（implement、glossary）、ledger、AI tells、register、block 的 job（uiux-refine）、finding / harness / port（ui-measure）、blocking edge / matrix / mismatch（to-ticket）、raw 桶（grill）、living source of truth / Distill-back（design-modeling）、状态值 `parked` / `在飞`。

## 要你定的

1. **grill 要不要改成模型可调用**：你的改动删了 `disable-model-invocation`。要的话同步改根 AGENTS.md 和 README，description 换成带触发词的写法；不要的话恢复这一行。
2. **状态值 `parked` / `在飞` 要不要换成中文**（比如「搁置」「实现中」）：会牵动 `spec-status.mjs`、`issues.mjs`、GitHub label、setup 的 issue-tracker 模板和现有 spec。
3. **seam 留不留**：它是 tdd、to-spec、implementer 共用的词，Matt 也这么叫。建议留作引导词，第一次出现时补一句中文定义。
4. **agent-builder 怎么用上 writing-for-agents**：两者都只能由人调用，互相调不到。可以改成「告诉人先跑 `/idea-loop:writing-for-agents`」，或者把 writing-for-agents 改成模型可调用。

## 明细

### design-modeling（27282）
- description 要改 → 「项目 DESIGN.md 的写法与准入规则。新建、改、对账 DESIGN.md，判断一条内容该不该进，或写一条设计法候选时用。」
- 蔓延：「各章写什么」（约 7K）、「新建」「蒸馏」「对账」三个分支挪进 references/，正文各留一行指针。
- 维护者的话：开头引用块（依据、Harold 定稿、样本品牌）；全文的样本统计（61/84、0/84…）和「样本里的情况」整列。
- 流程放错地方：「单条蒸馏」、「蒸馏」第 3、4 步、「对账」的处置列是 dreaming 的编排，dreaming 里又各写了一遍。
- 跨 skill：159–162、304 行写死 `skills/*/SKILL.md`、`tmp/<spec-slug>/delta/`、冻结记录路径。
- 指针：235、261 行的 `uiux-imagine`、`dreaming` 要写 `/idea-loop:`；214 行改成「用 Skill 工具调 `idea-loop:browser`」。
- 叠词和多余空格：243、249、265、284 行。
- 重复：扩展章形态（42/144/205 行）、Motion 不枚举（143/180/303）、文件该变短（63/288）、规则 1、5 与不进表。
- 否定：41 行「不设 Iteration Guide」、210 行「不预填 Case Law」、172 行。
- 「谁写、谁读」复述别的 skill 的流程，收成两行。
- 黑话：living source of truth、register、brand board、ground/ink/accent、Distill-back、protocol。
- 剪完约 8–9K。

### design-archive（22798）
- description 要改 → 「设计档案（docs/design/prod/）的结构、校验、查询与归档。写档案对象、查某个页面或状态的现状、跑档案校验或归档时用。」
- `node scripts/…` 补 `${CLAUDE_PLUGIN_ROOT}`。
- 「谁在什么时候跑它」复述 pr-review 和 ui-reviewer 的流程，还有 `§4.1`、agent 文件路径。
- 「解析模块」是内部 API，挪进脚本注释。
- 「查询模块」返回字段表和 MCP 实现细节、「归档」的内部算法，挪进 references/。
- 「合并前钩子」讲实现，收成一行。
- 「写 prod/ 只有归档脚本」写了四处；候选形状复述 design-modeling。
- 开头引用块并进「图的模型」；旧布局、Obsidian 自环等设计理由删掉。
- 写 `delta/` 的分支缺完成条件：补「`check --delta <slug> --no-used-by` 退出码 0」。
- 剪完约 9–10K。

### pr-review（20401）
- description 要改 → 「在一个 open 的 PR 上跑一轮 review，或在人说合并时合并它。implement 全部落地后、人说再跑一轮、人说合并时用。」
- 指错的节号（见真 bug）。编号标题与十几处 § 引用。
- 第 8 行写了自己 references 的完整路径和 agent 文件路径；第 46、61 行写 `decision-rules.md`。
- 「两个角色」表复述 agent 的模型、权限。
- 「合并」「合并前归档」约 4K 只在合并时用，挪进 references/merge.md。
- 合并清理清单四处重复；`research/` 不算四处重复。
- 第 2 节第 3 步、第 7 步括号里写的是审查者怎么干活。
- 维护者的话：34、109、18、116 行。
- 「不做」6 条全是禁令且重复，删掉；硬护栏并进「合并」第一句。
- 剪完约 10–12K。

### pr（5275）
- description 要改 → 「一个 PR 上给人看的东西怎么写、放在哪：PR 描述、停下汇报、review 汇报、review loop 文件。写 PR 描述、写汇报、记录或归档 review loop 时用。」
- review-loop 参考里「人回复之后」「合并」是编排流程，还写着 `implement` §6、`pr-review` §4/§5。
- 第 16 行和第 39 行几乎一样；「不写什么」两条重复、整节是禁令。
- 四节表「写什么」列复述 description.md 模板。
- 第 6 行末句空操作；第 35 行替 bot 规则辩护。
- 三个只有一行指针的节合成一节「格式」。
- 剪完约 3.8K。

### implement（12169）
- description 要改 → 「把一份已切好工单的 spec 实现完，或只做其中指定的几张。spec 进了在飞、要开工时用。」
- frontier 改成「可派的工单」。编号与 §。
- 跨 skill：`decision-rules.md`、`agents/implementer.md`、`to-ticket` 裸名；`/idea-loop:pr-review` 应写成「用 Skill 工具调 `idea-loop:pr-review`」，`grill` 写 `/idea-loop:grill`。
- 第 47、49 行复述 implementer 的输入；角色表写模型。
- 「合并之后（不归这里，备查）」整节删。
- 第 67、86 行写审查者的行为；第 34 行 trailer 的解释。
- 旧布局迁移残留；引用块前言；「不需要 /clear」与「不做」节。
- 剪完约 8.5K。

### to-ticket（10486）
- description 要改 → 「把一份 spec 切成垂直切片的工单。spec 审完（碰 UI 的设计已冻结）、要开工时用。」
- 「这里原来禁止派 subagent，现在不禁了」整段是历史；117、119 行的规则留下挪位置。
- 「收工」整节删（见真 bug），删工单并进 pr-review 的合并清理。
- 编号、§，spec 章节按节名写。引用块两处。
- 冻结闸门的重复与理由。否定句改正向。
- 黑话：blocking edge、expand/migrate/contract、matrix、mismatch、ledger。
- 「探代码库」「切垂直切片」补完成条件。旧布局残留。
- 剪完约 6K。

### wiki-conventions（16540）
- description 要改，补 `.tmp/` 这个分支 → 「目标仓库 docs/ 知识库与 worktree 下 .tmp/ 中间产物的约定：目录、frontmatter、slug 与链接。动 docs/ 或往 .tmp/ 放东西之前用。」
- 第 10–28 行签字修订史整块挪走。
- 编号与 §，被 implement、to-ticket、uiux-research、dreaming 引着，要一起改。
- 第 8 行五个 skill 的名单过期；`pr-*`、maintain 旧名。
- 「从平铺布局迁移」挪进 references/。
- 第 88 行 `research/` 一大段讲别的 skill 的流程。
- 状态闭集表和 spec-status 重复；ADR 按节取代、人机分工和 dreaming 重复；两条硬规则和 to-spec、to-ticket 重复。
- 维护者的理由段（47–55、113–115、166–168、186 行）各压成一句正向规则。
- ✅/🚫 表情；info/exclude 写了两遍，归 setup。
- 剪完约 9–10K。

### glossary（11241）
- description 基本合格，补「订正」分支。
- 「跟上游的差异」、来源与许可、人名 Harold 挪走或改掉。
- 出题时机归 grill；缺词收法和 pr-review 重复。
- CI YAML 和 AGENTS.md 模板挪进 references/ 或交给 setup。
- 黑话：frontier 题、lint。编号与 §（to-ticket、implementer 引用了「glossary §5」）。否定句。dreaming 对账重复。
- 剪完约 5–6K。

### decision-rules（7305）
- description 合格。
- 第 43 行未来计划删掉；「谁去找、谁来开 issue」归 pr-review / implement；第 25 行半句与「PR 流程」一节重复。
- 「交给人时」约占 40%，挪进 references/，正文一行指针；补可核对的完成条件。
- 否定句、开头两句压成一句。
- 剪完约 5K，「交给人时」挪出后正文约 3.5K。

### evidence（1941）
- 基本精简。删第 15 行「两类不混」；`flow-compose.mjs` 补 `${CLAUDE_PLUGIN_ROOT}`；freeze.md 里截图参数的重复改成指针。

### dreaming（8444）
- description 要改（只能由人调用，一行）→ 「把知识库、设计档案、DESIGN.md 和术语表跟代码对账，提议该订正、归档、删除的内容。」
- 「怎么调」里调度那句和「别在刚跑完之后立刻跑」删掉；ui-reviewer description 里的「每周」也删。
- 第 48 行复述 ui-reviewer 的五种判定。往事（实测落后 24 个 commit、DROP 的表）删。
- 引用块；纪律 5–7 与 wiki-conventions 重复；纪律 1 与流程第 1 步重复。
- 「四条边」表实际六行、「边」是黑话 → 「几种情况怎么处置」。编号与 §。
- 审核页卡片内容和 review-page.md 重复；「这里不复述」空操作；「按契约拆」指针不清。
- 剪完约 5K。

### uiux-refine（8935）
- description 要改 → 「设计收敛：把定下的方向打磨到人签字冻结。」
- 「冻结之后」的五样摘要和清理复述 freeze.md。
- 裸名 `uiux-imagine`（要 `/idea-loop:`）、`uiux-research`。
- 冲突项处理写了四遍；瓶颈判据复述脚本；素材段开启条件复述 asset-stage.md。
- 黑话：块的 job、register、AI tells、ledger。
- 两条校验命令补全路径；「方向说明在 / 不在」合成一行；「不用 /clear」「它切完翻在飞」删。
- designer.md 第 37 行「拿到的意见已经拦过一遍」是调用方流程，删。
- 剪完约 6.5K。

### uiux-imagine（8249）
- description 合格。
- `allowed-tools` 和正文对不上：正文要跑的 node 脚本、curl、codex、git status、静态服务器都没放行，放行的 git 子命令和 design.md CLI 正文没用。
- 裸名 `grill`、`to-spec`、`uiux-research`；`spec-status.mjs set <docs>` 没写全。
- 收工核对里的「七节都有正文」是校验脚本已经查的；退路复述 browser；部分冻结重开写了三处；一个 imaginer 活过全程与 SendMessage 那句重复；代填格格式复述 agent；收工对人说的话复述 refine 的事；开头段复述全流程。
- 剪完约 6.5K。

### uiux-research（6836）
- description 要改 → 「调研别人怎么处理一个 UX 问题：流程、某类页面的常见做法、文案语气。人问『别的产品怎么做』时用；视觉风格不归它。」
- 「接回 imagine / refine」整节删（编排者的流程）；第 19 行重复。
- 编号与 §；引用块；H1 和维护者的话。
- 页面排版、git 忽略、交回格式复述别处。
- 四处禁令合成一句正向的；`file://` 那段挪进 references/；黑话 researcher、flow。
- 剪完约 3K。

### to-spec（8805）
- description 小改 → 「把刚才的对话写成 spec；或把一组 GitHub issue 起草成 spec 草稿。」
- 「spec-figures」改 `idea-loop:evidence`；`grill`、wiki-conventions、spec-status、tdd 写成 skill 名。
- `issues` 简写没定义；「第 3 步」改节名；模板里「下一层高度」是 imagine 的内部说法。
- 第 29、31、33 行复述别的 skill；第 8 行括号重复；「别粉饰」改正向。
- seam 第一次出现补中文定义。
- 剪完约 8K（两份模板留在正文合理）。

### issue-dispatch（7898）
- description 合格。
- 编号与 §；引用块与 H1。
- 第 18–23 行禁令改成正向，硬护栏各留一行；署名那句空操作。
- 第 56 行复述 issue-explorer 的交付；第 45、55 行复述脚本行为。
- 子会话模板里「先跟用户 grill」→ 「先请用户跑 `/idea-loop:grill`」；「它自己翻状态」删。
- 上限 5 写了两遍；子会话模板挪进 references/。issue-explorer.md 第 10–12 行写调用方流程。
- 剪完约 5K。

### agent-builder（6717）
- description 合格。
- 第 7 行调不到 writing-for-agents（见「要你定的」）。
- 「剪」的空操作检验复述 writing-for-agents；两处「不写工作流位置」、两处「各说各的」重复。
- 「claude-seo 的 agent」「中位约 500 个英文词」删或换成中文上限。
- 「剪」补完成条件；第 23 行「文件路径」和第 52 行「不写死路径」打架；否定句；`refine-canvas.md` 例子换掉。
- 剪完约 5.6K。

### spec-status（6190）
- description 要改，补同步、关 issue 分支。
- 第 51 行开工先跑 check，三个 skill 各自已写；wiki-conventions 写成 skill 名；「照旧」删。
- 状态值黑话（见「要你定的」）；几处重复；`issues` 定义挪前；拆 spec 那句不是状态规则；第 78–80 行脚本内部理由；`已拍板未排期` 和 `parked` 拆两行。
- 剪完约 4.8K。

### setup（6185，模板 5622）
- description 合格。
- 编号与「第 N 步」；去读 pr-reviewer 的第 2 节第 3 步；第 9 行说别的 skill 的行为。
- 两步里各说一遍 PRODUCT.md 怎么推；`grill` 等写 `/idea-loop:`；「谁要用」一列会过期。
- 模板里「执行方」「审查者」是内部叫法，会写进目标仓库。
- 剪完约 5.2K。

### ui-measure（6121）
- description 要改 → 「把 UI 实现和冻结的设计画布逐格测量比对。实现 UI 工单、review 时对画布、冻结时定容差时用。」
- 瓶颈后交人（见真 bug）；「回 uiux-refine 弯设计」是 implement 的流程。
- 三条环境约定三处重复；「触发时机」整节删。
- 设计理由、「本仓库 lint 同构」、字段表、抗锯齿长解释压短。
- 黑话：finding、harness、port、dev、ledger、tab、ticket。否定句。
- 剪完约 3.8K。

### grill（4739）
- 见真 bug 和「要你定的」第 1 条。
- 否定句；第 38 行理由压成半句；`idea-loop:evidence` 的那一节在它的 references 里，写成「用 Skill 工具调 `idea-loop:evidence`，按它指到的……」；目录写死，调 wiki-conventions；raw 桶 → raw 目录；`GLOSSARY-MAP.md` 括号删。
- 剪完约 4K。

### tdd（4693）
- description 合格。
- 仪器表三处重复、写死 Toeflair 工具，整节换成指向 spec 的「测试决策」。
- 「spec 的 §6」；两处引用块；H1 和第 8 行；「不验证实现细节」三遍；否定句。
- 剪完约 2.7K。

### browser（2885）
- description 要改 → 「两个浏览器（无头的 Playwright、给人看的内嵌浏览器）各管什么、怎么用。截图、测量、复现问题，或把页面摆给人看之前用。」
- 「找不到就问人」（见真 bug）；`setup` 写 `/idea-loop:setup`。
- 「html 如需人审」那节措辞和 uiux-research 允许 `file://` 冲突，并进「给人看」，补「起完服务再 preview_start」。
- 第 20 行语句不通；「两边不混」重复表格；「不要假设已登录」空操作；「代码沙箱」写出工具名。
- 浏览器锁的规则散在四处，收进这里。
- 剪完约 2.3K。
