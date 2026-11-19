# 16 — skill 迁移：engineering、productivity 两类与它们的 agent，去掉 pr-reviewer

**Blocked by**：14 — 发布 dyna 第一版并存登记表
**设计冻结**：不涉及 UI

## 要建什么

engineering、productivity 两类 skill 和它们用到的 agent（implementer、explorer、issue-triager、adr-reconciler、design-steward 等）里的全路径脚本调用改成 `dyna <模块> <命令>`；参数改靠 `--help` 查，skill 只留查不到的约定和坑（例：issue-session 开头「下文 issues 指 …」那句删掉）。会被新 hook 拦的手写操作（手改 status label、`git worktree remove`）改成命令。skill 里显式调的 lint 删掉（由 hook 跑）；显式调的格式检查改成交回命令（`pr candidates submit`、`dreaming table submit`）。

去掉 pr-reviewer agent：pr-review 主会话自己跑一轮（机械检查 → `dyna agent codex run` 并行起 Spec、Standards 两个进程 → 等 UI 走查的发现 → 核实候选、`pr candidates submit` 校验 → 写汇报），pr-reviewer 定义里这一轮的做法挪进 pr-review 自己的 references，SKILL.md 主体只加指针、守在 5000 字内。

wiki-conventions、dreaming 里「由 #339 包装」的占位改成指向新命令；dreaming 里手写索引格式的那份参考删掉（索引由 `dyna home index` 生成）。

**字数**：implementer 主体 4999 字、dreaming 主体 4987 字，只做等长或更短的替换，不加新句子。其余手写的 git、gh、静态服务器不在这张（归 #340）。

## 验收标准

- [ ] 这两类 skill 和对应 agent 里没有全路径脚本调用；扫描测试通过
- [ ] pr-reviewer agent 已删，没有任何文件再引用它；pr-review 主体 ≤ 5000 字
- [ ] implementer、dreaming 主体字数不超过改前（用 AGENTS.md 的量法）
- [ ] 两处「由 #339 包装」的占位都指向存在的命令

## 选中的存量回归

- 两类 skill 的 `*-doc.test.mjs`（issues-skill-doc、implementer-slim-doc、pr-review-slim-doc、dreaming-*-doc、wiki-conventions-skill-doc 等）：断言 skill 文字，换写法可能碰到，要么照新写法改断言并写理由
- `no-project-leak.test.mjs`：改写后的文字不带项目信息
