# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[canvas-truth-dreaming-agents]] | 冻结后画布是唯一设计真相，设计变更由 designer 改画布；dreaming 拆成编排者加专职 agent |
| [[confirm-only-on-loss]] | 设计参考加一条可检查的规则：离开 / 结束入口只在会丢用户成果时才弹确认 |
| [[design-archive-sections]] | 设计档案给长页面加可引用的分段：入口拍整页按段切图，边带出发段和落点段，按段比对 |
| [[design-archive-skill-length]] | design-archive 的 SKILL.md 主体按字符数 11386，超 5000：主体只讲图的实体，命令与写法走 references |
| [[design-archive-unstable-sections]] | 设计档案的分段拍图对脚本动画、轮播、悬停暂停、滚动驱动的段也拍得稳、拍得对，对账不误报也不漏报 |
| [[design-md-write-entry]] | DESIGN.md 写入口收拢：删 design-modeling，写入标准成 reference，只留 uiux-imagine 与 dreaming 两处写 |
| [[design-research-agent]] | 把 Refero 设计调研抽成单独的调研 agent，参考图落本地给人看 |
| [[design-tmp-worktree-root]] | imagine / refine 的设计过程目录改按当前 worktree 根定位，不再用 CLAUDE_PROJECT_DIR |
| [[dreaming-design-reconcile]] | dreaming 每周对账设计档案与 DESIGN.md：重新驱动抓漂移、全站初扫、候选蒸馏 |
| [[dreaming-skill-length]] | dreaming 的 SKILL.md 主体超 5000 字：验证为不存在，issue 量到的是字节数，按字符数是 3525 |
| [[end-task-close-icon]] | 设计参考加一条规则：结束整个任务的入口用 X 并写明结束什么，后退箭头只用于无害地回一步 |
| [[idea-loop-seo]] | idea-loop 新开 seo 分类：蒸馏 OpenSEO 做发现，扫描结果提成 issue，按原有流程解决 |
| [[native-summary-locate]] | 原生折叠标题按角色定位不到、FAQ 展开写不成边：验证为不存在，已在 design-archive-sections 里做掉 |
| [[pr-review-report-followups]] | 判得出的 agent 自己定，交给人的题先做完功课，少审 spec 的来回与 PR 里的拍板 |
| [[retro]] | retro：从会话里的纠正与决定提炼规则候选，批了开 issue，改 skill 要回放证明生效 |
| [[retro-batch-dispatch]] | 调度只数 issue 会话；retro issue 按 plugin 每天做一次 retro 整合，自动做到 PR，人第二天看 |
| [[retro-candidate-pool]] | retro 批的候选由人选进候选池或开 issue；dreaming 数池里同一类出现超过两次的，提议开成 issue |
| [[retro-skill-length]] | retro 的 SKILL.md 主体按字符数约 3200 字，没超 5000：验证为不存在，原数是按字节数的 |
| [[sections-inner-scroll]] | 分段脚本认出真正在滚的元素：内层容器滚动的页面也能量全高、按段拍到首屏以下 |
| [[seo-cannibalization-sitelinks]] | SEO.md 新开「品牌」一节，蚕食判定排除含品牌词的查询，不再把站点链接报成蚕食 |
| [[ui-state-archive]] | docs/design 分 tmp / prod，prod 是一张按页面状态建的图，设计与验证共用，合并前归档 |
| [[uiux-imagine-agent]] | uiux-imagine 的执行抽成专职 uiux-imaginer agent，会话只编排和摆结果 |

> 当前为空。上一批（`design-plugin-idea-loop-integration` / `design-loop-v2`）已于 2026-09-16 蒸馏进 [[0001-design-workflow-into-harold-skills]] 与 [[0002-design-loop-v2-imagine-refine]] 并删除。
