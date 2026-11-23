# 01 — dyna 补上五个命令，五处 skill 改成调命令

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

skill 走到下面五步时，各有一条 dyna 命令可调，agent 不再自己拼 `gh` / `git`：

1. **空提交**：`dyna git commit` 加 `--empty`，只给说明、不给文件就提一个没有文件改动的提交；跟文件一起给就报错，提示去掉 `--empty`。暂存区里别的改动不进这个提交。
2. **按提交检出 worktree**：`dyna worktree add` 在 `--detach` 时多收一个 `--at <提交>`，worktree 游离在这个提交上，不读 `--base`；`--at` 不带 `--detach` 报错；提交本地找不到先 fetch origin 再找，还找不到报错。路径上已经是游离 worktree 就直接给回路径。建出来的能用 `dyna worktree remove` 删掉。
3. **换 issue 类型**：新命令 `dyna issues kind <docs> <号> <bug|feature|improvement>`：去掉 issue 上别的 `kind:*`，加上这个；已经是这个就什么都不做；项目没有这个 label 时报错并指向 `dyna issues labels`。形状照 `issues priority`。
4. **按状态列开着的 issue**：新命令 `dyna issues list <docs> --state <triage|todo|in-progress|in-review>`：JSON 数组，这个状态下全部开着的 issue，每条 `{number, title, assignees}`，号从小到大，不按挡路、指派人过滤；`backlog` 不收，指向 `issues backlog`。
5. **等 PR 检查跑完**：新命令 `dyna pr checks <owner/repo> <号> [--timeout <时长>]`：等这个 PR 当前 head 的检查，打印结论之一：`green`（全过，skipped 算过，退出 0）、`red`（第一个失败或取消就返回，列出名字和链接，退出 1）、`none`（从命令开始 60 秒内一个检查都没有，退出 0）、`timeout`（默认 30 分钟，退出 124）。

dyna 在集成分支当前版本（0.0.8）上升到 **0.0.9**，存 `0.0.9` 的登记表，插件 `dyna-version` 下限提到 `>=0.0.9`。（spec 原写 0.0.7，已被 #455、#458 占用；合并前若别的 PR 先改了 dyna 版本，再升一档。）

五处 skill 原文改成命令：

- issue-session「实现」第 1 步：空提交改成 `dyna git commit --empty`，删掉标「坑」的 `--allow-empty` 那句。
- pr-review 合并后的上线自查「准备」第 2 步：检出合并提交改成 `dyna worktree add … --detach --at <合并提交>`。
- issue-triager 第 5 步打类型、`idea-loop:issues` GitHub 参考的「类型」一行：改成 `dyna issues kind`。
- issue-dispatch（#455 之后的设备级调度）「没有会话的 issue」那一句：GitHub 上改成 `dyna issues list <docs> --state in-progress` / `--state in-review`。
- implement 的「等 CI」、pr-review 的前提「CI 全绿」、pr-review 交报告前「等 CI 绿」：改成 `dyna pr checks`，按 green / red / none / timeout 分别怎么走写清（SEO 自动合并引的是交报告的那一步，跟着变）。

## 验收标准

- [x] 暂存区有一个改动时 `dyna git commit --empty -m "chore: 开工 #1"`：多一个没有文件改动的提交，暂存区那个改动还在。
- [x] `dyna git commit --empty -m x a.txt`：报错退出 1，提示去掉 `--empty`。
- [x] 两个提交的临时仓库里 `dyna worktree add build --detach --at <第一个提交> --path <路径>`：worktree 的 HEAD 是第一个提交；`dyna worktree remove <路径> --force` 删得掉。
- [x] 假 gh 下 issue 7 带 `kind:bug`，`dyna issues kind docs 7 improvement` 后只剩 `kind:improvement`；已经是 improvement 时不调改 label。
- [x] 假 gh 下三个 open issue（#1 in-progress 指派给别人、#2 in-review、#3 in-progress 被挡路），`dyna issues list docs --state in-progress` 输出 #1、#3 两条；`--state backlog` 报错指向 `issues backlog`。
- [x] 假 gh 按次返回检查列表：空 → pending → pass 得 green 退出 0；一直空得 none 退出 0；出现 fail 得 red、列出它、退出 1；一直 pending 到超时得 timeout 退出 124。
- [x] dyna 版本 0.0.9、`dyna/registry/0.0.9.json` 已存且 `go test ./...` 绿；`idea-loop/dyna-version` 下限 `>=0.0.9`；`dyna-scan.test.mjs` 绿，把某处 skill 写成 `dyna pr checks --foo` 时红。
- [x] 上面五处 skill 原文都改成了命令，skill 里不再有 `--allow-empty`、手写的 `gh pr checks`、给 `kind:*` 的 `gh issue edit --add-label`。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `dyna/internal/git` 的 commit 测试：`--empty` 动的是同一个命令的参数校验，不能让不带 `--empty` 时文件照旧必填的行为变。
- `dyna/internal/app/git_worktree_test.go` 的 `--detach` 测试：`--at` 加在同一分支上，不给 `--at` 时仍游离在 `origin/<基准分支>`。
- `dyna/internal/issues` 的 `priority`、`candidates` 测试：`kind`、`list` 照它们的形状写，共用 gh 读写。
- `scripts/dyna-scan.test.mjs`、`dyna/internal/registry` 的登记表一致性测试：升版本、存登记表后必须仍绿。
- [x] review 第 1 轮 S1（2026-11-23）：等 PR 检查的命令只开放「等多久」一个可选参数，「隔多久问一次」不作为参数（间隔固定 15 秒），登记表里也没有它。
- [x] 开工交代（2026-11-23，合并前别的 PR 先占了版本就再升一档）：集成分支已把 dyna 升到 0.0.9（同步 PR #472），这次在它上面再升一档到 0.0.10：存 `0.0.10` 的登记表（`0.0.9` 的登记表保持集成分支上那份不动），插件 `dyna-version` 下限提到 `>=0.0.10`；skill 扫描测试照新下限仍绿。
