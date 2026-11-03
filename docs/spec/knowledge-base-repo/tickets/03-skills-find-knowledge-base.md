# 03 — 所有 skill 与 agent 去知识库找 docs 和设置

**Blocked by**：01 — knowledge-base.mjs
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里的 skill、参考文档、agent 定义，凡是说「目标仓库的 `docs/`」「当前 worktree 的 `docs/`」「主 checkout 的 `docs/`」「仓库根目录的 `PRODUCT.md` / `ISSUE_TRACKER.md` / `GLOSSARY.md` / `DESIGN.md`」「`AGENTS.md` 的 issue 分类」「`CLAUDE.md` 的 idea-loop 块」的地方，全部改成去知识库找。spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md` 的「方案」整节。

做法：
1. **在 `idea-loop:wiki-conventions` 定义一次**（它是「动 docs/ 之前用」的那个 skill）：知识库是什么、长什么样（根目录的业务级设置与 `idea-loop.json`、`docs/` 结构不变；仓库级设置 `DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 不在知识库，照旧在代码仓库根目录；代码仓库 `AGENTS.md` 的指针块）、`<知识库>` 怎么取（读用 `knowledge-base.mjs root`、写用 `root --write`）、所有 `docs/…` 路径都相对知识库根、`.tmp/kb/` 与 `.tmp/repos/<仓库名>/` 在「中间产物」里的位置、本地忽略只对代码仓库的 `.tmp/` 做而知识库的 `docs/design/tmp/` 由知识库自己的 `.gitignore` 管、知识库的 PR 合进知识库的主分支。description 从「目标仓库 docs/ 知识库」改成「业务知识库」。
2. **其余文件只换基准**：每处 `<docs>` 的定义改成知识库的 `docs/`（读还是写按那一步做什么定：对账、查、检查用 `root`；写 spec、工单、设计、raw、记录、删工单、归档用 `root --write`）；按名字提到业务级设置文件（`PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`、「issue 分类」）的，写明在知识库根（同一份文件里只在第一次出现处说，之后照旧用名字）；`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 的说法不动；「只改 `docs/` 的 PR」「合进主分支」这类说法，在 spec / 设计 / 记录这种知识库内容上改成「知识库的 PR」「合进知识库的主分支」；调设计档案脚本时传的仓库根改成 `<知识库>`；`gh pr` 作用在知识库 PR 上的，在知识库 worktree 里跑。
3. 不改语义：阶段名、调度出哪些 issue、怎么开会话、spec 和设计是否单独开 PR，都照现在写（F1 / F2 / F4 会改）。`setup` 和多仓库的规则不在这张（04、05）。
4. 插件 `README.md` 里说 `docs/` 在目标仓库的地方同步改。

## 验收标准
- [x] 新加一个文档测试：插件的 `skills/`、`agents/` 下（不含 `setup` skill，它归 04）不再出现「目标仓库的 `docs/`」「当前 worktree 的 `docs/`」「主 checkout 的 `docs/`」「仓库根目录」指向 idea-loop 设置文件这几类说法（测试列出命中的文件与行）
- [x] 文档测试：`wiki-conventions` 的 SKILL.md 写了 `knowledge-base.mjs root`、`root --write`、`.tmp/kb/`，且写明 `DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 在代码仓库根目录
- [x] 文档测试：每个定义了 `<docs>` 的 skill（`grep -l "<docs>"`）都在定义处提到 `knowledge-base.mjs`
- [x] 现有的 `*-doc.test.mjs` 因措辞变化失败的，改断言使其守的意思不变，不删测试
- [x] `no-project-leak.test.mjs` 仍绿：举例不用真实项目名
- [x] 插件全量测试全绿（仓库声明的命令 `node --test '*/scripts/*.test.mjs'`；`node --test idea-loop/scripts/` 在 Node 22 跑不了）
- [ ] review 第 1 轮 S1（2026-11-03）：会话开在知识库里时（当前 checkout 就是知识库），issue 会话、核 issue、dreaming 的开场不因读不到 `DEVELOPMENT.md` 停下：主分支取知识库远端的默认分支；碰代码的步骤读工单写的那个仓库自己的 `DEVELOPMENT.md` / `REVIEW.md`，在它的 `.tmp/repos/<仓库名>/` worktree 里做。文档测试守住这几处开场的说法

## 选中的存量回归
- `no-project-leak.test.mjs`：改了大量 skill 文字
- `skill-private-references.test.mjs`：参考资料引用关系
- 所有 `*-doc.test.mjs`：它们对 skill 原文断言，措辞改动最可能打断它们
