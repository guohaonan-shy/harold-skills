# 01 — 规则回放 runner 加 `--run-large`，issue 会话写明人说「现在就跑」时怎么用

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

规则回放（idea-loop 插件里 `evals/retro/` 下那个 runner）现在对标成大的用例只说「要进夜间队列」、退出码 3；能当场跑大用例的只有夜间队列模式，而它只在本机 00:00–07:00 起跑。人在 issue 会话里说「现在就跑吧」时，没有正式的路。

做完后：

1. runner 多一个参数 `--run-large`，配 `--case <名字>` 或 `--cases a,b`，必带 `--pr <号>`。它在任何时刻当场跑这些用例，跑法跟夜间队列跑一个用例完全一样（改前、改后各一次 `claude -p`、一次判定；起 agent、开浏览器都不中止；用同一个执行函数，不另写一份），不看时钟。没给 `--timeout-min` 时超时默认 45 分钟（小用例 `--case` 和夜间仍是 20）。
2. 全部用例跑完，把结果照夜间的格式追加进这个 PR 的 review loop 文件（`<worktree>/.tmp/review-loop/<PR>.md`，跟夜间队列写的 `规则回放` 条目同一个函数、同一格式）。worktree 取 `--worktree`，没给取 `--repo`，再没给取当前仓库根目录。不发会话间消息、不发 macOS 通知、不打印 `回放结果 {json}` 行（调它的会话自己读输出）；输出里写明结果写进了哪个文件。
3. 队列目录（`--queue-dir`，默认 `~/.idea-loop/replay-queue/`）里若有同一 worktree、同一 PR 号的队列条目，把这次跑了的用例从中删掉；删空了就删文件。只按条目里的 worktree 与 PR 号认，不要求 `--slug`。
4. 退出码：全过 0；有不过的 1；没 `--pr`、没用例名、用例不存在或格式不对 2（且不起任何会话）。
5. 不带 `--run-large` 的大用例照旧退出码 3，但提示里加一句：人说现在就跑，加 `--run-large --pr <N>`。
6. runner 文件开头的说明注释、插件 `README.md` 里 replay / nightly queue 那段，补上 `--run-large`。
7. `idea-loop:issue-session` 的 SKILL.md「规则回放的结果」那段加一句：大用例默认进夜间队列，人说「现在就跑」时照 `references/replay-result.md` 的「当场跑」。SKILL.md 主体保持 < 5000 字（量法见仓库 AGENTS.md）。
8. `references/replay-result.md` 加一节「当场跑」：人明说要现在跑才用；跑前先告诉人几个用例、每个最长约 3×45 分钟、花费用 runner 打印的估计（起 agent 的会比上限高）；命令 `node ~/.idea-loop/bin/retro-replay.mjs --cases <用例,用例> --run-large --pr <PR 号> --worktree <集成 worktree 绝对路径>`，用后台方式跑（前台 Bash 10 分钟截断），等它退出；跑完读 review loop 文件里新的 `规则回放` 条目，照本文件上面的「全过 / 有不过的」处理；runner 报不认 `--run-large`（固定路径的拷贝是旧版），先跑插件的 `scripts/retro-install.mjs` 重装再跑。

## 验收标准

- [ ] 端到端测试（假 `claude`）：标成大的用例，白天跑 `--case <它> --run-large --pr 12 --worktree <wt>`，起三次会话、退出码 0，review loop 文件里一条已处理的 `规则回放` 条目（`review-loop.mjs check` 读得出）
- [ ] 端到端测试：先 `--enqueue` 了该用例，`--run-large` 跑完后队列里该 PR 的文件没了；同一 PR 队列里还有别的用例时只删掉跑了的那个
- [ ] 端到端测试：改后仍答「否」时退出码 1，条目留作未处理
- [ ] 端到端测试：`--run-large` 不带 `--pr` 退出码 2，不起会话
- [ ] 端到端测试：只 `--case <大用例>` 退出码 3，输出提到 `--run-large`
- [ ] 端到端测试：`--run-large` 跑一个起了 agent 的小用例，不中止、不改标用例
- [ ] 文档测试：issue-session 的 SKILL.md 点名「现在就跑」与 replay-result.md 的「当场跑」；replay-result.md 的「当场跑」写了 `--run-large`、跑前告诉人多久与花多少、后台跑、重装 runner
- [ ] issue-session SKILL.md 主体 < 5000 字
- [ ] 仓库全部测试通过（命令见 REVIEW.md）

## 选中的存量回归

- `idea-loop/scripts/retro-queue-run.test.mjs`：夜间队列与本工单共用执行函数和条目写法，改动可能波及。
- `idea-loop/scripts/retro-replay.test.mjs`：`--case` 的小用例中止与「大用例不跑」两条在这里，提示文案改了要看它是否仍断言旧文。
- `idea-loop/scripts/retro-install.test.mjs`：runner 被拷到固定路径，确认拷贝内容仍完整。
