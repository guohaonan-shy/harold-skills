# 17 — skill 迁移：design 类与它们的 agent，子代理自己生图

**Blocked by**：14 — 发布 dyna 第一版并存登记表
**设计冻结**：不涉及 UI

## 要建什么

design 类 skill 和 designer、uiux-imaginer、ui-reviewer、uiux-researcher、ui-master 等 agent 里的全路径脚本调用改成 `dyna …`；显式调的 lint 删掉；格式检查改成交回命令（`design note submit`、`research submit`、`design critic round`）；`codex exec` 改成 `dyna agent codex image`。uiux-imaginer 里「`codex exec` 在子代理里会被拦、请编排者代办」作废，改成自己调；uiux-imagine 里替它代办生图的那一条删掉。

## 验收标准

- [ ] design 类 skill 和对应 agent 里没有全路径脚本调用、没有手写 `codex exec`；扫描测试通过
- [ ] uiux-imagine、uiux-imaginer 里不再有代办生图的说法

## 选中的存量回归

- `design-archive-skill-doc.test.mjs`、`design-archive-sections-doc.test.mjs`、`design-modeling-slim-doc.test.mjs`、`design-change-final-version-doc.test.mjs`、`ui-reviewer-archive-doc.test.mjs`：断言这些 skill 的文字
