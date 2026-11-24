---
type: adr
status: 生效
tags: [idea-loop, seo, seo-scan, seo-outreach, pr-review, decision-rules, seo-autopilot]
summary: SEO issue 默认全托管：扫描后当场分流、spec 照推荐定、内容改动自动合并并上线自查、每 3 天效果报告、外联进草稿箱
related: ["[[291]]", "[[0020-idea-loop-seo]]", "[[0022-issue-model]]", "[[0056-seo-draft-reads-principles]]"]
---

# ADR-0080 — SEO issue 默认全托管：从扫描到上线不停下等人，上线后有人看效果

> 由 spec `seo-autopilot` 蒸馏而来，该 spec 已删除。决定过程见 [[291]]。

## 1 背景（why）

`seo-scan` 是 idea-loop 的 SEO 扫描 skill：并行查站点各方向，把发现提成 GitHub issue；`SEO.md` 是目标仓库根上的 SEO 配置文件。issue #291 的证据取自当时唯一有 `SEO.md` 的项目（2026-11-12 对着它的 `origin/main` 查）：一个只改内容的 SEO 改动，从扫出到上线要在四处停下等人，而人在这几处几乎都是「照推荐」。

- 四处停点：issue 在 backlog 等每周分拣；spec 里有「待定」就推送、停下；合并只由人定（`decision-rules`「护栏」）；外联产出停在 `docs/` 里的草稿，邮件由人自己发。
- 人做了什么（该项目 2026-10-22 起的 26 个 SEO issue）：7 场决定记录里 6 场原话是「选 A」「照推荐」；被拒的 6 个里 5 个是 Claude 起草 spec 时自己验出的误报；已完成的 14 个没有一个 PR 改了 `.tsx` 或 `.astro` 组件，全是博客正文、配图、title/description、`llms.txt` 和 `docs/` 台账。2026-11-10 扫出的 5 个 issue 到 11-12 还在 backlog，实现 PR 等人合并 1 到 18 小时。
- 上线后没有任何一步回头看效果，也没有一步打开线上页面核对；OpenSEO 套餐每月约 10,000 credits、账期重置不累积，一个月只花了约 800，被单次 2000 上限、28 天节奏和 geo 额度 0 压着。
- issue #215：technical 方向拿两次审计比 title/description，不看中间合并了什么，有意的 SEO 改动被报成 `key-page-meta-changed`，项目里出现三次，每次都是一个会话核实后关成「不存在」。

## 2 决策（how）

决定一条 issue 走全托管还是停下等人的输入只有两个：分类是不是 `type:seo/*`，要不要 UI 设计（spec 有没有「前端交互」小节、改动是否只落在内容范围内）。

- **扫描后当场分流**：`seo-scan` 对本次新建的每个 issue 起 `idea-loop:issue-triager`（同时最多 5 个），按它交回的 `route` 翻：canceled、triage、todo；判不了的也翻 todo。`type:seo/*` 的分拣规则只写在分拣员的去向表里（只有要新建或改组件、页面模板、样式的才进 triage），`issue-triage` 不改、不排除 SEO。
- **误报在扫描端消掉**：新脚本用两次审计之间的合并历史判出处，找到出处的不出发现，只在研究日志记「有意改动」。
- **spec 照推荐定**：`draft-spec.md` 加 SEO 分支，「待定」照推荐改写成决定、依据写「AI 照推荐定：<理由>」，不推送不停下；有「前端交互」的仍翻回 triage。`SEO.md` 新增「内容原则」节，起草时先读。
- **自动合并是「护栏」的一条例外**：检查与 `seo-check` 全过、两轴无阻塞、改动只落在 `SEO.md`「内容路径」内，三条全满足才由 Claude 合并；PR 描述要有「上线自查的网址」一节，没有就不自动合并。
- **上线后自查与回滚**：合并后轮询到线上与构建产物一致（等满「上线等待」，默认 30 分钟，仍不一致则不回滚、推送叫人看部署），逐网址核能打开、没 noindex、title/description 一致、在 sitemap；全过则在 issue 上贴带隐藏标记的评论并开排名追踪，任一不过则 `git revert` 开 PR、检查过了合并、推送，另开同分类新 issue 直接翻 todo（原 issue 已是 done，不改状态模型）。
- **效果报告**：新方向 `results` 加新 agent `results-analyst`，每 3 天一次，其余五个方向每 7 天；定时任务改成每天一次。报告落 `docs/records/seo-results/`，由 seo-scan 开只改 `docs/` 的 PR、检查过了合并。
- **额度按周花**：`SEO.md`「OpenSEO」改成「套餐额度」加「每周分配」；`seo-budget.mjs` 去掉单次 2000，本周预算 = 本账期剩余额度 ÷ 剩余周数，超出本周剩余的研究不跑、推送给人。旧的「单次额度」报错并提示跑 seo-setup 迁移。geo 方向后来有了无人值守时的花费规则，以 `seo-geo-unattended-spend-doc.test.mjs` 钉的写法为准。
- **外联进草稿箱**：`seo-outreach` 新增「放进草稿箱」「发送」「跟进」「目录提交」四支：连着邮件 MCP 时草稿直接建进人的草稿箱，人说「发」才发；目录提交用新的运行环境能力『人的浏览器』填到最后一步，登录、人机验证、点提交都留给人。没有这些能力的环境退回写 `docs/`。

