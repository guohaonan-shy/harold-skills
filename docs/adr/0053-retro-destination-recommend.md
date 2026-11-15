---
type: adr
status: 生效
tags: [idea-loop, retro, retro-destination-recommend]
summary: retro 摆候选时给去处推荐：同类前两次进候选池，第 3 次起推荐开 issue，仍由人选
related: ["[[0030-retro-candidate-pool]]", "[[174]]", "[[314]]"]
---

# ADR-0053 — retro 摆候选时给去处推荐：默认进候选池，第 3 次起推荐开 issue

> 由 spec `retro-destination-recommend` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:retro` 把人批了的规则候选交给人选去处：进候选池，或直接开 issue。ADR-0030 当时定「retro 不给推荐」，依据是「两次现存实例也推不出『哪类该开 issue』的规则」；参考 `candidate-pool.md` 的「摆给人时怎么回」写「去处由人定，你不给推荐」，retro 的 SKILL.md 第 4 步写「更不替人选去处」。结果是每条批了的候选，retro 只摆两个去处，人自己判。

人判的依据其实就是池的门槛。#174 的 retro（2026-11-14，决定记录 [[174]] 候选 2）里，人说：「开issue的选择时只有出现2-3次相同的候选。」随后定「仍然保持3次」；计数脚本 `retro-pool-count.mjs` 的门槛也是 3。真实例子：那次 retro 有两条候选批了，retro 没给推荐；人先说出判据，再当场破例「这两个内容我觉的可以开issue」。判据和例外都由人临场说出，retro 本可以先把判据摆好。

## 2 决策（how）

- **每条候选给去处推荐，去处仍由人选。** 次数就是「同类」一项里的 N（计数以脚本为准，「池里没有」算第 1 次）：第 1、2 次推荐默认进候选池，第 3 次起推荐开 issue，跟池的门槛一致；推荐跟「这是第 N 次，并进 <那一份>」写在一起，人一眼看到理由就是次数。人选了不同的去处就按人选的走，不劝。
- **人只回「批」时按推荐走**，回复里说一句走了哪个。原来写「问一句去哪」，那时没有推荐可依；`idea-loop:decision-rules` 把「都按推荐」算作人对题的选择。拿不准的说法（不是「批」也不是两个去处之一）照旧问。
- **规则只写在 `candidate-pool.md` 一处**，retro 的 SKILL.md 第 4 步只写「去处给推荐、由人选」并指过去，不重复次数。
- 取舍：没改池的门槛（3 次）和 dreaming 对池的提议规则，二者不变；没动回放用例 `retro-pool-choice`（它的题是「有没有问人去哪」，人在 prompt 里明说「留在候选吧」，加推荐不改答案）。

## 3 结果（result）

- `idea-loop/skills/productivity/retro/references/candidate-pool.md`「摆给人时怎么回」一节有推荐规则；`idea-loop/skills/productivity/retro/SKILL.md` 第 4 步写「每条给去处推荐，去处由人选」，旧的「更不替人选去处」「不给推荐」已删。
- 守护：`idea-loop/scripts/retro-destination-recommend-doc.test.mjs`（先在旧文上红）。
- 提交 `8ad7c75`，合并在 PR #319（分支 `issue/314-retro-pool-default`），决定记录随 PR #324 合并，见 [[314]]。idea-loop 升 patch（0.1.15 → 0.1.16）：起草时按 `REVIEW.md` 判的 minor，人在合并前改定 patch。issue #314 已 COMPLETED 关闭（2026-11-14）。

取代 ADR-0030「批的时候由人选去处，retro 不给推荐」那一条。
