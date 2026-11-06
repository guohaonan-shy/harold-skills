# 预检表

| 项 | 怎么查 | 必需 |
|---|---|---|
| git 仓库与 `origin` | `git remote get-url origin` | 是 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 是（基准分支的推荐值从这里来） |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | 是 |
| Codex companion | `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"` 退出码 0 | 是（review 用） |
| 浏览器 | 用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的『浏览器』与『装与设置』：要装什么、怎么查、修法都在那里 | 是 |
| Refero MCP | 同上，读『装与设置』里 Refero 一条（查有没有、修法） | 可选（设计调研用） |
