# 02 — to-spec 按交付物重写：每一节写清给读者什么

**Blocked by**：01（共用写法要先在 `evidence` 里，to-spec 才能只引它）
**设计冻结**：不涉及 UI

## 要建什么

`idea-loop:to-spec` 的交付物是一份 spec（markdown 文件）。读它的人清楚方向和高层设计，不清楚实现细节，要快速看懂问题、看到证据、做出决定；下游 agent（切工单、实现、review）也照它做。现在的模板是一次次加规则攒出来的，没有一处写「这一节给读者什么」，主体 6033 字符，超过仓库「SKILL.md 主体 < 5000 字」的上限。

改完之后：

- 模板每一节有一行「这一节给读者什么」，节的取舍从上面的读者推出来。参照 Matt Pocock 的 to-spec（七节：问题、方案、User Stories、实现决策、测试决策、Out of scope、补充；只有模板，没有流程），原文在 `docs/raw/idea-loop-decisions/2026-10-31-handing-to-human-split-grill.md` 引的链接。我们多出来的节（验证、根因、技术方案总览、测试表、关联）逐个判：读者靠它得到什么；得不到的删或并。
- 「先写交付物，再列做法」写进「方案」节的说明：先写用户最终得到什么、由哪些输入决定，再写做法；选项差在用户能感到的地方，只差内部结构的不是选项；每个选项牵出的中间状态写全；改了文字，图和测试表同步改。
- 怎么写给人看（结论在前、最小视图、现状带出处、陌生叫法、同条件、题怎么摆）只引 `idea-loop:evidence` 一句，不复述。
- 加规则先归并（`writing-for-agents` 新加的那条）：现有每条规则，能归进一条更通用的就归，不能的才留。
- 主体 UTF-8 字符数在 5000 以内，长的流程细节可以进 to-spec 自己的 references。

**先交节表，再改正文。** 第一次交回不改文件，作为一道决定题交回（blocked）：新节表，每节一行「节名 · 给读者什么 · 跟现在比：保留 / 并进哪 / 删掉（理由）」，加上流程那 8 步各自的去向。人批了（或改了）节表，再照它改写。

脚本读 spec 的格式要守住，或在这张工单里连脚本和它的测试一起改：`spec-status` 读「验证」表每行的「存在 / 不存在」、开头的「> 需要 grill」、「实现决策」下以「待定」开头的标题、frontmatter 的 `status` 和 `issues`；`issue-verify` 的自检读「验证」「问题」「User Stories」「Out of scope」「关联」等节名。`issue-verify` 里关于现状核查的话（「先复现」节末、自检 6、7）跟新写法对齐，不重复 `evidence`。

## 验收标准

- [ ] 第一次交回是节表决定题（blocked），每节带「给读者什么」和跟现在比的去向；人批示原话记进工单「人的决定」
- [ ] 改写后的模板每节有一行「这一节给读者什么」，跟批过的节表一致
- [ ] 「方案」节写着先写交付物再列做法的四点
- [ ] to-spec 里讲给人看的写法只引 `evidence`，不复述（搜「陌生」「同条件」「出处」在 to-spec 里不再是完整规则）
- [ ] to-spec 主体按 `LC_ALL=en_US.UTF-8 wc -m` 在 5000 以内
- [ ] `spec-status check docs` 对仓库现有 spec 不报新问题；`spec-status` 的测试通过；新模板起草的一份样例 spec 跑 `route` 能正确分流（存在 → 正式；带待定 → 审核中）
- [ ] `issue-verify` 自检里引用的节名跟新模板一致
- [ ] 文档测试断言 to-spec 模板每节有「给读者什么」一行、主体在 5000 字符内；改前是红的
- [ ] 全部 `node --test idea-loop/scripts/` 通过

## 选中的存量回归

- `spec-status` 自己的测试：读「验证」表和「待定」标题，节名一改就会打断
- `issue-session-implement-doc.test.mjs`：读 issue 流程文档里对 spec 的引用
- `pr-review-cross-skill-refs-doc.test.mjs`：查跨 skill 引用，to-spec 节名变了可能打断
