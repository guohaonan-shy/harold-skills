# implementer-reads-standards

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle implementer-reads-standards --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：实现者照不到的规范，要等 review 才被指出来，多一轮返工。（harold-skills#147 正文里的一句，不是对话里的口述；#147 里没有别的人的原话）

**是/否题**：执行方没被工单点名，也照 CODING_STANDARDS.md 的链接读了 writing-for-agents 吗？

**预期**：改前（主分支的 implementer 定义）答「否」，定义里没有读 `CODING_STANDARDS.md` 的步骤；改后答「是」。改前就答「是」，说明用例没抓住问题。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
