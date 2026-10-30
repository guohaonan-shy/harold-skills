# 01 — idea-loop README 目录树里 pr-reviewer 的模型与思考强度跟定义对齐

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
idea-loop 插件的 README 有一棵目录树，`agents/` 下每个 agent 一行，写着它跑的模型别名和思考强度（effort）。pr-reviewer 那一行现在写的是 `sonnet` 别名、effort xhigh，但 pr-reviewer 的 agent 定义（frontmatter）是 `model: opus`、`effort: high`，定义是 2026-10-21 有意改的，README 落下了。

改完后，读 README 的人在 pr-reviewer 那一行看到的是「`opus` alias, effort high」，跟定义一致。这一行别的文字（谁起它、每轮一个、跟 ui-reviewer 同时起、20 分钟预算）一字不动；README 别的行不动；agent 定义本身不动。

## 验收标准
- [x] README 目录树里 pr-reviewer 那一行写「`opus` alias, effort high」，原来的「`sonnet` alias, effort xhigh」不再出现在这一行
- [x] 这一行除模型别名和 effort 之外的文字与改前一字不差
- [x] 对 `agents/` 下全部定义逐个取 `model` / `effort`，跟 README 目录树里对应行比，全部一致
- [x] 这次提交里产品内容的改动只有 idea-loop 的 README 一个文件（勾好的工单随同提交不算）

## 选中的存量回归
无（仓库没有覆盖 README 的测试）
