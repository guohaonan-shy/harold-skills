# 探查读什么

- `CLAUDE.md`、`AGENTS.md`、`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`ISSUE_TRACKER.md`、`CONTRIBUTING.md`、`README`
- CI 配置（`.github/workflows/`）、`package.json` 的 scripts、锁文件、`.worktreeinclude`
- `git log --merges -20 --oneline` 和最近合并的 PR（`gh pr list --state merged --limit 10`），看合并方式
- `docs/` 目录树、`.gitignore`、`.gitattributes`
- `gh label list --limit 500` 和 open issue 上的 label（`gh issue list --state open --limit 500 --json number,labels`）：哪些 label 在用、用在什么 issue 上，推出分类和要保留的 label
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" check docs`：报了旧状态的，要迁移
- `GLOSSARY.md`、`DESIGN.md`、`PRODUCT.md` 在不在；没有 `PRODUCT.md` 的，从 `README`、落地页文案、产品里现有的界面推出它每一节的推荐答案
