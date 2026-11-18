# 02 — 精简执行方定义：主体只留交付和步骤

**Blocked by**：01 — 执行方开工对齐起点改用不丢东西的写法（同一份文件，在它之上改）
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的执行方（implementer 这个 subagent）定义主体现在约 11600 字，是插件里最长的 agent 定义，几乎是第二长的两倍。只有部分工单用得到的分支（改规则的工单怎么证明规则变了、UI 工单与设计档案）内联在主体里，还写了本该归编排者的流程（被叫回来怎么接、重派、大用例谁跑）和一些解释、重复。

改完：定义主体不超过 5000 字，按 `agent-builder` 的写法——开头一句职业身份和交付，然后输入（指针清单）、开工、做、停与延后、完成标准与 commit、交回模板。要跑的命令照旧写在步骤里，交回模板的字段一个不改。只有部分工单用的分支挪进 implement skill 的参考文件：改规则的那段放进新建的一份参考，UI 与设计档案那段并进已有的 UI 工单参考；主体里各留一行说什么工单读哪份。编排者流程只留执行方自己要做的那一句。

**行为不变**：派出的执行方做普通工单、UI 工单、改规则的工单时，做的事、停下的条件、交回的字段都跟精简前一样。钉着这份定义措辞的文档测试跟着改：断言的内容挪到哪份文件，测试就读哪份；守的行为一条不删。

人 2026-11-18 提过「只需要告诉 agent 能用的工具」：不这样做，步骤和命令要留（spec「实现决策」写了依据）。

## 验收标准

- [x] 执行方定义主体（去掉 frontmatter）`LC_ALL=en_US.UTF-8 wc -m` 不超过 5000，有一个测试钉住这个上限
- [x] 开头一段读完就知道它交付什么：一个能快进进集成分支的 commit 和一份交回
- [x] 改规则工单的做法、UI 工单与设计档案的做法都在 implement skill 的参考文件里，主体各有一行指针写明什么工单读哪份；参考里的规则跟精简前逐条对得上，没有丢
- [x] 交回模板的字段名和取值跟精简前一致（编排者和落地脚本照旧核得过）；开工对齐起点、合进集成分支压成一个 commit 的命令照旧写在步骤里
- [x] 原先钉着这份定义的文档测试全部仍在、全部绿：内容挪走的，测试改读新位置，断言守的行为不变；没有删掉任何一条断言
- [x] 调了 `writing-for-agents`，交回的 `verified` 里每个改到的 agent 定义、skill 参考文件各一行杠杆
- [x] 改动的 SKILL.md（如果有）主体在 5000 字以内
- [x] 证明规则真的变了：这张工单不改规则、只重排，证明的是「没变」——上面那条字数测试改前红、改后绿，其余文档测试改前改后都绿
- [x] idea-loop 全部测试照旧绿；README 里描述执行方的那几句跟新定义对得上

## 选中的存量回归

- `implementer-standards-doc.test.mjs`、`implement-reuse-blocked-doc.test.mjs`、`skill-edit-acceptance-doc.test.mjs`、`test-layering-ci-doc.test.mjs`、`replay-codex-judge-doc.test.mjs`、`replay-read-products-doc.test.mjs`、`replay-exercised-doc.test.mjs`、`implement-replay-large-doc.test.mjs`、`implementer-start-point-doc.test.mjs`、`ticket-ledger.test.mjs`：都读执行方定义的具体段落，内容挪动最容易打断它们。
