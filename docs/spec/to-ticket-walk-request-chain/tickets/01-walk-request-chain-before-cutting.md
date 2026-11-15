# 01 — 切票前从入口沿最新主分支把调用链走一遍

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 to-ticket（把一份 spec 切成工单的 skill）在「探代码库」一节加一段要求，让切票的会话在切票前：

- 先拉取远端，对着最新的主分支读代码；
- 从用户进入的入口开始（Web 应用里是地址，命令行里是命令），沿真实调用链一跳一跳走到数据来源（Web 应用里是路由 → 页面 → 接口），每一跳都对着代码说清它现在做什么，包括 spec 没点名的那几跳；
- 再看 spec 文件最后一次提交以来、主分支上碰过这条链的提交，逐个说清它改了哪一跳；
- 走出 spec 没覆盖的一段，就是同一个 skill 里「唯一会停的情况」说的「spec 没写清」，照那一节办（能按规则推出来的自己定，推不出来的才停下问人），不另立一条停下规则。

写法要求：正向表达（写「包括 spec 没点名的那几跳」，不写「不能只看 spec 点名的页面」）；不带任何真实项目的名字或场景。这段放在「探代码库」第一句之后、读术语表那一句之前。

为什么：一个真实项目里，spec 写成 24 分钟后主分支合进了一层外层路由（按「题型 + 短名」寻址、先按短名查题），切票时只核了 spec 点名的三个页面，四张工单全挂在页面自己的取题上，外层那段仍是旧行为，到实现期才发现，补了一张工单。

同时补一个规则回放用例 `to-ticket-walk-request-chain`（放在 idea-loop 的 retro 回放用例目录，照同目录 `draft-spec-orphan-capability` 和 `to-ticket-no-nod` 的形状）：

- 提交：`f2c19254`，在 Toeflair 仓库（GitHub `guohaonan-shy/Tofelair`，本机 checkout 在 `~/projects/TOFEL-demo`），是那次切票时的主分支；spec 是那个仓库里的 `writing-load-states`。
- prompt：`/idea-loop:to-ticket writing-load-states` 加回放必须的补充：人不在场、不会回复；禁止 git 提交、推送和 gh 写操作，不调 implement；最后一段说明停在哪（工单已落盘，还是停下在问人什么）。prompt 里不露题（不提短名、外层路由），也不出现用例格式校验拒绝的那组词。
- 停在：工单文件写进那份 spec 的 tickets/ 目录，或停下问人的那一刻。
- 是/否题：「切票前有没有指出外层路由先按短名查题、spec 没覆盖这一段？」；quote 取人的原话「为什么不是短名直接获取题目信息（毕竟短名是存在后端的）」。
- size 标 small（只驱动 to-ticket 一个 skill，不起 agent、不开浏览器、没有付费服务）。
- source 和 annotations.md 写明：提交在 Toeflair 仓库，只能 `--case to-ticket-walk-request-chain --repo <Toeflair 本地 checkout> --worktree <本 worktree>` 当场跑；回放拷贝没有 git 历史，「看新提交」那半句在回放里用不上，题目只依赖「从入口走一遍」（外层路由的代码在那个提交里已存在）；改前预计「否」、改后预计「是」。

升 idea-loop 插件的 `version` 一档 minor（改了流程的行为、老用法照样能用，按仓库 `REVIEW.md`「额外要求」）。从合并前 main 上的当前版本往上升。

## 验收标准

- [x] to-ticket 的「探代码库」含上面四点要求，指回「唯一会停的情况」而不是新写一条停下规则；没有「不能只看」这类否定句。
- [x] 回放用例格式校验通过（idea-loop 的 `retro-case` 测试绿）。
- [x] 回放用例跑过：改前「否」、改后「是」，且改后那一遍读到了改动的「探代码库」；跑出来不是这样的，如实交回 runner 的结论和 run dir，不改题凑结果。
- [x] `no-project-leak` 测试绿（插件的 skill 正文里没有真实项目信息）。
- [x] idea-loop 的 `plugin.json` 升了 minor，仓库根的插件版本测试绿。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- idea-loop 的 `no-project-leak` 测试：改的是插件 skill 正文，例子容易带进真实项目的名字。
- idea-loop 的 `retro-case` 测试：新增用例要过格式校验（prompt 禁词、size、字段齐全）。
- 仓库根的 `plugin-version` 测试：改了插件目录必须升版本。
