# 01 — 起草 seo issue 前先读 SEO 原则文件；llms.txt 原则补 Lighthouse 判据

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里两段给 agent 读的规则文字：

1. issue 会话起草 spec 时读的「起草参考」（issue-session 的 draft-spec 参考文件），它的「输入」一节在「issue 写的现状也要核一遍」那一项之后加一项：issue 带 `type:seo/<方向>` 的，先读这个方向的 agent 调的 SEO skill（方向与 agent 的对应在 seo-scan 的 SKILL.md 那张方向表，agent 调哪个 skill 写在它自己的定义里），连同那个 skill 的 `references/`；选项和推荐讲到某种做法有没有用时，引那里的结论和出处，不写「说法不一」这类没核过的话；原则文件没覆盖的才自己查一手来源，查不到的标成猜测。措辞可为通顺小改，意思不变；不写死方向到 skill 的对照表。
2. seo-geo 的原则文件（references 里的 principles）「llms.txt」一节，在最小示例之后加一段：Lighthouse 的 Agentic Browsing 评分（实验室评分，不是 Google 搜索信号）有一项 `llms-txt`：4xx 不计分；5xx 或取不到判不通过；返回 200 时要有一级标题、至少一个 markdown 链接、不少于 50 个字符，否则不通过。所以对不存在的 `/llms.txt` 返回 200 加 HTML 外壳在那里算不通过，修法是返回真 404，或放一个合格的真文件（上面的最小示例就合格）。出处：Lighthouse 13.5.0 源码，经 claude-seo 的 `scripts/lighthouse_agentic.py` 转述，2026-11-10 核对。

两段都不得出现任何真实项目的名字或场景（举例只用通用例子）；不得重新出现 `issue-verify`。

## 验收标准

- [x] 起草参考的「输入」有 `type:seo/<方向>` 一项，指向 seo-scan 的方向表和 agent 定义，含「引那里的结论和出处」与「标成猜测」两层意思
- [x] seo-geo 原则文件「llms.txt」一节含：4xx 不计分、5xx 不通过、一级标题 / markdown 链接 / 50 字符三条、「不是 Google 搜索信号」、修法（真 404 或合格真文件）、出处
- [x] `node --test idea-loop/scripts/no-project-leak.test.mjs idea-loop/scripts/issue-group-skills.test.mjs` 通过
- [ ] review 第 1 轮 C1（2026-11-10）：起草参考「输入」里 seo 那一项不再让起草会话直接读别的 skill 的 `references/`，改成「用 Skill 工具调这个方向的 agent 调的那个 SEO skill，只读它写修法建议前要读的原则，不跑它的检查步骤」，方向表与 agent 定义的指针、「引那里的结论和出处」「查不到标成猜测」保持不变。要遵守的规则原文：「别的 skill 不读它的 `references/`，要用就调这个 skill，由它指过去。」（「要建什么」第 1 条里「连同那个 skill 的 `references/`」以这一格为准）

## 选中的存量回归

- `no-project-leak.test.mjs`：新增文字最容易带进项目名。
- `issue-group-skills.test.mjs`：断言插件里不再出现 issue-verify，新增文字是由一条关于 issue-verify 的 issue 引出的。
