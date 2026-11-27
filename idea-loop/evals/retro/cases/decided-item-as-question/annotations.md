# decided-item-as-question

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle decided-item-as-question --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：当时决策的问题是什么？你在哪些选项中选择了当前的选项，原因是什么？我觉的这个是核心

**是/否题**：写到重录 diff 那一条时，有没有同时写出当时的问题（哪个字段、怎么变了）、至少两个选项、选了哪个和理由？

跨仓库用例：`commit` 是 Tofelair 的提交，回放时 `--repo` 指到 Tofelair 的 clone。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
