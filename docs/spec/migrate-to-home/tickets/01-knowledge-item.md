# 01 — 搬知识库：`dyna home config` 的 knowledge 项

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

一台已在用 0.1.x 的设备上，人在某个已登记项目的主 checkout 里跑 `dyna home config plan --only knowledge --project <名字>`，看到这个项目的盘点表；把定好的表存成文件后跑 `dyna home config apply --only knowledge --project <名字> --plan <文件>`，这个项目的引导文件和 `docs/` 就原样进了 `<home>/projects/<名字>/`，并提交到 home。之后在这个项目里 `dyna home where`、`dyna home projects` 认它为已搬（`inHome: true`）。

现有 `dyna home config` 有四项（plugin、memory、claude-md、rules），出表 / 执行、执行前备份进 `<home>/.backup/<时间>/`、已是目标值的不重做。knowledge 是第五项，**只在 `--only` 点名时做**：不带 `--only` 时照旧只有原来四项，`ParseOnly` 的数字写法也只认原来四项。

**出表**（只读，什么都不写），三张表，`--json` 时同样三段：

1. 盘点：代码仓库 git 跟踪的每份文件一行（`docs/` 下的可以按目录合成一行并写文件数），列「归类」「去哪」。按下面顺序判，第一条成立就停：
   - idea-loop 的 8 份引导文件（`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`、`SEO.md`，用 home 包里已有的那份清单）→ 安装来的 → 项目目录
   - `docs/` 下 git 跟踪的 → 仓库专属的知识 → 项目目录下的 `docs/`
   - 仓库自己的 `AGENTS.md`、`CLAUDE.md`、`README*`、`EVAL.md`、`.claude/` 下的 → 仓库专属的工具 → 留在代码仓库
   - 其余根目录文件 → 判不了，「去哪」留空
   被 `.gitignore` 忽略、没被 git 跟踪的文件不进表。
2. 写死 `docs/` 的文件：代码仓库里 git 跟踪、不在 `docs/` 下的文件，内容里有指向本仓库 `docs/` 的相对路径（如 `docs/records/weekly/`）的；网址里的 `/docs/`（`https://example.com/docs/registry`）不算。
3. 开着且改了 `docs/` 的 PR：用 `gh pr list` 查这个仓库开着的 PR，改动文件里有 `docs/` 的列出号和标题。gh 失败就在这张表写一行「查不到：<原因>」，不让整个出表失败。

**执行**：读 `--plan` 文件（出表的 JSON，人可以填过「去哪」）。盘点表里还有「去哪」为空的行就拒绝，什么都不写，报出是哪几行。否则：
- 先照现有做法备份进 `<home>/.backup/<时间>/`（这一项备份 plan 文件本身）。
- 「去哪」是项目目录的文件复制进 `<home>/projects/<名字>/`，相对位置不变。`docs/` **最后落位**：先全部写进项目目录下的临时目录，引导文件就位后再把临时目录改名成 `docs/`；中途任何一步失败，项目目录里没有 `docs/`（临时目录清掉），重跑从头来。
- home 里的 `ISSUE_TRACKER.md` 两处改：「仓库」一节删掉；「分类 label」一节的正文换成 setup 模板（`idea-loop/skills/engineering/setup/references/issue-tracker.md` 的「分类 label」一节）里那段说明，后面接代码仓库 `AGENTS.md`「issue 分类」一节里的条目和「保留的 label」一行，格式要 `dyna issues` 的 `ParseTypes` 读得出来。代码仓库没有「issue 分类」一节就不动「分类 label」。代码仓库里的文件一个都不改。
- 代码仓库 `.gitattributes`、`.gitignore` 里指 `docs/` 的行，加上 `projects/<名字>/` 前缀追加进 home 的同名文件（已有的不重复加）。
- 用 home 已有的提交逻辑（`dyna home commit` 那一套，含 docs 的重名 slug 与死链检查）提交这次写的文件，message `chore: 搬入 <名字> 的知识库`。检查拒了就报出来，已复制的文件留着让人修。
- 第二次执行：项目目录里已有 `docs/` 就当作已搬，出表里这一项状态是「已是」，执行什么都不做。

## 验收标准

- [x] 临时 `HOME` 下登记一个 `example-app`（仓库根有 `DEVELOPMENT.md`、`EVAL.md`、一个 `NOTES.txt`，`docs/` 下两个跟踪的文件和一个被忽略的文件，`.gitattributes` 有一条 `docs/design/prod/**` 的 LFS 规则）：出表不写任何文件；`EVAL.md` 归「仓库专属的工具」，`NOTES.txt` 的「去哪」为空；被忽略的文件不在表里。
- [x] 同上，plan 里 `NOTES.txt` 没填就执行：拒绝、什么都没写；填成「留在代码仓库」后执行：项目目录下有 `DEVELOPMENT.md` 和两个跟踪的文件、没有被忽略的那个和 `EVAL.md`，home 的 `.gitattributes` 有加了前缀的规则，home 多了一个提交，备份目录里有 plan 文件。
- [x] 复制 `docs/` 的第二个文件时让它失败：项目目录里没有 `docs/`；去掉失败后再执行，`docs/` 在、文件齐全。
- [x] 仓库 `AGENTS.md` 有「issue 分类」一节（一个父类带一个子类、「保留的 label：无」）、`ISSUE_TRACKER.md` 有「仓库」「分类 label」两节：执行后 home 里的 `ISSUE_TRACKER.md` 没有「仓库」一节，`ParseTypes` 读出那个父类和子类；代码仓库里的两份文件没变。
- [x] 一个跟踪的脚本写着 `docs/records/weekly/`、一个写着 `https://example.com/docs/registry`：只有前一个进「写死 `docs/` 的文件」表。假 `gh` 返回一个改了 `docs/` 的开着的 PR：它进 PR 表；假 `gh` 失败时出表仍成功、表里一行「查不到」。
- [x] 执行第二次什么都不改；之后 `Locate` 对这个项目返回已搬。
- [x] 不带 `--only` 的 `plan` 输出跟改动前一样只有四行（现有测试照旧过）。
- [x] `cd dyna && go test ./internal/home/...` 全过。

## 选中的存量回归

- `dyna/internal/home` 的 config 测试：同一个命令加了项，默认四项和 `--only` 的数字写法最容易被带坏。
- `dyna/internal/home` 的 commit 测试：复用了它的提交与 docs 检查。
- `dyna/internal/issues` 里读「分类 label」的测试：home 里写出的那一节要它读得出。
- [ ] review 第 1 轮 S4（2026-11-26）：项目已搬（项目目录里已有 docs/）时，`plan --only knowledge` 只出这一项的总行「已是」，不再出盘点、写死路径、开着的 PR 三张表（JSON 同样不带这三段）；加一条测试：搬完再出表只有总行。
