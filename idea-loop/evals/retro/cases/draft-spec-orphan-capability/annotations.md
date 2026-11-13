# draft-spec-orphan-capability

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle draft-spec-orphan-capability --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：分数排序是哪个部分使用，我在前端都没有看到（人在 Toeflair#430 切票时说的；Toeflair `docs/raw/decisions/430.md` 题 1、题 2）

**是/否题**：spec 有没有把「修好还是删掉」写成一条待定，依据是查过按分数排序和最低分过滤没有任何调用方？

## 怎么跑（只能当场跑）

用例的提交 `b9602e50` 在 Toeflair 仓库（GitHub `guohaonan-shy/Tofelair`），不在本仓库，`--run-large` 按 `--worktree` 所在仓库取提交，取不到它。只能用 `--repo` 指到 Toeflair 的本地 checkout：

```
node ~/.idea-loop/bin/retro-replay.mjs --case draft-spec-orphan-capability --repo <Toeflair 本地 checkout> --worktree <本 worktree>
```

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：`b9602e50`（Toeflair，`2b7f0791` 的父提交，`2b7f0791` 是 `docs(spec): 起草 history-score-sort (#634)`）。这个状态里 `history-score-sort` 的 spec 还不存在。学生端前端只在两处沾边：API 客户端 `api/analysis.ts` 声明了 `sort_by` / `min_score` 参数，`PracticeHistoryPage.tsx` 把地址栏的 `?sort_by=` 读进一个没有 setter 的 state；没有任何界面控件把排序设成分数，也没有任何地方传 `min_score`。所以「查过没有调用方」要靠起草时去前端核，不是 grep 一下就有结论。
- **prompt**：当时调 to-spec 的原句不在仓库里。这里用 issue #430 的标题、正文和 2026-10-26 的补充评论（起草前就有）重拼；关闭时的评论（「spec 已实现并合并」）不放，它在起草之后。另加两句回放必须的：照 issue-session 的「起草 spec」参考自校验（回放里没有 issue 会话，prompt 里点明它在哪、怎么找）、人不在场并禁止提交推送和 gh 写操作。**没有把人的追问提前写进 prompt**：写了，改前的 skill 也会去查调用方，用例就抓不住问题。
- **改前预计答「否」**：改前的「自己校验」只要求把同一行为的其他入口标纳入或排除，没有要求查调用方；当时的会话就是这样按修好起草的。改后的第 7 条要求修坏能力的 spec 查调用方，查不到写成「待定：修好还是删掉」。
- **缺的**：当时的会话记录不在仓库里，人追问的原话取自 Toeflair 的决定记录。回放里写出什么由 skill 自己决定。
- **判定依据**：看交回的最后一段回复和工作区里的 spec：「实现决策」里有没有一条「待定」，选项是修好和删掉；spec 里有没有写查过调用方、结论是一个都没有。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
