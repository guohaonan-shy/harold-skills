# adr
> 契约：spec 的归档总结——永久。做了的记 why/how/result，决定不做的记 why-not。取代默认是 section 级，不是整份作废。

| 文件 | status | summary |
|---|---|---|
| [[0001-design-workflow-into-harold-skills]] | 生效 | design 工作流迁入 harold-skills，接上 idea-loop 一直空着的设计冻结字段 |
| [[0002-design-loop-v2-imagine-refine]] | 生效 | 设计拆成两次触碰，design plugin 退役并入 idea-loop，发散与收敛分成两个 skill |
| [[0003-ui-state-archive]] | 生效 | docs/design 分 tmp / prod，prod 是按页面状态建的一张图，设计与验证共用，合并前由归档脚本写入 |
| [[0004-design-archive-sections]] | 生效 | 设计档案给长页面加可引用的分段：分段是入口状态的组成、不是节点，类型取自闭集，边带出发段与落点段 |
| [[0005-design-archive-unstable-sections]] | 生效 | 分段拍图把页面时钟与 CSS 动画时间线都停住、只按固定步长拨，拍不稳的段改用 uncontrolled 信号，滚动驱动的段每步建成状态 |
| [[0006-sections-inner-scroll]] | 生效 | 分段脚本认出真正在滚的元素：内层容器滚动的页面按容器量全高、逐屏截再拼成一张段图 |
| [[0007-native-summary-locate]] | 生效 | 原生折叠标题按角色定位不到：边的 locate 兜底写 { text }，测量把按角色找不到的可点元素单列出来 |
| [[0008-ui-reviewer-archive-pointers]] | 生效 | ui-reviewer 指向设计档案的写法改成「能力名加节名」，不再用 references 文件路径 |
| [[0009-design-archive-skill-length]] | 生效 | design-archive 主体以图的实体为中心、<5000 字，写法/拍图/校验/查询/归档各走一份 references |
| [[0010-canvas-truth-dreaming-agents]] | 生效 | 冻结后画布是唯一设计真相、设计变更由 designer 改；删合并前钩子；dreaming 拆成编排者加钉模型的专职 agent |
| [[0011-dreaming-design-reconcile]] | 生效 | dreaming 每周对账设计档案与 DESIGN.md：源码波加实时波、全站初扫、候选蒸馏，产品坏了开 issue 而不改档案 |
| [[0013-design-md-write-entry]] | 生效 | DESIGN.md 只写设计系统本身、不收判例与日期；写入口只留 imagine 新建与 dreaming 维护，其余一律写候选 |
| [[0014-design-reading-load]] | 生效 | 16 份设计原则按读的时机合成 6 份、内容全留；ui-reviewer 的归档/对账步骤挪进 design-archive 按需读 |
| [[0015-uiux-imagine-agent]] | 生效 | imagine 的执行抽成专职 uiux-imaginer，会话只编排；选中的变种导成交接画布给 refine 接着做 |
| [[0016-design-research-agent]] | 生效 | 设计调研交给人调起的 uiux-research 和专职 uiux-researcher，产物是一页 HTML；imagine / refine 不再自己调研 |
| [[0017-design-tmp-worktree-root]] | 生效 | imagine / refine 的设计过程目录按当前 worktree 根（git rev-parse）定位，不再用 CLAUDE_PROJECT_DIR |
| [[0018-confirm-only-on-loss]] | 生效 | 设计参考加规则：离开 / 结束入口只在会丢用户成果时才弹确认，没东西可丢却弹了算 finding |
| [[0019-end-task-close-icon]] | 生效 | 设计参考加规则：结束整个任务的入口用 X 并写明结束什么，后退箭头只用于无害地回一步 |
| [[0020-idea-loop-seo]] | 生效 | idea-loop 新开 seo 分类：蒸馏 OpenSEO 方法做发现，扫描结果提成 issue，按原有 issue 流程解决 |
| [[0021-issue-consolidation]] | 已被取代（→ ADR-0022） | 用 cloud 定时任务把同处改动的 issue 挂成根加子 issue、按根出会话，0.1.8 上线，随后被 issue 模型重定取代 |
| [[0022-issue-model]] | 生效 | issue 状态是唯一真相：七个状态对上 Linear，实现开始即开 draft PR，一个仓库一个 PR，不用父子归组，正文四节必填 |
| [[0023-issue-triage]] | 生效 | backlog 每周由子代理逐个核实、按建议去向直接翻状态；开 issue 必经校验；优先级决定派发顺序；issue-verify 删除 |
| [[0024-issue-linear]] | 生效 | issue 在 Linear 上时 setup 经 MCP 接入、团队状态整理进 ISSUE_TRACKER.md，前提仍由 issues.mjs 判，读写走 MCP |
| [[0025-dispatch-triage-cards]] | 生效 | 调度也给 triage 的 issue 出会话卡片（单独上限 3），人点了才开会话；删掉独立队列，所有 issue 一个队列 |
| [[0026-runtime]] | 生效 | 运行环境从通用流程里抽出：能力清单加每个运行环境一份做法，自动检测，支持 Claude 桌面端与 magi，tripwire 防耦合回来 |
| [[0028-retro]] | 生效 | 新增 retro skill 从会话记录提炼规则候选逐条给人批；改规则用回放用例（改前否、改后是）证明生效 |
| [[0029-retro-batch-dispatch]] | 生效 | 调度只数标题为「仓库名#号」的 issue 会话，子会话不占位；曾设计的 retro 整合当天撤回 |
| [[0030-retro-candidate-pool]] | 生效 | retro 批的候选由人选进候选池或开 issue；dreaming 数池里出现达 3 次的，提议开成 issue，按建议处置直接开 |
| [[0032-session-digest-locate]] | 生效 | session-digest locate 先按会话自己的 id 找，退回标记时只认第一条人的发言，不唯一就退出码 2 |
| [[0033-skill-length-measure]] | 生效 | 「SKILL.md 主体 < 5000 字」写明量法：去掉 frontmatter、按 UTF-8 字符数，附照抄就对的命令，只写一处 |
| [[0034-writing-for-agents-pruning-layers]] | 生效 | 改 agent 文档先诊断；分支按调用方要的东西切；参考同样剪枝；通用文档不带项目信息；retro 候选写明怎么验证 |
| [[0035-decision-evidence-principles]] | 生效 | decision-rules 与 evidence 改成讲原则、不讲逐情形的答案；配什么图交给模型，图放哪归调用方 |
| [[0036-decision-rules-who-decides]] | 生效 | decision-rules 只管谁来定；写给人看的写法归 evidence，to-spec 与 pr 按交付物重写，加规则先归并 |
| [[0037-no-decision-autopilot]] | 生效 | 实现阶段没有决定题就不停，只在生产操作和合并前停；交一份写给不知情者的审核报告 |
| [[0038-pr-review-report-followups]] | 生效 | PR 流程里判得出的 agent 自己定并单列可推翻，review 无事时自动起下一轮（上限两轮） |
| [[0039-implementer-reuse-and-compact]] | 生效 | 保留 implementer 只改定义：按工单挑 skill、读写法规范、卡住的工单叫回原执行方；进实现前压缩已撤 |
| [[0040-orphan-capability-fix-or-remove]] | 生效 | 起草修坏能力的 spec 时先查调用方；一个都查不到，把「修好还是删掉」写成待定 |
| [[0041-readme-pr-reviewer-model]] | 生效 | README 目录树里 agent 的模型与思考强度以 agents/ 下的定义为准，pr-reviewer 那一行改成 opus · high |
| [[0042-link-sweep-skip-code]] | 生效 | link sweep 只查正文和 frontmatter 里的 wiki-link，行内代码和代码块里的格式示例不查 |
| [[0043-seo-cannibalization-sitelinks]] | 生效 | SEO.md 新开「品牌」节，蚕食判定排除含品牌词的查询，不再把站点链接报成蚕食 |
| [[0044-seo-params-from-seo-md]] | 生效 | seo 要用的项目信息经「推测、人确认、写入」，扫描缺了先停下等人，skill 不再自己推着用 |
| [[0045-seo-writing-faq-trim]] | 生效 | FAQ 条数超出项目规范时，seo-writing 先拿 Search Console 搜索词逐条评估，删完仍超才交给人 |
| [[0046-design-archive-loaded-sections]] | 生效 | 比主视口高、不分段的状态，首屏以下会连出边的组件按屏补拍进截图，边用 shot 指向图 |
| [[0047-dreaming-triage-autonomous]] | 生效 | dreaming 只问人 DESIGN.md 和文档冲突，其余自己执行并合并；每周分拣按建议直接翻状态 |
| [[0048-implement-resume-landed]] | 生效 | 会话断了重进来，执行方已做完的工单先当交回 landed 核对落地，再回收，不再回收重派 |
| [[0049-plugin-version-by-change]] | 生效 | 改了插件目录下任何文件的 PR 按改动性质升 major/minor/patch，没升版本的全量测试会红 |
| [[0050-docs-ride-code-pr]] | 生效 | 一个需求的 spec、设计、工单跟代码同一个分支、同一个 PR 合进主分支；setup 问知识库放仓库里、仓库外还是不要 |
| [[0051-pr-merge-says-release]] | 生效 | 说插件 PR 可以合并、交审核报告时，一并说它的版本去向；规则只放根 AGENTS.md 一处 |
| [[0052-replay-run-large-now]] | 生效 | 规则回放取消夜间队列，大用例 PR 开出后当场跑；输入不露题、Codex 当评委、核对改后用上了改动 |
| [[0053-retro-destination-recommend]] | 生效 | retro 摆候选时给去处推荐：同类前两次进候选池，第 3 次起推荐开 issue，仍由人选 |
| [[0054-retro-pool-cross-repo-record]] | 生效 | 候选池里别的仓库的决定记录写成「仓库加路径」，不用 `[[ ]]`；池里 5 条断链已修 |
| [[0055-scope-recommend-by-delivery]] | 生效 | 范围题按「影不影响这次交付」推荐：影响 spec 实现或上线的并进当前 PR，其余不进 |
| [[0056-seo-draft-reads-principles]] | 生效 | 起草 seo issue 前先调对应 SEO skill 读原则、引一手结论；补 llms.txt 判据 |
| [[0057-session-start-inject-rules]] | 生效 | SessionStart 钩子开场注入 decision-rules、runtime 正文与当前环境 reference |
| [[0058-skill-edit-acceptance]] | 生效 | 改 skill 类文件的工单带三格验收，落地前脚本核对交回「调过」writing-for-agents |
| [[0059-test-layering-ci-full]] | 生效 | 执行方只跑改动涉及的测试，全量交给 PR 转 ready 后的 CI；无 CI 时本机兜底 |
| [[0060-to-ticket-walk-request-chain]] | 生效 | 切票前对着最新主分支，从用户入口沿调用链走到数据来源；spec 没覆盖的一段照「唯一会停的情况」处理 |
| [[0061-ai-eval-plugin]] | 生效 | toeflair 的 ai-eval 迁成 harold-skills 的 ai-eval plugin，补报数口径参考与回放型 eval（eval-replay） |
| [[0062-browser-fake-mic]] | 生效 | 要麦克风的流程用 playwright-cli 命名会话加假麦克风自己点着走完，能测授权与拒绝，并往假麦克风喂指定音频 |
| [[0063-comment-marker-no-prefix]] | 生效 | idea-loop 发的评论去掉「🤖 idea-loop：」开头与「由 Claude 代发」署名，脚本改认隐藏标记 |
| [[0064-design-shared-implementations]] | 生效 | DESIGN.md 的 Components 能登记「这类界面必须用的共用实现」并配项目自己的检查，对账核它；章节表补官方 Voice 章 |
| [[0065-dispatch-day-night-modes]] | 生效 | 调度按时段派：白天开 triage、夜里每小时开 1 个 todo 做到 review 完，用 claude -p 加 /desktop 交到桌面端 |
| [[0066-docs-broken-links]] | 生效 | 知识库里指不到文件的双括号链接改成纯文本或删 related 项，不补文件 |
| [[0067-dreaming-ask-scope]] | 生效 | dreaming 问人的范围只在 SKILL.md 开头列一份并跟脚本判定对齐，周任务说明改成指过去，测试从脚本推出类别来守 |
| [[0068-explorer-reads-impl-decisions]] | 生效 | explorer 读 spec 从只读「测试决策」放宽到再读「实现决策」，只拿它点名的模块当找位置的起点 |
| [[0069-glossary-user-flow-wording]] | 生效 | 插件里两处「用户流程」改成术语表标准叫法「用户路径」，不加避用词检查 |
| [[0070-implementer-start-point-non-destructive]] | 生效 | implementer 开工对齐起点改成核空、快进、快进不了再改指分支，不再用 reset --hard；定义压到 5000 字内 |
| [[0071-issue-body-background]] | 生效 | issue 正文「背景」改成必填，issues new 与 issues body 缺它就拒，seo-scan 拼的正文固定补一节 |
| [[0072-magi-existing-branch-worktree]] | 生效 | magi 下调度给已有分支的 issue 建 worktree 时先查分支在不在，本地有就接上，不再一律 -b 新建 |
| [[0073-pr-review-round-cap]] | 生效 | pr-review 自动起下一轮的上限从 2 放到 5，审到没有要修的为止；每轮开审前先合入最新主分支 |
| [[0074-refine-judge-advisor]] | 生效 | 设计收敛改由人定：评委降为顾问，每轮交配参考图和用户路径的评审报告；冻结后走交给调度，搁置的设计放主 checkout 的 pending |
| [[0075-replay-gh-isolation]] | 生效 | 规则回放起的每个子进程（worker、两路判定）一律不带 gh 登录，读不到用例提交之后的线上 issue 与 PR |
| [[0076-replay-snapshot-plugin-sync]] | 生效 | 回放时把项目快照里被改动的插件文件换成各自这一边的版本，改前改后读到不同的规则；评测材料不换 |
| [[0077-scroll-driven-whole-pin]] | 生效 | 设计档案只把整段钉住（宽高都≥半屏）认成滚动驱动，窄侧栏照普通长图拍；滚动驱动段每一步一张图 |
| [[0078-sections-browser-test-out-of-full-suite]] | 生效 | 设计档案的真浏览器测试默认跳过、设环境变量才跑，每例 120 秒超时，REVIEW.md 另给单独命令 |
| [[0079-seo-agents-openseo-tool-name]] | 生效 | 带连接器的 agent 不写 tools 白名单、只写 disallowedTools，连接器被别处配置改了名也拿得到工具 |
| [[0080-seo-autopilot]] | 生效 | SEO issue 默认全托管：扫描后当场分流、spec 照推荐定、内容改动自动合并并上线自查、每 3 天效果报告、外联进草稿箱 |
| [[0081-seo-brief-angle-vs-site-posts]] | 生效 | seo-brief 新开页时先读站内同主题文章，每个角度候选写明和哪篇重合、新页补什么 |
| [[0082-seo-outreach-reads-seo-md]] | 生效 | seo-outreach 与 seo-writing 改用 seo-md.mjs 读 SEO.md，不再指向 seo-setup 的私有参考 |
| [[0083-seo-skill-descriptions-route-only]] | 生效 | seo 分类 6 个 skill 的 description 删掉流程与产物，只留「是什么 + 触发词」 |
| [[0084-skill-body-limit-backlog]] | 生效 | design-modeling 与 pr-review 两份 SKILL.md 把部分运行才走到的分支挪进 references 压回 5000 字，字数测试守回 5000 |
| [[0085-split-blog-publisher]] | 生效 | 博客 workflow 拆进 idea-loop seo 组：brief 出图、改稿循环、通用写作 lint，项目取值走 SEO.md 与 DESIGN.md |
| [[0086-subagent-handback-lost-turn]] | 生效 | 子 agent 交回后卡住是那一轮模型请求丢了，属于网络与平台侧；idea-loop 不加任何恢复机制（未采纳） |
| [[0087-ui-measure-matrix-gaps]] | 生效 | ui-measure 颜色换算后精确比、加减弱动效格、像素层加邻域比对、不再比 margin 与 gap，容差一律不放宽 |
| [[0088-ui-ticket-canvas-in-worktree]] | 生效 | UI 工单参考里「画布在执行方 worktree 里有、delta 没有、都走 tmp 绝对路径」只留一种说法，文档检查钉住 |
| [[0089-version-tier-0x-patch]] | 生效 | 插件还在 0.x 时，改已有流程的行为、老用法照样能用的也升 patch，minor 只留给大范围重构或使用方式的重大改动 |
| [[0090-wiki-conventions-slim]] | 生效 | wiki-conventions 主体缩到 5000 字以下并重组成目录表加生命周期两部分，规则不改，节名当契约 |
