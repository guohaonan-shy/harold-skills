# OpenSEO 被别处的配置顶替

`seo-setup` 第 1 步指到这里。判断跟 `seo-scan` 开场「认 OpenSEO」是同一个：会话里没有 `mcp__plugin_idea-loop_openseo__whoami`，但某个 `mcp__<名字>__` 前缀下同时有 `__whoami` 和 `__get_project_context`，就是 `<名字>` 那份配置顶替了插件自带的 OpenSEO。

原因（一句话告诉人）：Claude Code 对同一个服务只连优先级高的那份，工具名随之换成 `mcp__<名字>__*`，而 seo-scan 的方向 agent 只认插件名下的，会一个工具都拿不到。

告诉人：`<名字>` 顶替了 idea-loop 插件自带的 OpenSEO，删掉那份配置，重开会话，再跑 `/idea-loop:seo-setup`。删哪一层由人定，skill 不判断，两种都写：

- 用户级或本地配置：`claude mcp remove <名字>`
- 项目配置：删项目根 `.mcp.json` 里 `<名字>` 那一项

人删完之前，后面要 OpenSEO 的步骤照「连不上」做：只做仓库里的事，第 5、7 步记「未做：OpenSEO 被 `<名字>` 顶替」。
