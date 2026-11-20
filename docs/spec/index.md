# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[ai-eval-plugin]] | toeflair 的 ai-eval 迁成 harold-skills 的 plugin，补报数口径与回放型 eval |
| [[comment-marker-no-prefix]] | idea-loop 发的评论去掉「🤖 idea-loop：」开头和「由 Claude 代发」，脚本改认看不见的标记 |
| [[device-memory]] | 全设备一份记忆：设备级 dreaming 每周把根索引压在上限内、项目事实挪进项目目录 |
| [[dispatch-day-night-modes]] | 调度按时段派：白天开 triage 会话、夜里开 todo 会话做到 review 完，都用 claude -p 交到桌面端直接开 |
| [[dreaming-ask-scope]] | 把 dreaming 问人范围的说法统一成脚本的实际判定，周任务说明改成指过去而不再复述 |
| [[explorer-reads-impl-decisions]] | explorer 读 spec 从只读「测试决策」放宽到再读「实现决策」，用它点名的模块当找位置的起点 |
| [[home-bootstrap]] | 建 home：设备地图与项目清单、SessionStart hook 按项目注入项目地图、setup 一次改三处用户级配置 |
| [[idea-loop-cli]] | idea-loop 的脚本收成 Go 写的 dyna 命令行单独发布，skill 只写命令，插件写命令行版本范围 |
| [[implementer-start-point-non-destructive]] | implementer 开工对齐起点改用不丢东西的 git 写法，不再被 auto mode 拦；定义按 agent-builder 精简到 5000 字内 |
| [[issue-body-background]] | issue 正文的「背景」改成必填，issues new / body 缺它就拒；SEO 扫描拼的正文同步补上 |
| [[magi-existing-branch-worktree]] | magi 下调度给已有分支的 issue 建 worktree 时先查分支在不在，在就接上，不再用 -b 新建 |
| [[pr-review-round-cap]] | pr-review 自动起下一轮放到最多 5 轮，审到没有要修的为止；每轮开审前先合入最新主分支解冲突 |
| [[refine-judge-advisor]] | 设计收敛改由人定：评委降为顾问，每轮交一份配参考图和用户路径的设计评审报告 |
| [[replay-gh-isolation]] | 规则回放起的每个 claude / Codex 子进程都不带 gh 登录，读不到用例之后的线上 issue 与 PR |
| [[replay-snapshot-plugin-sync]] | 回放时把快照里被改动的插件文件换成这一边的版本，改前改后读到不同的规则 |
| [[runtime-local-override]] | 本机对 runtime 的特殊做法写进 ~/home/runtime/<运行环境>.md，开场注入时同名小节整段替换 reference |
| [[scroll-driven-whole-pin]] | 滚动驱动的段只认整段钉住；窄钉子的段照普通长图拍；滚动驱动段每一步都拍一张 |
| [[seo-agents-openseo-tool-name]] | 带连接器的 agent 不写 tools 白名单、只写禁用清单，连接器被别处配置改了名也拿得到工具 |
| [[sections-browser-test-out-of-full-suite]] | 设计档案的浏览器测试移出全量测试命令、另给单独命令，每例加超时 |
| [[seo-autopilot]] | SEO issue 默认全托管：扫描后当场分流、spec 照推荐定、内容改动自动合并并上线自查、每 3 天出效果报告、外联进草稿箱 |
| [[seo-brief-angle-vs-site-posts]] | seo-brief 新开页时先读站内同主题文章，每个角度候选写明和哪篇重合、新页补什么 |
| [[seo-outreach-reads-seo-md]] | seo-outreach 与 seo-writing 改用 seo-md.mjs 读 SEO.md，不再指向 seo-setup 的私有参考 |
| [[seo-skill-descriptions-route-only]] | seo 分类 6 个 skill 的 description 删掉流程与产物，只留「是什么 + 触发词」 |
| [[skill-body-limit-backlog]] | idea-loop 两份超 5000 字的 SKILL.md 把部分运行才走到的分支挪进 references |
| [[skill-rewrite]] | idea-loop 的 skill 与 agent 定义按写法规则逐份重写、五组合并，主体都不超过 4500 字 |
| [[skills-read-home]] | skill 与脚本从 home 的项目目录读写知识库，改动直接提交 home，dreaming-home 对账各项目 |
| [[split-blog-publisher]] | 博客 workflow 进 idea-loop seo 组：brief 出图、写作循环、通用 lint，项目取值走 SEO.md 与 DESIGN.md |
| [[subagent-handback-lost-turn]] | 交回后卡住是那一轮模型请求断了或挂住，被平台合成回复关掉；网络问题，idea-loop 不加机制 |
| [[ui-measure-matrix-gaps]] | ui-measure 补三样能力（只比一个锚点区域、颜色换算后再比、减弱动效格）并去掉两类假红（小数像素、margin/gap） |
| [[ui-ticket-canvas-in-worktree]] | UI 工单参考里画布在不在执行方 worktree 的两处说法统一：画布在，delta 不在，都走 tmp 绝对路径 |
| [[wiki-conventions-slim]] | wiki-conventions 主体从 7854 字缩到 5000 字以下：只有部分调用方用到的细节外置成 references |
