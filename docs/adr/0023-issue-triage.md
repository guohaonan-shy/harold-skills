---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, issue-triage]
summary: backlog 每周由子代理逐个核实、人批一张表定去向；开 issue 必经校验；优先级决定派发顺序；issue-verify 删除
related: ["[[2026-11-05-issue-triage-grill]]", "[[2026-11-05-issue-model-regrill]]"]
---

# ADR-0023 — issue-triage：backlog 每周分拣，人批一张表；开 issue 校验正文；按优先级派发

> 由 spec `issue-triage` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#243。issue 状态表里写着 backlog→triage/todo“分拣后人定”，却没有任何 skill 或定时任务去分拣：2026-11-06 harold-skills 开着 53 个 issue，42 个是 backlog，没人碰。复现和打分类藏在 triage 会话开头的 `issue-verify` 里，人挑进 triage 时还不知道它是不是真问题、重复、或早做掉了。另三处：开 issue 的正文格式只是文字约定（`seo-issues.mjs` 缺两节、`to-spec` 的 `issues open` 不经人就开成 todo）；调度按号码先进先出，线上坏了的和文案小改谁号小谁先；`issues set done` 先去 label 再关 issue，关失败（gh 连接断开）就留下“开着、没 label”的半翻状态。

## 2 决策（how）

- **每周分拣**：新 skill `idea-loop:issue-triage` 由定时任务每周起，取最早的 15 个 backlog issue，每个交给一个新子代理 `idea-loop:issue-triager`（同时最多 5 个）；依次查重、对“不做”清单、查是否已实现、复现、打分类，在 issue 上贴一条“🤖 idea-loop：”前缀的证据评论，交回一行 JSON。分拣会话拼成一张表，人逐行批，会话照批的翻状态。`全部` 参数用于把存量每 15 个一批跑完。
- **建议去向四种**：todo（问题清楚、不要人评估）、triage（要人 grill 或设计，或新能力）、canceled（重复/在“不做”清单/已实现/复现不出）、留在 backlog（判不了，评论分“已查清/还要你补”两栏，人没补就不再问）。项目跳过 triage 的没有第二种。分拣不判 P0，像 P0 的建议 P1 并标“疑似 P0”。
- **开 issue 只有一个入口**：`issues new` 先校验四个必填节、再按标题查重、再开；默认开成 backlog，人在会话里明说“做”的才开 todo 且必带优先级；疑似 P0 的开成 backlog 后当场起 `issue-triager` 复现，复现到了翻 todo、打 P0、推送通知人。`issues open` 删除；人明说不做的不开，直接写“不做”清单。
- **“不做”清单**：`docs/records/out-of-scope/<slug>.md`，一个概念一份，放在已有的 `records/` 下，不另开顶层目录。
- **优先级**：`priority:P0|P1|P2` 三个 label（一个 issue 最多一个），对 Linear 的 Urgent/High/Medium；调度按 P0→P1→P2→没有，同级里最早的先派。
- **`issue-verify` 删除**：复现手段表移进 `issue-triager` 定义；起草 spec 的规则（功能级写“需要 grill”、自检）移进 `issue-session` 的 `references/draft-spec.md`。
- **`move` 先关后改 label**：→done/canceled 先 `gh issue close`（带评论），成功才去 label；→done 的评论总写明合并了哪些 PR。
- **agent 定义**：`issue-triager` 钉 sonnet、medium；只读代码、不翻状态。
- 没选的：旧 spec 的“三种去向”（九个状态时没有 triage）；人明说不做的开成 canceled（一个开了就关的 issue 只有“不做”清单用得上）。

## 3 结果（result）

- skill：`idea-loop:issue-triage`（含 `P0 <号>` 当场复现分支）；agent：`idea-loop:issue-triager`；`setup` 的 `references/weekly-triage.md` 负责装每周任务（id `triage-<仓库名>`）。
- 脚本：`idea-loop/scripts/issues.mjs` 的 `new`、`body`、`priority`、`backlog`、`note`、`candidates` 的优先级排序，`move` 先关后改；`seo-issues.mjs` 的正文已补齐四节。
- `issue-verify` 与 `issues open` 在插件里已无引用（`idea-loop/scripts/issue-group-skills.test.mjs` 守着）。
- 尚未出现：`docs/records/out-of-scope/` 目录要等第一次拒掉需求时才会建。

## 取代线索

- 在 ADR-0022 的七个状态与正文格式之上建；无冲突。
- 后续被改动的几处：“triage 会话由人开”被 ADR-0025 改为调度也出卡片；候选顺序后来又加了指派人维度与“在状态里停留时间”（ADR-0026，#264）；每周任务“在桌面 app 里建”被 ADR-0026 的“定时任务”能力替代（magi 里 prompt 写成“用 Skill 工具调”）。
