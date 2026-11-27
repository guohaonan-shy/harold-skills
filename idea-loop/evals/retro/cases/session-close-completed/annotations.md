# session-close-completed

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle session-close-completed --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：关闭的理由不应该是not planned……我们这次就是复现发现这个问题已经解决了。（人在 Toeflair#465 的 triage 会话里，说完「好的，那你关了吧」之后纠正的）

**是/否题**：会话要执行的关闭命令是 `dyna issues set <docs> done 465` 带证据评论，而不是 `set canceled`？

## 怎么跑（只能当场跑）

代码提交 `467e1cd81` 在 Toeflair 仓库（GitHub `guohaonan-shy/Tofelair`），home 提交 `08548f3` 在 home 仓库，`--run-large` 按 `--worktree` 所在仓库取提交，取不到它们。要用 `--repo` 指到 Toeflair 的本地 checkout、`--home-repo` 指到 home 的本地 checkout：

```
node ~/.idea-loop/bin/retro-replay.mjs --case session-close-completed --repo <Toeflair 本地 checkout> --home-repo <home 本地 checkout> --worktree <本 worktree>
```

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：代码 `467e1cd81`（Toeflair 的 origin/main，2026-11-26 16:20，会话在评论里核对的就是它）；home `08548f3`（2026-11-27 08:19，那天会话关闭 #465 之前最近的一个），里面 `lr-report-prompt-refactor` 的 spec 写着「#465 不存在：生产库最近 30 天（2026-11-11 查）471 份 L&R 报告、6028 条问题卡，……大写层名 0 处」，就是会话当时引的证据。
- **prompt**：当时开会话的原句不在仓库里。这里用 #465 的标题、正文和 2026-11-26 之前的三条评论重拼（关闭那天的评论在会话之后，不放）；再加一段人的话：从起草 spec 开始、生产库其实查过、数据在哪、起草时核完没有要做的事就直接关掉（对应当时人说的「好的，那你关了吧」，回放里没有来回，写成一句交代）。第一版 prompt 没有「从起草 spec 开始」，会话直接去关，没有读「起草 spec」参考，改前也选了 done，用例没抓住问题，所以改成从起草开始；人不在场、禁写操作、关闭命令写在最后一段回复里。**没有把人的纠正写进 prompt**：写了，改前的 skill 也会选 done，用例就抓不住问题。
- **改前预计答「否」**：改前 `issue-session` 的第 1 步和「起草 spec」参考写的是「已被做掉的……去收尾」「`set canceled`」，当时的会话就是这样翻的 canceled。改后两处都写成 `set done` 带证据评论。
- **缺的**：当时的会话记录不在仓库里，人纠正的原话取自 Toeflair 的会话与 issue 评论。GitHub 读不了（回放里没有登录），所以 issue 全文贴在 prompt 里。
- **判定依据**：看交回的最后一段回复（以及 home 里它写的东西）：它要执行的关闭命令是 `dyna issues set … done 465 --comment=…`，评论里带证据（生产库数据、防回归检查的位置），而不是 `set canceled`。

## prompt 改写记录

- 用例格式校验拒绝 prompt 里出现 eval、评测等词。2026-11-26 那条评论原文里的 `evals/asserts/_lr_layer_names.py` 写成 `asserts/_lr_layer_names.py`，「两个评测检查」写成「两个检查」；其余原文不动。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
