# 停下时的交回

`seo-scan` 有三处停下：开场「认 OpenSEO」的两种（被顶替、没连上），和「缺口关卡」。停下都不派方向 agent；最后一条消息照下面对应的形状写，不加别的。

## 认 OpenSEO

idea-loop 插件自带的 OpenSEO 在会话里的工具叫 `mcp__plugin_idea-loop_openseo__<工具>`。项目、本地或用户级配置里也配了同一个服务时，Claude Code 只连优先级高的那份，插件那份被顶替，工具名变成 `mcp__<那份配置起的名字>__<工具>`；方向 agent 的白名单只认插件名下的，拿不到任何工具，整次扫描空跑。所以在派 agent 之前认一次，只看会话里的工具名，不调任何付费工具：

| 会话里有 | 情形 | 去向 |
|---|---|---|
| `mcp__plugin_idea-loop_openseo__whoami` | 插件那份在 | 往下走 |
| 没有；但某个 `mcp__<名字>__` 前缀下同时有 `__whoami` 和 `__get_project_context` | `<名字>` 顶替了插件那份 | 停下，交回「被顶替」 |
| 一个 OpenSEO 工具都没有 | 没连上 | 停下，交回「没连上」 |

停下时不调 OpenSEO、不写研究日志（日志也经 OpenSEO 写），不花 credits。定时任务触发时没人在场：用『推送』提醒（做法照 `idea-loop:runtime`），写交回的第一行。

### 被顶替

删哪一层由人定，skill 不判断是哪一种，两种都写：

```
seo-scan <YYYY-MM-DD HH:MM> 停下：OpenSEO 被顶替
- `<名字>` 顶替了 idea-loop 插件自带的 OpenSEO；没派 agent，没花 credits
- 删掉那份配置：用户级或本地配置 `claude mcp remove <名字>`；项目配置删项目根 `.mcp.json` 里 `<名字>` 那一项
- 删完重开会话，下一次扫描就恢复
- 运行目录：<路径>
```

### 没连上

```
seo-scan <YYYY-MM-DD HH:MM> 停下：OpenSEO 没连上
- 会话里一个 OpenSEO 工具都没有；在 `/mcp` 里连上 idea-loop 插件的 openseo，再跑
- 运行目录：<路径>
```

## 缺口关卡

```
seo-scan <YYYY-MM-DD HH:MM> 停下等确认：<方向...>
- 缺：<项>（<哪些方向要>）→ 推测：<值>（<出处>）；…
- 运行目录：<路径>
```
