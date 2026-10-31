---
type: record
captured: 2026-10-31
title: "retro 候选：开 PR 前、之后每次推送前，先在本地把最新 main 反合进分支"
tags: [retro-candidates]
---

> 来自 guohaonan-shy/Tofelair#712 的 retro（2026-10-31）。人批了，去处选「进候选池」（原话：「我倾向于先落候选吧，很难说这是一个很常见的case。」）。

- 信号：纠正与追问（推迁移的 dry-run 在没反合 main 的 PR 分支上报乱序错误，人追问推迁移和合并的先后），人在 retro 里扩成通用方向
- 落点：没定（候选：插件 `idea-loop:implement` 开 PR 前与 `implement` / `pr-review` 每次往 PR 分支推送前加「本地反合最新 main」；目标仓库 `DEVELOPMENT.md`「分支」一节，加「对生产库推迁移」第 1 步写「在已反合最新 main 的 PR 分支上 dry-run」并补先推迁移再合并的理由；两层都写）
- 旧文：插件里没有这一步——`idea-loop:implement`「没活了就停下」第 1 步直接「推送，`gh pr create --draft`」，`pr-review` 修复落地后直接推；Tofelair `DEVELOPMENT.md`「对生产库推迁移」第 1 步：「先跑 `supabase db push --dry-run`：只列出会推哪些迁移，不执行。」
- 新文：「开 PR 之前、开 PR 之后每次往 PR 分支推提交之前，先在本地把最新 main 合进分支（app 管的 worktree 用 app 的同步工具），有冲突先解决，再推。反合提交跟着本来要推的提交一起上去，CI 不多跑；review 看的、推迁移用的，都是合上 main 之后真正会上线的代码。」
- 例子：Tofelair PR #750 推新表迁移时，#510 的迁移已经先合进 main 并推到生产，PR 分支里没有这个文件，`supabase db push --dry-run` 报「Remote migration versions not found」并提示 `migration repair`；换到「PR 分支 + 最新 main」的临时检出里重跑，清单才只剩这次那一条。
- 状态：在池里

## 出现

- guohaonan-shy/Tofelair#712（2026-10-31）：「我觉得这样，开pr之前、开pr之后的每一次commit之前，我觉得在本地都需要进行反合（本地）。这样ci也不会多跑，每次review的都是上线的最新版本」（retro 摆候选 3「推迁移前反合」时人扩成通用规则）；决定记录：[[712]]
