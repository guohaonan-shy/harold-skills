# 样本：skill 改写的 PR，读完问题、概要就说得出现在、改完、要我做什么

**一句话**：一个把 idea-loop 全部 skill 与 agent 定义逐份重写的 PR，旧描述 9705 字，要读很久才找到「现在是什么样、改完是什么样、要我做什么」。好的描述读完问题和概要就说得出这三件。

## 出处

- guohaonan-shy/harold-skills#432「idea-loop 的 skill 与 agent 定义逐份重写、五组合并」，2026-11-22 02:07 UTC 合并到 `release/idea-loop-0.2.0`（issue #340、#356）。PR 分支最后一个提交 `020c5ba1`，255 个文件，+8821 −2236，34 个提交。
- 这个样本的起因是 #452 正文：旧格式的 PR 描述太长。2026-11-24 对着 GitHub 上的 PR 正文量（UTF-8 字符）：#432 总 9705 字，折叠区 4628，折叠区外 5077；「现在是什么样」散在「问题」里，「改完是什么样」散在「怎么修」里，没有改前改后对比。
- 材料取法：`gh pr view 432 --repo guohaonan-shy/harold-skills`；文件清单 255 个，prompt 里按目录合并。

## 当时产出的原文

**旧描述**（PR 合并时的原文，没改一个字；十节的旧格式，下面的 `<!-- idea-loop:section … -->` 行是写入工具加的段落标记）

~~~~~markdown
<!-- idea-loop:section summary -->
## 一句话

idea-loop 的每份 skill 和 agent 定义现在都不超过 4500 字，主文件只放每次都走的步骤，只在部分情况才用的分支挪进参考文件，加新分支时至少还有 500 字余量。五组 skill 合并，skill 从 41 个减到 36 个。调度在桌面端和 magi 里用同一条命令开 issue 会话。流程行为没变。
<!-- /idea-loop:section summary -->

<!-- idea-loop:section problem -->
## 问题

idea-loop 的 skill 和 agent 定义越写越长，已经没有地方加新东西了。

- **主文件没有余量**：开工前量了一遍（2026-11-20，对着集成分支），41 个 skill、16 份 agent 定义里有 25 份主体超过 4500 字，最长的 UI 审查 agent 6632 字；实现执行方、对账、SEO 接入这几份离 5000 字上限只差 1 到 60 字。改它们时只能做等长替换，新加一个分支就得挤掉别的内容。真实例子：实现编排的主体从 10 月中的 3885 字涨到 11 月中的 9589 字，约 25 个功能提交各往主文件里内联一个分支，后来专门开一个 issue 才压回去。
- **主文件里夹着只有少数运行才用到的内容**：59 份文件里 27 份写着日期、「人定于某天」这类决策历史；只在停下、延后或人点名部分运行时才走到的整节分支（例：实现执行方的「停，还是延后」约 900 字）每次都要读。
- **同一条规矩写在好几处，命令写死在步骤里**：比如「PR 从 spec 提交就挂着」在两份 skill 里各写一遍；步骤里手写的 gh、git 命令共 124 行、分布在 54 个文件。回放时 agent 没登录 gh，照这些步骤跑第一步就失败。

根因是写法规则早就有，但从来没有逐份照它重写过：每次功能改动只看自己那一处，加东西安全、删东西有风险，于是越积越多。
<!-- /idea-loop:section problem -->

<!-- idea-loop:section changes -->
## 怎么修

这次没有改任何流程的行为，只改了写法、位置和名字；用户看不到变化，换来的是每份定义都留出了至少 500 字给以后加分支。

**之前 → 之后**：主体超过 4500 字的 skill、agent 定义 25 份 → 0 份（最长 6632 → 4497）；skill 41 个 → 36 个；新会话开场注入的决策规则 6 节 → 9 节（多了「证据是什么」「整体怎么写」「配什么图」）。

### 逐份重写：每份定义压到 4500 字以内

只在部分情况才走到的分支（例：实现执行方「停，还是延后」、对账的「只跑一部分」、SEO 方法的无人值守交回）挪进各自的参考文件，主文件留一句「什么时候去读」。日期、人的原话这类决策历史从主文件删掉，会影响行为的理由留理由本身。每一步以一个完成条件结尾。依据：spec 的方案，和写法规则「每一步都以一个完成条件结尾」。

### 五组合并：skill 从 41 个减到 36 个

- 证据的写法并进决策规则，新会话开场注入整份；
- 术语表规则并进知识库约定；
- SEO 接入并进全局 setup，setup 接完项目后按模块问要不要接 SEO；
- 写 brief 并进 SEO 写作；
- 找外链候选站点并进 SEO 外联。

