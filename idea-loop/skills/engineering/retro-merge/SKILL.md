---
name: retro-merge
description: 一次 retro 整合的会话：把 retro 开出的至多 5 个 issue 做成一份 spec 和一个 PR。调度的整合卡片开出的会话、或人要接手一次 retro 整合时用。
argument-hint: "<issue 号> <issue 号> …"
---

你是 retro 整合 #`$ARGUMENTS` 的会话。这几个 issue 是同一个 plugin 里由 `idea-loop:retro` 开出、人在 retro 里已经批过的规则候选；你把它们合成**一份 spec、一个 PR**，一路做到 review 和回放，**中途不等人**，最后停下，让人第二天一次看完。每条候选的内容人已经批过一遍，所以这里不 grill，也不经设计段。

下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指当前 worktree 的 `docs/`，`<主分支>` 取目标仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

**确认清单**：全程自己按推荐定下的事，逐条记进 `.tmp/retro-merge/<spec-slug>/confirm.md`（建好 spec 之前先放 `.tmp/retro-merge/pending.md`），每条一句：定了什么、推荐的依据（`idea-loop:decision-rules`）。

## 开场

1. **自己的 worktree**：从主分支开出、不跟别的会话共用；不是就停下告诉人。
2. **归位**：调 `detach_session`（`self`）；报错说你不是被别的会话开出来的，就跳过。用 `list_sections` 找到「实现中」（没有就 `create_section`），`move_sessions`（`self`）移进去。标题不是「<仓库名> retro 整合 #<号> #<号> …」的，用 `set_session_title` 改成这样：调度靠它认整合会话。
3. **认领**：每个号 `gh issue view <号> --comments` 读全文。待验证的，一次 `issues set <docs> 验证中 <号> <号> …` 翻过去；已经是别的状态的，别的会话在做它，从这批里去掉并告诉人。一个都不剩，照 `idea-loop:issue-session` 的「收尾」归档自己。

完成条件：会话在「实现中」，留下的 issue 都是「验证中」。

## 起草

用 Skill 工具调 `idea-loop:to-spec`，`issues` 列全留下的号，不访谈、不 grill。

- 「验证」表每个 issue 核一遍它的「旧文」在不在主分支：在，「存在」；已经不在、意思已经有了，「不存在」，证据照 `idea-loop:issue-verify` 的「不存在」写三样（试了什么、对着哪个基准什么时候核的、用什么手段）。
- 一个 issue 一条规则；落到同一个 skill 同一段的几条，在 spec 里写成一条，照 `idea-loop:writing-for-agents` 的写法并进现有内容，不往后 append。
- 出现「待定」，按推荐定下，写成「按推荐先定，待人确认」，记进确认清单。

spec 的 PR 只改 `docs/`，检查全过就合并（`idea-loop:decision-rules` 的「不自动的」允许），做法照 `idea-loop:issue-verify` 的「合进主分支」。覆盖的 issue 在「验证」表里全是「不存在」的，spec 翻「完成」、issue 随之关掉，直接去「停下给人看」，改动点写「无」。

合并之后换阶段：`git fetch origin`，`git switch -c impl/<spec-slug> origin/<主分支>`，`issues advance <docs> <spec-slug>`（issue 翻到「实现中」）。

## 切工单、实现

用 Skill 工具调 `idea-loop:to-ticket`，再调 `idea-loop:implement`。落到同一个 skill 同一段的几条合成一张工单；每张工单的验收标准末尾加一格「证明生效」，写明用哪种证明和材料从哪来（下一节）。改完的 SKILL.md 主体仍要 < 5000 字，超了在 PR 描述里标出是哪个文件、多出多少。

implement 里原本要停下等人的地方，都按推荐先做：

- 有工单要人决定：把推荐写进工单的 `要建什么` 末尾，原话写成「按推荐先定，待人确认（<日期>）：<推荐>」，不冒充人的决定，然后照 implement 的「人回复后」里「决定」那条重派；记进确认清单。
- 开 PR 后的停下汇报：不等回复，往下走。

## 证明生效

每条规则照 `idea-loop:implementer` 的「改规则的工单」证明：能机械判定的做成检查，要判断的写回放用例，小的当场跑，大的进夜间队列。回放用例的材料（当时的提交、触发 skill 的那句话、停在哪）从 issue 正文、`docs/raw/decisions/<号>.md`、来源 PR 里拼；拼不出来的那条，在 PR 描述里标「无法回放：#<号>，缺<什么>」，不硬编用例。

## review

implement 开出 PR 并转成 open 后，用 Skill 工具调 `idea-loop:pr-review`，Spec 轴对照这份 spec（它的内容来自这批 issue 的候选和新文）。夜间队列里还有回放时，PR 留在 draft，先去「停下给人看」；结果由会话间消息送回，收到后照 `idea-loop:issue-session` 的「规则回放的结果」续上 review，再补摆一次「停下给人看」里 review 和回放的部分。

## 全程不停下

下面这些原本都会停下等人，现在都按推荐先做、记进确认清单，不停：spec 的「待定」、implement 里要人决定的工单、review 汇报里的「要你决定」（把推荐当批示处理，批示原文写「按推荐先定，待人确认」）。会改变用户看到什么、而 spec 和产品里都没有现成做法的事，仍然按推荐先定，由人第二天推翻。

不做的只有两样：合并代码 PR（只由人决定），和改 spec 之外的 issue。

## 停下给人看

所有能做的做完后，用 PushNotification 发一句话，然后在会话里依次摆（写法照 `idea-loop:pr` 的「停下汇报」）：

1. **要你确认**：确认清单，每条一句：做了什么、推荐的依据。没有就写「无」。
2. **改动点**：每个 issue 落到哪个文件哪一节；「不存在」的写证据出处；标了「无法回放」的单列。
3. **review 结果**：几轮、每轮留下什么。
4. **回放结果**：每个用例改前改后各答什么；在夜间队列里的写几点以后有结果。

然后等人。

## 人回复后

人的原话逐字记下，逐条处理：

- **不要的条目**：`issues drop <docs> <spec-slug> <号>`（关成 not planned，同时从 spec 里移出），撤掉对应的改动，提交进同一个 PR。
- **要讨论的条目**：`issues unhandoff <docs> <spec-slug> <号>`（移出 spec，回待验证），再 `gh issue edit <号> --remove-label retro`，撤掉对应的改动。它回到普通队列，走正常的验证和 grill。
- **推翻确认清单里的某条**：按人的意思改，其余照 `idea-loop:pr-review` 处理批示的做法。
- **合并**：人说合并，由 `idea-loop:pr-review` 合并。合并后照 `idea-loop:issue-session` 的「换阶段」「收尾」：`issues advance` 关掉其余 issue，调 `idea-loop:retro`，确认工作区干净，归档自己。

## 边界

- 只做这几个 issue。路上发现的别的问题，照 `idea-loop:spec-status` 的「开一个待验证的 issue」开出去，调度会接手。
- issue 的状态只走 `issues`；侧边栏只移动你自己。
