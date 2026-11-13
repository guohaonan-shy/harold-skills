# 03 — 回放的输入看不出在被测

**Blocked by**：02 — 取消夜间回放队列
**设计冻结**：不涉及 UI

## 要建什么

规则回放用改前、改后两版插件各跑一遍 `claude -p`。现在给 agent 的输入是用例里人的原话，末尾再加一句「（这是一次无人值守的回放，人不在场……做到「X」就停下……）」；工作目录路径形如 `/tmp/idea-loop-retro/<用例>/<时间>/before/project`。agent 能看出自己在被测、该停在哪，跟真实会话行为不同（#157 的用例改前改后都答「是」就是这类）。人定了：输入只给原话。

做完后：

1. 两遍的 `-p` 输入正好是用例的 `prompt`，不加任何说明。
2. 两遍的工作目录是 `<临时目录>/<随机串>/<项目仓库名>`（仓库名取 `--repo` / `--worktree` 的目录名或其 git 远端名，取不到用 `project`），改前、改后各一个随机串；路径里不含 retro、replay、回放、before、after、eval。产物、日志等仍放在原来的 run 目录里（agent 看不到的地方）。
3. 用例的 `stop_at` 不再给 worker，只出现在评委的输入里（告诉评委看产物里交给人的那一刻）。
4. 用例格式校验拒绝 `prompt` 里含回放、eval、judge、rubric、benchmark、评测、评委、判定（不分大小写）的用例；`--list` 报出格式问题；`--case` / `--run-large` 遇到这种用例退出码 2，不起会话。现有用例有命中的，改写它的 prompt（保留人的原话本意），并在它的 `annotations.md` 记一行为什么改。
5. 停靠：不再靠提示词。`claude -p` 里 agent 把东西交给人就结束这一轮，超时兜底（不改超时值）。
6. runner 开头注释、README 回放那段同步一句「输入只给原话」。

## 验收标准

- [ ] 端到端（假 `claude` 记下收到的 `-p` 和 cwd）：两遍收到的 `-p` 与用例 prompt 逐字相同；cwd 不含 retro / replay / 回放 / before / after / eval，且两遍不同
- [ ] 评委的输入里有 `stop_at`
- [ ] 单元：用例 prompt 含禁用词时校验报错；端到端：`--case` 这种用例退出码 2、不起会话
- [ ] `--list` 对仓库里现有全部用例不报格式问题
- [ ] 全量测试通过（命令见 REVIEW.md）

## 选中的存量回归

- `idea-loop/scripts/retro-case.test.mjs`：用例格式校验在这里。
- `idea-loop/scripts/retro-replay.test.mjs`：worker / judge prompt 的现有断言（「keeps the human words and tells the run to stop」那条要改成新行为）。
