# 05 — 只改内容的 SEO PR 由 Claude 合并

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
现在 decision-rules「护栏」规定合并改了代码的 PR 只由人定；SEO 实现 PR 等人合并 1 到 18 小时，而已完成的 14 个 SEO issue 没有一个改了组件。

这一刀之后：
- `SEO.md`「构建与检查」节新增键「内容路径」（glob 列表：项目的博客、配图、`robots.txt`、sitemap、`llms.txt` 等）。新增一个确定性脚本（照 `seo-*.mjs` 风格）判一个 PR 的改动文件是否全部落在「内容路径」加 `docs/` 和根目录 `SEO.md` 里：全部命中才算「只改内容」，否则列出不在范围内的文件。`.astro`、`.tsx`、`.css` 这类只有被显式列进「内容路径」才算。`seo-md.mjs` 读出这个键；seo-setup 推测推荐值、人确认后写入，`SEO.md` 格式参考同步加。
- decision-rules「护栏」加一条 SEO 例外，写成可核对的三条：`REVIEW.md` 的检查与 `seo-check` 全过；两轴没有阻塞项；脚本判定只改内容。另外「上线自查失败时开的 revert PR」也可由 Claude 合并。任一条不满足回到「只由人定」。
- pr-review 在「没有修复、没有要人定的事 → 交审核报告」之后加 SEO 分支：issue 带 `type:seo/*`、三条都满足、PR 描述有「上线自查的网址」一节时，报告照常写进 PR 描述，然后不停下，照合并参考的「合并」走（review loop 照常归档），汇报和推送写「已自动合并」。缺任何一条，照现在的流程停下交给人。
- PR 描述新增一节「上线自查的网址」（每行一个网址和它的目标词）：由实现阶段写（implement 或 pr 的 PR 描述规则里说明 SEO issue 要写这一节）；没有这一节的不自动合并。若 `pr-body.mjs` 的节是闭集，就加这个节名。
- 上线后自查本身由下一张工单做；这一刀只要求合并后照现有合并流程走完。

## 验收标准
- [x] 单元测试：「内容路径」只列博客目录，喂一个改了博客 md 和一个 `.tsx` 的文件列表，判「不在范围内」并列出 `.tsx`
- [x] 单元测试：全部落在「内容路径」+ `docs/` + `SEO.md` 的判「只改内容」
- [x] 单元测试：`seo-md.mjs` 读出「内容路径」
- [x] decision-rules「护栏」有 SEO 例外的三条和 revert PR 那一条；pr-review 有 SEO 自动合并分支；各用 `*-doc.test.mjs` 钉住（先对改前原文看它红）
- [x] PR 描述能写「上线自查的网址」一节（`pr-body.mjs` 接受它，有测试）
- [x] pr-review、decision-rules 的 SKILL.md 主体字数不超过各自现有的字数测试/棘轮
- [x] idea-loop 全量测试通过

## 选中的存量回归
- pr-review 的字数棘轮测试（钉在 5108 字附近）：加分支最容易撑破它，超了把细节挪进 pr-review 自己的 references
- `pr-body` 相关测试：新增节名可能影响节的顺序和代码指称检查
- decision-rules 现有的文档测试（范围题、护栏的句子）
