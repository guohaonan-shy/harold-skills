# 开场的三步

`seo-scan` 的「开场」一节指到这里。下文 `S` 指 `${CLAUDE_PLUGIN_ROOT}/scripts`。

1. 项目目录照 `idea-loop:wiki-conventions` 的「项目目录」拿，拿不到照那里停下。`<项目目录>/SEO.md` 不存在，或 `node S/seo-md.mjs <项目目录>/SEO.md` 报错、`openseo.projectId` 为空：停下，交回原因和「先由人跑 `/idea-loop:seo-setup`」。
2. **运行目录**：`<工作根>/.tmp/seo-scan/<YYYYMMDD-HHMM>/`（工作根 = `git rev-parse --show-toplevel`，时间取 `date +%Y%m%d-%H%M`），`mkdir -p` 建好。照 `idea-loop:wiki-conventions` 的「本地忽略」确认 `.tmp/` 被忽略。
3. **项目上下文**：调 `get_project_context`（`projectId`），原始返回原样写到 `<运行目录>/context.json`。失败：原因记下，下面挑方向和同步都当作没有上下文。
