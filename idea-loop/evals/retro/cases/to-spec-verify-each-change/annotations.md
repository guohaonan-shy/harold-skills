# to-spec-verify-each-change

> 判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle to-spec-verify-each-change --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**这是目标用例，不是回放**：题不是从人当时的原话写出的，是从 spec `docs/spec/skill-change-verify/skill-change-verify.md` 的期望行为 1 写出的：改 skill 的 spec 里，每处改动都有一行「验证：」，五种之一，不写「不涉及」。

**是/否题**：起草出的 spec 里每处 skill 改动（对 skill、参考文件、agent 定义这类给 agent 读的文档的改动）都有一行验证、没有写「不涉及」吗？

## 材料怎么拼的

- **提交**：`66b4d463`（`release/idea-loop-0.2.0`，2026-11-23），spec 问题 1 数 11 份 spec 的那个状态：`docs/spec/skill-change-verify/` 还不存在，`to-spec` 还没有「验证」一行，`AGENTS.md` §5 开头还是「跳过 quantitative eval」。`idea-loop/agents/issue-triager.md` 在这个状态里有「评论与交回」一节，issue 说的两栏就在那里。
- **prompt**：issue 是照这个仓库 `issue-triager` 的现状写的一个改 agent 定义的小需求（issue 号是编的，不指向真实 issue），不提验证、测试、用例；后一段照别的 to-spec 用例的写法（我不在场、禁提交推送和 gh 写操作、最后说明停在哪）。改前的 to-spec 会在 spec 里怎么写「测试决策」由它自己定。
- **改前预计答「否」**：改前的 `to-spec` 模板「LLM 输出质量」那行写「改了哪些 prompt、要加或改哪些 eval」，仓库 `AGENTS.md` §5 开头是「跳过 quantitative eval」，起草出的 spec 多半写「不涉及」或只写一句笼统的话，没有逐处的验证行。改后的 `references/agent-docs.md` 要求杠杆诊断每处末尾一行五选一的验证，表里那行写「见杠杆诊断各处的验证」。
- **判定依据**：看工作区里的 spec：「方案」或杠杆诊断里对 `issue-triager.md` 的改动有没有末尾一行「验证：」，是五种之一（检查 / 回放 / 目标用例 / 不改行为 / 判不了）；「测试决策」表 LLM 输出质量那行有没有写「不涉及」。

## 跑过的结果

- 2026-11-24（`skill-change-verify` 工单 03）：run `20261124T035418`，判定 Codex，**过**：改前「否」（「测试决策」写「不加 eval」，没有验证行），改后「是」（对 `issue-triager.md` 的改动末尾有「验证：检查 …」，LLM 输出质量那行写「见杠杆诊断各处的验证」）。实际花费 $4.11（改前 $2.36，改后 $1.75，判定 Codex 不占 Claude 额度；预计是 $1.05–$3.50）。执行方读了两边的 `artifact.md`，自己答同一题，跟评委一致。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
