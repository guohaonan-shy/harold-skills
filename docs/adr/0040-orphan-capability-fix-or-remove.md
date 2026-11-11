---
type: adr
status: 生效
tags: [idea-loop, issue-session, draft-spec]
summary: 起草修坏能力的 spec 时先查调用方；一个都查不到，把「修好还是删掉」写成待定
related: ["[[148]]"]
---

# ADR-0040 — 坏掉的能力没有调用方时，spec 把「修好还是删掉」摆成待定

> 由 spec `orphan-capability-fix-or-remove` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

一个真实的路径：Toeflair 的报告历史接口按分数排序测试不稳定，issue 会话起草的 spec 复现了排序没生效，正文也写了「学生端没有入口触发」，却仍按修好起草并合进主分支；人在切票时追问「分数排序是哪个部分使用，我在前端都没有看到」，会话才去查，学生端、营销站、端到端测试、MCP 都没有调用。人定删掉相应参数，spec 重写一次，多出一份 spec 和一次 spec PR。

起草 spec 的「自己校验」只要求查「同一行为的其他入口」，没有任何一句要求查这个能力有没有人在用，所以坏能力默认就被当成要修的。

## 2 决策（how）

- **落点在 issue-session 的「起草 spec」参考的「自己校验」第 7 条（现状和范围查清了），后面加一句**，不新开条目。杠杆是可执行的检查项：清单每项不过就回去改，每次起草都一定会被核一遍，叙述性的提醒没有这个力道。
- **规则内容**：修坏能力的 spec，查过调用方（界面入口、前端请求、别的服务、脚本或定时任务），查到的写进「方案」，照常按修起草；一个都查不到，「实现决策」里写一条「待定：修好还是删掉」，两个选项各配例子和代价、给推荐，交给人定。
- **查不到就一律写待定，不由 agent 自己判「删」**：删掉是对外行为的改动，归人。待定的写法沿用 `decision-rules` 的「要人定的写成一道题」，不复述。
- **只改这一处**：`to-spec` 本身排除（它也服务不从 issue 来的需求，人直接用时人在场）；分拣员排除（它判 issue 真不真、去哪，不起草方案）。
- **验收走 retro 回放**：用例的提交在 Toeflair 仓库，夜间队列取不到，只能用 `--case` 加 `--repo` 当场跑，记为已知限制，不给 runner 加「用例自带仓库」字段。

## 3 结果（result）

- `idea-loop/skills/engineering/issue-session/references/draft-spec.md` 的「自己校验」第 7 条已含调用方检查与「待定：修好还是删掉」。
- 回放用例 `idea-loop/evals/retro/cases/draft-spec-orphan-capability/`（`case.json` 加 `annotations.md`）。
- 合并为 PR #274，issue #148 已关闭。

## 取代线索

无。起草规则原先在 `issue-verify`，该 skill 已被 issue 分拣的决定删掉，见 `ADR-0023`。
