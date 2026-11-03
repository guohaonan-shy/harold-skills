# 老项目迁到知识库

老布局：`docs/`、`PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`、`AGENTS.md` 里的「issue 分类」都在代码仓库里。迁完之后代码仓库只留 `AGENTS.md` 里的指针块和 `DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`，别的都在知识库（布局见 [knowledge-base.md](knowledge-base.md)）。没迁的仓库跑任何 idea-loop skill 都会被告知先跑 setup，所以迁移不能留一半。

第 1 到 4 步不碰代码仓库的文件，第 5 步才改。

1. **问人**：[questions.md](questions.md) 的前四题（业务名、知识库仓库、会话在哪跑、issue 在哪个仓库），每题带推荐。知识库仓库还没有的，建仓库的命令（`gh repo create <owner>/<业务>-kb --private --clone`）原样给人看，人说建才建：它在 GitHub 上立刻生效。迁移前先对代码仓库的 `docs/` 跑一次 `spec-status.mjs check docs`，记下结果，第 6 步比对。
2. **带历史搬 `docs/`**：在代码仓库里 `git subtree split --prefix=docs -b <临时分支>` 切出一条只含 `docs/` 历史的分支；在知识库里 `git subtree add --prefix=docs <代码仓库的本机路径> <临时分支>` 接进来。路径不变，历史保留。`git subtree` 是 git 自带的，不用另外装；接完删掉临时分支。`subtree add` 要求知识库已有至少一个提交、工作区干净：刚建的空仓库先把 `idea-loop.json`（第 3 步写法）提交成第一个 commit 再接。
3. **复制设置文件**：`PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md` 复制进知识库根（仓库级的三份不动）。再按 [knowledge-base.md](knowledge-base.md) 写 `idea-loop.json`（`issues` 填第 1 步问到的仓库；issue 本来就在这个代码仓库上的，填它自己）、知识库的 `AGENTS.md`（把代码仓库 `AGENTS.md` 里的「issue 分类」一节搬过去）、`.gitattributes`、`.gitignore`。给人看 `git diff`，人说提交就提交，推到知识库主分支。
4. **写本机映射**：`~/.idea-loop/projects.json`，写法见 [knowledge-base.md](knowledge-base.md)。
5. **代码仓库开 PR**：从基准分支切一个分支，删 `docs/`、`PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`、`AGENTS.md` 里的「issue 分类」一节、`.gitattributes` 与 `.gitignore` 里 `docs/` 的行；把 `AGENTS.md`（或 `CLAUDE.md`）里原来的 `## idea-loop` 块换成指针块（模板 [agents-block.md](agents-block.md)）。`AGENTS.md` 里人写的别的内容原样留着。推送、开 PR，链接交给人看。**人合并，setup 不合并。** 删文件只走这个 PR，不直接推基准分支：误删要能在 review 里拦下。
6. **核对三项**，都过才算迁完：
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" check <知识库>/docs`：跟第 1 步记下的是同一组 spec，零问题。
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels <知识库>/docs`：不新建 label，也不列出多余的 label。
   - 在代码仓库主 checkout 里跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" root`，输出知识库的路径。主 checkout 要等 PR 合并后才有指针块；合并前在第 5 步的分支上跑，合并后再跑一次。

迁完回到 SKILL.md 的「写」，补它没覆盖的 label。
