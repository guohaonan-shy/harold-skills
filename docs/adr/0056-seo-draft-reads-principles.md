---
type: adr
status: 生效
tags: [idea-loop, seo, issue-session, seo-geo, seo-draft-reads-principles]
summary: 起草 seo issue 前先调对应 SEO skill 读原则、引一手结论；补 llms.txt 判据
related: ["[[0020-idea-loop-seo]]", "[[0022-issue-model]]", "[[151]]"]
---

# ADR-0056 — 起草 seo issue 的方案前先读 SEO skill 的原则

> 由 spec `seo-draft-reads-principles` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

一个项目的 `/llms.txt` 返回的是应用的 HTML 外壳，被 seo-scan 提成 `type:seo/geo` 的 issue。起草方案的会话没读 `seo-geo` 的原则文件，spec 写「主流 AI 爬虫是否真的会读，公开说法不一（猜测，未核实）」，推荐只能是「收益不确定就选最小的」。而 `seo-geo/references/principles.md` 的「llms.txt」一节早已写明：Google 搜索不用它，主要 AI 搜索没公开说过会读，真正用得上的是开发者文档站。人没采纳那条推荐，在 retro 里追问出处，才发现证据插件里本来就有。

根因有两个。原则文件只被 seo-scan 的方向 agent 读（它们用方法 skill 找问题），起草方案那一步的输入清单没指过去；分拣的证据评论也只写现状，不带原则结论。另外原则文件写了「llms.txt 对搜索没用」，没写「坏了按什么判」：issue 起草时就缺这一条来决定修法（返回 404 还是放真文件）。

issue 原先写的落点 `issue-verify` 在 #243 已删，改落到现在起草 spec 的地方，`issue-session` 的起草参考。

## 2 决策（how）

- **起草参考的「输入」加一项**：issue 带 `type:seo/<方向>` 时，起草会话先用 Skill 工具调这个方向的 agent 调的那个 SEO skill，只读它写修法建议前要读的原则，不跑它的检查步骤（`seo-geo` 的检查里有付费的 AI 可见性步骤）。选项和推荐讲到某种做法有没有用时，引那里的结论和出处，不写「说法不一」这类没核过的话；原则没覆盖的才自己查一手来源，查不到的标成猜测。
- **不写死方向到 skill 的对应表**，指回已有的两处：`seo-scan` 的「派方向 agent」表，和各方向 agent 定义里写的它调哪个 skill。再抄一份会跟它们漂移。
- **原则文件补 Lighthouse 判据**：`seo-geo` 的 `principles.md`「llms.txt」一节加一段：Lighthouse 的 Agentic Browsing 评分（实验室评分，不是 Google 搜索信号）里 `llms-txt` 一项，4xx 不计分，5xx 或取不到判不通过，返回 200 时要有一级标题、至少一个 markdown 链接、不少于 50 个字符；所以对不存在的地址返回 200 加 HTML 外壳不通过，修法是返回真 404 或放一个合格的真文件。出处是 Lighthouse 13.5.0 源码，经 claude-seo 的 `scripts/lighthouse_agentic.py` 转述，2026-11-10 核对。
- **新增文字不举真实项目的例子**，由 `no-project-leak.test.mjs` 守着。

取舍：

- 起初写的是「连同那个 skill 的 `references/`」，让起草会话直接翻别的 skill 的参考资料。PR #278 review 第 1 轮 C1 指出它与 writing-for-agents「别的 skill 不读它的 `references/`，要用就调这个 skill，由它指过去」冲突，人定改成「调 skill、由它指过去」。
- **没改** `to-spec`：它是通用起草方法，也给非 seo 项目用，seo 分支放在 issue-session 的起草参考里，不让每次起草都读到 SEO 规则。
- **没改** `issue-triager`（分拣只判真伪、分类、去向，不出方案选项）、`seo-brief`（内容类 issue 本就从 SEO 方法出发，缺口出在 geo / technical 走通用起草时）、`seo-geo/SKILL.md` 第 3 步（只报现状，已指向 principles）。
- **没做**「spec 里出现『说法不一』『猜测』」的机械检查：措辞多变，没有可靠匹配。也没把 Lighthouse 其他审计项（WebMCP、ai-catalog）写进 seo-geo：没有对应的发现实例。

## 3 结果（result）

- `idea-loop/skills/engineering/issue-session/references/draft-spec.md`「输入」有 `type:seo/<方向>` 一项，写明调 skill、只读原则、不跑检查、引结论和出处、查不到标猜测，并指向 `idea-loop:seo-scan` 的「派方向 agent」表；`idea-loop/skills/seo/seo-geo/references/principles.md`「llms.txt」一节有 Lighthouse 判据、修法和出处。
- 合并在 PR #278（起草 seo issue 的方案前先读 SEO skill 的原则文件）；issue #151 已 COMPLETED 关闭；决定记录见 [[151]]。
- 守护：只有 `no-project-leak.test.mjs`（不带项目名）和 `issue-group-skills.test.mjs`（不复活 `issue-verify`）这两条旧测试，没有专门钉这两句话的新测试；下一次起草 seo issue 会不会照做，要等一次真实运行才知道，没建 eval（仓库 AGENTS.md §5）。
