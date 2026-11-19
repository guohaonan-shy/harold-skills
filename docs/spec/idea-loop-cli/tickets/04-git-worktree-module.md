# 04 — git 与 worktree 模块，worktree 护栏

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

新增 `dyna git`：只 add 给定的文件、提交、推送（可带仓库目录，代替手写 `git -C`），出错报下一条命令。新增 `dyna worktree`：建、删、列；删时先解锁、再删 worktree、再删分支（可选保留分支）。`worktree guard --hook`：从 stdin 读 PreToolUse 事件，手写 `git worktree remove` 的拦下并提示 `dyna worktree remove`。运行环境是 magi 时 worktree 的做法按现在 magi 参考里写的来。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [x] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）：没有对应的旧脚本和旧测试，没有可搬的
- [x] 把 `git worktree remove x` 喂给 `dyna worktree guard --hook` 被拦，提示里有 `dyna worktree remove`；`git worktree list` 放行
- [x] 在临时仓库里 `dyna worktree remove` 一个上了锁的 worktree：解锁、删除、分支也删掉
- [x] `dyna git commit` 只提交给定的文件，工作区里别的改动不进提交
- [x] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- 无（新增命令，没有旧脚本测试）

> 编排者补（2026-11-19）：spec 的模块表写 git 模块包「代码仓库的 `git commit/push/merge`」，工单漏了 merge。依据 spec 和「跟 #340 怎么分」（#339 保证命令都在，#340 重写时改用），补上 `dyna git merge`。

- [x] 补：`dyna git merge <ref>`（可带仓库目录）：合进给定的提交或远端分支；有冲突时停下、列出冲突文件、给下一条命令，不自动解决；push 被拒时的「下一条」改成这条命令
