---
type: raw
source_type: conversation
captured: 2026-10-21
title: SEO 工作流重新设计讨论（替代 growth-weekly）
tags: [idea-loop-seo, seo-workflow]
related: ["[[idea-loop-seo]]", "[[2026-10-22-grill-idea-loop-seo]]"]
---

# SEO 工作流重新设计讨论（2026-10-21）

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 是 AI 的回应，只留结论与发现，取证过程略去。
> 外部材料只留链接。末尾「本轮决议」一行一个议题。
> 这场讨论发生在 TOEFLAIR 项目仓库的会话里，当时的结论是「项目内插件 + 独立队列」。次日的 [[2026-10-22-grill-idea-loop-seo]] 推翻了位置、队列、核验和写作归属几项，现行决定以那份为准。当时画的图随项目内的旧 spec 一起作废，没有带过来。

## U1

我之前有一个workflow就是根据openseo/posthog的数据分析我们下一步seo以及潜在的缺陷以及优化点，我们现在来重新看这个workflow的设计，调整下这个skill/workflow 然后按照方向进行归类，每周整理出3-5个任务单独开session处理～

## A1

现状诊断（2026-10-21 查）：

- 定时任务自 2026-09-06 起实际停摆：launchd 日志最后一次 `starting growth-weekly session` 是 2026-09-06 22:00，没有对应的 `session ended`；`launchctl list` 显示那次的进程（PID 47961）仍在。launchd 见上一个实例未退出就不再起新的。`docs/records/weekly/` 最新快照是 2026-09-17，09-13 与 09-17 两份是手动跑的。
- 09-17 那轮只出 2 张工单、16 段洞察。按「缺决策的永远是洞察」的规则，最有价值的几条（Listen & Repeat 一簇差一篇文章、`/academic-discussion` 缺一轮诊断、CTR 一簇的文案判断）每周写出来、每周没人接。
- 执行链停在开 PR（growth-chain 派出的子会话没有 Workflow 工具；另见 issue #435）。

提议：任务单位从「修法已定的工单」改成「值得开一个会话处理的问题」，诊断和拍板在会话里完成；分析与证伪阶段保留；按固定方向归类，每周挑 3–5 个，各开一个会话。

## U2

我觉得还有两个问题就是外链+新的搜索关键词的挖掘，另外posthog我倾向于从这个工作流里面移除，这个专门做seo

另外，https://github.com/AgriciDaniel/claude-seo/tree/main 这个工具你能参考下吗？我在想能不能将openseo和这个工具结合，整理成一个可以半自动甚至完全自动跑的seo工作流

## A2

读了 claude-seo（commit `4b99de2`，2026-10-05）：它是一次性体检工具，`/seo audit` 并行派十几个 agent 出带分数的报告，周与周之间不记状态（只有 drift 存页面基线），不排优先级、不派任务；数据层的 GSC / GA4 / Bing 与我们已有的 OpenSEO + `bing_query` 重复；需要独立 Python 环境和 Playwright Chromium。

值得借的方法：关键词按前 10 名网址重合度聚类（7–10 同页、4–6 同簇、2–3 互链、0–1 无关）；外链竞品差距（链了竞品没链我们的引用域）加「数据不够不打分」；页面基线回归（title / description / canonical / robots / H1 / schema 按严重度比对）；写作简报。OpenSEO 自带的 link-prospecting skill 补外联候选与外联信草稿。

拿掉 PostHog 后的方向定为五个：技术 SEO 与索引、已有页面优化、关键词挖掘与新内容、外链、AI 搜索可见性。

## U3

posthog 我之后单独有用处。

我总结下，我们fork claude-seo 这个仓库将数据源换成openseo，然后用几个routine 每周针对性的对这5个方向进行run，给安装这个plugin的项目仓库提issue，然后我启动一个loop 抓取这些issue并创建会话开始完成内容的改动是吗？

## A3

方向对，三处修正：不整个 fork（26 个 skill、19 个 agent、数据访问散在几十个 Python 脚本里，换源等于重写，上游更新勤），新建精简插件，MIT 协议下拷方法、注明出处；routine 按节奏分不按方向分，3–5 个的总上限要有地方管（每方向最多 2 个、先查有没有同一问题的 open issue）；loop 优先用现有的 issue-dispatch。

## U4

issue-dispatch 是否可以指定对应的问题类型，现在 @[质量待办调度] 专门审查bug，我想讲这些seo相关的问题单独放一个类目（相当于一个单独的队列一样）

## A4

现在不行：issue-dispatch 只按「有没有 `status:*` label」挑 issue，其余 label 不读。SEO issue 一提出来就会被质量调度抓走。要独立队列需按 label 分队列、草稿 spec 分队列、在审上限按队列配置，并可选「跳过起草 spec」与「每队列自己的会话提示词」。

## U5

我们这个SEO的plugin要包含哪几个skill以及那些agent？

## A5

提议：skill —— seo-setup、seo-run（调度入口）、seo-brief、seo-outreach（可选 seo-baseline）；agent —— 五个方向各一个分析 agent（technical-auditor、page-optimizer、keyword-miner、backlink-analyst、geo-analyst）加一个独立的 verifier；脚本 —— 提 issue（取代 promote-gate）、页面基线比对、额度判断。

## U6

我觉得这个plugin先在toefl-demo这个仓库创建吧，然后再考虑沉淀到harold-skills吧。我重新整理下思路

