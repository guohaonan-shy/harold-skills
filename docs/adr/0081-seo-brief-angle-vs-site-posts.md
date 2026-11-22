---
type: adr
status: 生效
tags: [idea-loop, seo, seo-brief]
summary: seo-brief 新开页时先读站内同主题文章，每个角度候选写明和哪篇重合、新页补什么
related: ["[[188]]", "[[0020-idea-loop-seo]]"]
---

# ADR-0081 — seo-brief 的角度候选先对照站内同主题的已有文章

> 由 spec `seo-brief-angle-vs-site-posts` 蒸馏而来，该 spec 已删除。决定过程见 [[188]]。

## 1 背景（why）

`seo-brief` 是给一个目标词写内容 brief 的 skill；「新开页」指站点上还没有这个词的页面、要新写一页。issue #188 记了两次真实经过（同一个站点）：为「toefl speaking practice」新开页（2026-10-25），推荐的角度和站内已有的三篇博客重合，人回「同时我希望不要跟现在的blog内容重合」；为「toefl speaking topics」新开页（2026-10-27），推荐的角度和站内两篇文章的小节重合，人提醒「现有的blog我记得之前貌似做过类似的事儿，你可以check下」之后才去对照。

原因是 `seo-brief/SKILL.md` 第 2 步「新开页」只读 `sitemap.xml` 拿一份可链接的页面清单，完成条件也只要清单；第 4 步「角度候选」没有对照这一项。全文搜「重合」「逐篇」零命中。第 1 步 Search Console 的检查管的是目标词会不会自相蚕食，不看角度论点。

## 2 决策（how）

只改 `seo-brief/SKILL.md` 三处，不改别的 skill：

- **第 2 步「新开页」负责取材**：在读 sitemap 之外，从清单里按网址和标题挑出和目标词同主题的已有文章，`curl -s` 逐篇取 H2–H3 大纲和一句论点，抓不到的写明、不猜；完成条件加一份「同主题文章清单」（每篇有大纲和论点，或写明抓不到；没有写「无」）。
- **对照规则放在第 4 步「角度候选」**：每个角度逐篇对照论点与主要小节，重合的换一个角度，或写明重合的是哪一篇哪一节、新页在那之外补什么；不重合写「无重合」；输出结构里每个候选多一行「对照：…」，完成条件加「每个角度候选都有对照结果」。规则放在角度形成的地方而不是照 issue 原文放在第 2 步，因为两处隔着两步；两处由完成条件连起来。措辞用正向写法，不写「不列为候选」。
- 「同主题」怎么挑由 agent 按网址和标题判，不写死规则；挑出的清单写进 brief，人能核。
- **规则验收走回放**：人在 2026-11-16 选了「写回放用例、PR 开出后当场跑」（另一个选项是只做文字检查）；用例取 2026-10-27 那次，是/否题「brief 的角度候选有没有逐篇对照站内同主题的已有文章、写明重合与否」。回放两次都走成「改已有页」，人接受并要求在 PR 里写明没验到新开页取材那一步。
- **版本档**：patch（人 2026-11-20 的原话「以一个patch 版本合并吧」）。

没做（取舍）：第 1 步的自相蚕食检查、「改已有页」模式、`seo-writing` 重查前 10 名、`seo-issues.mjs` 生成的 issue 正文都不改，没有出现过相关实例；新增文字不带任何项目的例子（`no-project-leak.test.mjs` 守着）；runner 不加跨仓库支持，现有 `--repo` 够用。

## 3 结果（result）

- 合并在 PR #402（seo-brief 的角度候选先对照站内同主题的已有文章）；issue #188 已 CLOSED（2026-11-20）。
- 对着 `main` c2b43c34 核过：`idea-loop/skills/seo/seo-brief/SKILL.md` 第 2 步有同主题文章清单与完成条件，第 4 步有逐篇对照的规则与「每个角度候选都有对照结果」，输出结构有「对照：」一行；主体 4486 字，在 5000 字内。
- 守护：`idea-loop/scripts/seo-brief-angle-doc.test.mjs`、`idea-loop/scripts/no-project-leak.test.mjs`（本次对账共 5 条全过）；回放用例在 `idea-loop/evals/retro/cases/seo-brief-angle-vs-site-posts/`（`case.json`、`annotations.md`）。
- 旧的 retro 候选 `docs/records/retro-candidates/retro-candidate-92.md` 状态已改成「已开 issue（#188）」。
