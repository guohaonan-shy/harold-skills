# 16 — skill 迁移：engineering、productivity 两类与它们的 agent，去掉 pr-reviewer

**Blocked by**：01 — 末尾「人的决定」那一格（版本改成 0.0.1）
**设计冻结**：不涉及 UI

## 要建什么

engineering、productivity 两类 skill 和它们用到的 agent（implementer、explorer、issue-triager、adr-reconciler、design-steward 等）里的全路径脚本调用改成 `dyna <模块> <命令>`；参数改靠 `--help` 查，skill 只留查不到的约定和坑（例：issue-session 开头「下文 issues 指 …」那句删掉）。会被新 hook 拦的手写操作（手改 status label、`git worktree remove`）改成命令。skill 里显式调的 lint 删掉（由 hook 跑）；显式调的格式检查改成交回命令（`pr candidates submit`、`dreaming table submit`）。

去掉 pr-reviewer agent：pr-review 主会话自己跑一轮（机械检查 → `dyna agent codex run` 并行起 Spec、Standards 两个进程 → 等 UI 走查的发现 → 核实候选、`pr candidates submit` 校验 → 写汇报），pr-reviewer 定义里这一轮的做法挪进 pr-review 自己的 references，SKILL.md 主体只加指针、守在 5000 字内。

wiki-conventions、dreaming 里「由 #339 包装」的占位改成指向新命令；dreaming 里手写索引格式的那份参考删掉（索引由 `dyna home index` 生成）。

**字数**：implementer 主体 4999 字、dreaming 主体 4987 字，只做等长或更短的替换，不加新句子。其余手写的 git、gh、静态服务器不在这张（归 #340）。

## 验收标准

- [x] 这两类 skill 和对应 agent 里没有全路径脚本调用；扫描测试通过
- [x] pr-reviewer agent 已删，没有任何文件再引用它；pr-review 主体 ≤ 5000 字
- [x] implementer、dreaming 主体字数不超过改前（用 AGENTS.md 的量法）
- [x] 两处「由 #339 包装」的占位都指向存在的命令

## 选中的存量回归

- 两类 skill 的 `*-doc.test.mjs`（issues-skill-doc、implementer-slim-doc、pr-review-slim-doc、dreaming-*-doc、wiki-conventions-skill-doc 等）：断言 skill 文字，换写法可能碰到，要么照新写法改断言并写理由
- `no-project-leak.test.mjs`：改写后的文字不带项目信息

> 补充（工单 08 交回，2026-11-19）：`dyna ui measure` 不再用目标项目里的 playwright，改用本机的 Chrome / Chromium（找不到再找 Playwright 缓存里的 chromium，或用 `IDEA_LOOP_CHROME` 指定）。改 ui-measure skill 和 implement 里 UI 工单的参考时，把「项目里要装 playwright」换成「机器上要有 Chrome 或 Chromium」。

> 补充（工单 12 交回，2026-11-19）：setup 的 replay-runner 参考里「Codex 查找脚本也随 runner 装进去」已不对（runner 改调 dyna），改它时同步改 replay-exercised-doc 测试最后一条断言；pr-review、setup 的预检表、pr-reviewer 里写的 codex-companion、codex-prompt 改成 `dyna agent codex run` / `dyna agent codex prompt`。
- [ ] review 第 1 轮 C1（2026-11-19）：给 agent 的说明里，指代 dyna 命令时不叫「脚本」，改叫「命令」或直接写 dyna（术语表 dyna 词条「不要用」：脚本）；只换词，不加句子；claude-desktop 的运行环境数据注入接近一万字上限，不变长
