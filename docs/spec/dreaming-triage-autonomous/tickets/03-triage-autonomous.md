# 03 — 每周分拣按建议直接翻状态

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

改 idea-loop 里每周分拣（`issue-triage`）这条流程的文字，让下一次每周分拣跑完，backlog 里被查过的 issue 都已翻好状态，没有等人批的表：

- 分拣子代理交回的建议去向直接执行，不拼表、不停下：todo / triage 带优先级照翻；canceled 带理由照翻；留在 backlog 的什么都不做。
- 不替人拒需求：canceled 只来自重复、命中「不做」清单（`docs/records/out-of-scope/`）、已实现、复现不出四种；拿不准值不值得做的翻 triage 交给人评估，不 canceled。
- 疑似 P0：照子代理的建议去向翻，优先级 P1，并在推送里点名，P0 由人改。
- 推送只在两种情况：有留在 backlog 的 issue（子代理评论里写了「还要你补」），或有疑似 P0；点名这几个号。都没有不推送。
- `全部` 模式一批接一批跑完，不再「批完一张才跑下一批」。
- 原来「人拒掉一个需求就写进 `out-of-scope` 记录」那一步没有触发点了：挪到 issue 会话起草 spec 时「人决定不做」那一条（issue-session 的起草 spec reference），在那里写记录，走只改 `docs/` 的 PR、检查全过就合并。
- 完成条件改成：这一批每一行都按建议去向处理了。

要改到的地方：`issue-triage` 的开头一句、调用表里 `全部` 一行、分拣第 4–7 步、完成条件；issue-session 的起草 spec reference 的「人决定不做」；`issues` skill 状态表里「backlog → triage / todo / canceled：分拣后人定」那一行（只改字不加行：这份 skill 主体已近 5000 字）；setup 的「每周分拣」一段和每周分拣那份 reference 里「摆一张表等人批」「分拣表在那个会话里等人逐行批」「批完一张再跑下一张」。改这些给 agent 读的文档前用 Skill 工具调 `idea-loop:writing-for-agents`。

不改：`issue-triager` 子代理定义（它的建议规则已经满足上面的边界）；仓库根 `AGENTS.md` 与插件 README（归 02）。

## 验收标准

- [ ] `issue-triage` 里没有「等人批」「人逐行」的步骤；四种去向各自怎么执行写明
- [ ] 「拿不准值不值得做的翻 triage，不 canceled」写在 `issue-triage` 里
- [ ] 推送的两种情况、疑似 P0 的处理写明
- [ ] `out-of-scope` 记录的写法在 issue-session 的「人决定不做」里，`issue-triage` 里不再有
- [ ] `issues` 与 `issue-triage` 两份 skill 主体都 < 5000 字（`awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`）
- [ ] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：改了插件文字
- `idea-loop/scripts/issues.test.mjs`（如有）：`issues` skill 的状态表被脚本的前提检查引用，改字不能改出与脚本不一致的说法
