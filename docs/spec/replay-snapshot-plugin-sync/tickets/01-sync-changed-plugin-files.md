# 01 — 回放项目里被改动的插件文件换成这一边的版本

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

跑一个规则回放用例时（`--case` 当场跑，和 `--run-large` 跑大用例，两条都走），每一遍的项目目录在交给 agent 之前，把「改前插件和改后插件之间所有不同的文件」（整个插件目录，增、改、删都算；插件里放回放用例和评测材料的 `evals/` 目录除外）换成这一遍自己那一边的版本：这一边有这个文件就写入它，没有就从项目里删掉。没被改动的插件文件、项目里其余的文件都保持用例提交时的样子。

只在用例提交的快照里确实带着这个插件时才换：快照里在「插件在它自己仓库里的相对目录」那个位置有一个插件，且它的 `.claude-plugin/plugin.json` 的 `name` 跟改后插件的一样。插件在它仓库里的相对目录，能从改后插件所在的 git 仓库求出就用求出的；改后插件不在 git 仓库里（如测试里直接给的目录），就当作仓库根下以插件目录名命名的那个目录。快照里没有这个插件（外部仓库的用例），项目照旧原样解包。

换文件发生在项目的初始提交之前，所以 run 结束后「agent 写了哪些文件」的清单里不会出现这些换进去的文件。

「用到了改动」的核对，把项目里那份插件目录也算作改后插件的位置：改后那一遍的 agent 用 Read 读项目里那份被改动文件（绝对路径），或用 Bash 以绝对路径或相对项目目录的路径（如 `cat idea-loop/skills/…/SKILL.md`）读它，都记为用到了改动，不是「用例没测到改动」。

## 验收标准

- [x] 测试仓库的提交里带插件目录，其中被改动的一个 skill 文件写「旧」、没被改动的另一个 skill 文件写「快照」；改前插件里前者写「改前」，改后插件里前者写「改后」，另有一个只在改后插件里有的新文件。跑一个用例：改前那一遍在项目里读到前者 =「改前」、新文件不存在；改后那一遍读到前者 =「改后」、新文件存在；两遍读到后者都是「快照」。
- [x] 同一个用例里，评委拿到的两份产物（agent 写下的文件清单）都不含这些换进去的插件文件。
- [x] 测试仓库的提交里没有插件目录：两遍的项目跟原样解包一致，不多出任何插件文件。
- [x] 快照里那个位置有插件目录但 `plugin.json` 的 `name` 跟改后插件不同：不换，原样解包。
- [x] 改后那一遍的 agent 用 Bash 以相对路径读项目里的被改动文件：结果的改动核对记「用到了」，不是 `not-exercised`；用 Read 以项目里那份的绝对路径读，同样记「用到了」。
- [x] 回放 runner 的测试文件（`retro-replay.test.mjs`）全部通过，`REVIEW.md` 列的验证命令全部通过。
- [x] review 第 1 轮 S1（2026-11-20）：插件 `evals/` 下的文件（回放用例、判定题、批注、评测材料）即使改前改后不同也不换进项目：改后插件比改前多出一个用例的 `case.json` 时，改后那一遍的项目里看不到它，两遍项目里 `evals/` 都保持快照的样子；`evals/` 以外被改动的文件照旧换。
- [ ] review 第 2 轮 C1（2026-11-20）：插件自己的说明（`idea-loop/README.md` 里回放 runner 那段，以及回放 runner 文件开头的说明）写明插件顶层 `evals/` 的改动不换进项目；依据 REVIEW.md「额外要求」：改了插件的脚本要在同一个改动里同步插件自己的 README.md。

## 选中的存量回归

- 「e2e: the worker sees the project as of the case commit and what it wrote is judged」：这一刀改的正是准备项目那一段，它守着「项目跟用例提交一致、agent 写的文件进产物」。
- 「e2e: both plugins are copied to <tmp>/<random>/<plugin dir name> for --plugin-dir …」与「e2e: the plugin copy and the work dir are removed even when a session was stopped」：改后插件位置的求法和临时目录的清理会被碰到。
- `exercisedBy` 开头的几条单元测试（Read、Skill、Agent、Bash 全路径、斜杠命令、什么都没用到）：核对的位置列表变多，原有判定不能变。
- 「e2e: a small case whose run starts an agent is stopped, relabelled large, and left to --run-large」：大用例路径同样走准备项目的代码。
