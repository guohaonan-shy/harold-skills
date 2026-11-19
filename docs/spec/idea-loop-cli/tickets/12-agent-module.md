# 12 — agent 模块：包装 Codex 与 Claude 命令行

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

新增 `dyna agent codex run`、`agent codex image`、`agent claude run`：直接起 `codex exec` / `claude -p` 子进程，stdin 关掉，带超时（codex run 默认 20 分钟），退出或超时时结束整个进程组，超时报已写出的部分输出位置。codex-prompt 收进来（pr-review 的 Codex prompt 模板仍是插件里的文字，从插件目录读）；claude-stream 成为共用包（读 `claude -p` 的事件流）。两个 eval runner（retro、uiux-research）改成调 `dyna agent claude run`，不再 import 旧实现。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [ ] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [ ] PATH 上放一个假 codex 再起一个睡眠子进程，`dyna agent codex run` 带 2 秒超时：报超时，假 codex 和它的子进程都已不在
- [ ] 两个 eval runner 改调命令后，各自的回放/基线测试照旧通过
- [ ] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `codex-prompt.test.mjs`、`claude-stream.test.mjs`：行为基准
- `retro-replay.test.mjs`、`retro-run-large.test.mjs`、`research-baseline.test.mjs`：runner 改调用方式，有风险
