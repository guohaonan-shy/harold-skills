# 03 — DEVELOPMENT.md 的发布方式，setup 问清并带老项目迁移

**Blocked by**：01 — issues.mjs 换成四段阶段；02 — skill 走一条线
**设计冻结**：不涉及 UI

## 要建什么
setup 写 `DEVELOPMENT.md` 时「分支」节多「发布方式」（应用 / 按版本发布），按版本发布的再写「版本号」那一行；setup 问它，推荐值看有没有带版本号、最近被改过的清单文件。issue 会话开分支、pr-review 合并都照它走：应用一条 `issue/<根号>` 分支进主分支；按版本发布由版本会话切 `release/<单元>-<版本>`，feature 从 release 切 `feature/<slug>`、PR 进 release、合进 release 后 issue 留在审核中，全部合完版本会话开 release → 主分支的 PR、在合并提交里改版本号，再合各 feature 的知识库 PR、advance 关 issue。老项目重跑 setup：预检发现老 label 就进迁移，先给人看 `issues migrate` 的清单，人说做才 `--apply`，侧边栏「审核中」section 改名「讨论中」。本仓库自己的 `DEVELOPMENT.md` 填上按版本发布。

## 验收标准
- [x] setup 的 `development.md` 模板有「发布方式」「版本号」两行和取值说明；`questions.md` 有这一问和推荐规则
- [x] setup 预检表多一行「老 label 还在」，迁移参考写清：清单给人看 → 人说做 → `--apply` → section 改名
- [x] issue-session 按「发布方式」开分支：应用 `issue/<根号>`；按版本发布的版本会话切 release、feature 分支与 PR base 的规则
- [x] pr-review 合并：base 是 release 的 feature PR 合完不 advance；release → 主分支时在合并提交里改版本号，然后合 feature 的知识库 PR、逐份 advance
- [x] 本仓库 `DEVELOPMENT.md` 的「分支」节写上按版本发布与各 plugin 的版本文件
- [x] 文档测试守住 `development.md` 有「发布方式」；全量测试通过

## 选中的存量回归
- `setup-single-source.test.mjs`、`setup-knowledge-base-doc.test.mjs`、`setup-consolidation-doc.test.mjs`：断言了 setup 的结构
- [x] review 第 1 轮 S1（2026-11-03）：按版本发布的 feature，实现开的代码 PR base 是 release 分支；版本会话里验证只管这个 feature 的子 issue
- [x] review 第 1 轮 C1（2026-11-03）：插件说明的 issue 会话一条和目录树写上按版本发布时一组分成多份 spec
