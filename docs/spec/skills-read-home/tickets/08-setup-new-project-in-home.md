# 08 — setup 给全新项目把引导文件和 docs/ 建在 home 里

**Blocked by**：05 — engineering 与 productivity 的 skill 写成「项目目录」（setup 的说法跟它一致）
**设计冻结**：不涉及 UI

## 要建什么

现在 setup 在代码仓库的主 checkout 根目录写引导文件（`DEVELOPMENT.md` 等八份）和 `docs/`，并往代码仓库 `AGENTS.md` 里写一段 `## idea-loop` 指针。#252 之后 setup 先建 home、登记项目。改成：

- home 已在、当前项目在项目清单里、项目目录还没有 `docs/`：
  - **以前就在用 0.1.x 的项目**（代码仓库根已经有 idea-loop 的引导文件，或 `docs/` 里有 `spec/` 或 `adr/`）：setup 说「这个项目要迁移」，走迁移（#247 的事），这张工单只留一个指向迁移的入口和这句话，不写迁移本身。
  - **全新项目**：引导文件和 `docs/` 直接建在项目目录里，不往代码仓库根写任何 idea-loop 的文件。
- 新项目不再往代码仓库 `AGENTS.md` 里写 `## idea-loop` 段；它的作用由项目地图代替。
- `ISSUE_TRACKER.md` 模板：删掉「仓库」一节；「分类 label」一节从指向 `AGENTS.md` 改成直接装分类（格式同现在 `AGENTS.md`「issue 分类」一节）。
- setup 写完项目目录里的文件后，用 `commit` 提交到 home。
- setup 的「预检」：判断项目是否已接上，改看项目目录而不是代码仓库根。

## 验收标准

- [x] setup 的流程写明：全新项目的引导文件和 `docs/` 建在项目目录、提交到 home；代码仓库里不留 idea-loop 的文件
- [x] 0.1.x 项目被认出来时，setup 停在「要迁移」并指向迁移，不在代码仓库里补文件
- [x] `ISSUE_TRACKER.md` 模板没有「仓库」一节，「分类 label」一节直接装分类；代码仓库 `AGENTS.md` 的 `## idea-loop` 段模板不再被新项目使用
- [x] 02 的 issue 脚本能读到这份新模板生成的「分类 label」（拿模板生成一份跑一次 `labels` 的解析）
- [x] 改了的 SKILL.md 主体 < 5000 字，并调过 `idea-loop:writing-for-agents`

## 选中的存量回归

- setup 相关的文档测试和 `home-config` 的测试。
- issue 脚本里解析分类的测试：模板格式要对得上。
