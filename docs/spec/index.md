# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[design-archive-loaded-sections]] | 不分段的长状态，首屏以下会连出边的组件按屏补拍进截图 |
| [[docs-ride-code-pr]] | spec、设计、工单跟代码一个 PR 合进主分支；setup 问要不要知识库、放在哪 |
| [[dreaming-triage-autonomous]] | dreaming 只问人 DESIGN.md 和文档冲突，其余自己执行并合并；每周分拣按建议直接翻状态 |
| [[implement-resume-landed]] | 会话断了以后，执行方已做完的工单先当交回 landed 落地，不再回收重派 |
| [[migrate-to-home]] | 把本机两个项目的知识库、10 个项目的记忆、用户级 skill 搬进 home，在 0.2.0 装上后一次做完 |
| [[plugin-version-by-change]] | 改了插件的 PR 按改动性质升 major / minor / patch，没升版本的测试会红 |
| [[pr-merge-says-release]] | 说插件 PR 可以合并、或交它的审核报告时，一并说它合并后随哪个版本发 |
| [[replay-run-large-now]] | 取消夜间回放队列，大用例在修改侧当场跑；回放输入不露题、Codex 当评委、核实改后用上了改动的 skill |
| [[retro-destination-recommend]] | retro 摆候选时给去处推荐：默认进候选池，同类第 3 次起推荐开 issue，仍由人选 |
| [[retro-pool-cross-repo-record]] | 候选池「出现」行引别的仓库的决定记录时写仓库加路径，不用 [[ ]]；修掉池里 5 条断链 |
| [[scope-recommend-by-delivery]] | 范围题按「影不影响这份 spec 的实现、上线」推荐并进当前 PR 还是不进 |
| [[seo-draft-reads-principles]] | 起草 seo issue 的 spec 前先读对应方向 SEO skill 的原则文件，选项引一手结论；seo-geo 补 llms.txt 的 Lighthouse 判据 |
| [[skill-edit-acceptance]] | 改 skill 的工单自带三格验收，落地时脚本核对交回调过 writing-for-agents |
| [[test-layering-ci-full]] | 执行方只跑改动涉及的测试，全量测试交给 PR 转 ready 后的 CI，review 读 CI 结果不在本机重跑 |

> 当前为空。上一批（`design-plugin-idea-loop-integration` / `design-loop-v2`）已于 2026-09-16 蒸馏进 [[0001-design-workflow-into-harold-skills]] 与 [[0002-design-loop-v2-imagine-refine]] 并删除。
| [[device-memory]] | 全设备一份记忆：设备级 dreaming 每周把根索引压在上限内、项目事实挪进项目目录 |
| [[dispatch-one-per-device]] | 一台设备一个调度 dispatch-home：配置在 home、上限按状态、每 30 分钟一轮 |
| [[dispatch-triage-per-round]] | 白天的 triage 也按每轮新开表里的上限个，triage 分组总数另设上限（表里新一列，默认 10） |
| [[dyna-app-layer-cleanup]] | 运行环境说明搬出插件、由 setup 照模板生成；dyna 去掉写死的桌面端默认和应用层叫法 |
| [[dyna-missing-commands]] | dyna 补上 skill 五处还要 agent 自己拼 gh / git 的命令：按状态列 issue、打 kind、空提交、按提交检出、等 PR 检查 |
| [[edge-case-known-limit]] | 思考、决策、沟通、证据由 setup 写成 home 的固定文案；插件删掉 decision-rules，证据搬进 evidence |
| [[evidence-forms]] | evidence 按五种形态分支（加录屏），从 home「证据」往下展开，配一组取自真实交付物的回放样本 |
| [[home-bootstrap]] | 建 home：设备地图与项目清单、SessionStart hook 按项目注入项目地图、setup 一次改三处用户级配置 |
| [[idea-loop-cli]] | idea-loop 的脚本收成 Go 写的 dyna 命令行单独发布，skill 只写命令，插件写命令行版本范围 |
| [[in-scope-legacy-fix]] | 影响本次改动的存量问题在本 PR 里修，不再被当成无关存量自动开 issue |
| [[pr-five-sections]] | PR 描述改成问题、概要、证据、合并风险、要你做的事五节，evidence 照 show-me 出视图菜单 |
| [[runtime-local-override]] | 本机对 runtime 的特殊做法写进 ~/home/runtime/<运行环境>.md，开场注入时同名小节整段替换 reference |
| [[runtime-ops-in-docs]] | 运行环境的操作全写进运行环境说明，dyna 不再认环境分支；说明按能力模板写，新环境照模板生成 |
| [[scope-case-input]] | 回放用例「范围题推荐」的输入改成从 issue-session 进，让它测得到「边界」那一句范围题推荐法 |
| [[session-cleanup]] | issue 会话自己建 worktree、收尾时连分支和进程一起收；测试和 eval 的临时目录由 dyna 分配和回收 |
| [[setup-modules]] | setup 接完核心后按设计、SEO、评测三段问接不接，按插件装没装出题，正文腾出篇幅 |
| [[skill-change-verify]] | 改 skill 的每处改动在 spec 里写定怎么验，新能力也能写用例跑，落地时 dyna 核用例在、结果在 |
| [[skill-rewrite]] | idea-loop 的 skill 与 agent 定义按写法规则逐份重写、五组合并，主体都不超过 4500 字 |
| [[skill-structure-checks]] | skill 文件的常驻检查：写文件时 hook 对 home 下全部 skill 跑字数线 4500、对 idea-loop 跑行内命令绊线、review 报主文件增长、retro 先判能不能做成检查、没 CI 时同一 head 的全量只跑一次 |
| [[skills-read-home]] | skill 与脚本从 home 的项目目录读写知识库，改动直接提交 home，dreaming-home 对账各项目 |
