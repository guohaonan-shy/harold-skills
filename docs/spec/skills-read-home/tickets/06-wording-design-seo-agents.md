# 06 — design、seo 的 skill 和全部 agent 写成「项目目录」

**Blocked by**：05 — engineering 与 productivity 的 skill 写成「项目目录」（共用那个文档测试和项目目录的说法）
**设计冻结**：不涉及 UI

## 要建什么

跟 05 同一套写法（见 wiki-conventions 里项目目录那一段），改剩下的：`skills/design/`、`skills/seo/` 下所有 skill 与参考、`agents/` 下全部 agent 定义，以及两份 README。

- agent 定义统一改成：「读调用方在 prompt 里给的项目目录；`<docs>`、引导文件都在它下面；代码在你自己的 worktree 里」。子代理不触发 SessionStart，拿不到注入的那一行。
- 设计的产物（画布、冻结记录、`delta/`）写在项目目录的 `docs/design/tmp/<spec-slug>/` 下；跑设计档案脚本时给的根目录是项目目录。
- SEO 的 `SEO.md`、站点上下文在项目目录；站点内容（文章、页面）仍在代码仓库。
- pr-review 的 Codex 轴：给 Codex 的 spec 路径是 home 里的路径。

把 05 加的文档测试覆盖扩到 `skills/` 全部和 `agents/`。

## 验收标准

- [x] design、seo、agents 下不再出现「当前 worktree 的 `docs/`」「仓库根（目录）的 <引导文件>」「`git add -f`」（文档测试覆盖全部 skill 和 agent，全绿）
- [x] 每个 agent 定义写明从调用方 prompt 拿项目目录
- [x] 改了的每个 SKILL.md 主体 < 5000 字，并调过 `idea-loop:writing-for-agents`
- [x] 现有文档测试全绿
- [x] review 第 1 轮 S1（2026-11-18）：冻结后改设计（design-change-sync）派 designer 的清单里给出项目目录的绝对路径——spec：「调用子代理时，调用方在 prompt 里给出项目目录。」
- [ ] review 第 2 轮 S3（2026-11-18）：插件英文 README 的设计发散段（交接文件在 home 的项目目录下）和 review 段（SEO 自动合并只认 SEO.md 的内容路径、设计过程文件在项目目录）写成现行做法——REVIEW.md：同一个改动里同步插件自己的 README

## 选中的存量回归

- 插件不出现项目信息的测试。
- 设计档案 skill、uiux-refine 冻结、设计 tmp 位置、SEO 相关的文档测试：钉着被改的原话。
