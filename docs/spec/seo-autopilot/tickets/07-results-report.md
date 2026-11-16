# 07 — 每 3 天一份 SEO 效果报告

**Blocked by**：02 — OpenSEO 额度按周花完套餐；06 — 合并后上线自查，失败自动回滚
**设计冻结**：不涉及 UI

## 要建什么
现在 seo-scan 的五个方向都是找问题，没有一个回头看改动前后的效果；seo-scan 还写着「不写周报」。

这一刀之后：
- 节奏：`seo-due.mjs` 的节奏改成 `results` 每 3 天、其余五个方向每 7 天，方向列表加 `results`。seo-setup 建的定时任务改成每天一次（原「每周扫描」参考改名为每天扫描，任务 id 不变）；当天没有到期方向就只写一行研究日志。
- 新 agent `idea-loop:results-analyst`（照现有方向 agent 的定义写法、模型与思考强度钉在定义里）：输入同其他方向 agent（`SEO.md`、项目 id、额度、运行目录、今天）。用上一张工单的读回函数从带「上线自查」标记的已关 SEO issue 拿改动清单；取 Search Console、OpenSEO 排名、`SEO.md` 可选节「分析」（工具名、项目 id、dashboard 链接）指向的分析工具。产出发现文件（格式同 findings，过它的校验）和报告 md 加两张 excalidrawer `chart` 图（近 4 周每日点击折线并标出每个改动的上线日；每个改动前后对比的柱状图）。
- 报告三块：开头写窗口截止日（Search Console 晚 2–3 天）；整站近 7 天对上一个 7 天；只列上线满 14 天的改动的前后对比；「本周要做什么」的条目同时成为发现。没写「分析」节的，那一块写「没有接分析工具」。反常下跌、改了没起色的写成发现，按原改动的方向打分类（不新增 `type:seo/results`），走同一条提 issue → 分流。
- 报告落地：seo-scan 在 `.tmp/` 下开一个从主分支出的临时 worktree，把报告提交到 `docs/records/seo-results/<日期>.md`（加图），开只改 `docs/` 的 PR，检查过了合并，删掉 worktree，推送 PR 链接。
- seo-scan 里「不写周报或洞察」那句改掉；`seo-md.mjs` 读「分析」节（可选）；seo-setup 格式参考加「分析」节。
- 排名、点击变差不自动回滚，只进报告和 issue。

## 验收标准
- [x] 单元测试：研究日志里 results 3 天前跑过、technical 6 天前跑过，`seo-due.mjs` 判 results 到期、technical 未到期；7 天前跑过的 technical 到期
- [x] 单元测试：results 方向的发现文件过 findings 的校验
- [x] 单元测试：`seo-md.mjs` 读「分析」节，缺省不报错
- [x] results-analyst 定义存在，写明输入、改动清单的来源、两张图、报告三块和 14 天规则；seo-scan 写明 results 方向与报告落地；`*-doc.test.mjs` 钉住
- [x] seo-setup 的定时任务是每天一次
- [x] idea-loop 全量测试通过

## 选中的存量回归
- `seo-scripts.test.mjs`：`seo-due.mjs` 的节奏断言（28 天）要随之改
- `seo-issues.test.mjs`：results 的发现要能被 `seo-issues.mjs` 开成 issue
- `no-project-leak.test.mjs`：新 agent 的例子不能带项目名
