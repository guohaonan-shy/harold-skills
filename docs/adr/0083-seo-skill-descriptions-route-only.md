---
type: adr
status: 生效
tags: [idea-loop, seo, skill-description, writing-for-agents]
summary: seo 分类 6 个 skill 的 description 删掉流程与产物，只留「是什么 + 触发词」
related: ["[[234]]"]
---

# ADR-0083 — seo 分类 6 个 skill 的 description 只做路由

> 由 spec `seo-skill-descriptions-route-only` 蒸馏而来，该 spec 已删除。决定过程见 [[234]]。

## 1 背景（why）

模型可调用的 skill，`description` 常驻在每一轮上下文里，仓库规则（`AGENTS.md`「SKILL.md 编写约定」第 1 条）只让它写「是什么 + 每个分支的触发词 + 必要时一句『X 用 Y』」，流程和产物不写。issue #234 的扫描（2026-11-16 对着 `main` 5f26e2f 读 `idea-loop/skills/seo/*/SKILL.md` 第 3 行）发现 6 个违反：

- `link-prospecting`、`keyword-research`、`keyword-clustering`、`seo-audit` 写着「人在场时出…；被方向 agent 调用时交回发现清单」（两种调用各交什么），`competitor-analysis` 同样且没有触发词；
- `seo-outreach` 写着「放进草稿箱」「填目录提交表单」（产物去向、做法），是 #291 加四个分支时（见 ADR-0080）写进去的。

这些信息各自正文的「目标」「两种调用」节已有，删掉 description 里的半句不丢信息。issue 标题里的 `issue-verify` 已在 #243 删掉，不在范围内。

## 2 决策（how）

- 只改 6 个 `SKILL.md` 的 frontmatter `description`，正文与调用方式不动；6 个都保持模型可调用，因为方向 agent 和 `seo-scan` 要按名字调它们。
- 改后每条是「是什么」加「…时用」触发词，加一句「X 用 Y」指向兄弟 skill；`seo-outreach` 保留全部四个分支的触发词（起草、发送、跟进、目录提交），`competitor-analysis` 补上单个竞品、市场格局两个分支的触发词。
- 用一个文档测试钉住：6 个 description 不含「人在场时」「发现清单」「草稿箱」「表单」「报告」「打标」，且含「时用」。
- 版本档：patch（人 2026-11-17 定，合并时按 0.1.24）。

没做（取舍）：seo 分类里其他 skill 的 description（`seo-scan`、`seo-setup` 等）issue 没点名，范围只到这 6 个；正文的「两种调用」节不动。

## 3 结果（result）

- 合并在 PR #353（seo 分类 6 个 skill 的 description 只做路由）；issue #234 已 CLOSED（2026-11-17）；决定记录 [[234]]。
- 对着 `main` c2b43c34 核过：`idea-loop/skills/seo/` 下 `seo-outreach`、`link-prospecting`、`competitor-analysis`、`keyword-research`、`keyword-clustering`、`seo-audit` 的 `SKILL.md` 第 3 行与决定的写法一致。
- 守护：`idea-loop/scripts/seo-skill-descriptions-route-only-doc.test.mjs`（6 条，本次对账全过）。
