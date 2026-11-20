# 跑一轮：机械检查 → 两个 Codex 进程 → 核实 → 汇报

`../SKILL.md` 的「跑一轮」第 2 步读这份。**这一轮由调用 pr-review 的主会话自己做，不起审查者子代理。** 这一步只读代码：不改代码、不提交、不推送；不碰 PR（描述、评论、合并）和 review loop 文件（SKILL.md 第 4 步才往里追加）；处置只标不执行，也不宣布能不能合并。

开工先读 [review-standards.md](review-standards.md)（两轴问什么、什么算问题、怎么验、每条怎么标处置）；处置怎么判看 `idea-loop:decision-rules`，汇报的写法与证据形式看 `idea-loop:pr` 的「Review 汇报」，配图看 `idea-loop:evidence`。

这一轮的工作目录是 `.tmp/pr-review/<PR 号>/round-<N>/`，配图放 `.tmp/pr-review/<PR 号>/evidence/`。要用到：worktree 路径（集成分支，已推送）、`<owner/repo>`、PR 号、基准分支、轮次 N、spec 路径（`<项目目录>/docs/spec/<spec-slug>/<spec-slug>.md`，给 Codex 的也是它）和同目录 `tickets/`、review loop 文件（从里面读之前几轮的汇报和人的批示，**尤其是人推翻过的条目**）。有设计产物时还有 UI 走查的发现文件 `ui-findings.json`（路径见 [ui-walkthrough.md](ui-walkthrough.md)）。

## 开跑前

1. **工作区干净**（`git status --short --untracked-files=no` 为空），本地 HEAD 等于 PR 的 head。不对就停下告诉人：审的必须是人在 PR 上看到的那个版本。工作区保持原样；需要旧状态时用 `git archive <sha> | tar -x -C <scratch>` 解出来，不 reset、不 stash、不 checkout。
2. **merge-base**：`git merge-base HEAD origin/<基准分支>`。
3. **`codex` 命令在 PATH 上**：`command -v codex`。不在，停下告诉人缺什么；不装、不改 Codex 配置。

## 机械检查（Standards 轴的一半）

照 review-standards 的「机械检查」：全量测试命令、以及 CI 已在这个 head 上跑过的测试不在本机跑，读 CI 结论，写成 `<检查名> | CI 结论 | 链接`，没跑完写「CI 未完成」（不算通过）；PR 上没有检查时，全量测试照旧本机跑。typecheck、lint 照旧本机跑，每条输出过一遍 `dyna pr diagnostics filter <merge-base>`，记下每条命令的退出码、只留改动行的诊断、其余的计数；跑不了的写「未运行：<原因>」。核实某条发现要跑测试时，只跑对应的那几个。这些结果是事实，原样交给 Standards 进程。

## 两个 Codex 进程，并行

两轴的 prompt 是固定模板，只填这一轮不一样的引用。先把机械检查结果写进工作目录的 `checks.md`，把前几轮人批了「不修」或「开 issue」的条目写进 `wontfix.md`（没有就写「无」），然后：

```
dyna agent codex prompt spec <工作目录>/spec-prompt.md worktree=<worktree> base=<merge-base> spec=<spec 路径> tickets=<工单目录> wontfix=<工作目录>/wontfix.md
dyna agent codex prompt standards <工作目录>/standards-prompt.md worktree=<worktree> base=<merge-base> rules=<规则来源的路径，逗号隔开> checks=<工作目录>/checks.md wontfix=<工作目录>/wontfix.md
```

规则来源照 review-standards 的「规则来源：只认写下来的」列。命令拒绝时照它说的补齐再跑。然后在**同一条消息**里用 Bash 的 `run_in_background: true` 起两个进程，各自等它退出：

```
dyna agent codex run --model gpt-5.6-sol --effort high --prompt-file <工作目录>/spec-prompt.md --cwd <worktree> --out <工作目录>/spec-out.md
dyna agent codex run --model gpt-5.6-sol --effort high --prompt-file <工作目录>/standards-prompt.md --cwd <worktree> --out <工作目录>/standards-out.md
```

- **沙箱保持默认只读**，不加 `--sandbox workspace-write`；模板里也已写明只读。
- 命令自带 20 分钟超时，超时退出 124 并结束整个进程组，这一轴记为「未完成」。启动失败、非零退出、没有结果都算未完成，**未完成不等于没问题**。
- **20 分钟是总预算，从这两个进程起跑的那一刻算，Codex 与等 UI 发现文件共用**，不是各 20 分钟。
- 原始输出就是 `--out` 的两个文件（过程日志在 `<out>.log`），留在工作目录。

