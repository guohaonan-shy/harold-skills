# raw transcript 的正文模板

`docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md` 的正文照下面写。frontmatter 的字段在 `idea-loop:to-spec` 的「落 raw」里。

```markdown
<一段格式约定，让这份文件自解释：U 是人的原话，A 是 AI 的结论>

## U1

<人的发言，逐字保留，不改写不精简：决策住在这里>

## A1

<AI 的回应，只留结论与发现；取证过程、工具调用、中间推演都略去。引用的外部产物留链接，不复制正文>

…

## 本轮决议

| 议题 | 决议 |
|---|---|
```

引用过的外部材料（网页、PDF、查询结果、截图）抓进同一个 `docs/raw/<topic>/` 目录，各自带 `source_type` 和 `captured`；图片下载到 `assets/`，每张配一段文字描述，没有文字的图不算捕获。
