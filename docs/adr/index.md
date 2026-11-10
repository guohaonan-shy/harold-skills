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
| [[0023-issue-triage]] | 生效 | backlog 每周由子代理逐个核实、人批一张表定去向；开 issue 必经校验；优先级决定派发顺序；issue-verify 删除 |
| [[0024-issue-linear]] | 生效 | issue 在 Linear 上时 setup 经 MCP 接入、团队状态整理进 ISSUE_TRACKER.md，前提仍由 issues.mjs 判，读写走 MCP |
| [[0025-dispatch-triage-cards]] | 生效 | 调度也给 triage 的 issue 出会话卡片（单独上限 3），人点了才开会话；删掉独立队列，所有 issue 一个队列 |
| [[0026-runtime]] | 生效 | 运行环境从通用流程里抽出：能力清单加每个运行环境一份做法，自动检测，支持 Claude 桌面端与 magi，tripwire 防耦合回来 |
| [[0028-retro]] | 生效 | 新增 retro skill 从会话记录提炼规则候选逐条给人批；改规则用回放用例（改前否、改后是）证明生效 |
| [[0029-retro-batch-dispatch]] | 生效 | 调度只数标题为「仓库名#号」的 issue 会话，子会话不占位；曾设计的 retro 整合当天撤回 |
| [[0030-retro-candidate-pool]] | 生效 | retro 批的候选由人选进候选池或开 issue；dreaming 数池里出现达 3 次的，提议开成 issue，批了才开 |
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
