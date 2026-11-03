# 探查读什么

- 代码仓库里的 `CLAUDE.md`、`AGENTS.md`、`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`CONTRIBUTING.md`、`README`；老布局下代码仓库里还有的 `ISSUE_TRACKER.md`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" business`：已配的业务、知识库、`home`、各仓库；本机 `~/.idea-loop/projects.json` 里已有哪些业务（业务名的备选）；业务的知识库已存在时，读它根目录的 `idea-loop.json`、`PRODUCT.md`、`ISSUE_TRACKER.md`、`AGENTS.md`
- 业务里有两个以上代码仓库时（或这次加进来的是第二个）：每个仓库的 `README` 与顶层目录结构（本机路径取自 `knowledge-base.mjs business`；本机没 clone 的只读 GitHub 上的 README），推「管哪块功能」「跟别的仓库的依赖」的推荐答案；知识库 `AGENTS.md` 里已有 `## 仓库` 一节的，读它
- CI 配置（`.github/workflows/`）、`package.json` 的 scripts、锁文件、`.worktreeinclude`
- `git log --merges -20 --oneline` 和最近合并的 PR（`gh pr list --state merged --limit 10`），看合并方式
- `docs/` 目录树（老布局在代码仓库里，否则在知识库里）、`.gitignore`、`.gitattributes`
- `gh label list --limit 500` 和 open issue 上的 label（`gh issue list --state open --limit 500 --json number,labels`；issue 仓库不是当前仓库时加 `--repo <owner/name>`）：哪些 label 在用、用在什么 issue 上，推出分类和要保留的 label
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" check <docs>`（`<docs>` 是老布局下代码仓库的 `docs`，或知识库的 `docs`）：报了旧状态的，要迁移；老布局的结果记下来，迁移后拿来比对
- `GLOSSARY.md`、`DESIGN.md`、`PRODUCT.md` 在不在（老布局在代码仓库根目录，否则在知识库根）；没有 `PRODUCT.md` 的，从 `README`、落地页文案、产品里现有的界面推出它每一节的推荐答案
