---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, issues, issue-body-background]
summary: issue 正文「背景」改成必填，issues new 与 issues body 缺它就拒，seo-scan 拼的正文固定补一节
related: ["[[297]]", "[[0022-issue-model]]", "[[0023-issue-triage]]"]
---

# ADR-0071 — issue 正文必须写背景

> 由 spec `issue-body-background` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#297。`idea-loop:issues` 的「正文」原来要求「问题」「证据」「影响范围」「从哪发现」四节必填，「背景」是可选（[[0022-issue-model]] 定的格式）。结果开 issue 的会话只写现象，隔几周回来的人读不懂。真实例子是 #69（设计档案：入口是加载中的长页面，加载完的状态不能分段）：正文直接引用「入口是加载中」「design-archive.md §3『分段』」，没说档案里「状态」「分段」是什么。2026-11-12 triage 会话请人定「谁能声明分段」，人回：「这个issue你能给我讲述下吗？时间有点久我有点遗忘了」，会话只好补讲一遍；11-13 retro 里人说根本是书写 issue 时要把上下文整理好，不是重新描述问题靠人回忆。

2026-11-16 对着 main（`5f26e2f`）写一份四节齐全、没有「背景」的正文，跑 `issues body`：打印「正文齐了」、退出 0，照样放行。根因两处：skill 把「背景」标成可选，「开一个 issue」第 1 步只说「写给一个没有上下文的人看」太泛；`issues.mjs` 的必填节清单只有那四个，`issues new` 和 `issues body`（Linear 项目开 issue 前跑的）都只查这四个。

## 2 决策（how）

- **「背景」改必填，排第一节**：写读懂问题要先知道的机制或现状，写给隔了几周回来、已经忘了这一块的人；问题里第一次出现的叫法（规则名、字段、页面、命令）各用一句说清；确实不需要的写「无」。校验只看在不在、空不空，不看顺序，顺序只是格式说明里的建议。
- **必填节清单加「背景」**：`issues new` 和 `issues body` 共用这份清单，一处改、两处生效，Linear 项目也一起。
- **seo-scan 拼的正文补固定一节「背景」**：它自己拼正文、也过同一个校验，不补每次扫描的 issue 都会被拒。内容是固定文字（哪天哪个方向提出的、「怎么复现」可以独立重跑、「建议的修法」是扫描时的判断要在 triage 时核），不让方向 agent 另写，因为扫描无人值守。
- **上线自查回滚时另开的 issue**（`pr-review/references/merge.md`）也补一句「背景：原 issue 改的是什么、上线自查查的是什么」。retro、dreaming 开 issue 跟着「正文」一节走，不用改。
- **版本档位 patch**（0.1.21 到 0.1.22）：起草时按 `REVIEW.md` 判 minor，人在合并时定「合并，但使用一个patch版本」（2026-11-17），避开在 main 上占用 0.2.0 发布线。

没做：判断「背景」写得好不好（机械检查做不到，写个「无」也过，由 review 和 triage 把关）；人在 GitHub 上手开的 issue（不经过脚本，由 `issue-triager` 分拣时读正文把关）；给已开着的 issue 补背景。

## 3 结果（result）

- 脚本：`idea-loop/scripts/issues.mjs` 的 `REQUIRED_SECTIONS = ['背景', '问题', '证据', '影响范围', '从哪发现']` 与 `bodyErrors`；`idea-loop/scripts/seo-issues.mjs` 拼正文第一节是固定的「背景」。
- 文字：`idea-loop/skills/engineering/issues/SKILL.md` 的「正文」一节第一行是「必填」的「背景」；`idea-loop/skills/engineering/pr-review/references/merge.md` 第 5 步回滚 issue 的正文含「背景」。
- 合并在 PR #352（issue 正文必须写背景）；issue #297 已 CLOSED（2026-11-17）；决定记录 [[297]]。
- 守护：`idea-loop/scripts/issues-skill-doc.test.mjs`（「背景」标必填且排第一、回滚 issue 带背景）、`idea-loop/scripts/seo-issues.test.mjs`（正文五节齐全、「背景」在先、点名日期与方向）；`idea-loop/scripts/issues.test.mjs` 里的正文校验用例。
