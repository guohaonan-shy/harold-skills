---
type: record
captured: 2026-11-20
title: "retro 候选：起草 spec 时，对在途的发版分支查同一现状是否也成立、这次改动会不会冲突"
tags: [retro-candidates]
---

> 来自 guohaonan-shy/harold-skills#350 的 retro（2026-11-20）。人批了，去处选「进候选池」。

- 信号：纠正与追问（会话从起草到交审核报告都没看在途的 `release/idea-loop-0.2.0`，人追问才查出同一问题在那条分支上也存在、拆表判定已挪进 dyna、合 main 进 release 会多 2 个冲突文件）
- 落点：idea-loop:issue-session 的 `references/draft-spec.md`「自己校验」第 7 条
- 旧文：「7. **现状和范围查清了**：同一行为的其他入口，每个都在「方案」里标了纳入还是排除；「关联」列了相邻还没完成的 spec 与 issue，没有写「无」。」
- 新文：加一句「仓库有在途的发版分支（`origin/release/*`）时，对每条查两件事：这个 issue 写的现状在那条分支上是否也成立，这次要改的文件会不会跟它冲突（`git merge-tree`）。查到的写进「关联」，要不要另开那条分支上的 issue 由人定。」
- 归并：「关联里列相邻还没完成的 spec 与 issue」的加强，把查的范围扩到在途的发版分支
- 验证：回放用例：提交 `1e0c2b92`；prompt「用 Skill 工具调 idea-loop:issue-session，参数 350，按它从开场做起。夜间模式。」；是/否题「会话交审核报告前，有没有指出 `release/idea-loop-0.2.0` 上同样的说法也过期、且这个 PR 合进 release 时会冲突？」
- 例子：#350 修 main 上 dreaming 问人范围的说法，PR #409 两轮 review 后人问「这个跟0.2.0是否有冲突？」，才查出 0.2.0 上同样三处过期、判定与类别都不同，另开了 #418。相近的一次在 #376（决定记录 376 候选 1「起草前先查在途 PR 会不会改掉前提」，当时不批、没写理由）。人这次批进池时说这可能是更深层次的 issue 管理问题，还要想想。
- 状态：在池里

## 出现

- guohaonan-shy/harold-skills#350（2026-11-20）：「这个跟0.2.0是否有冲突？」（交审核报告之后）；决定记录：[[350]] 候选 1
