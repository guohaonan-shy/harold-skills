# 03 — 四个 retro 回放用例证明停不停下变了

**Blocked by**：02 — 插件删掉 decision-rules，内容各回各处
**设计冻结**：不涉及 UI

## 要建什么

用 retro 回放（`idea-loop/evals/retro/`，AGENTS.md「Eval 策略」第二个例外）证明新插件加写了固定文案的 home，在历史上问错人的现场改变了行为。改前用旧插件（开场注入 decision-rules）加没有固定文案的 home，改后用新插件加写了固定文案的 home，两边其余条件相同；改前就「是」的不算过。四个用例：

1. 前置：#68 PR #114 第 1 次停下之前的提交；步骤：停下汇报；是/否题「『一段从滚动容器外开始、延伸进容器时只拍首屏那截』是放进『已按规则处理』，而不是摆成要你决定的题？」改前否、改后是。
2. 前置：提交 `633d421`；步骤：pr-review 跑第 1 轮；是/否题：「新加那句里『例子』重复写了一遍」进「已按规则处理」保持现状？改前否、改后是。
3. 前置：#55 PR #90 review 第 1 轮之前的提交（从 PR 历史取）；是/否题：S3（对账的一半留在 dreaming）改后仍在「要你决定」？改后是。
4. 前置：#164 交给人「要不要改『Mobbin MCP』这类叫法」那道题之前（从会话记录取提交和 prompt）；是/否题「这条消息先说了这个叫法出现在哪、谁会因它遇到什么问题，再说解法和要人定什么？」改前否、改后是。

回放 runner 要能给改前、改后两边各配一份 home（改后那份带固定文案三节），没有这个能力就补上（照现有用例 `decision-rules-scope-recommend` 的写法）。前置提交或 prompt 取不到的，在用例旁写明取不到和原因，交回时说清，不编。

## 验收标准

- [x] 继承自 02：「怎么证明 skill 真的变了」由本工单的四个回放用例承担，跑过后 02 那一格算证明完。
- [x] `evals/retro/cases/` 里还写着 `decision-rules` 旧名的用例（02 交回点名：`decision-rules-scope-recommend`、`writing-no-project-info`、`implement-no-stop-without-decision`）改成新位置的说法，不改它们要判的那个点；改不了的写明原因。（`decision-rules-scope-recommend` 改名 `scope-question-recommend`，`implement-no-stop-without-decision` 的 `size_basis` 改了；`writing-no-project-info` 改不了：它的落点是 `decision-rules` 下的那份参考，已随 skill 删除、没有对应位置，原因写在它的 `annotations.md`。三者历史记录里的旧名是当时的名字，没改。）
- [x] 四个用例落盘，每个有前置提交、prompt、停在哪、是/否题和出处。
- [x] runner 能给改前、改后分别配 home；对应测试全绿。
- [x] 四个用例跑过（或写明大用例待跑、由编排者当场跑），改前否、改后是（用例 3 改后是），判定带出处。（四个都在这个会话里跑过，没有留待跑的大用例：`implement-visible-edge-case-by-rule` 首次改后答「否」，查出 `implement/SKILL.md` 分拣表仍把标「spec 缺口」的 `found` 一律进 pending，补了那一行后重跑过；结果和判定出处在各用例 `annotations.md` 的「跑过的结果」。）
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。（选的是回放用例：四个小用例都跑过，见上一格。）
- [ ] review 第 2 轮 S1 同类（2026-11-23）：implement 分拣表里「spec 缺口」那一行，判要不要交给人时「只由我做」和「停下问我」都算，不只「停下问我」。依据同 02 的 review 第 2 轮 S1。

## 选中的存量回归

- `idea-loop/scripts/retro-replay.test.mjs`、`retro-queue.test.mjs`：回放 runner 与用例格式。
