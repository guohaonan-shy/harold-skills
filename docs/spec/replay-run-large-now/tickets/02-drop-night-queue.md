# 02 — 取消夜间回放队列，大用例由编排者在 PR 开出后当场跑

**Blocked by**：01 — 规则回放 runner 加 `--run-large`（已落地）
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的规则回放（`evals/retro/` 下的 runner）现在有一条夜间路径：大用例由编排者 `--enqueue` 进 `~/.idea-loop/replay-queue/`，每晚 00:00–07:00 由 setup 建的计划任务 `idea-loop-retro-replay` 跑 `--queue`，结果用「回放结果」行转发回 issue 会话或发 macOS 通知。人定了取消它：大用例在修改侧当场跑。

做完后：

1. **runner** 不再有 `--queue`、`--enqueue`、`--notify`、`--now`、`--queue-dir`、`--session`、`--slug` 及其背后的函数、时间窗、队列文件读写、「回放结果」行；`--run-large` 不再碰队列（去掉队列去重和条目里「已从夜间队列拿掉」那句）。写 review loop 条目的那部分留下，条目文字里不再出现「夜间」（不再需要来源参数，统一写「当场跑完」之类）。不带 `--run-large` 的大用例仍退出码 3，提示改成「大用例由编排者在 PR 开出后用 --run-large --pr <N> 跑」。runner 开头注释同步。
2. **安装脚本**（`scripts/retro-install.mjs`）只把 runner 拷到 `~/.idea-loop/bin/` 并打印允许规则，不再生成、打印计划任务的 prompt。
3. **setup**：SKILL.md 的「夜间规则回放」一节改成「规则回放 runner」，description 里「夜间规则回放的 runner 和计划任务」同步改；参考文件（现在叫 `nightly-replay.md`，改名为讲 runner 的名字）步骤改成：装 runner；『定时任务』里有 `idea-loop-retro-replay` 就删掉；`~/.idea-loop/replay-queue/` 在就删掉；打印允许规则给人。完成条件与汇报里那行同步。
4. **implement**：「没活了就停下」第 1 步里 `回放在队列里` 那段改成：落地的交回里有大用例（`verified` 写「大用例待跑：<用例>」）时，在会话里告诉人几个用例、每个最长约 3×45 分钟、每个约 1.05–3.50 美元（起 agent 的更高）乘以个数，不等人点头，用 Bash 后台方式跑 `node ~/.idea-loop/bin/retro-replay.mjs --cases <用例,…> --run-large --pr <主 PR 号> --worktree <集成 worktree 绝对路径>`，等它退出，照参考文件 `replay-result.md` 处理。「全部落地」的前提里「没有排队中的回放」改成「没有在跑或未处理的回放」。`replay-result.md` 从 issue-session 的参考移到 implement 的参考（内容改成处理 runner 跑完的结果，去掉夜间消息、通知、「当场跑」那一节里已并入上面的部分，runner 不认 `--run-large` 时重跑 setup 那句保留）。implement 的 SKILL.md 只加指针，不复述。
5. **issue-session**：删掉「规则回放的结果」那一段（不再有夜里发来的消息）。
6. **implementer 定义**：大用例那条改成「只写好用例提交，`verified` 写『大用例待跑：<用例>』，编排者在 PR 开出后当场跑」；去掉 `--enqueue`、「夜里的结果」、「setup 的夜间回放那一步」等说法（runner 不在时说 setup 的「规则回放 runner」那步没做）。
7. **README**：Replay 与 nightly queue 两段合成一段讲当场跑；目录树和测试清单里的说明同步；setup 段落里计划任务的说法去掉。
8. **review-loop 脚本**的注释里「`replay` is the nightly runner's」之类的说法同步。
9. 测试：删掉只测队列、时间窗、通知、计划任务 prompt 的测试；保留并改写 `--run-large` 的端到端测试；改文档测试。

## 验收标准

- [ ] 端到端（假 `claude`）：`--run-large` 跑大用例写一条 review loop 条目，条目文字不含「夜间」「队列」；`--queue`、`--enqueue`、`--notify` 都报未知参数、退出码 2
- [ ] 端到端：不带 `--run-large` 的大用例退出码 3，提示里有 `--run-large --pr`
- [ ] `retro-install.mjs` 的测试：只装 runner、打印允许规则，输出里没有计划任务 prompt
- [ ] 文档测试：implement 的「没活了就停下」写了报三样（个数、3×45 分钟、1.05–3.50 美元）、不等点头、后台跑 `--run-large`、照 `replay-result.md` 处理；issue-session 没有「规则回放的结果」；setup 写了删计划任务 `idea-loop-retro-replay` 和队列目录
- [ ] 全仓库除 `docs/adr/`、`docs/raw/`、`docs/records/`、`docs/spec/` 外搜不到 `--enqueue`、`replay-queue`（setup 删除那句除外）、`--queue`、`回放结果`、`夜间队列`
- [ ] issue-session、setup 的 SKILL.md 主体 < 5000 字；implement 的 SKILL.md 主体不比改前长
- [ ] 全量测试通过（命令见 REVIEW.md）

## 选中的存量回归

- `idea-loop/scripts/review-loop.test.mjs`：`replay` 条目的读取与 check，条目文字改了要看它。
- `idea-loop/scripts/setup-single-source.test.mjs`：setup 正文与参考的单一来源约束，改节名要过它。
- `idea-loop/scripts/no-project-leak.test.mjs`：插件里不出现项目信息。
