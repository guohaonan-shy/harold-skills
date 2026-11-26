# 样本：改 skill 的 spec 有「杠杆诊断」，frontmatter 标了 changes_agent_docs

**一句话**：一份要重写 skill 的 spec，应该有一节「杠杆诊断」（每处改动一行「验证：」），frontmatter 写 `changes_agent_docs: true` 让检查知道要核它。当时的 spec 两样都没有，没有任何东西拦。

## 出处

harold-skills#438 的 triage 会话（2026-11-23），起草 `evidence-forms`（提交 `957553fe`，起草之前的状态是 `4355f4cc`）。样式组：Harold 2026-11-24 在 #451 会话里定「先只在to-spec加」（决定记录 `docs/raw/decisions/451.md`）和「我觉的一个是历史调用to-spec 的场景，看看spec的样式是否符合现在的我们的定义」。题从 spec `spec-for-agents` 的 User Stories「样式与检查 2」写出（写 spec 时立刻报出改 agent 文档却没「杠杆诊断」）。

## 当时产出的原文

`docs/spec/evidence-forms/evidence-forms.md`，205 行、约 12800 字：开头一行判词「#438 存在：……」，「问题陈述」四个小节加「根因」，「方案」里改 `evidence/SKILL.md`（重写正文，按形态分支）、展开 home 固定文案里的证据描述，是一份改 agent 文档的 spec。全文没有「杠杆诊断」一节，也没有 `changes_agent_docs`（2026-11-24 对着该文件查，两个词都搜不到）。

## 人指出的问题

#451 的问题陈述（2026-11-24）：改 skill 的 spec 要有「杠杆诊断」（每处改动一行「验证：」，`to-ticket` 照抄），没有检查拦；15 份 spec 里只有 3 份有，`evidence-forms`、`skills-read-home` 都没有。人定：只在写 spec 时核，to-spec 起草时在 frontmatter 写 `changes_agent_docs: true`，`dyna spec check` 看到它就要求有这一节。

## 好的长什么样

同一个 issue 再起草一遍，新 spec：

- frontmatter 有 `changes_agent_docs: true`；
- 有一节标题是「杠杆诊断」（`##` 或 `###`），改的每个 agent 文档一条：改什么、对应哪条杠杆，末尾一行「验证：」，五选一（检查 / 回放 / 目标用例 / 不改行为 / 判不了）；
- 没有这一节、没有标记，或者有标记没有节，都不算。

不好的样子：照样写出一份长 spec，只在「实现决策」里说「改 evidence 的 SKILL.md」，没有哪一处写了怎么验。

## 回放这一格怎么跑

- 现场：提交 `4355f4cc`（`957553fe` 的上一个，起草之前），prompt 是起草 spec 的那一句加 issue 正文；
- 换过的地方：issue 正文取当前的版本（2026-11-25 `gh issue view 438`），当时的版本没有留存；正文里的「评测样本」「评测」「`idea-loop/evals/`」换成了「样本」「检查」「idea-loop 的样本目录」，因为 prompt 里不能出现会让会话看出自己在被测的词；
- 大小：small，只起草一份文字规则的 spec，不要求出图；
- 改前（集成分支的插件）2026-11-25 预跑过，两遍都是「否」（它不认识 `changes_agent_docs`），见 `annotations.md`。改后 2026-11-25 已跑，运行编号与判定见 `annotations.md`。
