# 竞品与重点页面同步

`seo-scan` 的「竞品与重点页面同步」一节指到这里。

1. `dyna seo sync-context <项目目录>/SEO.md <运行目录>/context.json`（没有 `context.json` 就跳过，记「同步失败：读不到项目上下文」）。
2. `updates` 非空：调 `update_project_context`，`updates` 就用脚本给的数组，原样。为空就不写。

名单以 SEO.md 为准、只往 OpenSEO 写，多出来的竞品被删是预期。任一步失败：记下原因，跳过同步，继续派 agent（它们读 SEO.md）。

完成条件：脚本的 `summary` 或失败原因已记下，供研究日志用。
