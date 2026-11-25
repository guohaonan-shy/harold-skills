# 04 — setup 的「迁移」一节接上五步，dyna 升版

**Blocked by**：01、02、03
**设计冻结**：不涉及 UI

## 要建什么

已在用 0.1.x 的设备装上 0.2.0 后，人在项目的主 checkout 跑 `/idea-loop:setup`：预检认出「这个项目还没搬进 home」，setup 不再停在「步骤待补」，而是照新参考文件 `references/migrate.md` 一步一步带人搬完，每步「出表 → 人看 → 先备份 → 执行」。

setup `SKILL.md` 的「迁移」一节：把「迁移本身的步骤待补进这一节」换成一行指针（读 `references/migrate.md`）和完成条件（`dyna home projects` 里这个项目 `inHome: true`；记忆、用户级 skill 两项「已是」或人拒绝；删文件的 PR 已开），正文仍在 4500 字内。

`references/migrate.md` 写五步，命令用 01–03 的：

1. **登记**：项目不在项目清单里，先照「home」一节登记（建项目目录和项目地图）；`config` 的 `memory` 项（切 `autoMemoryDirectory`）这时不做，留到第 3 步。
2. **盘点并复制知识库**：`plan --only knowledge --project <名字>` 的三张表给人；「判不了」和「开着且改了 `docs/` 的 PR」按人这一轮的话定（PR 每个二选一：先合、之后再复制；或把它的 `docs/` 改动搬进 home、PR 里删掉）；定完的 JSON 存进 `<home>/.backup/<时间>/plan.json`，再 `apply`。被 docs 检查拒了，按它列的文件和行号在 home 里修，再提交。
3. **记忆**，同一次里做完、中间不开别的会话：`apply --only memories` → `apply --only memory`（切目录）→ 用 Skill 工具调 `idea-loop:dreaming` 只跑记忆那一段，压到 `dyna home memory check` 通过（140 行内）。压不下去就把 `autoMemoryDirectory` 改回备份里的原值，告诉人。
4. **用户级 skill**：`plan --only skills` 给人，人逐行定去留，**删的清单单独再确认一次**，人说「删」才 `apply`。
5. **代码仓库的 PR**：在主 checkout 之外开 worktree（`dyna worktree add`），从主分支切分支，删掉搬走的引导文件和 `docs/`、项目级启用 idea-loop 的设置（提交在仓库里的那份；本机文件先备份进 `<home>/.backup/<时间>/` 再改），把盘点表「写死 `docs/` 的文件」改成 home 里的路径，代码仓库 `AGENTS.md` 删掉「issue 分类」一节和 `## idea-loop` 一块；开 PR 给人合（`gh pr create`）。合之前对着主分支最新的 `docs/` 再跑一次第 2 步的复制（只复制有变化的文件），提交到 home。
6. 收尾：停用这个项目的 `dreaming-<仓库名>` 定时任务（只停用不删，交回里写名字）；`dispatch-<仓库名>` 不管（起 `dispatch-home` 时调度自己停）。交回一张改前改后对照表：搬进 home 的文件数对代码仓库 git 跟踪的数、记忆条数、`MEMORY.md` 行数、`~/.claude/skills` 下剩几个、PR 链接、停用的定时任务。

同一台设备再跑：已搬的项目盘点表每行「已是」，什么都不做。

另两件：
- harold-skills 自己的两个测试（`decision-rules-who-decides-doc.test.mjs` 读 `docs/records/retro-candidates/`、`retro-candidate-verify-doc.test.mjs` 读 `docs/records/index.md`）改成不依赖仓库的 `docs/`：`docs/` 不在时跳过读它的那几条断言（或改读固定在测试旁的样本），删掉 `docs/` 跑全量 node 测试全过。
- dyna 版本在集成分支当时的版本（0.0.15）上升一档，存登记表，`idea-loop/dyna-version` 下限提到新版本；README 里 setup 一行提一句迁移。

## 验收标准

- [ ] setup 的文档测试：「迁移」一节有指向 `references/migrate.md` 的指针、没有「待补」；参考文件里五步都在、写明删 skill 前单独确认清单、记忆三小步同一次做完、`memory` 项不在登记时先切。
- [ ] 把仓库的 `docs/` 删掉跑 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'`：全过；有 `docs/` 时也全过。
- [ ] dyna 新版本的登记表存好，`dyna-version` 下限对上，版本相关测试过；`cd dyna && go test ./...` 全过。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/setup-new-project-doc.test.mjs`、`setup-home-doc.test.mjs`：setup 正文和「home」一节的守护。
- `idea-loop/scripts/no-project-leak.test.mjs`：参考文件里不许出现真实项目名。
- `scripts/dyna-version.test.mjs`：升版守护。
