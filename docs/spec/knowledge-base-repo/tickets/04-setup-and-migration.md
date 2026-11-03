# 04 — setup 配知识库，并把老项目迁过去

**Blocked by**：01 — knowledge-base.mjs；03 — 所有 skill 与 agent 去知识库找 docs 和设置
**设计冻结**：不涉及 UI

## 要建什么

`/idea-loop:setup` 往代码仓库只写 `AGENTS.md` 里一个指向知识库的指针块（spec「代码仓库怎么指向它」）和仓库级的三份设置，别的都写进知识库：它先问清业务与知识库，把设置写进知识库，记本机映射；发现代码仓库里还有 `docs/`（老项目）就带人迁移。spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md` 的「知识库仓库长什么样」「每台机器怎么找到它」「业务级与仓库级的划分」「迁移：`git subtree` 带历史，设置文件复制」「老布局在哪被拦下」。

要点：
- **预检**加两行：本机映射里有没有这个仓库（`knowledge-base.mjs business`）；代码仓库里还有没有 `docs/` 或根目录的 idea-loop 设置文件（有 = 老布局，要迁移）。
- **问人**加四题，必须问清（grill 决议 U7 Q22）：业务名（推荐仓库名）；知识库仓库（已有就填它的 GitHub 名与本机路径；没有推荐新建私有 `<owner>/<业务>-kb`、clone 到代码仓库主 checkout 同级的 `<业务>-kb/`）；会话在哪跑（`home`：一个代码仓库的业务推荐那个代码仓库，几个仓库推荐知识库）；issue 在哪个 GitHub 仓库（推荐当前代码仓库）。往已有业务加仓库时只问它的仓库级设置。
- **写**：业务级设置（`PRODUCT.md`、`ISSUE_TRACKER.md`、「issue 分类」写进知识库根的 `AGENTS.md`；`GLOSSARY.md`、`DESIGN.md` 只在迁移时搬）写到知识库根；仓库级（`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`）照旧写在代码仓库根目录；`idea-loop.json`；`docs/` 骨架建在知识库里；LFS 规则和 `docs/design/tmp/` 的忽略写进知识库的 `.gitattributes` / `.gitignore`；代码仓库只写指针块（`agents-block.md` 模板改成指针块；写进 `AGENTS.md`，没有 `AGENTS.md` 就写进 `CLAUDE.md`，两份都没有问人建哪份；块已存在就原地更新）并往 `$(git rev-parse --git-common-dir)/info/exclude` 加 `.tmp/`；`issues.mjs labels`、`spec-status.mjs` 的 `<docs>` 用知识库的 `docs/`；写 `~/.idea-loop/projects.json`（合并已有内容，不覆盖别的业务）。知识库里的改动提交并推送到知识库主分支前先给人看 `git diff`。
- **迁移**（老布局时）：照 spec 的 6 步，写成 setup 的一份参考文档（如 `references/migrate-to-knowledge-base.md`），SKILL.md 正文只放一节指针。建 GitHub 仓库的 `gh repo create` 先给人看、人说建才建。代码仓库那边是一个删文件、把原 `## idea-loop` 块换成指针块的 PR，交给人合并，setup 不合并。核对三项（`spec-status check` 同一组 spec 零问题、`issues labels` 不新建不列出、代码仓库主 checkout 跑 `knowledge-base.mjs root` 输出知识库）。
- **夜间回放、每周 dreaming、整合定时任务**这三节不改语义；dreaming 的「在本仓库主 checkout 里做」改成在 `home` 里做。
- **交回**改：写了知识库哪些文件、映射写了什么、迁移 PR 的链接、「怎么起调度」改成在 `home` 的主 checkout 里起。
- setup 的 description 改成不再说「根目录的项目规则文件、docs/ 骨架」。
- 插件 `README.md` 的安装与 setup 说明同步。

> 人的决定（2026-11-03）：「我觉得DEVELOPMENT.md、REVIEW.md、CODING_STANDARDS.md 这些仍然放在project 纬度吧，之后再考虑将一部分通用的内容拆分到业务这块。」

> 人的决定（2026-11-03，#220 会话转达）：「我倾向于仓库的agent.md仍然维护，但是知识库可以一个指针指向对应的地方即可～」

## 验收标准
- [x] `setup-single-source.test.mjs` 等现有 setup 文档测试改成守新说法后全绿
- [x] 新文档测试：setup 的 SKILL.md 与 references 不再把 `PRODUCT.md`、`ISSUE_TRACKER.md`、「issue 分类」、`docs/` 骨架写进代码仓库；`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 仍写在代码仓库根目录；`agents-block.md` 是含「业务」「知识库」两行的指针块；写了 `idea-loop.json`、`projects.json`、迁移参考的指针
- [x] 新文档测试：迁移参考写了 `git subtree split --prefix=docs`、`git subtree add --prefix=docs`、`gh repo create` 先给人看、删文件走 PR、三项核对
- [x] 问人的问题清单（`references/questions.md`）有业务名、知识库仓库、会话在哪跑、issue 仓库四题，各带推荐与出处
- [x] 插件全量 `node --test idea-loop/scripts/` 全绿
- [x] review 第 1 轮 S1（2026-11-03）：业务里有两个以上代码仓库时（新建时就有，或往已有业务加第二个仓库时），setup 在知识库根 `AGENTS.md` 写「## 仓库」一节，每个仓库一条：仓库名、GitHub 名、管哪块功能、跟别的仓库怎么依赖；「管哪块功能」「依赖」先从各仓库的 README / 目录结构推一个推荐答案再问人；只有一个仓库的业务不写这一节。「会话在哪跑」几个仓库时推荐知识库。文档测试守住

## 选中的存量回归
- `setup-single-source.test.mjs`、`setup-consolidation-doc.test.mjs`：守 setup 的现有说法
- `no-project-leak.test.mjs`：迁移举例不用真实项目名
