# 停下时的交回

`seo-scan` 有两处停下用这里的形状：开场「认 OpenSEO」没连上，和「缺口关卡」。停下都不派方向 agent；最后一条消息照下面对应的形状写，不加别的。

## 认 OpenSEO

会话里任何一个连接器（插件自带的、手动配置的、claude.ai 的，名字不拘）同时带 `whoami` 和 `get_project_context` 两个工具，就算 OpenSEO 在，往下走。一个都没有就停下：不调 OpenSEO、不写研究日志（日志也经 OpenSEO 写），不花 credits。定时任务触发时没人在场：用『推送』提醒（做法照 `idea-loop:runtime`），写交回的第一行。

```
seo-scan <YYYY-MM-DD HH:MM> 停下：OpenSEO 没连上
- 会话里一个 OpenSEO 工具都没有；在 `/mcp` 里连上 OpenSEO，再跑
- 运行目录：<路径>
```

## 缺口关卡

```
seo-scan <YYYY-MM-DD HH:MM> 停下等确认：<方向...>
- 缺：<项>（<哪些方向要>）→ 推测：<值>（<出处>）；…
- 运行目录：<路径>
```
