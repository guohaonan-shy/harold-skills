# 01 — agent 读起它的 skill 的参考：规则写全，加检查守住路径

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

插件规则（`idea-loop/AGENTS.md`「参考资料归谁」）写着：skill 的 `references/` 只有这个 skill 和它起的 agent 读。13 个 agent 定义正是这样按 `${CLAUDE_PLUGIN_ROOT}/skills/<分类>/<skill>/references/…` 读起它的 skill 的参考，都合规，**不改 agent 定义**。

两处要补：

1. `idea-loop:writing-for-agents` 的 Skill 机制参考（`SKILL-MECHANICS.md`）「引用另一个 skill」一节只写了 skill 之间的情形（「不写文件路径」「别的 skill 不读它的 `references/`」），没提 agent，读的人会以为 agent 按路径读也违规（issue #198 就是这么误判的）。加一条：skill 起的 subagent 读这个 skill 的参考时，写插件根下的完整路径（如 `${CLAUDE_PLUGIN_ROOT}/…`）；别的 agent 和别的 skill 照旧调 skill、给节名。`writing-for-agents` 是通用写法文档，这条不点 idea-loop 的目录名。
2. 现在没有检查守着这些路径（插件 `scripts/` 下的 `skill-private-references` 测试只扫 skill，不扫 `agents/`）。把它扩到 agent 定义：每个 `${CLAUDE_PLUGIN_ROOT}/skills/…/references/…` 路径要存在；路径里的 skill 要是起这个 agent 的 skill 之一。「谁起它」按 skill 正文（SKILL.md 及其参考）里出现 `idea-loop:<agent 名>` 判。

现状参考（2026-10-31 核）：ui-reviewer 被 pr-review、uiux-refine、dreaming 起，读的是 pr-review 的参考；designer 被 uiux-refine、design-change-sync 起；implementer 被 implement、pr-review 起；其余 10 个各被一个 skill 起、读它的参考。

## 验收标准

- [ ] `SKILL-MECHANICS.md`「引用另一个 skill」有一条写 skill 起的 subagent 按插件根下完整路径读这个 skill 的参考；这条里没有 idea-loop 的目录名或 agent 名
- [ ] 扩展后的检查先在一个故意写错的输入上红过两次：一次路径不存在，一次读了不起它的 skill 的参考（在测试里用构造的文本断言，或先改坏一个 agent 定义看它红再改回），报错指出 agent 和路径
- [ ] 对现在的 13 个 agent 定义，检查是绿的
- [ ] 全量测试 `node --test '*/scripts/*.test.mjs'` 绿

## 选中的存量回归

- `idea-loop/scripts/skill-private-references.test.mjs`：本次就是扩它，原有的 skill 互读断言不能被改松
- `idea-loop/scripts/pr-review-cross-skill-refs-doc.test.mjs`：同样守「跨 skill 只调名字加节名」，改规则文本时别让它的前提失效
