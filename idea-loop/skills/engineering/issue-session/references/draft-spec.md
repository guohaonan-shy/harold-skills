# 起草 spec

会话已认领时，用 Skill 工具调 `idea-loop:to-spec` 起草，再照这份做。一个 issue 一份 spec，frontmatter 的 `issues` 写这个号。交付：一份提交到 home 的 spec（过了「自己校验」、「待定」和「需要 grill」都处理完），或 issue 被关掉、翻回 triage、先放着。`<docs>` 指 `<项目目录>/docs/`（项目目录：`idea-loop:wiki-conventions` 的「项目目录」）。

## 输入

- issue 全文和评论：认领时读到的那份（`dyna issues read <docs> <号>`）。
- 分拣的证据评论（idea-loop 写的，认法照 `idea-loop:issues` 的「评论」）：复现、分类、结论都在里面，当证据用，在 spec 里引它的出处（评论链接、日期）。没有这条评论的（人直接开成 todo 的），自己先复现：手段表在 `${CLAUDE_PLUGIN_ROOT}/agents/issue-triager.md`「五步」的第 4 步「复现」，输出留在 `.tmp/to-spec/<spec-slug>/repro/`，只读回判断要用的一两行。
- issue 写的现状也要核一遍，再写进 spec：照 `idea-loop:decision-rules` 的「证据是什么」。
- issue 带 `type:seo/<方向>` 的：先用 Skill 工具调这个方向的 agent 调的那个 SEO skill（方向与 agent 的对应在 `idea-loop:seo-scan` 的 SKILL.md 的「派方向 agent」表，agent 调哪个 skill 写在 `${CLAUDE_PLUGIN_ROOT}/agents/` 下它自己的定义里），只读它写修法建议前要读的原则（由那个 skill 指过去，不直接翻它的 `references/`），不跑它的检查步骤。选项和推荐讲到某种做法有没有用时，引那里的结论和出处，不写「说法不一」这类没核过的话；原则文件没覆盖的才自己查一手来源，查不到的标成猜测。
- 起草要跑 OpenSEO 的付费调用（SEO 研究）的：先看「起草与验证」那一份本周还剩多少。`get_project_context` 存成 `.tmp/to-spec/<spec-slug>/context.json`，`whoami` 读余额，跑 `dyna seo allocate <项目目录>/SEO.md <余额> --context <那份 context.json> --today <YYYY-MM-DD>`（不带方向，只出本周的账），读输出里 `week.shares` 的「起草与验证」的 `left`（也不超过 `week.floorRoom`）。这次研究预估要花的 credits 超过它就不跑：用『推送』告诉人是哪项研究、预估多少、本周还剩多少，spec 里写明这项研究没做。跑了的，用 `update_project_context` 的 `appendResearchLog` 记一笔，第一行 `起草 <YYYY-MM-DD>：issue #<号>`，第二行 `花费：<n | 未知> credits，余额 <n | 未知>，份：起草与验证`（「花费」行同 `idea-loop:seo-scan` 的研究日志，`dyna seo allocate` 靠它加总）。
- issue 带 `type:seo/*` 的，再读项目目录的 `SEO.md` 的「内容原则」（`dyna seo parse <项目目录>/SEO.md` 输出里的 `principles`，每条带出处），与上一条先读的方向原则并列：选项、推荐和「需要 grill」的答案都以两者为据。没有 `SEO.md`，或这一节是空的，就当没有这类原则。

## 结论行

标题下一行：`> #<号> 存在：…`，格式见 `idea-loop:to-spec` 的模板。证据评论推翻了 issue 原来的说法，「根因」里写「修正：issue 原先认为 X，实测是 Y」。

起草时发现 issue 已经被做掉了：`dyna issues set <docs> canceled <号> --comment=<出处、核对的日期和提交>`，删掉这份 spec 的草稿，不提交，回会话的「收尾」。

## 功能级的标「需要 grill」

标题下第一行写「> 需要 grill：<为什么>」。功能级是修完多了一个原来没有的能力，或者 issue 里写着还没定的设计问题。

## 自己校验

提交之前逐项核对，哪项不过回去改，改完再核：

