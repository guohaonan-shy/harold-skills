# 探查读什么

代码仓库里读：

- `CLAUDE.md`、`AGENTS.md`、`CONTRIBUTING.md`、`README`
- CI 配置（`.github/workflows/`）、`package.json` 的 scripts、锁文件、`.worktreeinclude`
- 最近 20 次合并提交和最近合并的 10 个 PR，看合并方式
- 「模块」三段推荐接不接的依据：前端界面（页面、组件目录）；对外的营销站或博客；调模型的依赖（`package.json`、`requirements.txt` 之类里的 `@anthropic-ai/sdk`、`openai`）。已接过的看 `<项目目录>/.gitattributes` 的 LFS 规则、`<项目目录>/SEO.md`、代码仓库根的 `EVAL.md`
- GitHub 项目：仓库现有的 label 和 open issue 上的 label（各读到 500 条）：哪些 label 在用、用在什么 issue 上，推出分类和要保留的 label

项目目录里读（全新项目这里还是空的，只有「已接上」的项目才有东西）：

- `DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`、`PRODUCT.md` 在不在；没有 `PRODUCT.md` 的，从 `README`、落地页文案、产品里现有的界面推出它每一节的推荐答案
- `docs/` 目录树、`.gitattributes`
- issue 在哪个平台：`ISSUE_TRACKER.md` 第一个标题写的是 GitHub 还是 Linear；没有这份文件的，看会话里有没有 Linear 的 MCP（能不能调 `list_teams`）、`README` 和 `CONTRIBUTING.md` 有没有提 Linear，推出「issue 在哪个平台」的推荐答案
- `<docs>` 在时：`dyna spec check <docs>`：报了旧平铺布局或还带 `status` 行的 spec，要迁移
