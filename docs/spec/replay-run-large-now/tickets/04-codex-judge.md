# 04 — 回放的评委换成 Codex

**Blocked by**：03 — 回放的输入看不出在被测
**设计冻结**：不涉及 UI

## 要建什么

规则回放跑完改前、改后两遍后，由一个评委读两份产物（标成 A、B）答一道从人原话写出的是/否题，必须引产物原文作出处；改前「否」、改后「是」才算过。现在评委也是 `claude -p`，跟被测的同一家模型。人定了评委换成 Codex（不同模型家族）。

做完后：

1. runner 用 Codex companion 的 `task` 跑评委（companion 路径用插件里 `scripts/codex-companion.mjs` 找；pr-reviewer 定义里有调用先例），评委的题、规则、要求的 JSON 输出格式不变；不给 Codex 写权限。
2. A、B 的顺序每次随机；结果里记下哪个是改后，判定时按记录还原成改前 / 改后。
3. 找不到 Codex（companion 脚本退出码 1，或 `task` 起不来）：开跑前打印一句「没找到 Codex，评委用 Claude」，照旧用 `claude -p` 判。
4. 结果（`result.json`、终端汇报、review loop 条目）写明评委是谁（`codex` / `claude`）。
5. 测试用环境变量换掉 companion（同 `RETRO_CLAUDE_BIN` 的做法），不碰真 Codex。
6. 开跑前打印的花费估计仍按原公式（Codex 不占 Claude 额度，估计里说一句评委走 Codex）。
7. runner 开头注释、README 同步。

## 验收标准

- [x] 端到端（假 `claude`、假 Codex）：评委由假 Codex 回答，结果写 `judge: codex`，过 / 不过判得对
- [x] 端到端：A/B 顺序被打乱时（测试里固定随机种子或注入顺序）仍还原正确的改前 / 改后答案
- [x] 端到端：假 Codex 不存在时打印退回提示，评委走假 `claude`，结果 `judge: claude`
- [x] 评委 prompt 里不出现「改前」「改后」「新」「旧」字样
- [x] 继承自 03：改前、改后两份插件都拷到 `<临时目录>/<随机串>/<插件目录名>` 下再传给 `--plugin-dir`，跑完清理；被测 agent 调 skill 时看到的插件路径里不含 retro、replay、回放、before、after、eval（端到端测试断言 `--plugin-dir` 的值）。依据：spec 期望行为 2「看不出在被测」，03 只管了输入和工作目录，skill 的「Base directory」会露出插件路径
- [x] 继承自 03：implementer 定义里教写回放用例的那句补上：prompt 只放人当时的原话，不加「这是回放 / 人不在场」之类的说明（校验会拒绝含回放、eval、judge 等词的 prompt）；「停在哪」只给评委看
- [x] 全量测试通过（命令见 REVIEW.md）

## 选中的存量回归

- `idea-loop/scripts/retro-replay.test.mjs`：判定解析与过 / 不过的判法。
- `idea-loop/scripts/codex-companion.test.mjs`：companion 查找。
