---
type: spec
tags: [idea-loop, seo, issue-session, seo-geo]
summary: 起草 seo issue 的 spec 前先读对应方向 SEO skill 的原则文件，选项引一手结论；seo-geo 补 llms.txt 的 Lighthouse 判据
related: ["[[0020-idea-loop-seo]]", "[[0022-issue-model]]"]
issues: [151]
---

# 起草 seo issue 的方案前先读 SEO skill 的原则文件

> #151 存在：起草 spec 的输入清单里没有「先读对应 SEO skill 的原则文件」这一步，seo issue 的选项会把插件里已有的一手结论写成「说法不一（猜测）」；issue 写的落点 issue-verify 已删，改落到 issue-session 的起草参考，详情在「问题陈述」

## 问题陈述

### 1. 起草 seo issue 的方案时没人去读插件里现成的 SEO 结论

真实经过（issue 正文）：一个项目的 `/llms.txt` 返回的是应用的 HTML 外壳，被 seo-scan 提成 `type:seo/geo` 的 issue。起草方案时没读 `seo-geo` 的原则文件，spec 写「主流 AI 爬虫是否真的会读，公开说法不一（猜测，未核实）」，推荐只能是「收益不确定就选最小的」。而 `seo-geo/references/principles.md` 的「llms.txt」一节早已写明：Google 搜索不用它，主要 AI 搜索没公开说过会读，真正用得上的是开发者文档站。人没采纳那条推荐，retro 里追问出处，才发现证据插件里本来就有。

现状（2026-11-10 对着 `main` 92fa448 复核，与分拣评论一致）：

- 当时起草方案的 `issue-verify` 已在 #243 删掉，`idea-loop/scripts/issue-group-skills.test.mjs` 还断言插件里不再出现它。issue 写的「旧文 / 新文」落点不存在了。
- 现在起草 spec 的地方是 `issue-session` 的 `references/draft-spec.md`。它的「输入」一节只有三项：issue 全文与评论、分拣证据评论、用 `idea-loop:evidence` 核现状。`grep -i seo` 在 `issue-session`、`to-spec` 下零命中。
- 所以同样的 issue 今天再起草一次，仍没有任何一步要求先读 SEO skill 的原则文件。

证据：分拣评论 https://github.com/guohaonan-shy/harold-skills/issues/151 （「🤖 idea-loop：」那条，2026-11-10）。

### 2. seo-geo 只说「200 却是 HTML」是坏的，没给怎么判、怎么修

`seo-geo/SKILL.md` 第 3 步「llms.txt」一项只报「返回 200 却是 HTML 页面」这种坏掉的；`principles.md` 的「llms.txt」一节没有任何外部判据。上面那个 issue 起草时就缺这一条来决定修法（返回 404 还是放真文件）。

一手来源（本次核对，2026-11-10）：claude-seo 仓库 `scripts/lighthouse_agentic.py`（提交 1142460，2026-09-23）的说明写着它对照的是 Lighthouse 13.5.0 源码：`llms-txt` 审计遇 4xx 不计分，5xx 或取不到判不通过，否则要求有一级标题、至少一个 markdown 链接、不少于 50 个字符。它属于 Lighthouse 的「Agentic Browsing」实验室评分，不是 Google 搜索信号。

### 根因

1. 原则文件只被 seo-scan 的方向 agent 读（它们调方法 skill 找问题），起草方案那一步的输入清单没指过去；分拣证据评论也只写现状，不带原则结论。
2. 原则文件写了「llms.txt 对搜索没用」，没写「坏了按什么判」。

## 方案

起草 spec 的会话（triage 会话或 todo 会话）拿到一个带 `type:seo/<方向>` 的 issue 时，先用 Skill 工具调这个方向对应的 SEO skill、只读它写修法前要读的原则（由那个 skill 指过去，不直接翻它的 `references/`，也不跑它的检查步骤），再写选项和推荐；讲到某种做法有没有用，引原则文件的结论和出处。原则文件没覆盖的才自己查一手来源，查不到的标成猜测。人看到的题因此带着插件已有的结论，不再出现「说法不一」。

改动两处：

1. `issue-session/references/draft-spec.md` 的「输入」一节加一项（文字见「实现决策」）。对应 writing-for-agents 的杠杆：**信息层级**——只有 seo issue 会走到，所以写成一项带指针的输入，不展开每个方向的文件清单。
2. `seo-geo/references/principles.md` 的「llms.txt」一节加 Lighthouse 判据一段，并给出由它推出的修法。对应杠杆：**事实有出处**。

同一行为的入口：

- `issue-session/references/draft-spec.md`「输入」：**纳入**。triage 会话、todo 会话起草 spec 都走它，一处覆盖。
- `to-spec`：**排除**。它是通用的起草方法，也给非 seo 的项目用；带 seo 分支放在 issue-session 的起草参考里，不让每次起草都读到 SEO 规则。
- `agents/issue-triager.md`（分拣）：**排除**。分拣只判真伪、分类、去向，不出方案选项；起草时这条规则会再核一遍。
- `seo-brief`：**排除**。内容类 SEO issue 的「方案」由它写，它本就从 SEO 方法出发；这次的缺口出在非内容类（geo / technical）走通用起草时。
- `seo-geo/SKILL.md` 第 3 步 llms.txt 检查：**排除**。它只报现状，判据放进原则文件，第 3 步的「见 principles」已经指过去。

## User Stories

只修问题，不画树。

