# retro-issue-replay-material

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle retro-issue-replay-material --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：同意（答 retro-batch-dispatch 的 grill Q5：retro 第 5 步开 issue 时，正文再写决策发生时的提交、让 skill 产出那个东西的那句话、skill 把东西交给人的那一刻，分类照常按 plugin 打并加 `retro`；见 spec「retro 开 issue 时写上回放材料」一节的依据）

**是/否题**：要开的这个 issue，label 里有没有 type:idea-loop 开头的分类和 retro，正文里有没有把决策发生时的提交、让 skill 产出那个东西的那句话、skill 把东西交给人的那一刻这三样都写出来？

**材料的来源**：候选取自 `docs/raw/decisions/55.md` 的候选 5 与它开出的 #102；提交 203cbce 取自 PR #90（`impl/canvas-truth-dreaming-agents`）review 第 2 轮汇报时的分支 HEAD，两条人的发言取自同一个决定记录的题 15 和题 17。回放里提交写在 prompt 中，因为回放的项目拷贝是 `git archive`，没有历史可查。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
