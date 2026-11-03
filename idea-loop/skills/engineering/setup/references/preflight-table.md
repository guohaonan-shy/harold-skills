# 预检表

| 项 | 怎么查 | 必需 |
|---|---|---|
| git 仓库与 `origin` | `git remote get-url origin` | 是 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 是（基准分支的推荐值从这里来） |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | 是 |
| Codex companion | `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"` 退出码 0 | 是（review 用） |
| Playwright MCP | `claude mcp get playwright`：用户级，参数带 `--headless --isolated`；修法 `claude mcp add --scope user playwright -- npx -y @playwright/mcp --headless --isolated` | 是 |
| Refero MCP | `claude mcp get refero`：用户级、http、`https://api.refero.design/mcp`；token 由人自己配，修法 `claude mcp add --scope user --transport http refero https://api.refero.design/mcp --header "Authorization: Bearer <token>"` | 可选（设计调研用） |
| 本机映射 | `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" business`（在代码仓库主 checkout 里跑）：退出码 0 = 这个仓库已配进业务，输出业务、知识库、`home`、各仓库；非 0 = 还没配，stderr 说原因（缺指针块，或本机没 clone 知识库） | 否（结论决定走新配置、加仓库还是重跑更新） |
| 老阶段 label | `gh label list --search status:` 里有 `status:验证中`、`status:待设计`、`status:待实现` 中任何一个（issue 仓库取知识库 `idea-loop.json` 的 `issues`；还没配知识库的看当前仓库）：有 = 阶段名还没换成讨论中 / 设计中 / 实现中 / 审核中 | 否（有 = 走 SKILL.md 的「迁移」） |
| 老布局 | 代码仓库里有没有 `docs/`，或根目录有没有 `PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`，或 `AGENTS.md` / `CLAUDE.md` 的 `## idea-loop` 块还是设置清单（没有「业务」「知识库」两行）：有任何一样 = 要迁移 | 否（有 = 走 SKILL.md 的「迁移」） |