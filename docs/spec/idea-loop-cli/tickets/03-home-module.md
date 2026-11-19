# 03 — home 模块：知识库与项目目录，落地护栏

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

把 project-map（where / commit / map）、home-config、memory-check、glossary-check 收成 `dyna home …`（glossary-check 是 `home glossary check`，带 `--hook` 时照现在的 PostToolUse 钩子回话；`map` 只由 hook 调）。新增：`home index` 生成各层 `index.md`（spec 层沿用现有生成逻辑，raw、adr 两层按 dreaming 现在手写的格式）；`home adr new <名字>` 给出下一个四位编号的文件名（递增、不复用）；`home commit` 加两条护栏：`docs/` 下 slug 重名（工单和 index.md 豁免）、`[[...]]` 指向不存在的文件（行内代码、代码块里的不算）就拒绝，列出所在文件、行和 slug，不产生提交。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [ ] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [ ] 一份 docs 里一个文件链到已删除的 slug，`dyna home commit <文件>` 拒绝、列出文件和 slug、git 里没有新提交
- [ ] 两个同名 slug 时 `home commit` 拒绝；工单、index.md 同名不拒
- [ ] `home adr new` 在已有 0001、0003 时给出 0004
- [ ] `home glossary check --hook` 对同一个 hook 事件的回话与旧钩子一致
- [ ] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `project-map.test.mjs`、`home-config.test.mjs`、`memory-check.test.mjs`、`glossary-check.test.mjs`：行为基准
