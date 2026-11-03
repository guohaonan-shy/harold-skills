# 知识库怎么写

知识库是一个业务一份、自己的 git 仓库。`knowledge-base.mjs` 靠根目录的 `idea-loop.json` 认它。

```
<知识库>/
├── idea-loop.json          业务名、issue 所在的 GitHub 仓库、业务里的代码仓库
├── PRODUCT.md  GLOSSARY.md  DESIGN.md  ISSUE_TRACKER.md
├── AGENTS.md               「issue 分类」一节
└── docs/                   spec/ adr/ design/ raw/ domain/ records/ index.md
```

## 建仓库

没有知识库仓库时：`gh repo create <owner>/<业务>-kb --private --clone` 先原样给人看，人说建才建，它在 GitHub 上立刻生效。clone 到代码仓库主 checkout 同级的 `<业务>-kb/`（人另有位置就用人定的）。setup 直接在知识库的主 checkout 里写，不开 worktree。

## 写什么

- **`idea-loop.json`**：

  ```json
  { "business": "<业务>", "issues": "<owner/name>", "repos": { "<仓库名>": "<owner/name>" } }
  ```

  `issues` 是 issue 所在的 GitHub 仓库，`issues.mjs` 读它。`repos` 的键是仓库名（`origin` 的仓库名），值是它的 GitHub 名。往已有业务加仓库时，只在 `repos` 里添这一项，别的不动。
- **`PRODUCT.md`、`ISSUE_TRACKER.md`**：按 [product.md](product.md)、[issue-tracker.md](issue-tracker.md) 的模板写到知识库根。
- **`AGENTS.md`**：只放一句「这是 `<业务>` 的知识库」和 `## issue 分类` 一节（模板 [issue-types.md](issue-types.md)，格式 [issue-category-format.md](issue-category-format.md)）。
- **`docs/` 骨架**：`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`records/`、`index.md`，只建不存在的。
- **`.gitattributes`**：`docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- **`.gitignore`**：`docs/design/tmp/`。
- 报了旧 spec 状态的：`node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" migrate <知识库>/docs`。
- `GLOSSARY.md`、`DESIGN.md` 不由 setup 新建：迁移时搬来，之后由 `idea-loop:grill`、`/idea-loop:uiux-imagine`、`/idea-loop:dreaming` 维护。

写完在知识库里 `git diff` 给人看，人说提交才提交，推到知识库主分支。

## 本机映射：`~/.idea-loop/projects.json`

```json
{
  "<业务>": {
    "knowledgeBase": "<知识库主 checkout 的绝对路径>",
    "home": "<会话在哪跑：调度和 issue 会话开在哪个 checkout>",
    "repos": { "<仓库名>": "<这个代码仓库主 checkout 的绝对路径>" }
  }
}
```

先读出已有内容，只合并这个业务，别的业务原样留着；文件不存在就新建。只放路径和会话在哪跑。环境变量 `IDEA_LOOP_HOME` 设了，用它替换 `~/.idea-loop`。
