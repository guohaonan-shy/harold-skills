# AI 可见性跟踪

SEO 模块第 7 步：建跟踪（长期计划）的付费由人批一次，原因在 [steps.md](steps.md) 的第 7 步。

1. `get_ai_visibility_tracker`。已配好且定期检查开着：报给人（提示词数、引擎、频率），这一步完成。
2. 没配好：起一份提示词草稿。来源按顺序：人给的；重点页面的头词改写成用户会问 AI 的问题；人同意花一次模型调用的话用 `generate_ai_visibility_prompts`。提示词的原文经人确认，之后不再改写。
3. `estimate_ai_visibility_cost`，`patch` 带上草稿的提示词和引擎，`scheduleInterval` 用人想要的频率（推荐 `weekly`）。把单次检查和每月的花费报给人。
4. 人批了：`save_ai_visibility_tracker` 存提示词和引擎，再 `set_ai_visibility_schedule`（`enabled: true`，人选的频率）。首次开启会排一次基线检查，读那次的结果，不再另买 `run_ai_visibility_check`。人没批：什么都不存，记下「geo 方向会一直是未采集」。
5. 这次花了 credits（`find_serp_competitors`、`generate_ai_visibility_prompts`），用 `update_project_context` 的 `appendResearchLog` 记一条：查了什么、花了多少，别的 skill 据此不重买。