1. **结构**：`dyna spec check <docs>` 没有报这份 spec 的问题（旧平铺布局、遗留的 `status` 行）。
2. **有着落**：issue 在 spec frontmatter 的 `issues` 里，标题下有它的一行结论。
3. **复现过**：「问题陈述」里写了复现到的现象，来自证据评论或本次复现；只有 issue 原文的不算。
4. **正文里没有机器的原始输出**：断言报错、堆栈、`[repro]` 日志、SQL 原文都改写成人话。
5. **每条都有期望行为**：只修问题的 spec，「User Stories」里每个问题一行「期望行为」，编号跟「问题陈述」的小节对得上。
6. **选项都是真分歧**：每条「待定」写明了依据为什么冲突或没有；选项的写法照 `idea-loop:decision-rules` 的「要人定的写成一道题」。
7. **现状和范围查清了**：同一行为的其他入口，每个都在「方案」里标了纳入还是排除；「关联」列了相邻还没完成的 spec 与 issue，没有写「无」。spec 是修一个坏掉的能力的，还查过它有没有调用方（界面入口、前端请求、别的服务、脚本或定时任务），查到的写进「方案」；一个都查不到，「实现决策」里有一条「待定：修好还是删掉」，两个选项各配例子和代价，不默认按修起草。
8. **改动只在该在的地方**：要提交到 home 的只有这份 spec 的目录和 `<docs>/spec/index.md`（`raw` 里这次写的文件另算）；SEO 的 brief 出了配图的，图放在这份 spec 目录的 `assets/` 里（`<docs>/spec/<slug>/assets/`），随 spec 一起提交。

## 跟人定要 grill 的

issue 带 `type:seo/*`、spec 没有「前端交互」小节的：不推送、不停下，自己定完就提交；人在场接手时也照这条，人可以推翻；唯一的例外是 `idea-loop:seo-writing` 的 brief 分支的角度和封面主体，人在场时它们合成一问。

- 「待定」：逐条照推荐改写成决定，依据写「AI 照推荐定：<推荐的理由>」，删掉「待定」两个字；牵出的图、User Stories 和测试决策一起改。
- 「需要 grill」：照 spec 已有的结论和 `SEO.md`「内容原则」自己答完，删掉这一行。

有「前端交互」小节的（要 UI 设计）不走这条：todo 会话照「起草中冒出了要人定的」那句 `dyna issues set <docs> triage <号> --comment=<要人定什么、spec 在 home 的提交号>` 翻回 triage，triage 会话照下面的流程跟人定。

其余的 issue，spec 里还有「需要 grill」或「待定」：用『推送』能力发一句话说要人定什么，然后停下等人。人开口后逐条处理：

- 「需要 grill」：用 Skill 工具调 `idea-loop:grill`，按结果改 spec，删掉这一行。
- 「待定」：人定了，把小节改写成定下的决定，写上依据（人的原话），删掉「待定」两个字；牵出的图、User Stories 和测试决策一起改。
- 人决定不做：`dyna issues set <docs> canceled <号> --comment=<人的原话>`，再记进「不做」清单 `<docs>/records/out-of-scope/<slug>.md`（目录没有就建）：`type: record`，一个概念一份文件，写是什么、为什么不做（人的原话）、相关 issue 号；同一个概念已有记录，往里追加号码。记录写好就 `commit` 到 home，不经分支和 PR（`idea-loop:wiki-conventions` 的「知识库落地」）。然后删掉这份 spec 的目录，不提交，回会话的「收尾」。
- 人说先放着：回会话的「先放着」。
- 都定完了：提交。

## 提交

照 `idea-loop:wiki-conventions` 的「知识库落地」：`commit` 这份 spec 的目录和 `<docs>/spec/index.md`（`dyna spec index <docs>` 刷新它），消息 `docs(spec): 起草 <slug>`。不切分支、不进代码 PR：设计和实现接着做，代码 PR 里只有代码。SEO 的 brief 出了配图的，图在 `<docs>/spec/<slug>/assets/` 里，随 spec 一起提交到 home，triage 会话不为它开 `issue/<号>-<slug>` 分支；todo 会话实现写文章时，把图拷进站点的图片目录（`SEO.md`「配图」节写的、`dyna seo scope --image-dir` 校验的那个），跟文章一起进代码 PR。
