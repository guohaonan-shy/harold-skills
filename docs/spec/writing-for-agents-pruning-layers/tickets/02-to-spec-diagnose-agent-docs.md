# 02 — to-spec：改 agent 文档的 spec，方案先从 writing-for-agents 的诊断和调用方清单推出来

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

`idea-loop:to-spec` 起草 spec 时，「探代码并谈 seam」一步只探代码。issue 要改的是给 agent 读的文档（skill、references、agent 定义、AGENTS.md / CLAUDE.md）时，起草方不会先诊断文档本身。历史例子：#125（design-archive 的 SKILL.md 超长）第一版 spec 只定了「按分支挪进 references、只换位置」，人追问「你用writing-for-agent 这个skill扫design-archive这个skill，你觉得问题在哪？」「这个skill目前是给谁引用的」之后，spec 又重写了两次。

在这一步加一段（意思照 retro 批过的新文，措辞顺进现在的结构）：issue 要改的是给 agent 读的文档时，起草方案之前先做两件事——一是用 Skill 工具调 `idea-loop:writing-for-agents`，逐条对照它的杠杆（信息层级、就近归置、单一事实来源、引导词、完成条件、剪枝）给文档下诊断；二是列出谁在调它、各自读哪几块。「方案」从这份诊断和调用方清单推出来，每处改动标明对的是哪条杠杆。

加之前照 `writing-for-agents`「剪枝」第一条「加内容之前先归并」看：`to-spec` 里已有的步骤能不能改写来容纳它。`to-spec` 主体要保持在 5000 字以内（UTF-8 字符数：`LC_ALL=en_US.UTF-8 wc -m`，不设 locale 时 macOS 数的是字节）；2026-10-31 是 4864，只剩 136 字，工单 04 之后还要改同一份文件的示例，所以这段写短，或改写已有句子容纳它。

## 验收标准

- [x] `to-spec` 的探代码那一步写着：要改给 agent 读的文档时，先调 `idea-loop:writing-for-agents` 诊断、列调用方，方案从这两样推出、每处改动标杠杆
- [x] 一条文档 tripwire（照 `idea-loop/scripts/pr-review-cross-skill-refs-doc.test.mjs` 的写法）断言这段在，改前红、改后绿
- [x] `to-spec` 主体 UTF-8 字符数 < 5000（`to-spec-by-deliverable-doc.test.mjs` 守着）
- [x] 一个 retro 回放用例：提交取 570e135（#125 第一版 spec #138 起草之前），prompt 取当时让 `to-spec` 起草 design-archive 精简 spec 的那句话，停在 spec 草稿交给人的那一刻；是/否题：「spec 的方案是从 writing-for-agents 的诊断和调用方清单推出来的吗？」，`quote` 抄上面人的原话。按用例大小当场跑或交回「回放在队列里」；runner 跑时传 `--base origin/main`（本地 `main` 是旧的）
- [x] 全量测试绿

## 选中的存量回归

- `idea-loop/scripts/to-spec-by-deliverable-doc.test.mjs`：to-spec 刚按交付物重写过，它守着节表和字数，本次加段落最容易碰到它
