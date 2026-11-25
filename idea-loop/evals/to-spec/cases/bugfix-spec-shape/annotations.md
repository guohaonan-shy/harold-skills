# bugfix-spec-shape

> 判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle bugfix-spec-shape --run <那次的 run dir> --cases-root idea-loop/evals/to-spec`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。样本本身有想改的地方（换了现场、改了题、改了 prompt），记在「样本改动」。

**题的来源（goal_from）**：docs/spec/spec-for-agents/spec-for-agents.md User Stories 样式与检查 1

**是/否题**：七节（问题陈述、方案、User Stories、实现决策、测试决策、Out of scope、关联）是否齐、顺序对，User Stories 里的期望行为编号是否对得上问题陈述的小节编号，且没有复现图、方案里的时序图和「根因」小节？

## 样本改动

（还没有。）

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。
也可以记你对这次产出的看法：好在哪、差在哪，写在这一行下面。 -->
- 2026-11-25（#451 工单 03）改前预跑，run 20261125T072801：改后的插件（#451 工单 02 的 to-spec）还没落地，所以改前、改后两边都用了集成分支起点 1b4afc66 的插件（`--before-plugin` 与 `--after-plugin` 指同一份，改动核对写「不适用」），这一遍只回答「题在改前的 to-spec 上是不是『否』」；报出的「不过」是因为改后还是旧插件，不是规则没用。
  - 改前=否（两遍都是）：产出里有方案下的时序图（`![白天 triage 一轮的时序：红色是这份 spec 新增或改动的消息](…)`）和「### 根因」小节，还有开头判词「> #398 存在（只剩白天 triage 那一半）……」和方案下的「### 后端」。七节是齐的。花费 $5.30。
  - 样本改动：这一遍的题里写的是「没有复现图和『根因』小节」，评委把方案的时序图也算作要删的图；题随后改成「没有复现图、方案里的时序图和『根因』小节」（`case.json` 与 `sample.md` 同步改），答案不变。
- 改后：待跑。等 #451 工单 02 落地后，由编排者当场跑：`retro-replay.mjs --case bugfix-spec-shape --cases-root idea-loop/evals/to-spec --worktree <本分支> --base <集成分支> --before-dyna <本地编的 dyna> --after-dyna <本地编的 dyna> --out <.tmp 下的目录>`（要用本地编的 dyna：`~/.idea-loop/bin/dyna` 太旧，`dyna home config apply --only rules` 会报错；编法见 `DEVELOPMENT.md`）。
