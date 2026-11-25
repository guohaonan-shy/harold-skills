# 04 — pr 的五个标注样本

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
维护 idea-loop 的人改了 `idea-loop:pr` 后，能用 `retro-replay.mjs --cases-root idea-loop/evals/pr` 对着五个真实 PR 现场重跑，看描述是不是写好了。格式与 runner 同 evidence 组（每个现场一个文件夹：`case.json` + `sample.md` + `annotations.md`），放在 `idea-loop/evals/pr/cases/`。仓库根 AGENTS.md §5「标注样本」一条已点名 `idea-loop/evals/pr/`，把这一组补进那一条的说明（第一组之外写一句 pr 组五个现场的名字），不另写例外。

五个现场（输入是那个 PR 合并时的材料：旧描述、diff、review 归档评论；当时的提交取那个 PR 的合并基点；旧描述里的图从共享笔记 452-pr-samples 的本地副本存进样本目录）：
- `tofelair-1072-frequency`（改提示词）：题「问题节用频率证明提示词的问题真实存在吗？」原话：「比如提示词修改时候，就可以用统计学来表示出现问题的频率」
- `tofelair-1137-ui`（UI）：题「音频包搬家只出现在概要的 diff 里、证据里只用一行说行为没变吗？」原话：「没有对应问题的，我觉的内容理论上会在summary中的diff里面，同时之前和之后应该是不变的？」
- `tofelair-1136-reproduce`（本机服务）：题「证据节的之前 / 之后是同一个操作在两边各做一遍（开几个会话、数出题工具进程），而不是拿线上的 71 份跟合并后比吗？」原话：「比如之后就是我创建了多个claude 进程，但是只有一个toeflair mcp的进程了」「你这个71和1的属佛啊，我读下来感觉意义不大」
- `harold-skills-387-decision-risk`（命令行）：题「人在 review 里定的事本身没写进描述，它带出的兼容风险写进了合并风险吗？」原话：「问题的本质是我的决定带来的风险会写入合并风险内？」
- `harold-skills-432-length`（skill 改写）：题「读完问题、概要，说得出现在是什么样、改完是什么样、要我做什么吗？」原话（#452 正文）：「人要读很久才找到『现在是什么样、改完是什么样、要我做什么』」

`sample.md` 放当时的旧描述原文、四轮产出（分支上 `idea-loop/evals/pr/rounds/` 里已有）的位置与要点、Harold 的批示、好的长什么样。tofelair 仓库的 PR 取材用 gh 读（toeflair 仓库的 owner 从 rounds 下的 notes.md 里找）。

## 验收标准
- [ ] `idea-loop/evals/pr/cases/` 下五个文件夹，每个有 `case.json`（字段与 evidence 组相同，`quote` 是上面的原话）、`sample.md`、`annotations.md`。
- [ ] `retro-replay.mjs --cases-root idea-loop/evals/pr --dry-run`（或 runner 已有的只校验不跑的方式）对五个用例都不报格式错。
- [ ] AGENTS.md §5「标注样本」写进了 pr 组；守它的根测试（`scripts/root-agents-annotated-samples.test.mjs`）跟着改并绿。
- [ ] 改前 / 改后回放：大用例写明待跑，由编排者在 PR 开出来之后照 `--run-large` 跑。

## 选中的存量回归
- 仓库根 `scripts/root-agents-annotated-samples.test.mjs`：守 AGENTS.md §5 的样本清单。
- retro runner 的测试：用例格式校验在那里。