## 等 UI 走查的发现文件

有设计产物时，进「核实、画图、校验」第 1 步（并进候选）之前，确认它（谁起 UI 走查、它交回未完成怎么办见 [ui-walkthrough.md](ui-walkthrough.md)）：

- 文件已经在位：读它。
- UI 走查已交回未完成：不再等，UI 这一轴记「未完成」，原因取自它的交回，进汇报的「没覆盖到的」。
- 还不在，也没交回：先做不依赖它的事（等 Codex 两个进程、整理机械检查），每隔一会儿看一次；从两个 Codex 进程起跑算起总共 20 分钟到了还没出现，UI 这一轴同样记「未完成」，写进「没覆盖到的」，说明是等超时。**未完成不等于没问题**，不要因为没有 UI 发现就写成「UI 没有问题」。
- 之后文件才出现：这一轮不再用它，会话里告诉人它晚到了。

## 核实、画图、校验

1. **合并候选**：同一个失败行为、同一种修法的只留一条。去掉人在之前几轮批了「不修」或「开 issue」（旧说法「进 backlog」）、这一轮又没有新证据的。**从 review loop 里人的批示找出推翻记录**（「推翻 C1」「这个不用改」这类），照 review-standards 的「后面几轮」处理：不再按同一依据标成照规则，标「要你决定」，前提里说明上一轮按什么依据处理、被推翻了。
   **UI 走查的发现也在这里并进来**：它的 `spec` 数组就是 Spec 候选（形状相同，图已在证据目录，文件名以 `r<N>-ui-` 开头），与 Codex 的 Spec 候选一起去重，同一个失败行为留证据更清楚的那条。它们不再由 Codex 重审，但**要核实**：引文是否真在原文里、图是否真存在、所说的行为是否看得出来；对不上的照样走第 5 步被丢弃或改写。它的 `coverage` 写进汇报折叠区：走过的状态与边进「核对过、没有问题的」，进不去、标了「人看」、没来得及跑的进「没覆盖到的」。
2. **Spec 候选逐条核实**（review-standards 的「Spec 轴」），标明 `behavior`：
   - **行为问题**：真的走一遍，把复现结果做成最快能让人看懂的证据，标明 `on_screen`；界面上看得到的必须有取自实现的截图。**复现不了的不做证据**，让它在第 5 步被校验掉，原因写「没复现：<卡在哪>」。
   - **非行为问题**：用 diff 核实，没有证据块。
3. **给每条候选标处置**，照 review-standards 的「每条候选标处置」，每条都要标。改动行以外的存量只在「Standards 轴」那两种例外下报。
4. **写成拍板的人读得懂的样子**：照 review-standards 的「每条写成拍板的人读得懂的样子」和 `idea-loop:pr` 的「Review 汇报」。位置全放 `locations`。
5. **校验**：`dyna pr candidates submit candidates.json <merge-base> <证据目录> <N>`。`discarded` 进「丢弃的候选」。`rewrite` 不为空（退出码 2）就改写那几条再跑，直到为空；校验过了才算候选交齐。只有 `spec` 与 `standards` 里的条目进汇报。
6. **编号**：UI 走查条目原来的 `U1` 等编号作废，Spec 依次 `S1`、`S2`……，Standards 依次 `C1`、`C2`……。

## 写出汇报

照 `idea-loop:pr` 的「Review 汇报」写（来自 review），存成 `.tmp/pr-review/<PR 号>/round-<N>/report.md`：

- 第一行是 review loop 的条目标记 `<!-- idea-loop-entry {"kind":"review","round":<N>} -->`。
- 「已按规则处理」一节每条照规则的候选一行，行尾留 `〔链接〕` 占位（之后补成提交或 issue 链接）；列进这一节的不在下面重复。
- **图写本地路径**，相对 review loop 文件所在的 `.tmp/review-loop/`，即 `../pr-review/<PR 号>/evidence/r<N>-….png`。不上传。
- 写完自己读一遍折叠区以外的部分：有没有反引号、路径、提交号、章节编号。

## 做完手上有什么

交给 SKILL.md 第 4 步往下的是：汇报文件；每个条目的处置（照规则·动作 / 要你决定）和指到的工单文件；读到的推翻记录和据此改成「要你决定」的条目；每条机械检查命令的退出码、改动行上的诊断数、其余计数；未完成的轴或检查及原因（含晚到的 UI 发现）；丢弃的条数；缺词（概念 → 推荐叫法）。原始 Codex 输出、检查日志、复现过程都留在工作目录，不搬进会话。