1. 期望行为（对应问题 1）：起草带 `type:seo/<方向>` 的 issue 时，会话先读该方向 SEO skill 的原则文件；spec 的选项和推荐讲到某做法有没有用时，引原则文件的结论和出处；原则文件没覆盖、自己也查不到一手来源的，才标「猜测」。
2. 期望行为（对应问题 2）：`principles.md` 的「llms.txt」一节写明 Lighthouse 的判据和出处，并说明对「不存在的地址返回 200 加 HTML」的修法是返回真 404 或放一个合格的真文件，且注明这是实验室评分、不是搜索信号。

## 实现决策

- **draft-spec「输入」新增一项**，在「issue 写的现状也要核一遍」之后：「issue 带 `type:seo/<方向>` 的：先用 Skill 工具调这个方向的 agent 调的那个 SEO skill（方向与 agent 的对应在 `seo-scan` 的 SKILL.md，agent 调哪个 skill 在它的定义里），只读它写修法建议前要读的原则，不跑它的检查步骤。选项和推荐讲到某种做法有没有用时，引那里的结论和出处，不写「说法不一」这类没核过的话；原则没覆盖的才自己查一手来源，查不到的标成猜测。」措辞允许实现时为通顺小改，意思不变。
  - 修正（PR #278 review 第 1 轮 C1，人 2026-11-10 定「C1 选 A」）：起初这里写的是「连同那个 skill 的 `references/`」，让起草会话直接翻别的 skill 的参考资料，与 writing-for-agents 的「别的 skill 不读它的 `references/`，要用就调这个 skill，由它指过去」和 idea-loop/AGENTS.md「参考资料归谁」冲突，改成调 skill、由它指过去。要写明「只读原则、不跑检查步骤」：seo-geo 的检查里有付费的 AI 可见性步骤。
- **不写死方向 → skill 的表，指向已有的对应关系**。依据：`seo-scan` 的 SKILL.md 已有方向 → agent 表，五个 agent 定义各自写了调哪个方法 skill（geo → `seo-geo`，technical → `seo-audit`，pages → `competitor-analysis`，keywords → `keyword-research` / `keyword-clustering`，backlinks → `link-prospecting` / `seo-outreach`）；再抄一份会跟它们漂移。
- **新增文字不举真实项目的例子**。依据：仓库 AGENTS.md「插件里不出现任何项目的信息」，`no-project-leak.test.mjs` 守着；issue 原文的项目名不带进插件。
- **principles.md 补的一段**：「Lighthouse 的 Agentic Browsing 评分（实验室评分，不是 Google 搜索信号）有一项 `llms-txt`：4xx 不计分；5xx 或取不到判不通过；返回 200 时要有一级标题、至少一个 markdown 链接、不少于 50 个字符，否则不通过。所以对不存在的 `/llms.txt` 返回 200 加 HTML 外壳在那里算不通过，修法是返回真 404，或放一个合格的真文件（上面的最小示例就合格）。出处：Lighthouse 13.5.0 源码，经 claude-seo 的 `scripts/lighthouse_agentic.py` 转述，2026-11-10 核对。」依据：问题 2 的一手来源；示例本身有一级标题、两条链接、超过 50 字符。
- **seo-geo 的 SKILL.md 不动**。依据：第 3 步只报现状、已写「见 principles」；判据在原则文件一处。
- 两个文件的 SKILL 字数不受影响：draft-spec.md 是 reference，principles.md 是 reference。plugin 版本不在这次升，照仓库现有做法由集成时的 chore 提交统一升。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及：只改规则文字 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：两段规则文字，照仓库 AGENTS.md §5 不做 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：两个文件的文字，加上仓库已有的 `idea-loop/scripts/no-project-leak.test.mjs` 和 `issue-group-skills.test.mjs`。抓得到：规则写进去了、没带项目名、没复活 issue-verify；抓不到：下一次起草 seo issue 时会不会照做（要等下一个真实 seo issue）。
- **增量功能测试**：
  - 前置：本分支。
  - 步骤：读改后的 draft-spec「输入」和 principles「llms.txt」；跑 `node --test idea-loop/scripts/no-project-leak.test.mjs idea-loop/scripts/issue-group-skills.test.mjs`。
  - 期望：「输入」有 `type:seo/<方向>` 一项，指向 seo-scan 的方向表和 agent 定义，含「引那里的结论和出处」「标成猜测」；「llms.txt」一节含 4xx 不计分、一级标题 / markdown 链接 / 50 字符、「不是 Google 搜索信号」、修法和出处；两个测试通过。
  - 覆盖：期望行为 1、2。
- **照着谁写**：`docs/spec/seo-writing-faq-trim/` 同为规则文字的修改。

## Out of scope

- 给「spec 里出现『说法不一』『猜测』」写机械检查：措辞多变，没有可靠的匹配。
- 把 Lighthouse Agentic Browsing 的其他审计项（WebMCP、ai-catalog）写进 seo-geo：没有对应的发现实例。

## 关联

- 相关 spec：[[0020-idea-loop-seo]]（seo-scan 与方向 agent 的设计）、[[0022-issue-model]]（issue 会话的起草流程）。
- 相邻还没完成的 issue：#234（issue-verify 和 seo-outreach 的 description）也提到 issue-verify，但改的是 description 写法，不碰起草输入，无重叠；#164（方向 agent 的 OpenSEO 工具白名单）改 agent 定义的 tools 行，不碰本次指向的「调哪个 skill」，无先后依赖。
