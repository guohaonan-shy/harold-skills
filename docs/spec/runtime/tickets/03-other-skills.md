# 03 — productivity、design、seo 的流程只写能力名：dreaming、grill、retro、uiux、seo

**Blocked by**：01 — 运行环境层落地
**设计冻结**：不涉及 UI

## 要建什么

productivity、design、seo 分类下的 skill 与 references 里，写死运行环境工具或界面的地方改成能力名，做法照 `idea-loop:runtime`。涉及：dreaming（审阅页、提议表、增量范围读上次成功运行时间、DESIGN.md 对账）、grill（提问方式的那句）、retro（导出会话记录）、uiux-imagine、uiux-research（向人提问）、seo-audit（交付报告）、seo-scan（审阅页、推送）、seo-setup（向人提问、每周定时任务）。各自的退路删掉，统一照 runtime。

桌面端行为不变：删掉的写法都必须已经在 01 的 claude-desktop reference 里。

## 验收标准

- [ ] 这三个分类的正文与 references 里不再出现运行环境专用写法（照 spec「tripwire 的名单」grep，frontmatter 的工具声明行除外）；交回里贴 grep 结果。
- [ ] 每处删掉的桌面端写法都能在 claude-desktop reference 里找到（交回里列对照）；缺的补进 reference。
- [ ] dreaming 的增量范围在 magi 里能照 runtime 读出上次成功运行时间（`magi cron show`），桌面端照旧读任务运行记录。
- [ ] 审阅页在 magi 里照 runtime 用 `magi artifact push` 发布、`magi.reply` 收回批示；桌面端照旧。
- [ ] 只能由人调用的 skill（seo-scan 等）在 magi 里建定时任务时走退路（不能用「用 Skill 工具调」起），步骤里写清。
- [ ] 改到的 SKILL.md 主体仍 < 5000 字；README 同步。
- [ ] `node --test '*/scripts/*.test.mjs'` 全绿。

## 选中的存量回归

- `proposal-table-check` 相关测试：dreaming 的提议表格式断言，改审阅页措辞可能牵动。
- `dreaming-skill-length`、`design-archive-skill-length` 一类长度测试：改写后字数可能越线。
- `no-project-leak.test.mjs`：改写例子时最容易带进真实项目名。
