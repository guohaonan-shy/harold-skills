# 01 — 有意改过的 title/description 不再报成回退（#215）

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
technical 方向比较两次审计时，重点页面的 title 或 description 变了会出 `technical/key-page-meta-changed` 发现，不看这段时间合并了什么，于是有意的 SEO 改动被开成误报 issue（项目里已经三次，每次都由一个 issue 会话核实后关掉）。

这一刀新增一个确定性脚本（照 idea-loop 现有 `seo-*.mjs` 的命令行风格：输入文件/参数 → stdout JSON），输入两次审计的完成时间、`seo-baseline.mjs` 交出的 `key-page-meta-changed` 发现、目标仓库路径。对每个变化的页面，用新的 title / description 字符串在主分支历史里找引入它的提交（`git log -S` 一类），提交落在两次审计之间、且能对上一个合并 PR 的，判为「有意改动」。

technical-auditor agent 的定义在跑完 `seo-baseline.mjs` 那一步之后多一行调用这个脚本：有意改动不出发现，改为在研究日志记一行「有意改动：<页面> → #<PR>」；找不到出处的照旧出发现。判定全在脚本里，agent 只照结果做。研究日志的格式说明（seo-scan 的 research-log 参考）同步加这一行的格式，前两行格式不动（`seo-due.mjs` 依赖它们）。

## 验收标准
- [ ] 单元测试：建一个临时 git 仓库，两次审计之间有一个合并提交引入了新 title；脚本喂这条发现，输出判它为有意改动并给出那个 PR 号
- [ ] 单元测试：喂一个仓库历史里找不到的 title，脚本照旧把它列为要出的发现
- [ ] 单元测试：引入提交落在两次审计时间之外的，不算有意改动
- [ ] technical-auditor 定义里有这一步调用，并写明有意改动只进研究日志、不出发现；用一个 `*-doc.test.mjs` 钉住这句（先对改前的原文看它红）
- [ ] idea-loop 全量测试通过

## 选中的存量回归
- `seo-scripts.test.mjs`：同目录的 SEO 脚本测试，新脚本复用它们的辅助函数时可能被连带改坏
- `seo-issues.test.mjs`：发现文件的格式被 `seo-issues.mjs` 读，研究日志/发现格式变动会影响它
