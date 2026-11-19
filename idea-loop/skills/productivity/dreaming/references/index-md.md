# index.md 的格式

dreaming 手写 `raw/`、`adr/` 的索引时读这一份；各层 `index.md` 的生成交给统一命令行（#339），那以后由命令行生成，这份就不再需要。`index.md` 只放索引，召回靠 `tags` + `summary` 加自带搜索。

```markdown
# <层名>
> 契约：<这一层收什么、不收什么，一句话>

| 文件 | status | summary |
|---|---|---|
| [[slug]] | 生效 | <取自 frontmatter.summary> |
```

- `adr/` 照上面的表头。`raw/` 的列是「文件」「source_type」「captured」「summary」，后三列取自各份 frontmatter。
- `docs/spec/index.md` 由 `spec.mjs index <docs>` 生成，只有「文件」「summary」两列：spec 没有状态，工作走到哪看它 `issues:` 里的 issue。看全貌跑 `spec.mjs check`。
- 设计档案的索引是 `docs/design/prod/index.md`，由归档脚本生成，没有 `docs/design/index.md`。它的契约行：「设计档案里现有的页面、组件、动效、用户路径各一张清单，`usedBy` 由脚本反向生成；frontmatter 里定主视口 / 主题 / 语言 / 动效模式（`motion`，项目定一次）。不收 `tmp/` 里进行中的需求。」它是唯一带 frontmatter 的 `index.md`，主视口 / 主题 / 语言 / 动效模式要被脚本读。
