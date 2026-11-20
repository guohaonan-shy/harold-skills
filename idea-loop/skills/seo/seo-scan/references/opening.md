# 开场的四步

`seo-scan` 的「开场」一节指到这里。

1. 项目目录照 `idea-loop:wiki-conventions` 的「项目目录」拿，拿不到照那里停下。`<项目目录>/SEO.md` 不存在，或 `dyna seo parse <项目目录>/SEO.md` 报错、`openseo.projectId` 为空：停下，交回原因和「先由人跑 `/idea-loop:setup`（SEO 模块）」。
2. **运行目录**：`<工作根>/.tmp/seo-scan/<YYYYMMDD-HHMM>/`（工作根 = `git rev-parse --show-toplevel`，时间取 `date +%Y%m%d-%H%M`），`mkdir -p` 建好。照 `idea-loop:wiki-conventions` 的「本地忽略」确认 `.tmp/` 被忽略。
3. **认 OpenSEO**：会话里有连接器同时带 `whoami` 和 `get_project_context` 就往下；一个都没有：停下，不派 agent，照 [stops.md](stops.md) 交回。
4. **项目上下文**：调 `get_project_context`（`projectId`），原始返回原样写到 `<运行目录>/context.json`。失败：原因记下，下面挑方向和同步都当作没有上下文。
