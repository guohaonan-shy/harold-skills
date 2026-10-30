# 预检表

| 项 | 怎么查 | 必需 |
|---|---|---|
| git 仓库与 `origin` | `git remote get-url origin` | 是 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 是（基准分支的推荐值从这里来） |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | 是 |
| Codex companion | `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"` 退出码 0 | 是（review 用） |
| Playwright MCP | `claude mcp get playwright`：用户级，参数带 `--headless --isolated`；修法 `claude mcp add --scope user playwright -- npx -y @playwright/mcp --headless --isolated` | 是 |
| Refero MCP | `claude mcp get refero`：用户级、http、`https://api.refero.design/mcp`；token 由人自己配，修法 `claude mcp add --scope user --transport http refero https://api.refero.design/mcp --header "Authorization: Bearer <token>"` | 可选（设计调研用） |
