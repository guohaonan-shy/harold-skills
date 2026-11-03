# 在目标项目里接上术语表

目标项目第一次有 `GLOSSARY.md`、或人要求接入时用这份。

## AGENTS.md 里的读取规则

读取规则落在目标项目根的 `AGENTS.md`，用普通 markdown 链接（`@` 导入是 Claude Code 专有写法，Codex 不展开）。模板：

```md
## 领域词汇

[GLOSSARY.md](GLOSSARY.md) 是本项目的术语表。给领域概念起名前先读它：用标准叫法，不用 `_Avoid_` 里的词，
歧义词按它说的带限定；缺词不自己造词，在产出里说明缺了什么。
```

## CI 兜底

plugin 的 hook 只管 agent 的写入；人手改、别的工具改，靠目标项目的 CI 挡。`glossary-check.mjs` 是单文件、零依赖，CI 按 commit sha 钉版本直接拉，不往目标项目里复制一份，升级就是改 sha：

```yaml
name: Glossary check
on:
  pull_request:
    paths: ['**/GLOSSARY.md']
jobs:
  glossary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: |
          curl -fsSL https://raw.githubusercontent.com/guohaonan-shy/harold-skills/<sha>/idea-loop/scripts/glossary-check.mjs -o /tmp/glossary-check.mjs
          git ls-files | grep -E '(^|/)GLOSSARY\.md$' | xargs -r -n1 node /tmp/glossary-check.mjs
```
