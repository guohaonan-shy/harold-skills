# 05 — 停掉 cloud 整合；implement 没工单自己切

**Blocked by**：03 — 开 issue 时挂模块根、判 P0（都改 implement）
**设计冻结**：不涉及 UI

## 要建什么

setup 不再建 cloud 整合定时任务：删掉那一节、它的 prompt 参考文件、交回里那一行，以及守着这一节的测试；插件 README 同步。setup 正文仍在长度上限内、链接的参考文件都在（这两条原来由被删的测试守着，移到别的 setup 测试里继续守）。

`/idea-loop:implement <slug>` 遇到 spec 还没切工单（「正式」、`tickets/` 下没有工单）时，用 Skill 工具调 to-ticket 切完接着派工，不再停下让人先跑 to-ticket；旧布局照旧先停下迁移。

## 验收标准

- [x] setup 里没有「整合定时任务」，参考目录里没有整合 prompt；README 不再提整合任务
- [x] setup 正文长度与参考链接仍有测试守着
- [x] implement 的前提写明没工单自己调 to-ticket
- [x] 全量测试通过

## 选中的存量回归

- `setup-single-source.test.mjs`、`setup-knowledge-base-doc.test.mjs`：守着 setup
- `implement-reuse-blocked-doc.test.mjs`：守着 implement