被合并的 5 个 skill 整个删掉，不留旧名字。依据：spec 的五组合并表；引用它们的 README 和两份 AGENTS 清单一并删掉（同一张表的「牵动」一列）。

### 同一条规矩只写一处，手写命令换掉

- PR 描述、issue 状态、知识库落地等已有归属的规矩，别处只指过去。重写时执行方另报出 6 处表外的重复（评论标记、暂缓的设计、SEO 方向 agent 的输入段、首轮 review 列存量 issue、交回前要跑的测试清单、Linear 说明），加了一张工单各收成一处，并补进归属表。依据：spec「规矩的归属」原文「表外新发现的……由编排者在后面的工单里处理」。
- 步骤里手写的 gh、git 命令，能用命令行 dyna 的改成 dyna；做错会出事的（只快进、只一个提交）写成对结果的要求；靠看想不到参数的留着并写明理由。

### 你在 review 里定的三件

- **dyna 给人看的提示改指现在的 skill**（你说「D1 我倾向于在这个PR里面解决」）：术语表格式提示、两条 SEO 额度报错、一个参数说明、扫描自动开的 SEO issue 正文，原来都指向这次删掉的 skill，现在指向合并后的位置。
- **「人的原话」字段名全插件统一成「原话」**（你选了统一回一个叫法）：设计发散、设计收敛、调研、UI 审查几份里被改成「原文」的地方改回来，加了测试守着只有一个叫法。
- **开 issue 会话在桌面端和 magi 用同一条 dyna 命令**（你说「开会话我觉得先统一是没问题的」）：桌面端交出改用 claude 官方的「在桌面端打开」参数，不再模拟终端敲命令，不再依赖系统的 expect。侧边栏分组、定时任务、会话收尾仍留在各自运行环境的说明里，开场注入。

### 照规则顺手处理的

- 五个 SEO 方向 agent 的 description 改成写职业身份和交付，不写谁起它。依据：仓库 AGENTS.md「agent：写它的职业身份和交付，不写谁起它」。
- 对账参考里一处已不存在的旧命令名改成现在的命令。依据：照写调不通。
- setup 的 SEO 模块去掉了一个走不到的分支（问题跟踪文件里没有分类 label 一节就先停）：SEO 模块现在只在 setup 写完那份文件之后才跑。依据：spec 的合并方案。

**后端流程**：命令行 dyna 改了开 issue 会话和给人看的提示文字，版本 0.0.4 → 0.0.5（没发布，插件要求的最低版本仍是 0.0.4）；其余没变。
<!-- /idea-loop:section changes -->

<!-- idea-loop:section verification -->
## 怎么验证

- 每份定义不超过 4500 字：按仓库 AGENTS.md 的量法逐份量，36 个 skill、16 份 agent 定义全部过，最长 4497。
- 被删 skill 的名字不再被引用：skill、agent、README、AGENTS 清单、hooks、运行环境说明、dyna 源码里都搜过，已清零。
- 新会话开场注入整份决策规则：用这条分支构建的 dyna 实跑开场注入，九节都在，含「依据只认三种」「证据是什么」。
- 合并后的入口能被找到：SEO 写作的 description 有「写 brief」、SEO 外联有「找候选站点」、知识库约定有「术语表」、决策规则有「写证据、配图」、setup 写了「按模块问要不要接 SEO」。
- 开 issue 会话两种运行环境同一条命令：用这条分支的 dyna 在桌面端、magi 两种环境各跑了一遍参数写错的情形，都正常报错退出；两份运行环境说明里开会话那一步是同一句。
- 全量测试：node 测试 1104 条，1103 过，红的一条是「改了插件就要升版本」，按约定 0.2.0 由集成分支合进 main 的那个 PR 一次升，红在预期内；dyna 的 vet、格式检查、Go 测试（43 个包）全绿。2026-11-20 删工单之后在本机重跑。PR 上没有 CI。
- **桌面端真机交出**：没验成。新的「在桌面端打开」参数能不能把会话真放进桌面端侧边栏，执行方在你的电脑上开不了桌面端会话；留给你在真机验，见「要你做的事」。
- **合并后的 description 能不能被真实对话触发**：没验成，没做对话回放（这个插件的 skill 按约定不做量化评测）；装上 0.2.0 后用的时候看。
- review：跑了 2 轮。第 1 轮 Standards 报 2 条，都按写法规则修了：设计发散和设计收敛有三步把完成条件写在开头，挪到结尾；SEO 教练讲数据来源那一步补了完成条件。第 2 轮两轴都 0 条，确认两处修对了。
<!-- /idea-loop:section verification -->

