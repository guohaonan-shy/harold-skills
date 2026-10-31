# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[canvas-truth-dreaming-agents]] | 冻结后画布是唯一设计真相，设计变更由 designer 改画布；dreaming 拆成编排者加专职 agent |
| [[confirm-only-on-loss]] | 设计参考加一条可检查的规则：离开 / 结束入口只在会丢用户成果时才弹确认 |
| [[decision-rules-who-decides]] | decision-rules 只管谁来定；讲给人看的写法进 evidence，to-spec 与 pr 按交付物重写，全局沟通风格从读者出发 |
| [[design-archive-sections]] | 设计档案给长页面加可引用的分段：入口拍整页按段切图，边带出发段和落点段，按段比对 |
| [[design-archive-skill-length]] | design-archive 主体 11386 字超 5000、sections.md 1.55 万字：主体只讲图的实体，写法、拍图、命令走 references |
| [[design-archive-unstable-sections]] | 设计档案的分段拍图对脚本动画、轮播、悬停暂停、滚动驱动的段也拍得稳、拍得对，对账不误报也不漏报 |
| [[design-md-write-entry]] | DESIGN.md 写入口收拢：删 design-modeling，写入标准成 reference，只留 uiux-imagine 与 dreaming 两处写 |
| [[design-research-agent]] | 把 Refero 设计调研抽成单独的调研 agent，参考图落本地给人看 |
| [[design-tmp-worktree-root]] | imagine / refine 的设计过程目录改按当前 worktree 根定位，不再用 CLAUDE_PROJECT_DIR |
| [[dreaming-design-reconcile]] | dreaming 每周对账设计档案与 DESIGN.md：重新驱动抓漂移、全站初扫、候选蒸馏 |
| [[dreaming-skill-length]] | dreaming 的 SKILL.md 主体超 5000 字：验证为不存在，issue 量到的是字节数，按字符数是 3525 |
| [[end-task-close-icon]] | 设计参考加一条规则：结束整个任务的入口用 X 并写明结束什么，后退箭头只用于无害地回一步 |
| [[idea-loop-seo]] | idea-loop 新开 seo 分类：蒸馏 OpenSEO 做发现，扫描结果提成 issue，按原有流程解决 |
| [[implementer-reuse-and-compact]] | implementer 不再写死 skill 清单、可读 spec 全文、读 CODING_STANDARDS；卡住的工单复用原执行方；to-ticket 落盘后提交工单（进实现前压缩已移除） |
| [[issue-consolidation]] | cloud 定时任务每 6 小时把改同一文件或模块的 issue 挂到新开的根 issue 下；调度按根出会话，一个根一份 spec、一个会话从审核做到合并 |
| [[link-sweep-skip-code]] | link sweep 只查正文里的 wiki-link，代码里的格式示例不算，不再报一串假阳性 |
| [[native-summary-locate]] | 原生折叠标题按角色定位不到、FAQ 展开写不成边：验证为不存在，已在 design-archive-sections 里做掉 |
| [[no-decision-autopilot]] | 实现阶段没有决定题就不停：切票直接落盘、停下汇报无决定题即放行、review 无事不等；只在生产操作和合并前停，交一份写给不知情者的审核报告 |
| [[pr-review-report-followups]] | 判得出的 agent 自己定，交给人的题先做完功课，少审 spec 的来回与 PR 里的拍板 |
| [[readme-pr-reviewer-model]] | idea-loop README 目录树里 pr-reviewer 的模型与思考强度改成跟定义一致（opus · high） |
| [[retro]] | retro：从会话里的纠正与决定提炼规则候选，批了开 issue，改 skill 要回放证明生效 |
| [[retro-batch-dispatch]] | 调度只数 issue 会话；retro issue 按 plugin 每天做一次 retro 整合，自动做到 PR，人第二天看 |
| [[retro-candidate-pool]] | retro 批的候选由人选进候选池或开 issue；dreaming 数池里同一类出现超过两次的，提议开成 issue |
| [[retro-skill-length]] | retro 的 SKILL.md 主体按字符数约 3200 字，没超 5000：验证为不存在，原数是按字节数的 |
| [[sections-inner-scroll]] | 分段脚本认出真正在滚的元素：内层容器滚动的页面也能量全高、按段拍到首屏以下 |
| [[seo-cannibalization-sitelinks]] | SEO.md 新开「品牌」一节，蚕食判定排除含品牌词的查询，不再把站点链接报成蚕食 |
| [[seo-params-from-seo-md]] | seo skill 要用的项目信息由 setup 推测确认写入；scan 缺了先停下给人确认，补进 SEO.md 再跑 |
| [[session-digest-locate]] | retro 取会话记录时按会话自己的 id 找；退回标记时只认第一条人的发言，对不上不报成功 |
| [[ui-reviewer-archive-pointers]] | ui-reviewer 开工与对账模式用文件路径指向设计档案的分段写法：验证为不存在，已在 design-archive-skill-length 里改成能力名加节名 |
| [[ui-state-archive]] | docs/design 分 tmp / prod，prod 是一张按页面状态建的图，设计与验证共用，合并前归档 |
| [[uiux-imagine-agent]] | uiux-imagine 的执行抽成专职 uiux-imaginer agent，会话只编排和摆结果 |
| [[writing-for-agents-pruning-layers]] | 改 agent 文档先诊断再定方案；按实体组织、参考同样剪枝、通用文档不带项目信息；retro 候选写明怎么验证 |

> 当前为空。上一批（`design-plugin-idea-loop-integration` / `design-loop-v2`）已于 2026-09-16 蒸馏进 [[0001-design-workflow-into-harold-skills]] 与 [[0002-design-loop-v2-imagine-refine]] 并删除。
