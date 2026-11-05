# 预检表

| 项 | 怎么查 | 必需 |
|---|---|---|
| 业务根目录 | `node "${CLAUDE_PLUGIN_ROOT}/scripts/business.mjs" root`：`legacy` 为假、`repos` 列出业务下的代码仓库；修法：建业务根目录的 git 仓库，把代码仓库 clone 在下面 | 是（`legacy: true` 是知识库还在代码仓库里的旧布局，照旧可用） |
| 业务说明文件 | `business.mjs instructions`：`current` 里有 `recommend` 那份；`needsSwitch` 为真时 `switchOn` 也为真 | 是 |
| git 仓库与 `origin` | 在代码仓库里 `git remote get-url origin`（知识库没有远端是正常的：公司业务不连远端） | 是 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 是（基准分支的推荐值从这里来） |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | 是 |
| Codex companion | `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"` 退出码 0 | 是（review 用） |
| Playwright MCP | `claude mcp get playwright`：用户级，参数带 `--headless --isolated`；修法 `claude mcp add --scope user playwright -- npx -y @playwright/mcp --headless --isolated` | 是 |
| Refero MCP | `claude mcp get refero`：用户级、http、`https://api.refero.design/mcp`；token 由人自己配，修法 `claude mcp add --scope user --transport http refero https://api.refero.design/mcp --header "Authorization: Bearer <token>"` | 可选（设计调研用） |
