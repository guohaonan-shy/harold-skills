# guard-four-covered

> 判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle guard-four-covered --run <那次的 run dir> --cases-root idea-loop/evals/to-spec`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。样本本身有想改的地方（换了现场、改了题、改了 prompt），记在「样本改动」。

**当时的原话**：第一件 我选择A

**是/否题**：夜里要停的事，spec 有没有把决策规则护栏里除「合并」以外的四样（术语、动生产数据、真实支付、对外发布）也列进去？

## 样本改动

（还没有。）

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。
也可以记你对这次产出的看法：好在哪、差在哪，写在这一行下面。 -->
- 改前、改后：待跑，没有单独跑。这个用例跟 `one-stop-point` 是同一个 prompt，上面那一次预跑已经产出两份旧插件的 spec，没有再花一次约 $7 去重跑；对着那两份产出自己看了一遍（不是判定会话的判定，不当结论）：
  - 一份：列了合并、动生产数据、真实支付、对外发布，术语没有列进「夜里要停」，而是单列成一道待定（「夜里碰到要起新术语，停下还是先起一个名字」）；
  - 另一份：列了动生产数据、真实支付、对外发布、删改别处的文件，没有术语。
  - 两份都没把四样齐列，按题的口径都是「否」。
- 改后：待跑（等 #451 工单 02 落地）。命令：`retro-replay.mjs --case guard-four-covered --cases-root idea-loop/evals/to-spec --worktree <本分支> --base <集成分支> --before-dyna <本地编的 dyna> --after-dyna <本地编的 dyna> --out <.tmp 下的目录>`（要用本地编的 dyna：`~/.idea-loop/bin/dyna` 太旧，`dyna home config apply --only rules` 会报错；编法见 `DEVELOPMENT.md`）；这一格同样对一次生成的运气敏感，建议多跑几遍。
