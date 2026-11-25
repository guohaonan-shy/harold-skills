# ui-spec-shape

> 判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle ui-spec-shape --run <那次的 run dir> --cases-root idea-loop/evals/to-spec`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。样本本身有想改的地方（换了现场、改了题、改了 prompt），记在「样本改动」。

**题的来源（goal_from）**：docs/spec/spec-for-agents/spec-for-agents.md User Stories 样式与检查 3

**是/否题**：spec 正文里是不是没有给人看的配图和判词（每个 issue 一行「存在 / 不存在」的结论；复现材料、对照图只写文件路径不算配图）？

## 样本改动

（还没有。）

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。
也可以记你对这次产出的看法：好在哪、差在哪，写在这一行下面。 -->
- 改前、改后：待跑。这个用例标成 large（输入同 `spec-option-goal-figure`，改前会出图、可能开浏览器），`--case` 不跑，由编排者在 PR 开出来之后照 `retro-replay.mjs --run-large --pr <N> --worktree <本分支> --cases-root idea-loop/evals/to-spec --cases ui-spec-shape --base <集成分支>` 当场跑（同样要本地编的 dyna）。
- 预期：改前的 to-spec 开头有判词表（「验证」）、问题下有复现图、「前端交互」写「不涉及」；改后的 to-spec 要求保留「前端交互」小节、没有这些给人看的图和判词。
- 注意：题的前半（有「前端交互」）改前大概率也是「是」，真正拉开改前改后的是后半（没有配图和判词）。
- 推翻 20261125T093216 改后=是 ｜ 按改后的题：改后 spec 正文 0 张图、没有判词，复现材料与对照图只写路径；改前嵌了 4 张图（问题 1 两张、问题 2 一张、方案时序图）。Harold 2026-11-25「按推荐」。
