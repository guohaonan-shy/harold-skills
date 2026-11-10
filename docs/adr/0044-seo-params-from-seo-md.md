---
type: adr
status: 生效
tags: [seo, seo-params-from-seo-md]
summary: seo 要用的项目信息经「推测、人确认、写入」，扫描缺了先停下等人，skill 不再自己推着用
related: ["[[2026-10-31-seo-params-confirm-gate]]", "[[2026-10-27-brand-terms-cannibalization]]"]
---

# ADR-0044 — seo 的项目信息：推测、人确认、写入，skill 只读写着的

> 由 spec `seo-params-from-seo-md` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

ADR-0043 里品牌词定下「由人写进 `SEO.md`、没写不自己推」，但这条做法只落在品牌词一个参数上，没有通用约定；下一个给 seo 加参数的人读格式定义看不到它。

更实际的问题在定时扫描：`seo-scan` 每周由定时任务触发，规则是「缺数据记下来、接着走」。它派出的方向 agent 调四个方法 skill（`seo-audit`、`competitor-analysis`、`keyword-research`、`link-prospecting`），这些 skill 在无人值守时会自己推断缺的值直接用：业务概述、当前目标从站点推，竞品用 `find_serp_competitors` 推，定位也推。例如「竞品」节为空时，backlinks 方向会推出一个竞品、拿它的外链档案挖候选并提成 issue；人没确认过，下周还可能推出别的。

## 2 决策（how）

起草时的推荐（选项 A）是只管品牌词这类判定参数，研究输入缺了照旧推断。人给了第三条路：凡是 skill 要用的项目信息，都经「推测 → 人确认或补充 → 写进存放处 → skill 只读写着的」。两个关卡：

- `seo-setup` 初始化：用已有工具和内容推测推荐值，提问确认后写入（现状已如此，只补说明）。
- `seo-scan` 开场：派方向 agent 之前检查这次要跑的方向要用的信息齐不齐；缺了就推测、发通知、**停下**等人，不先跑后补（人明确选了「停下等我」）。

其余取舍：

- **约定写在 `SEO.md` 的格式定义里**，附一张「每个方向要用的信息」表，缺口检查照表查。
- **存放处沿用现状**：竞品、品牌词在 `SEO.md`；业务概述、当前目标、定位在 OpenSEO 项目上下文。把后三者挪进 `SEO.md` 是两套存储重排，不做。
- **缺口检查由脚本做**，跟挑方向、算预算一样不靠 agent 读规则判断；读不到项目上下文时只查 `SEO.md` 的项，OpenSEO 不通不卡扫描。
- **人说「不需要」写成「无」**，写在这一项自己的存放处（`SEO.md` 的键或节，或项目上下文对应一节）。缺口检查把「无」当作问过，不再每周重问；读它的 skill 当作没有这项信息。该条由 review 第 1 轮补充，来自人的原话（提问时明确不需要的，要在对应章节写明）。品牌词写「无」，蚕食判定照旧不排除。
- **四个方法 skill 的无人值守分支不再推断**：缺了就在 `assumptions` 写明缺什么、哪部分因此没做，其余照做。人在场的分支原本就是推测、问人、写入，不动。
- **不做**：插件写死的判定阈值（对所有项目一样，不算项目信息）；停下后人不回复的二次提醒（先只发一条通知）。

## 3 结果（result）

- `skills/seo/seo-setup/references/seo-md.md` 有「项目信息从哪来」一节和「每个方向要用的信息」表，并写明给 seo 加新参数的步骤。
- `scripts/seo-md.mjs` 把「无」读成空值并标 `confirmed`；`scripts/seo-gaps.mjs` 是缺口检查，表以代码形式在它的 `NEEDS` 里。测试：`seo-scripts.test.mjs`、`seo-gaps.test.mjs`。
- `skills/seo/seo-scan/SKILL.md` 有「缺口关卡」：有缺口时推测（竞品花预算内的 credits）、用推送提醒、停下，交回「停下等确认」形状；人回复后写 `SEO.md` 或 `update_project_context`，重取上下文再重跑检查。`allowed-tools` 含 `seo-gaps.mjs`、`find_serp_competitors`、`update_project_context`、`PushNotification`。
- 四个方法 skill 的「项目上下文」第 3 步有「无人值守：缺了不推断」。
- 文档测试 `scripts/seo-params-doc.test.mjs`、`seo-method-skills-no-inference-doc.test.mjs` 钉住这些句子。
- 合并在 PR #207（实现）和 #204（spec），issue #142 已 COMPLETED 关闭。

承接 ADR-0043：品牌词是这条约定的第一个实例。