<!-- idea-loop:section rollback -->
## 能否回滚

**能不能撤回**：能，撤销合并即可。没有数据迁移，没有对外发布；dyna 0.0.5 没发布，撤了不影响任何已装的版本。

**影响面**：这个 PR 合进的是 0.2.0 的集成分支，不是 main，所以现在没人装得到；要等 0.2.0 合进 main 发布后才影响装它的人。那之后，被合并删掉的 5 个 skill 名（证据、术语表、SEO 接入、SEO brief、找外链候选站点）调不到，这是 spec 定的「一次发布、不留旧路径」。

**顺带开的 issue**
- [Linear 项目接 SEO 模块时仍在 GitHub 上建 type:seo 系列 label](https://github.com/guohaonan-shy/harold-skills/issues/433)：改前就有，跟这次重写无关。
- [SEO 写作循环判 premise 翻回 triage 时让写分支名，triage 阶段没有分支](https://github.com/guohaonan-shy/harold-skills/issues/434)：同上。
- [dreaming 对账设计档案时截图目录两处写法不同，按输入路径读图会读空](https://github.com/guohaonan-shy/harold-skills/issues/435)：同上。
- [after-freeze-exit 文档测试的切片标题对不上，守不住「告诉人」那一段](https://github.com/guohaonan-shy/harold-skills/issues/436)：同上。
- [dyna 缺五个命令，skill 在这几步只能让 agent 自己拼 gh / git](https://github.com/guohaonan-shy/harold-skills/issues/437)：要加命令行功能，不在这次「只改写法」的范围里。
<!-- /idea-loop:section rollback -->

<!-- idea-loop:section your-todo -->
## 要你做的事

**要你审的**
- [ ] **真机交出一次**：在本机一个已经信任过的目录里，让调度开一次 issue 会话（或直接跑它的开会话命令），看桌面端侧边栏有没有出现这个会话、命令是不是自己退出。执行方开不了你电脑上的桌面端会话，这一项只有你能验。遇到「信任这个目录吗」的确认框，告诉我，要把那句提醒补回运行环境说明。

**合并**：review 两轮都过了，没有要你决定的事。说「合并」即可（合进 0.2.0 的集成分支）；直接说合并，视为上面那项你认可先合、真机交出之后再验。
<!-- /idea-loop:section your-todo -->

<!-- idea-loop:section reference -->
## 参考

<details><summary>spec 与工单、版本、执行记录、合并后的清理</summary>


- spec：[skill-rewrite.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/340-skill-rewrite/docs/spec/skill-rewrite/skill-rewrite.md)；决定记录：[340.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/340-skill-rewrite/docs/raw/decisions/340.md)
- 工单（20 张，全部落地；交审核报告时已从分支删除，链接指向删除前的提交）：
  - [01 — 写法规则：重写核对表、命令归类与 4500 线进 writing-for-agents](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/01-writing-rules.md)
  - [02 — evidence 并进 decision-rules，开场注入整份正文](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/02-decision-rules-evidence.md)
  - [03 — glossary 并进 wiki-conventions](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/03-wiki-conventions-glossary.md)
  - [04 — 实现链逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/04-impl-chain.md)
  - [05 — PR 链逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/05-pr-chain.md)
  - [06 — issue 链逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/06-issue-chain.md)
  - [07 — 起草与复盘逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/07-draft-retro.md)
  - [08 — seo-setup 并进 setup，setup 按模块问](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/08-setup-seo.md)
  - [09 — 对账逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/09-reconcile.md)
  - [10 — 设计发散与调研逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/10-design-diverge.md)
  - [11 — 设计档案逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/11-design-archive.md)
  - [12 — SEO 合并：seo-brief 进 seo-writing、link-prospecting 进 seo-outreach，seo-coach 重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/12-seo-merge.md)
  - [13 — SEO 扫描逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/13-seo-scan.md)
  - [14 — SEO 研究与出图逐份重写](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/14-seo-research.md)
  - [15 — 整体核对](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/15-overall-check.md)
  - [16 — 规矩归属表外的重复收成一处](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/16-dedupe-rules.md)
  - [17 — dyna 跟着 skill 的合并与挪位适配](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/17-dyna-adapt.md)
  - [18 — 「人的原话」字段名统一回「原话」，results-analyst 输入段收成指针](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/18-quote-field-name.md)
  - [19 — 开 issue 会话统一成 `dyna runtime handoff`，桌面端与 magi 同一条命令](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/19-unified-session-open.md)
  - [20 — 桌面端交出改用官方的 `claude --desktop --resume`，不再用 expect 模拟敲 `/desktop`](https://github.com/guohaonan-shy/harold-skills/blob/89fd002bd766c1860855a74b65ea5cac52f010ea/docs/spec/skill-rewrite/tickets/20-desktop-flag-handoff.md)
- 一起关：#356（行内命令归类，并进本 issue）
- 顺手开的存量 issue：#433–#437
- 留给兄弟 issue 接的：#280 落在决策规则（本 PR 并进了证据写法并整份重写）；#386 落在调度（本 PR 把早上汇总挪进参考文件，开会话统一成同一条命令）
- 版本：idea-loop 的 plugin.json 不升（合进集成分支时统一升）；dyna 0.0.4 → 0.0.5，没发布

Refs guohaonan-shy/harold-skills#340
Refs guohaonan-shy/harold-skills#356

🤖 Generated with [Claude Code](https://claude.com/claude-code)

- 过程记录：Review 汇报 3 份（来自实现 1 份、review 2 轮），合并时整份贴在这个 PR 的评论里；审到的版本 89fd002，之后只多一个删工单的提交 020c5ba
- 验证：PR 上没有 CI，按 REVIEW.md 在本机跑全量（2026-11-20，020c5ba）：node 1104 条只红 plugin-version（预期），dyna 的 vet、gofmt、go test 全绿
- 合并后 Claude 做的清理：照例的几项（这个 PR 的临时目录；工单在合并前已经删了）

</details>
<!-- /idea-loop:section reference -->

Refs guohaonan-shy/harold-skills#340
Refs guohaonan-shy/harold-skills#356

🤖 Generated with [Claude Code](https://claude.com/claude-code)
~~~~~

**四轮产出**：四轮产出在分支上的 `idea-loop/evals/pr/rounds/harold-skills-432/`：`description-v1.md`、`description-v2.md`、`description-v3.md` 是前三轮，`description.md` 是第四轮（Harold 定的模板），`notes.md` 是每轮子代理记下的「标准没说清」和字数；每轮之间改了什么、Harold 的批示在 `docs/raw/decisions/452.md` 题 20–27。

- 第一轮 1738 字（去掉代码块；旧描述折叠区外 5037）。
- 第二轮 2161：证据节三组之前 / 之后，其中两组是〔缺〕占位；人在 review 里批过的两件（dyna 提示改指新 skill、「原话」统一）按「已经定了的事不写」删掉。
- 第三轮 3139：证据节问题 1 到 3 各一组，没有对应问题的改动又四组，6 处〔缺〕占位；比旧描述折叠区外短不了多少（人看后说「收紧再跑」）。
- 第四轮 2263：问题节一张三行表加一个真实例子（implement 主体 3885 字涨到 9589 字）；概要一句话加两个视图（文件树 diff、开会话的 diff）；证据只留两边都真做过的一组（量法同一条，25 份超 4500 → 0 份），加一行「行为没变」（开 issue 会话）和一段没验成；要你做的事一个复选框加一段命令。

## 人指出的问题

- 人的原话（#452 正文）：「人要读很久才找到『现在是什么样、改完是什么样、要我做什么』」
- 旧描述十节每节写满、一半在折叠的「参考」里；人想要的是一眼看到现在、改完、要做什么，而不是读完十节再自己拼。

## 好的长什么样

- 读完「问题」和「概要」两节，说得出：现在是什么样（57 份里 25 份主体超过 4500 字，最长 6632，dreaming 离 5000 上限只剩 1 字，再加一个分支就得先删别的句子）；改完是什么样（每份只留每次都走的步骤，部分运行才走到的分支挪进参考文件，五组 skill 合并 41 → 36）。
- 要我做什么在最后一节，一两行：合并前只有人能验的一件（真机交出一次，附能直接复制的命令），再加「说『合并』即可」。
- 问题节有一个真实例子（implement 主体 10-14 的 3885 字涨到 11-13 的 9589 字）而不是只有总数。
- 不好的样子：现在和改完散在好几节里；要我做什么埋在参考之后；一半内容折叠。

## 回放这一格怎么跑

- 现场：提交 `e30dcd8a`（本仓库 `release/idea-loop-0.2.0` 在这个 PR 合并前一刻的样子，是合并提交的第一个父提交）。这个现场在本仓库，不用另指 `--repo`。
- 换过的地方：prompt 里给的是旧描述、按目录合并的文件清单、3 条 review 归档评论；材料里的「回放」写成「重放」、「评测」写成「测评」。
- 大小：large，由编排者在 PR 开出来之后照 `--run-large` 跑。
