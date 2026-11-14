# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[design-archive-loaded-sections]] | 不分段的长状态，首屏以下会连出边的组件按屏补拍进截图 |
| [[docs-ride-code-pr]] | spec、设计、工单跟代码一个 PR 合进主分支；setup 问要不要知识库、放在哪 |
| [[dreaming-triage-autonomous]] | dreaming 只问人 DESIGN.md 和文档冲突，其余自己执行并合并；每周分拣按建议直接翻状态 |
| [[implement-resume-landed]] | 会话断了以后，执行方已做完的工单先当交回 landed 落地，不再回收重派 |
| [[replay-run-large-now]] | 取消夜间回放队列，大用例在修改侧当场跑；回放输入不露题、Codex 当评委、核实改后用上了改动的 skill |
| [[pr-merge-says-release]] | 说插件 PR 可以合并、或交它的审核报告时，一并说它合并后随哪个版本发 |
| [[seo-draft-reads-principles]] | 起草 seo issue 的 spec 前先读对应方向 SEO skill 的原则文件，选项引一手结论；seo-geo 补 llms.txt 的 Lighthouse 判据 |
| [[test-layering-ci-full]] | 执行方只跑改动涉及的测试，全量测试交给 PR 转 ready 后的 CI，review 读 CI 结果不在本机重跑 |

> 当前为空。上一批（`design-plugin-idea-loop-integration` / `design-loop-v2`）已于 2026-09-16 蒸馏进 [[0001-design-workflow-into-harold-skills]] 与 [[0002-design-loop-v2-imagine-refine]] 并删除。
