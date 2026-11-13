# 起草 spec

会话已认领、在 issue 的分支上时，用 Skill 工具调 `idea-loop:to-spec` 起草，再照这份做。一个 issue 一份 spec，frontmatter 的 `issues` 写这个号。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`spec` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs"`，`<docs>` 指当前 worktree 的 `docs/`。

## 输入

- issue 全文和评论：`gh issue view <号> --comments`。
- 分拣的证据评论（「🤖 idea-loop：」开头）：复现、分类、结论都在里面，当证据用，在 spec 里引它的出处（评论链接、日期）。没有这条评论的（人直接开成 todo 的），自己先复现：手段表在 `${CLAUDE_PLUGIN_ROOT}/agents/issue-triager.md` 的「复现」，输出留在 `.tmp/to-spec/<spec-slug>/repro/`，只读回判断要用的一两行。
- issue 写的现状也要核一遍，再写进 spec：用 Skill 工具调 `idea-loop:evidence`，看它的「证据是什么」。
- issue 带 `type:seo/<方向>` 的：先用 Skill 工具调这个方向的 agent 调的那个 SEO skill（方向与 agent 的对应在 `idea-loop:seo-scan` 的 SKILL.md 的「派方向 agent」表，agent 调哪个 skill 写在 `${CLAUDE_PLUGIN_ROOT}/agents/` 下它自己的定义里），只读它写修法建议前要读的原则（由那个 skill 指过去，不直接翻它的 `references/`），不跑它的检查步骤。选项和推荐讲到某种做法有没有用时，引那里的结论和出处，不写「说法不一」这类没核过的话；原则文件没覆盖的才自己查一手来源，查不到的标成猜测。

## 结论行

标题下一行：`> #<号> 存在：…`，格式见 `idea-loop:to-spec` 的模板。证据评论推翻了 issue 原来的说法，「根因」里写「修正：issue 原先认为 X，实测是 Y」。

起草时发现 issue 已经被做掉了：`issues set <docs> canceled <号> --comment=<出处、核对的日期和提交>`，删掉这份 spec 的草稿，不提交，回会话的「收尾」。

## 功能级的标「需要 grill」

标题下第一行写「> 需要 grill：<为什么>」。功能级是修完多了一个原来没有的能力，或者 issue 里写着还没定的设计问题。

## 自己校验

提交之前逐项核对，哪项不过回去改，改完再核：

1. **结构**：`spec check <docs>` 没有报这份 spec 的问题（旧平铺布局、遗留的 `status` 行）。
2. **有着落**：issue 在 spec frontmatter 的 `issues` 里，标题下有它的一行结论。
3. **复现过**：「问题陈述」里写了复现到的现象，来自证据评论或本次复现；只有 issue 原文的不算。
4. **正文里没有机器的原始输出**：`grep -nE 'AssertionError|expected .* to |^\s+at |\[repro\]|^\s*(SELECT|FROM|WHERE) ' <spec>` 有输出就回去改写。
5. **每条都有期望行为**：只修问题的 spec，「User Stories」里每个问题一行「期望行为」，编号跟「问题陈述」的小节对得上。
6. **选项都是真分歧**：每条「待定」写明了依据为什么冲突或没有；选项的写法照 `idea-loop:decision-rules` 的「要人定的写成一道题」。
7. **现状和范围查清了**：同一行为的其他入口，每个都在「方案」里标了纳入还是排除；「关联」列了相邻还没完成的 spec 与 issue，没有写「无」。spec 是修一个坏掉的能力的，还查过它有没有调用方（界面入口、前端请求、别的服务、脚本或定时任务），查到的写进「方案」；一个都查不到，「实现决策」里有一条「待定：修好还是删掉」，两个选项各配例子和代价，不默认按修起草。
8. **改动只在该在的地方**：`git status --short` 里只有这份 spec 的目录和 `docs/spec/index.md`。

## 跟人定要 grill 的

spec 里还有「需要 grill」或「待定」：用『推送』能力发一句话说要人定什么，然后停下等人。人开口后逐条处理：

- 「需要 grill」：用 Skill 工具调 `idea-loop:grill`，按结果改 spec，删掉这一行。
- 「待定」：人定了，把小节改写成定下的决定，写上依据（人的原话），删掉「待定」两个字；牵出的图、User Stories 和测试决策一起改。
- 人决定不做：`issues set <docs> canceled <号> --comment=<人的原话>`，再记进「不做」清单 `docs/records/out-of-scope/<slug>.md`（目录没有就建）：`type: record`，一个概念一份文件，写是什么、为什么不做（人的原话）、相关 issue 号；同一个概念已有记录，往里追加号码。记录在另一个从 `<主分支>` 切出的分支上写，不混进这个 issue 的分支，走只改 `docs/` 的 PR，检查全过就合并（`idea-loop:wiki-conventions` 的「知识库落地」）。然后删掉这份 spec 的目录，不提交，回会话的「收尾」。
- 人说先放着：回会话的「先放着」。
- 都定完了：提交。

## 提交

照 `idea-loop:wiki-conventions` 的「知识库落地」：只 `git add` 这份 spec 的目录和 `docs/spec/index.md`（`spec index <docs>` 刷新它），提交（`docs(spec): 起草 <slug>`），留在这个分支上；设计和实现接着在这里做，最后跟代码一个 PR 合进主分支。
