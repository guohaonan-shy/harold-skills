# 05 — 核对改后那一遍真的用上了改动

**Blocked by**：04 — 回放的评委换成 Codex
**设计冻结**：不涉及 UI

## 要建什么

规则回放判「过」只看评委答案。可改后那一遍要是根本没触发改过的 skill（LangChain 的测试里提示了也只有 70% 触发），「改前否、改后是」说明不了规则生效。做完后 runner 机械核对改后那一遍用没用上改动：

1. **改动集**：基准分支（`--base`，默认 main）到改后插件之间，插件目录下 `skills/`、`agents/` 里改过（新增或修改）的文件。
2. **算用上**：改后那一遍的事件流里（主会话和子代理都算）出现任一项：读了改动集里的文件（读的路径落在改后插件目录里、对得上）；用 Skill 工具调了改动集里某个 `SKILL.md` 或其同目录参考文件所属的 skill（skill 名对得上 `<插件名>:<skill 目录名>`）；用 Agent 工具起了改动集里某个 agent 定义对应的 agent（`<插件名>:<文件名去掉 .md>`）。
3. **结果**：没用上 → 新结局「用例没测到改动」（`not-exercised`），退出码 1，不算过；review loop 条目里跟其他没过的一样列出、给三个处理。改动集为空（只改了脚本）→ 这项记「不适用」，照评委答案判。用上了 → 照评委答案判，结果里记命中了哪一项（文件或 skill 名）。
4. 这项核对在评委之前做；没用上时仍跑评委（结果留给人看），但结局按「没测到改动」。
5. 终端汇报、`result.json`、review loop 条目写明这项核对的结果。runner 开头注释、README 同步。

## 验收标准

- [ ] 单元：给定事件流和改动集，Read 命中、Skill 命中、Agent 命中、子代理里的命中各判为用上；都没有判为没用上；改动集为空判不适用
- [ ] 端到端（假 `claude`）：改后插件改了某 skill，假 `claude` 改后那一遍调了它 → 过；没调也没读 → `not-exercised`、退出码 1、条目里列为没过
- [ ] 继承自 04：测试不会碰到真 Codex：设了 `RETRO_CLAUDE_BIN`（换成假 claude）却没设 `RETRO_CODEX_COMPANION` 时，runner 不去找真的 Codex，评委走那个假 claude；端到端测试断言这一点。依据：04 交回时，一个漏设变量的测试挂在了真 Codex 上
- [ ] 继承自 04：README 里「本机 runner 要重跑 setup 才换新版」那句补上：评委用的 Codex 查找脚本也随 runner 装进去，不重跑就用不上 Codex 评委
- [ ] 全量测试通过（命令见 REVIEW.md）

## 选中的存量回归

- `idea-loop/scripts/claude-stream.test.mjs`：事件流解析。
- `idea-loop/scripts/review-loop.test.mjs`：没过的 `replay` 条目仍被 check 列出。
