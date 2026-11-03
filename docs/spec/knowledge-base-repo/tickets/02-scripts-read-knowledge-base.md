# 02 — issue 翻在对的仓库上，设计档案查询读知识库

**Blocked by**：01 — knowledge-base.mjs
**设计冻结**：不涉及 UI

## 要建什么

知识库搬出代码仓库后，两处脚本要换「在哪」：

1. **issue 所在仓库**：`issues.mjs`（以及复用它 `gh` 的 `seo-issues.mjs`）现在在 `<docs>` 所在目录里跑 `gh`，作用在那个仓库。`<docs>` 变成 `<知识库>/docs` 后，这会作用到知识库仓库上。改成：`<docs>` 上一层（知识库根）有 `idea-loop.json` 且有 `issues` 字段时，`gh` 带环境变量 `GH_REPO=<issues>` 跑（`gh api` 的 `{owner}/{repo}` 占位也认它）；没有时照旧。读「issue 分类」仍是 `<docs>` 上一层的 `AGENTS.md`，不改。`issues open` 写进新 issue 正文的 spec 位置，从「`docs/spec/<slug>/<slug>.md`」改成说明它在知识库里（知识库的 GitHub 名可从 `idea-loop.json` 的 `repos` 之外推不出时，就写「知识库的 `docs/spec/<slug>/<slug>.md`」）。用法注释里 `<docs>` 的说明改成「知识库的 `docs/`」。
2. **设计档案 MCP**（`design-archive-mcp.mjs`）现在取会话目录的 git 根、要求下面有 `docs/`。改成用 01 导出的函数取知识库根（读用，即 `root` 的语义）；查不到业务时的报错照 01 的说法（让人跑 `/idea-loop:setup`），错误码沿用现在的 `no-repo`。其余设计档案脚本（check / query / write / sections / flow-compose）本来就接受显式的仓库根参数，不改代码，只把它们报「下面没有 docs/：这不是目标仓库的根」的文字改成「这不是知识库的根」。

spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md` 的「issue 在哪个 GitHub 仓库」「同一行为的其他入口」。

## 验收标准
- [x] `issues.mjs` 的单元测试：临时知识库根有 `idea-loop.json`（`issues: "o/app"`），用默认 `gh` 工厂起一个命令（把 `gh` 换成记录环境的假可执行文件，或直接测工厂产出的 env），看到 `GH_REPO=o/app`；没有 `idea-loop.json` 时不设 `GH_REPO`
- [x] `seo-issues.mjs` 用同一个工厂，不另写一套
- [x] 设计档案 MCP 在一个配进业务的代码仓库 worktree 里启动，`design_state` 之类的查询读到的是知识库 `docs/design/prod/` 的内容（测试用 01 的临时仓库夹具 + `IDEA_LOOP_HOME`）
- [x] 设计档案 MCP 在没配进业务的仓库里启动，返回 `no-repo`，文字含 `/idea-loop:setup`
- [x] 插件全量 `node --test idea-loop/scripts/` 全绿
- [x] review 第 1 轮 S6（2026-11-03）：拼流程图脚本（flow-compose）给的档案目录不是知识库时，报错文字跟其余设计档案脚本一致，说「这不是知识库的根」

## 选中的存量回归
- `issues.test.mjs`：`defaultGh` 被改，全部 issue 状态翻转都经它
- `seo-issues.test.mjs`：复用 `defaultGh` 和 `readTypes`
- `design-archive-mcp.test.mjs`：`repoRoot` 被改
