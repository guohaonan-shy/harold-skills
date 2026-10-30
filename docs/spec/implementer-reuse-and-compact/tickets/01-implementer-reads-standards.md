# 01 — implementer 按工单挑 skill、读写法规范、spec 全文可读

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的工单执行方（`idea-loop:implementer`，插件里的一份 agent 定义）开工时的规矩改三处：

- **skill 不再写死清单。** 现在定义开头写死了「开工先调 wiki-conventions、tdd、decision-rules」，工单要用别的 skill（写文章的 seo-writing、改 skill 文档的 writing-for-agents）只能靠切票时手写进工单。改成：只有 decision-rules 仍是开工必调（定义里「停，还是延后」整节引用它）；其余看工单内容自己挑，定义里写一句怎么挑，再举几个例子（按 TDD 实现代码的工单调 tdd；往 `.tmp/` 放东西前调 wiki-conventions；改 skill、agent 定义、AGENTS.md 的工单照 `CODING_STANDARDS.md` 链接到的写法；写站点文章调 seo-writing）。例子是用来说明怎么挑的，不是清单。定义里其它几节按条件点名的 skill（ui-measure、design-archive、browser、evidence）原样保留。
- **spec 全文可读。** 现在规定 spec「只读测试决策」，别的部分不读。改成：spec 是背景，任何一节都可以读；这次做什么由工单划定，spec 里有、工单没要的不做。
- **读目标仓库的写法规范。** 「开工前」加一步：读目标仓库的 `CODING_STANDARDS.md`、`REVIEW.md`、根目录与适用子目录的 `AGENTS.md` / `CLAUDE.md`，以及它们链接到的文档；`@` 导入不会自动展开，被引用的文件要显式去读；链接指到一个 skill 目录时，照着读或调那个 skill。读法跟 pr-review 审 Standards 轴时的读法一致（review 标准里「读目标仓库的 CODING_STANDARDS.md……」那一句），让实现和 review 读的是同一套规范。

模型、思考强度、交回格式、其它各节都不动。插件 README 里描述 implementer 的地方，说法跟着对上。

人的决定（来自 spec）：保留 implementer，不删；skill 改成看工单挑、spec 全文可读，是人选的「在定义里顺手改」。

> 人的决定（2026-10-30）：「选 A，按你说的改法写进工单 01 重派，落地后再跑一次回放」——改法：回放 20261030T023450 里改后的执行方读了 CODING_STANDARDS.md，却没顺着「链接」调 writing-for-agents（那句「链接指到一个 skill 目录，就照着读或调那个 skill」埋在一长串要读的文件里被略过）。implementer 的「开工前」改成：在 CODING_STANDARDS.md 的「链接」里找出管这张工单所改文件类型的那一条（例：改 skill、agent 定义 → writing-for-agents），读完或调完再动手；交回的 `verified` 加一行写读了哪几份写法规范。

## 验收标准

- [x] 一个文档检查（`node --test` 跑的测试，读插件文件断言文字）：implementer 定义不再把 wiki-conventions、tdd 写成开工必调；decision-rules 仍是开工必调；不再有「只读测试决策」的规定，改成「范围以工单为准」；「开工前」指向 `CODING_STANDARDS.md` 及它链接的文档。先在改前的定义上看到它失败，再改到通过
- [x] 改规则的证明：照定义「改规则的工单：怎么证明 skill 真的变了」，写一个 retro 回放用例。输入取 harold-skills#125 的一张改 skill 文档的工单，去掉它手写的「开工前调 writing-for-agents」；停在执行方交回那一刻；是/否题出自 #147：「执行方没被工单点名，也照 CODING_STANDARDS.md 的链接读了 writing-for-agents 吗？」改前应答否、改后应答是。这个用例会起子代理，按大的算，只写好用例，交回写「回放在队列里：<用例名>」（用例 implementer-reads-standards 已写好，按大的算，回放在队列里）
- [x] 插件 README 里对 implementer 开工调哪些 skill 的描述跟定义一致
- [x] 插件全量测试是绿的
- [x] 人的决定（2026-10-30）：implementer「开工前」点名在 CODING_STANDARDS.md「链接」里找管这次所改文件类型的那一条、读完或调完再动手；交回格式的 `verified` 要求一行「读了哪几份写法规范」。文档检查覆盖这两处（先在当前文字上看到它失败）；README 如描述了交回字段就同步；插件全量测试绿。回放用例 implementer-reads-standards 已由编排者换成 design-tmp-worktree-root 的工单 01（不用改），落地后编排者再跑回放
- [x] review 第 1 轮 C1（2026-10-30）：implementer 定义里「其余的 skill 看工单挑」那句的例子，要 agent 当场用上另一个 skill 的都写成「用 Skill 工具调 `<插件>:<名字>`」（writing-for-agents 的机制说明原文：「要 agent 当场用上另一个 skill：写『用 Skill 工具调 <插件>:<名字>』」）

## 选中的存量回归

- `design-archive-skill-doc.test.mjs`：它检查 skill 和 agent 定义按节名引用 design-archive 时都指得到，implementer 定义是被扫的调用方之一，改它的开头和「开工前」时可能碰坏引用
- `skill-private-references.test.mjs`：它检查不读别的 skill 的私有 references；新加的「怎么挑 skill」那句举例时不能写成读别人的 references
