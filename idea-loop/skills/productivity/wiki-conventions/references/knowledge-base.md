# 业务与知识库

下文 `business` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/business.mjs"`。

## 业务根目录

一个业务（共用一份知识库的一组代码仓库，只有一个仓库的也是）的知识库是一个 git 仓库，它的目录就是业务根目录。业务的代码仓库 clone 在它下面，由它的 `.gitignore` 忽略：

```
<业务根目录>/                 知识库所在的 git 仓库
├── CLAUDE.md 或 AGENTS.md    业务说明文件：## idea-loop 块、## issue 分类
├── PRODUCT.md  GLOSSARY.md  ISSUE_TRACKER.md  DEVELOPMENT.md  REVIEW.md  CODING_STANDARDS.md  DESIGN.md  SEO.md
├── docs/                     结构见 SKILL.md 的「目录」
├── .gitignore                忽略下面每个代码仓库
├── .worktrees/<分支>/        知识库分支的 worktree（本地忽略）
└── <仓库名>/                 代码仓库，只带它自己的 AGENTS.md / CLAUDE.md
```

- 个人的业务每个一个私有远端；公司的业务放在虚拟机上，本地 git，不连远端。
- 除了各代码仓库自己的 `AGENTS.md`（或 `CLAUDE.md`），idea-loop 读写的文件都在业务根目录。代码仓库里不放指向知识库的东西，归属只看目录。
- **多个仓库**：各仓库不同的地方（开发服务器、验证命令、代码规范……）写在同一份文件里，按 `## <仓库名>` 分节；各仓库相同的写在分节之前。读的时候先读共同部分，再读自己仓库那一节。
- **找业务根目录**：`business root` 输出 `root`（业务根目录）、`repo`（当前代码仓库名，在知识库里时为空）、`repos`（业务下的代码仓库）、`legacy`。从代码仓库、它的任何 worktree（不管开在哪）或知识库里跑，结果一样。
- **旧布局**（`legacy: true`）：知识库还在代码仓库里，业务根目录就是这个仓库自己。迁移前的仓库照旧工作，下面的「落地」不适用，知识库改动照旧跟着这个仓库的 PR 走。

**说明文件**：Claude Code 从会话所在目录往上读 `CLAUDE.md` / `AGENTS.md`，所以在业务根目录下面开的会话自动读到业务说明文件。worktree 开在业务根目录外面时，idea-loop 的 SessionStart hook 把业务说明文件的原文注入会话。业务根放哪一种、「两份都读」怎么开，归 `/idea-loop:setup`。

## 知识库落地

知识库的改动**不开 PR**。改到一半不进 main：别的会话、worktree 都从 main 读，不该读到半成品。

1. **开分支**：一个需求一个知识库分支，分支名 `issue-<号>`；没有 issue 的活（dreaming 的执行段、retro 的候选池）用 `<skill>-<YYYY-MM-DD>`。`business kb <分支>` 给出它的 worktree（`<业务根目录>/.worktrees/<分支>/`，不在就从 main 开，分支已在就接着用）。这个需求的 spec、raw、设计画布与冻结记录、工单、设计档案归档都写在这个 worktree 里，`<docs>` 就是它下面的 `docs/`；随时提交，不推送。
2. **什么时候合进知识库 main**，跑 `business land <分支>`：
   - **有代码 PR 的**：代码 PR 合并的同时或紧接着，由合并它的会话跑。
   - **父 issue**：拆完子 issue（spec 与设计定稿）就合，子 issue 的会话从 main 读父 spec。
   - **没有代码的 issue**：issue 进 done / canceled 时合。
   - **没有 issue 的活**：人批过、做完时合。
   - **搁置的**：不合，分支和 worktree 留着，恢复后接着用。
3. **`land` 做什么**：在业务根目录（停在知识库 main 上）合入分支；有远端就推送；再收掉 worktree、删掉分支。退出码 1 时 main 没动，照它的提示做完再跑一次：worktree 有没提交的改动，先提交；跟 main 冲突，在知识库 worktree 里 `git merge <main>`、解完冲突提交（两个分支改同一份文件，由合并的会话解，已知限制）；推送失败，合并已在本地完成，告诉人。
4. **读**：没开分支的会话读业务根目录（就是 main）；开了分支的读自己的 worktree。

旧布局下 `business kb` 返回当前 checkout，`land` 拒绝（退出码 1）。
