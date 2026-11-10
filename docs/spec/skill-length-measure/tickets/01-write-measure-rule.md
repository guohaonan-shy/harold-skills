# 01 — 把「主体 < 5000 字」的量法写进仓库规则

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

仓库根目录的 `AGENTS.md` 和 `REVIEW.md` 都要求 SKILL.md「主体 < 5000 字」，但没写怎么量。agent 常用 `wc -m`，而 Claude Code 的 shell 里 `LANG`、`LC_ALL` 为空、locale 是 C，`wc -m` 这时数字节，一个汉字算 3，中文为主的 SKILL.md 量出来差不多翻倍，被误报超长（例：dreaming 的 SKILL.md，C locale 下 `wc -m` 得 6821，去掉 frontmatter 后按字符数只有 3580）。

做完以后：agent 在 `AGENTS.md`「标准 plugin 目录结构」下方那条「SKILL.md 主体保持精简（< 5000 字）」要点里就能读到量法——

- 主体 = 去掉文件开头 frontmatter（两条 `---` 之间）之后的部分；
- 「字」= UTF-8 字符数，一个汉字、一个字母、一个空格各算 1；
- 一条照抄就对的命令：`awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`；
- 一句提醒：不带 `LC_ALL` 的 `wc -m` 在 C locale 下数的是字节。

量法只写在这一处。`AGENTS.md` 目录树里的注释「主体 < 5000 字」和 `REVIEW.md`「额外要求」里那条，各自只加一个指回这条要点的指针，不重复量法。`REVIEW.md` 那条现在写的出处是「`AGENTS.md`「SKILL.md 编写约定」」，但这条要点其实在「标准 plugin 目录结构」一节，指针要指对。

写法守仓库已有的风格：中文、短句、不加新小节。

## 验收标准

- [ ] `AGENTS.md` 那条要点写明了主体从哪算起、「字」怎么数、那条命令和 C locale 的提醒。
- [ ] 量法在仓库根目录的文档里只出现在这一处；目录树注释和 `REVIEW.md` 那条都只是指针，`REVIEW.md` 指向的节名与要点实际所在的节一致。
- [ ] 在 `LANG`、`LC_ALL` 为空的 shell 里，把文档里的命令原样套到 `idea-loop/skills/productivity/dreaming/SKILL.md` 上跑，再加 `LC_ALL=C` 前缀跑一次：两次结果相同，且等于用 Node 读文件、去掉 frontmatter 后 `[...s].length` 的值。
- [ ] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过。

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：守的是插件目录，这次只改仓库根目录的文档，跑一遍确认没碰到插件。
- `idea-loop/scripts/design-archive-skill-doc.test.mjs`：同一个「去掉 frontmatter、数字符」的量法，确认规则里写的量法跟它一致。
