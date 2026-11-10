---
type: adr
status: 生效
tags: [idea-loop, retro, dreaming]
summary: retro 批的候选由人选进候选池或开 issue；dreaming 数池里出现达 3 次的，提议开成 issue，批了才开
related: ["[[2026-10-26-retro-candidate-pool-grill]]"]
---

# ADR-0030 — retro 候选先进候选池，由 dreaming 数次数、提议开成 issue

> 由 spec `retro-candidate-pool` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

- retro 原先设计成「批了就开 issue」。人两次想要第三种去处（harold-skills#108 回「留在候选吧」；Tofelair#538 想先按编号沉淀在本地、真要改插件时再提 issue），只能绕开 skill 手写文件。
- 一次性的依据不稳：#55 的 retro 按 3 次「接受」开出了 issue，回看时 3 次里 2 次被人推翻。
- 手工建起的候选池有 20 份，没有任何 skill 读它。

## 2 决策（how）

- **批的时候由人选去处，retro 不给推荐。** 人的回复拆成「批·进候选池」「批·开 issue」，不批、改成不变。人的原话是进池还是直接开 issue 需要由他判断；两次现存实例也推不出「哪类该开 issue」的规则。
- **一条候选一份文件，形状统一**：frontmatter 加信号、落点、旧文、新文等，外加「出现」节，每场会话一行逐字原话；状态闭集 `在池里` / `已开 issue` / `驳回`。次数 = 不同会话的行数，减去后来被推翻的行。
- **同类归并在 retro 写入时做**（要读懂内容，写入时说出「这是第 N 次」让人核）；之后的计数机械化，交给脚本。
- **dreaming 的门槛是出现 ≥ 3 次**（人的原话「超过两次」）。提议表新增「retro 候选」一节，处置闭集：`开 issue：机械检查` · `开 issue：改 skill` · `留在池里` · `驳回`；dreaming 自己做这一节不起 agent，批了才开 issue，不自己改 skill。
- **池按落点分仓库**：落点是插件的进 harold-skills 的池，是目标仓库规则文件的进目标仓库的池；dreaming 各看各的池，不跨仓库读。retro 在别的仓库跑、候选进 harold-skills 的池时，另开一个只改 `docs/` 的 PR。
- **目录放 `docs/records/retro-candidates/`，类型 `record`**：池文件要加行、改状态，与 `raw/` 的「忠实、不编辑」冲突。

## 3 结果（result）

- `retro` 的参考资料「候选池」规定形状与读写；候选格式带「同类」一项。
- 计数脚本 `retro-pool-count.mjs`（按 JSON 输出每份次数与是否过门槛，形状不对退出码 2），另有 `retro-pool-reopened.mjs`（驳回过的候选之后是否又出现新会话，按 git 历史判）；`proposal-table-check.mjs` 认「retro 候选」一节和处置闭集。
- `dreaming` 的 `references/retro-candidates.md` 管这一节，SKILL.md 只留一行指针。
- 池在 `docs/records/retro-candidates/`（2026-11-10 对账时 28 份文件）；回放用例 `retro-pool-choice` 守「问人去哪」这一步。

## 取代线索

- 取代 ADR-0028 里「批了的候选一律开成 issue」那一条，并取代 `retro-batch-dispatch` 的 retro 整合设想（ADR-0029）。
- 「dreaming 不参与 retro」（ADR-0028 的排除项）在此改为：dreaming 只数池、提议，不改 skill。
