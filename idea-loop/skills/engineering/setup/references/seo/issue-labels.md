# SEO 的 issue 分类

SEO 模块第 6 步，补进 `<项目目录>/ISSUE_TRACKER.md` 的「分类 label」一节。存在就补上缺的行，格式照 setup 的模板：父类、子类各一行，名字放反引号里，「：」后接说明，子类缩进两格。

```markdown
- `seo`：搜索可见性的问题：由 seo-scan 定时提出，或人按 SEO 问题提
  - `technical`：技术 SEO 与索引：审计问题、索引、sitemap、重点页面相对上次审计的回退
  - `pages`：已有页面优化：排名 5–20 位的词、标题与点击率、自相蚕食、内链缺口
  - `keywords`：关键词挖掘与新内容：新词、聚类、并入已有页还是新开
  - `backlinks`：外链：竞品有、我们没有的引用域，外联候选
  - `geo`：AI 搜索可见性：被 AI 回答提到和引用的情况、schema、llms.txt
```
