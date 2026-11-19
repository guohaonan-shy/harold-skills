# 15 — hooks.json 与 .mcp.json 改调 dyna

**Blocked by**：14 — 发布 dyna 第一版并存登记表
**设计冻结**：不涉及 UI

## 要建什么

插件的 hook 和 MCP 都改调插件小脚本：hook 每条写插件目录下的 `bin/dyna <模块> <命令> --hook`（SessionStart 的三条 `runtime inject` 和 `home map`；PreToolUse（Bash）新加 `issues guard --hook`、`worktree guard --hook`；seo、design lint、DESIGN.md lint、术语表检查各自的命令）；设计档案 MCP 改成 `bin/dyna mcp design-archive`。会话开场、写文件、敲 Bash 时的行为跟现在一样，外加两条新拦截。

## 验收标准

- [ ] hooks.json、.mcp.json 里没有旧脚本路径；扫描测试对它们通过
- [ ] 临时插件 + 本机装好的命令行，开一个 `claude -p` 会话：开场注入了运行环境和项目地图；会话里手写 `git worktree remove` 被拦（⏭ 延后 → 跑不了 `claude -p` 时写明）
- [ ] 版本不对时 hook 不拦、不报错，只在 stderr 留一行

## 选中的存量回归

- `session-start-inject.test.mjs`、`design-lint-hook.test.mjs`、`design-md-hook.test.mjs`：读 hooks.json 的形状，改写后要跟着改
