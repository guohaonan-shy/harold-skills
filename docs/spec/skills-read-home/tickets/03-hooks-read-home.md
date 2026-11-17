# 03 — SEO 检查 hook、设计档案查询、设计 lint hook 认 home 里的项目目录

**Blocked by**：01 — 认项目脚本会答「项目目录在哪」
**设计冻结**：不涉及 UI

## 要建什么

三处按 git 顶层目录找 idea-loop 的文件，知识库搬进 home 后都找不到：

- **SEO 发布前检查的 hook**：在代码仓库的 git 顶层目录找 `SEO.md`。改成用认项目逻辑取项目目录，在项目目录里找 `SEO.md`；`SEO.md` 里写的构建输出目录仍相对代码仓库（hook 所在的 worktree）解析。项目没搬、或认不出项目的：hook 静默放行（跟现在没有 `SEO.md` 时一样），不挡命令。
- **设计档案查询的 MCP**（`design_page` 等七个工具）：在 git 顶层目录找 `docs/`。改成用认项目逻辑取项目目录，读项目目录下的 `docs/design/prod/`；会话开在 home 本身时，要能指定项目（工具参数里加可选的项目名，不给就按当前目录认）。认不出、或没搬的：报错，带 01 的那句话。
- **设计 lint hook**：认画布时要求路径里有 `docs/design/tmp/<spec-slug>/canvas/`。home 里的画布路径是 `<home>/projects/<名字>/docs/design/tmp/<spec-slug>/canvas/…`，现在的正则已经能匹配；确认绝对路径、home 里的路径都能认，并加测试钉住。不要求路径在当前仓库内。

## 验收标准

- [ ] 假 home 里项目目录有 `SEO.md`、代码 worktree 里没有：SEO hook 在 worktree 里触发时读到项目目录的 `SEO.md`
- [ ] 没搬的项目：SEO hook 静默放行，退出码 0
- [ ] 设计档案 MCP 在代码 worktree 里调用时读到假 home 项目目录的 `prod/`；在 home 里带项目名调用读到同一份；没搬的项目报迁移那句话
- [ ] 设计 lint hook 对 `<假 home>/projects/example-app/docs/design/tmp/x/canvas/a.html` 判为画布；对 `canvas/assets/` 下的文件不判
- [ ] 三者现有测试全绿

## 选中的存量回归

- SEO 检查 hook 的测试：找 `SEO.md` 的位置变了。
- 设计档案 MCP 的测试：根目录来源变了，七个工具都过一遍。
- 设计 lint hook 的测试：画布路径判定。
