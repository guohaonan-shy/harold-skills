# 03 — pr 按交付物重写：四份交付物各一张节表

**Blocked by**：01（共用写法要先在 `evidence` 里，pr 才能只引它）
**设计冻结**：不涉及 UI

## 要建什么

`idea-loop:pr` 管 PR 上给人看的四份东西：PR 描述（审核报告）、停下汇报、review 汇报、review loop 文件。读的人清楚方向和高层设计，不清楚实现细节，要快速看懂这次改了什么、看到它确实对了的证据、决定合不合并或怎么批。现在这四份的写法是一次次加规则攒出来的（5 个文件共 11841 字符），没有一处写「这一节给读者什么」。

改完之后：

- 四份交付物各一张节表：节名 · 这一节给读者什么 · 谁写。节的取舍从上面的读者推出来。参照 Matt Pocock 的 pr skill：一份 PR 描述三节，「摘要」（能说清要点的最小一张图：伪代码、调用树、文件树、diff、时序图）、「证据」（改前改后：截图最好，其次测试输出）、「合并风险」（能不能撤回、影响面）；原文链接在 `docs/raw/idea-loop-decisions/2026-10-31-handing-to-human-split-grill.md`。我们现有的每一节逐个判：读者靠它得到什么；得不到的删或并。
- 怎么写给人看（结论在前、最小视图、现状带出处、陌生叫法、同条件、题怎么摆）只引 `idea-loop:evidence` 一句，不复述；停下汇报、review 汇报里只写落到这个场景的要求。
- 加规则先归并（`writing-for-agents` 新加的那条）：现有每条规则，能归进一条更通用的就归，不能的才留。

**先交节表，再改正文。** 第一次交回不改文件，作为一道决定题交回（blocked）：四份交付物的新节表，每节一行「节名 · 给读者什么 · 跟现在比：保留 / 并进哪 / 删掉（理由）」；要不要加 Matt 的「合并风险」一节，单独作为一个选项摆出来，带一个本仓库最近合并的 PR 当例子写一遍它会是什么样。人批了（或改了），再照它改写。

脚本绑着的格式要守住，或在这张工单里连脚本和它的测试一起改：`pr-body.mjs` 按固定节名（一句话、问题、怎么修、怎么验证、顺带开的 issue、要你做的事、参考）写入并拒绝代码层面的指称；`review-loop.mjs` 认「**要你决定**」和「需要你决定」标题判断汇报要不要等人、认「做了什么」判断处理完；`review-check.mjs` 查 review 汇报的处置与措辞；`codex-prompt.mjs` 给审查者的输出格式。改了节名的，调用这些节的 skill（`implement`、`pr-review` 及其 references、`pr-reviewer`、`implementer`）同步改。

## 验收标准

- [ ] 第一次交回是节表决定题（blocked），四份交付物都有，「合并风险」单列一个带例子的选项；人批示原话记进工单「人的决定」
- [ ] 改写后四份交付物各有一张节表，每节「给读者什么」，跟批过的一致
- [ ] pr 里讲给人看的写法只引 `evidence`，不复述
- [ ] pr 的 SKILL.md 主体按 `LC_ALL=en_US.UTF-8 wc -m` 在 5000 以内，四份 references 合计不比现在（11841 − SKILL.md 部分）多
- [ ] 改了节名的，`pr-body.mjs` / `review-loop.mjs` / `review-check.mjs` 与其测试同步，调用方文档同步；没改的，脚本测试原样通过
- [ ] 文档测试断言四份交付物各有节表、每节一行「给读者什么」；改前是红的
- [ ] 全部 `node --test idea-loop/scripts/` 通过

## 选中的存量回归

- `pr-body.mjs`、`review-loop.mjs`、`review-check.mjs` 各自的测试：节名与标记一改就会打断
- `pr-review-slim-doc.test.mjs`：断言 pr-review 文档的结构
- `pr-review-cross-skill-refs-doc.test.mjs`：查跨 skill 引用
- `issue-session-implement-doc.test.mjs`：读 implement 里对停下汇报的引用
