---
type: raw
source_type: conversation
captured: 2026-11-03
title: 讨论 —— #220 这一组做成 idea-loop 0.2.0：release 分支、5 个 feature、知识库按业务独立成仓库、cmux 全自动调度
tags: [issue-workflow, release, idea-loop-0-2-0]
related: ["[[issue-intake-priority]]", "[[idea-loop-0-2-0-release]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现，取证过程略去。末尾一张「本轮决议」表。
>
> 讨论在 harold-skills#220 的 issue 会话里进行，这一组：根 #220，子 issue #217 #222 #226 #227 #228 #232。开场时 spec issue-intake-priority（#220 #217）已在主分支、状态审核中；#222 那一支有一份没提交的草稿 setup-platform-env 和交接笔记（共享笔记目录，不在仓库里）；#232 刚认领。事实对着 origin/main 9a33407（idea-loop 0.1.9）与本机取。

## A0

开场摆了两道题：这一组的 spec 怎么分（一份分三部分 / 拆成三份），以及「重新讨论调度」要谈 spec 里的哪一条。

#232 核过存在：idea-loop 0.1.9 有 19 份 skill 与脚本把「spec / 设计先经只改 docs 的 PR 合进主分支」当阶段门；本仓库最近合并的 60 个 PR 里 40 个是 `docs(...)`。

## U1

我们可以将这个会话的发布定为下一个patch版本，然后将这些issue拆分成feature，合并到release分支。最后统一由该会话合并到main。

## A1

事实：idea-loop 当时 0.1.9；仓库没有 release 分支、没有 CI（`.github/workflows` 不存在）、main 没开分支保护；marketplace 装的是 main，release 分支合并前本机跑的插件不变；`issues advance` 读传进去的那份 `docs/`，不写死 main。

提了六题：这是通用流程还是这一组的做法；拆成 5 个 feature（F1 入口与调度 #220 #217、F2 一个会话一条线 #232、F3 Linear #226、F4 工作环境 #227、F5 知识库 #228；#222 是 #226–#228 的上一层）；分支名与版本号；spec 放哪；谁来做（全在本会话 / 本会话拍板、feature 各开会话）；调度要重谈哪条。

## U2

Q1 我觉的没问题的，这块有个更深的问题就是，这个信息需要放在哪里，一个新的deployment文件还是项目根的agents.md

Q2 F4和F1也算有关系，因为桌面端的loop调度只能创建人物卡片，但是任务卡片需要人点击，我倾向于P2优先级的问题可以不需要我点击就让claude开始自动化的处理，我理解是不是claude cli + cmux 就可以

Q3 按照patch吧

Q4 同意

Q5 B

Q6 你这几个点我都没太明白，我们一个一个grill吧～

## A2

事实：Desktop 定时 loop 那一轮调 `start_session` 被拒（2026-10-22 实测），只能出卡片；本机有 `claude` CLI 2.1.299；harold-skills 开着 46 个 issue，38 个没有 `status:*`（待验证）。

追问：「发布方式」写在 `DEVELOPMENT.md`「分支」节 / 新建 `DEPLOYMENT.md` / `AGENTS.md`；P2 自动做到开 PR 前还是一路到合并；先在本机试后台 `claude -p`，cmux 等人装好再试，P2 只在夜里跑；调度第一条「只出 P0 和焦点模块」的含义，并指出 harold-skills 的 issue 几乎都在 idea-loop 下，按插件分模块过滤不掉东西，推荐细到 `idea-loop/<子类>`。

## U3

linear主要是公司场景，不过我看linear得desktop是可以支持用loop直接驱动claude code cli的？我在想能否让我的虚拟机安装linear desktop，然后调度在mac上通过cmux命令行创建claude code terminal？https://linear.app/docs/assigning-issues#collapsible-914243845565

Q7 如果是这样的话，development.md文件就算是本地开发+线上部署了

Q8 我倾向于可以一路做到B，这是我的最终目的，不过我倾向于先做到PR前吧

Q9 cmux 我已经安装了，我倾向于按照项目状态，讨论中、设计中、实现中、审核中重新调整section/workspace group。seo我也倾向于不在单独开设队列

Q6.1 同意

## A3

Linear（读 assigning-issues、open-issues-with-custom-scripts、agents-in-linear）：desktop 的「Work on issue」只能人点或快捷键触发；能开的终端只列 macOS 的系统默认、Ghostty、Warp、iTerm，没提 cmux、没写 Linux；custom script 经 `~/.linear/coding-tools.json` 拿到 issue 号、分支名、prompt；会自动开工的只有装在 Linear 平台上的 agent，不是本地 CLI。

cmux（本机 0.64.22，CLI 在 `/Applications/cmux.app/Contents/Resources/bin/cmux`，不在 PATH）：`new-workspace` 有 `--name --cwd --command --group`；从 Desktop 会话调 `cmux ping` 被拒，只有在 cmux 里起的进程能连（也可配 socket 密码）；help 里没有建、改 workspace group 的命令。

追问：Linear desktop 只当手动入口、自动的由调度读 API 再经 cmux 开会话；公司场景调度跑在 Mac（`cmux ssh` 开虚拟机会话）还是虚拟机（经 relay 调本地 cmux，文档没写能不能）；四段阶段名的对应；调度第二条「对账时补挂根、补判 P0」的含义。

## U4

cmux 我记得是默认支持Ghostty的

Q10 这个问题比较复杂，我来拆分下。issue 的来源我希望除了github以外，可以按照项目纬度配置支持linear，linear我可以用桌面端，通过cmux调度。还有一个场景就是github的低优先级issue我会让cmux + claude cli 完全接管，这里面有个需求点就是，不同的workspace group下的workspace命令可能不一样，个人的基本上就是本地命令，公司的需要加上ssh。cmux 现在能做到这么复杂的吗？

Q11 我选择A

Q12 我倾向于打开PR并完成一轮review，然后我会在白天阅读pr 里面的内容

Q6.2 同意

## A4

cmux 用的是 Ghostty 的终端引擎、包里带一个 `ghostty`，但它是独立 app（`com.cmuxterm.app`）；本机没装 Ghostty.app，Linear 里选 Ghostty 大概率开不到 cmux（未实测），稳的接法是 custom script 调 `cmux new-workspace`。

cmux 的 `cmux.json` 能按目录给 workspace group 配颜色、图标、+ 按钮的右键菜单（手动新建时可按 group 给不同命令），但命令行建 workspace 时不按 group 套命令。结论：「个人本地、公司 ssh」由调度按每个项目的配置拼命令，cmux 只执行。

追问：issue 来源与会话在哪跑各放哪；调度搬进 cmux 后用不了 Desktop 的卡片，P0/P1 也自动开（停在讨论中通知人）还是 Desktop 另留一个调度；四段名字；调度第三条「汇报不加在等你的会话」在 P2 自动后要改。

## U5

Q13 同意

Q14 我倾向于A

Q15 同意

Q6.3 没问题

另外有个点就是cmux的cli是否支持打开markdown预览 或者yazi或者其他的md预览工具是否支持命令行调度，方便llm调度。本地好说，如果是远端虚拟机要怎么调度本地文件让cmux预览

## A5

cmux 有 `cmux markdown open <路径>`（排好版、文件变了自动刷新）；yazi 本机有，但它是要按键的终端文件管理器，不适合 LLM 调度。cmux 的 ssh 文档写了 relay 让虚拟机上的进程调本地 cmux 命令、浏览器面板走虚拟机网络、拖文件经 scp 上传，没写 `markdown open` 能不能读远端路径。

追问：远端文件怎么给人看（PR 是主路，cmux 预览是顺手看）；P2 每晚几个；Dreaming 的「P2 与想法」一节还要不要；几个仓库共用一份知识库的单位叫什么（推荐「业务」）；知识库是单独 git 仓库还是同步盘。

## U6

cmux也可以打开图片吗？

Q16 我理解虚拟机上的Claude进程会跟mac 上的cmux 进程有通信渠道吧？我觉的远端的内容，本地没办法通过cmux，我理解是否可以在本地开放一个挂载区域，挂到对应的知识库 + 临时文件区域，这样cmux在本地就可以直接预览文件、图片

Q17 每晚上先定5个吧，顺利的话再慢慢增加吞吐

Q18 dreaming这些先不要了，想法我直接自己开会话

Q19 业务这个词用得好

Q20 知识库分开吧，虚拟机上都是公司的，个人的全在个人电脑。你的理解是对的

## A6

`cmux open <路径>` 按类型开：md 进 markdown 预览，html 进浏览器面板，png / jpg / pdf 进文件预览 tab。本机没装 sshfs 与 macFUSE（`/Library/Filesystems` 只有 NetFSPlugins），macOS 26.5.1。「业务」写进 `GLOSSARY.md`（首建）。

追问：挂载用 sshfs + macFUSE / 虚拟机开 SMB / 单向同步；仓库级设置放知识库的 `repos/<仓库名>/` 还是留在代码仓库；多仓库需求每个仓库一个 PR；docs 留在代码仓库里的老做法留不留；一个 PR 里人拍板 spec 留在哪。

## U7

Q21到时候再说

Q22 我觉的合理，那这个选择是一定要在setup做好的

Q23 是

Q24 我倾向于升级plugin之后，顺手迁移了

Q25 是

## A7

追问：老做法是删掉还是两种都留；5 个 feature 的顺序（改的文件有重叠：F5 碰 59 份文件的路径，F1 与 F4 都碰 `issue-dispatch` 与 `issues.mjs`）；Desktop 这个环境还支持吗；Linear 什么时候连；5 份 spec 谁写。

## U8

Q24b 我希望A，之后我们就可以基于知识库上包装索引和图谱之类的搜索哈哈哈

Q26 没问题

Q27 我倾向于支持desktop，这个可以选择在setup让用户选择，关于desktop/cmux这些工作环境的内容可以单独抽成skill或者reference。

Q28 到时候在F3会话，我来进行连接。另外，如果你需要虚拟机，我会先临时用证书连接。（此处人转贴了一段同事关于公司虚拟机临时证书登录的说明，涉及公司内部环境，不收录。要点：虚拟机目前只认 12 小时证书，过期了回页面重领；新模板上线后可直接用公钥登录。）

Q29 同意

额外一句话，我觉的我们这个改动貌似巨大，要不升级为0.2.0？而不是一个小patch

## A8

同意升 0.2.0：知识库搬出代码仓库、阶段名改、老做法删，装了旧版的项目升级后都要重跑 setup 迁移。追问：工作环境写成一个 skill（`idea-loop:workspace`，正文写开会话、分组、通知、定时、给人看文件这几个动作，`references/desktop.md` / `references/cmux.md` 各写一种做法，同 `idea-loop:browser` 的组织方式）。

## U9

Q30同意

## U10

如果这样的话，plugin以后我是不是可以全局只需要安装一份了，各个项目只需要单独维护项目纬度的agent.md即可

## A10

插件已经只装一份：idea-loop 在用户级 `~/.claude/settings.json` 的 `enabledPlugins` 里打开，代码在 `~/.claude/plugins/cache/`，各项目共用。F5 之后各项目多出来的东西分三处：业务级在知识库根、仓库级在知识库 `repos/<仓库名>/`、「这个仓库属于哪个业务、会话在哪跑」在每台机器的 `~/.idea-loop/projects.json`；按 Q22，代码仓库里不留 idea-loop 文件。

## U11

我倾向于仓库的agent.md仍然维护，但是知识库可以一个指针指向对应的地方即可～

## A11

改 Q22：代码仓库的 AGENTS.md 照旧由人维护，加一个指针块写这个仓库属于哪个业务、知识库仓库在哪（不写本机路径）；会话靠它找知识库，`projects.json` 只留跟机器有关的项。已转给 F5 的会话。

## U12

（人在 F5 的会话里说，由 F5 会话转来）我觉得DEVELOPMENT.md、REVIEW.md、CODING_STANDARDS.md 这些仍然放在project 纬度吧，之后再考虑将一部分通用的内容拆分到业务这块。

## A12

再改 Q22：这三份照旧留在代码仓库根目录，知识库里不设 `repos/<仓库名>/`；以后再考虑把其中通用的部分拆到业务层。

## U13

现在有一个小变动，我现在在跟公司商量怎么付费，目前可能打算就用这个账号（超过200刀订阅的部分，我到时候用invoice走公司报销），这个等公司财务回复是否可行。如果可行，我理解桌面端以后负责公司项目 + 个人项目中的p0/p1，cmux 只负责个人项目的p2问题。公司项目环境是虚拟机，我个人环境目前是本地（以后可能是我的macmini）。

相关的内容可以先暂停等待决策，其他不依赖的内容可以先干。

## A13

待定（等公司财务回复）：可行的话，Desktop 管公司项目（虚拟机）和个人项目的 P0/P1，cmux 只管个人项目的 P2（本地，以后可能是 Mac mini）。受影响的是「调度在哪跑」「自动化」两条（U4 Q11、U5 Q14）和 Linear 的手动入口，即 F4、F3；F5、F1、F2 不依赖，照常做。

## U14

假设公司允许的话，那我一个账号就可以直接通过ssh访问远端，claude仍然在本地。我理解入口仍然是只限制在cmux，而且claude的会话也可以在云端上。不管同不同意与否，工作环境和入口仍然是cmux，调度入口仍然是linear调度cmux。

## A14

撤回 U13 的「Desktop 管公司与个人 P0/P1」：不管公司同不同意，工作环境和入口都是 cmux，调度入口是 Linear 调度 cmux。追问三处：Linear 调度是否只管公司项目、个人 GitHub 项目仍由自己的调度在 cmux 里开；「claude 仍然在本地」是指 claude 进程跑在哪；哪些会话放到云端。

## U15

Q31 你认为的对，只不过就是不同的业务（公司和个人）调度入口不一样吧了

Q32 我倾向于A

Q33 个人项目不管优先级先都在本地，公司项目不管优先级先都在远端

## A15

定了：cmux 里一个调度，按业务读不同的 issue 来源（公司读 Linear、个人读 GitHub），公司多一个 Linear「Work on issue」经 custom script 调 cmux 的手动入口；公司的 claude 跑在虚拟机上（`cmux ssh`，用这个账号登录），个人的跑在本地；先不上云端。F4、F3 的设计不再等付费决策，只有公司项目能不能真用等公司那边。

## U16

（人在 F5 会话里说，PR #233 review 第 1 轮 S1，由 F5 会话转来）如果一个业务有多个代码仓库，我觉得业务的根目录需要有一个业务包含的仓库/模块的说明文件吧。

## A16

F5 会话追问后人选定（F5 转述，非原话）：会话可以开在知识库里，几个仓库的业务推荐这样；此时主分支取知识库的默认分支，碰代码时读工单所在仓库的开发设置。仓库说明写成知识库根 `AGENTS.md` 的「## 仓库」一节，每个仓库写名字、GitHub 名、管哪块功能、跟别的仓库怎么依赖。

## U17

先用我自己的账号吧，也是超了我就打开credits 或者cmux调度也可以调度codex 终端。

## A17

定了：虚拟机上的 claude 也登录这个账号，公司和个人共用额度；超了就开 credits，或者由 cmux 里的调度改开 Codex 终端。F4 要加：两个业务各自的会话上限；Codex 作为额度不够时的另一种执行方（怎么跑 idea-loop 的流程待 F4 定）。

## U18

现在ultra 也没有5小时限流了。idea-loop支持codex我记得，里面有什么信息是强耦合claude的吗？

## A18

idea-loop 现在只在 review 时由 Claude 调 Codex（pr-reviewer 起两个只读 Codex 进程），不能让 Codex 当主角跑。强耦合 Claude Code 的：41 份 SKILL.md 靠 Skill 工具互调、15 个子代理定义钉了 Claude 模型、82 处 `${CLAUDE_PLUGIN_ROOT}`、4 个挂在 Claude 工具名上的 hook、AskUserQuestion / TaskCreate / SendMessage / Desktop 工具名、`disable-model-invocation` 与 `allowed-tools`、评估回放起 `claude -p`。问 Codex 兜底与分业务上限这一期做不做。

## U19

codex 本期先不做了

## U20

其实做也行，单开一个spec，然后cmux 也可以支持codex的terminal

## A20

问两题：Codex 做到哪一步（A 只接单张工单的实现 / B 跑完整个 issue 会话，等于把 A18 的耦合表全改一遍）；放不放进 0.2.0（作为 F6 排在 F4 之后 / 下一版）。推荐 A、F6。

## U21

Q35 我倾向于B

Q36 作为F6

## A21

定了：Codex 能跑完整个 issue 会话（审核到合并），cmux 调度可开 Codex 终端；作为 0.2.0 的 F6，排在 F4 之后。开了子 issue #237 挂在 #220 下，状态审核中、分类 idea-loop/engineering。

## 本轮决议

| 议题 | 决议 | 依据 |
|---|---|---|
| 发布 | 这一组做成 idea-loop 0.2.0：`release/idea-loop-0.2.0` 从 main 切出，feature PR 合进它，最后由这个会话合进 main，版本号只在这次合并里改 | U1、U8 |
| 通用流程 | 按版本发布的仓库：一个会话一个版本一条 release 分支；应用仓库：一个会话一个 PR（#232） | U2 Q1 |
| 发布方式写哪 | `DEVELOPMENT.md` 的「分支」节，它从此管本地开发与线上部署 | U3 Q7 |
| feature | F1 入口与调度（#220 #217）、F2 一个会话一条线（#232）、F3 Linear（#226）、F4 工作环境（#227）、F5 知识库（#228）；#222 是 F3–F5 的上一层 | U2 Q2 |
| 顺序 | F5 先；合进 release 后 F1、F2、F4 并行（F4 只改怎么开会话、怎么分组，F1 只改出哪些 issue）；F3 最后 | U8 Q26 |
| 谁做 | 本会话 grill、拍板、review、合进 release 与 main；每个 feature 一个会话 | U2 Q5 |
| spec | 每个 feature 的 spec 与实现在同一个 feature PR 里；spec 定稿单独提交一次、翻正式；PR draft 到「审核中」才 ready；issue-intake-priority 由 F1 改 | U2 Q4、U7 Q25、U9 |
| 阶段 | 讨论中 → 设计中 → 实现中 → 审核中（PR 开出且 review 过一轮）；`status:*`、Desktop section、cmux workspace group 同名 | U3 Q9、U5 Q15 |
| 调度：出哪些 | P0 在前、再出本期焦点的；harold-skills 的模块细到 `idea-loop/<子类>`（推翻 spec 里「模块就是 plugin」）；seo 不再单独排队 | U3 Q6.1、Q9 |
| 调度：对账 | 补挂根、补判 P0 | U4 Q6.2 |
| 调度：名额与汇报 | 审核中不占名额；汇报每天列「等你的」，按阶段、带等了多久 | U5 Q6.3 |
| 自动化 | cmux 环境下一个调度、全部自动开会话：P0/P1 到讨论中 `cmux notify`；P2 只在夜里跑，每晚 5 个，做到开 PR 并 review 一轮；最终目标是一路到合并 | U3 Q8、U4 Q12、U5 Q14、U6 Q17 |
| 账号与额度 | 虚拟机上也登录这个账号，公司与个人共用额度；超了开 credits；分业务会话上限 F4 开工时再定（Ultra 已无 5 小时限流） | U17、U18 |
| Codex | 0.2.0 的 F6（#237）：Codex 能跑完整个 issue 会话，cmux 调度可开 Codex 终端；排在 F4 之后（推翻 U19「本期不做」） | U20、U21 |
| 调度在哪跑 | Mac 的 cmux 里一个调度，按业务读不同来源（公司 Linear、个人 GitHub）；个人项目的会话全在本地，公司项目的会话全在虚拟机上（`cmux ssh`，claude 用这个账号在虚拟机上登录）；先不上云端 | U4 Q11、U14、U15 |
| 配置 | issue 来源（GitHub / Linear）写 `ISSUE_TRACKER.md`；会话在哪跑、cmux group、挂载路径对照写 `~/.idea-loop/projects.json`（只放跟机器有关的） | U5 Q13、U11 |
| Linear | 按项目选；Linear 不会自己触发，自动的部分由 cmux 里的调度读 Linear API；desktop 的「Work on issue」经 custom script 调 cmux，作手动入口；映射在 F3 会话里人连上 Linear 后再定 | U4 Q10、U8 Q28、U15 |
| 环境 | Desktop 与 cmux 都支持，setup 让人选；环境内容抽成 `idea-loop:workspace` skill，两种做法各一份 reference | U8 Q27、U9 |
| 给人看文件 | PR 是主路；cmux 里用 `cmux open`；远端文件靠 Mac 挂载虚拟机的知识库与临时区，挂载方式以后定 | U6 Q16、U7 Q21 |
| Dreaming | 不加「P2 与想法」一节；想法人自己开会话 | U6 Q18 |
| 业务 | 共用一份知识库的一组仓库叫「业务」（`GLOSSARY.md`） | U6 Q19 |
| 知识库 | 单独一个 git 仓库，按业务分；公司的只在虚拟机，个人的只在个人电脑 | U6 Q20 |
| 仓库级设置 | `DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 留在代码仓库根目录，知识库不设 `repos/<仓库名>/`；以后再考虑把通用部分拆到业务层。代码仓库的 AGENTS.md 由人维护，加一个指针块写所属业务和知识库仓库地址，会话靠它找知识库；setup 必须问清 | U7 Q22、U11、U12 |
| 业务的仓库说明 | 知识库根 `AGENTS.md` 的「## 仓库」一节：每个仓库的名字、GitHub 名、管哪块功能、依赖；会话可以开在知识库里（多仓库业务推荐），主分支取知识库默认分支，碰代码读工单所在仓库的开发设置 | U16 |
| 多仓库需求 | 每个仓库一个 PR，知识库一个 PR；先后由工单「被谁挡着」定；全部合并 spec 才完成 | U7 Q23 |
| 老做法 | 删掉「docs 在代码仓库里」；老项目重跑 setup 迁移（harold-skills、Toeflair 都迁） | U7 Q24、U8 Q24b |
| 没定的 | 挂载方式；Linear 映射；cmux 实测（`new-workspace`、relay 调 `cmux open`）；分业务会话上限要不要（F4） | U7 Q21、U8 Q28、U19 |