没做（取舍）：排名、点击变差不自动回滚，只进报告和 issue；真正发邮件、点提交、超出每周额度的花费、UI 设计仍只由人定；不新增 `type:seo/results` 分类；报告不用 PostHog 截图（定时任务里登录不了），只附 dashboard 链接；非 SEO issue 的分拣、待定题、合并规则不变。

## 3 结果（result）

- 合并在 PR #338（SEO issue 默认全托管：从扫描到上线不停下等人，上线后有人看效果），#291 与 #215 均已 CLOSED；人定的版本档是 patch（决定记录 [[291]] 题 2）。
- 分流：`idea-loop/skills/seo/seo-scan/SKILL.md`「分流」节与 `references/routing.md`；`idea-loop/agents/issue-triager.md` 的 SEO 分支。误报：`idea-loop/scripts/seo-meta-provenance.mjs`。
- spec 照推荐定：`idea-loop/skills/engineering/issue-session/references/draft-spec.md`；`SEO.md` 的「内容原则」「内容路径」「上线等待」由 `idea-loop/scripts/seo-md.mjs` 读。
- 自动合并与自查：`idea-loop/skills/productivity/decision-rules/SKILL.md` 的「SEO 例外」；`idea-loop/skills/engineering/pr-review/references/seo-auto-merge.md`、`merge.md`「上线后自查」；`idea-loop/scripts/seo-content-scope.mjs`、`seo-live-check.mjs`、`seo-live-record.mjs`。
- 效果报告：`idea-loop/agents/results-analyst.md`、`idea-loop/skills/seo/seo-scan/references/results-report.md`、`idea-loop/scripts/seo-due.mjs`（`results: 3`，其余 7）、`idea-loop/skills/seo/seo-setup/references/daily-scan.md`。额度：`idea-loop/scripts/seo-budget.mjs`。
- 外联：`idea-loop/skills/seo/seo-outreach/SKILL.md` 四个分支；『人的浏览器』在 `idea-loop/skills/productivity/runtime/SKILL.md` 的能力表与 `references/claude-desktop.md`、`magi.md`。根 `AGENTS.md` 的 seo-scan 出口已改成新的两个出口。
- 守护测试（本次对账跑过 147 条全过）：`seo-scan-routing-doc`、`seo-meta-provenance`、`seo-spec-recommend-doc`、`seo-auto-merge-doc`、`seo-content-scope`、`seo-live-check`、`seo-live-record`、`seo-post-deploy-doc`、`seo-results-report-doc`、`seo-budget-doc`、`seo-outreach-doc`，均在 `idea-loop/scripts/`。
- 未核：合并后对存量 backlog 的一次性分流、以及在真实项目上的五条验收（一次扫描分流、自动合并、故意加 noindex 看 revert PR、第一份效果报告、草稿箱里的外联邮件）没有留在仓库里的痕迹，这次对账查不到。
- 取代关系：[[0020-idea-loop-seo]] 里「单一入口 `seo-scan`」一条（每周定时、单次 2000、keywords/backlinks/geo 满四周才跑）和 §3「新 SEO issue 是 backlog、由每周 triage 分拣」一条，已被本 ADR §2 的当场分流、每天定时与按周额度取代。