* seo-setup 这个内容我非常同意，这个skill的配置我们单独沉淀一个SEO.md吧，主要是存域名、语言版本、竞品名单、重点页面、openseo（包含项目id、纬度预算），seo-lint以及内容类任务的skill 不用管，应该是loop会话在创建的会话中分配给对应的agent，这个不应该是setup来管的
* seo-run，我倾向于修改成seo-audit，由routine触发，按照我们说的5个方向，技术SEO与索引，已有页面优化，关键词挖掘与新内容，外链以及AI搜索可见性，通过调用5个方向的agent最后将任务放到github 指定“队列”的内容
* seo-brief 这个skill 我没有任何问题，我倾向于这个skill 可以在seo-run 执行的过程中，将brief直接放到对应的issue里面，这样负责内容相关issue的会话可以调用写作相关的skill直接去写了。
* seo-writing，我觉得这个skill可以将我们的blog publisher融合到一块，根据brief开始产出对应的内容，skill 负责规则，hook负责机械化的格式校验
* seo-outreach 没有任何问题。


harold-skills 我理解issue-dispatch 是不是要支持限定`queue:*`队列标签？

## A6

补充：SEO.md 放仓库根；各方向节奏写进 SEO.md、只挂一个 routine；seo-audit 与 OpenSEO 自带 skill 重名；简报由扫描主会话在核验通过后写（子 agent 稳定调起 skill 从未验证成功），带生成日期；并入 blog-publisher 时它原有的几种入口要保留。issue-dispatch 要队列化需改五处，可收进每队列一个配置文件。

## U7

看完你的补充，我坐几点调整：
1 seo.md我觉得放仓库根目录没有问题，关于竞品名单，我倾向于md文件以及openseo的项目两个信息保持一致。
2 那就改成seo scan吧，另外openseo的相关plugin和skills 我们也可以吸收下，最后我们的skill以及agent都需要像openseo和claude-seo一样，内容简洁（不要想harold-skills的写法，太冗余）
3 "它不只做 SEO 文章，还接竞品对比文、okara 稿子、局部润色、中英镜像这几种活。并进来之后，"按简报写"作为新增的入口，原来这些入口都要保留" 这里我有个专业的问题请教你，seo文章和竞品对比文有区别吗？多语言镜像、局部润色我觉得属于通用能力应该被迁移的。

issue-dispatch 的队列我倾向于现在项目纬度的这个seo plugin内自己写一个吧，不耦合idea-loop吧

## A7

- 竞品名单以 SEO.md 为准，扫描开跑前单向同步进 OpenSEO（`update_project_context`），记下同步了什么。
- 改名 seo-scan；OpenSEO 的 keyword-research / keyword-clustering / competitor-analysis 吸收进 keyword-miner，link-prospecting 吸收进 seo-outreach 与 backlink-analyst；写法照 OpenSEO 的固定结构（目标、输入、工具、步骤、输出、禁止事项），约百行。
- 对比文是 SEO 内容的一种页面类型：对应「X vs Y / 替代品 / 测评」这类已在选产品的搜索意图，证据要求高（必须实际试用竞品）、过期快、结构固定。写作流程是同一条，区别在调研强度和模板。okara 入口去掉（okara 已停用）；润色与中英镜像随 seo-writing 迁过来。
- 插件内自写 seo-dispatch；不改 idea-loop 的隔离办法：SEO issue 同时打 `queue:seo` 和 `status:parked`（idea-loop 里本就是「不接手」），seo-dispatch 自己的状态用另一组前缀。

## U8

我觉得写作这里，竞品对比以及普通文章如果差别比较大，我觉得writing skill 可以加一个章节，这个章节可以让ai 根据文章类型，将对应的reference 动态的加入？

## A8

可以，复用 blog-publisher 已有的六类封闭分类（`blog-categories.md`，文章 frontmatter 的 `kicker` 记着类型）。对比文的专用规则现在散在 4 个文件、18 处。拆法：深度研究（对比、排名）、数据研究、创始人故事各一份类型规则；学习方法、实用技巧、产品指南先用通用规则。类型由扫描写简报时定，润色与镜像读 `kicker`，都没有时先说出判断再动笔；通用规则留原处。类型记在 frontmatter 里，hook 能按类型多查（对比表、竞品核实日期），扫描能发现核实超 90 天的对比文。

## U9

可以，落成 spec 吧。

## 本轮决议

| 议题 | 决议 |
|---|---|
| 工作流范围 | 只做 SEO；PostHog 移出，另有用途 |
| 方向 | 五个：技术 SEO 与索引、已有页面优化、关键词挖掘与新内容、外链、AI 搜索可见性 |
| 每周产出 | 3–5 个任务，各开一个会话处理 |
| 与 claude-seo 的关系 | 不 fork，不装；新建精简插件，借方法、注明出处 |
| 数据层 | OpenSEO + `bing_query` |
| 插件位置 | 先在本仓库，跑通再考虑沉淀到 harold-skills |
| 项目配置 | 仓库根 `SEO.md`：域名、语言版本、竞品名单、重点页面、OpenSEO 项目 id 与各方向预算；不管 lint 与写作 skill |
| 竞品名单 | SEO.md 与 OpenSEO 项目保持一致（SEO.md 为准、单向同步） |
| 扫描 skill | 名为 seo-scan，routine 触发，五个方向 agent，结果提到 GitHub 的 SEO 队列 |
| 简报 | seo-brief 在扫描过程中把简报写进内容类 issue |
| 写作 | seo-writing 并入 blog-publisher；skill 管规则、hook 管机械格式校验；按文章类型动态加载规则 |
| 外联 | seo-outreach，只起草不发送 |
| 写法 | 学 OpenSEO / claude-seo，简洁，不照 harold-skills 的写法 |
| 队列调度 | 插件内自写，不耦合 idea-loop |
