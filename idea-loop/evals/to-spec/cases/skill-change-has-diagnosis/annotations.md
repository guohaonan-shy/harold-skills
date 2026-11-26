# skill-change-has-diagnosis

> 判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle skill-change-has-diagnosis --run <那次的 run dir> --cases-root idea-loop/evals/to-spec`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。样本本身有想改的地方（换了现场、改了题、改了 prompt），记在「样本改动」。

**题的来源（goal_from）**：docs/spec/spec-for-agents/spec-for-agents.md User Stories 样式与检查 2

**是/否题**：有没有「杠杆诊断」这一节，frontmatter 有没有 `changes_agent_docs: true`？

## 样本改动

（还没有。）

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。
也可以记你对这次产出的看法：好在哪、差在哪，写在这一行下面。 -->
- 2026-11-25（#451 工单 03）改前预跑，run 20261125T072801：改后的插件（#451 工单 02 的 to-spec）还没落地，所以改前、改后两边都用了集成分支起点 1b4afc66 的插件（`--before-plugin` 与 `--after-plugin` 指同一份，改动核对写「不适用」），这一遍只回答「题在改前的 to-spec 上是不是『否』」；报出的「不过」是因为改后还是旧插件，不是规则没用。
  - 改前=否（两遍都是）：有「### 杠杆诊断与调用方」，但 frontmatter 只有 `type`、`issues`、`tags`、`summary`、`related`，没有 `changes_agent_docs: true`；另一遍正文只有「调用方清单与杠杆诊断」，没有标题叫「杠杆诊断」的一节。花费 $5.34。
  - 说明：集成分支的 to-spec 已经会在改 agent 文档的 spec 里写一节杠杆诊断（#456 合进来了），所以题的后半「frontmatter 有没有 `changes_agent_docs: true`」才是这一格真正钉住的东西；题里两样要同时有。
- 2026-11-25 改后（编排者当场跑），run 20261125T082247：改前=否（有杠杆诊断，但 frontmatter 没有 `changes_agent_docs: true`），改后=是（标了，有 `## 杠杆诊断`），过。花费 $4.98。
