---
type: raw
source_type: conversation
captured: 2026-10-22
title: grill —— retro：从实际决策里把问题和决策点整理成规则，迭代 skill
tags: [idea-loop-decisions, retro]
related: ["[[retro]]"]
---

> 格式：U 是人的原话，逐字保留；A 是 AI 的结论与发现，取证过程略去。讨论发生在 #51 的 issue 会话里，起草的第一版 spec（dreaming 读 PR 归档）被这场 grill 推翻。

## U1

其实这个issue的核心诉求是我之前看了matt的一个改动（/retro）以及poteto最近的一个skill（writing-verificable-skill），其实这个核心诉求就是再实际的决策中，将问题以及决策点整理成规则迭代skills。

其实这个用不用dreaming，我觉得不重要根本。主要的是我上面说的内容。

## A1

- Matt 的 `/retro`（[mattpocock/skills `skills/engineering/retro/`](https://github.com/mattpocock/skills/blob/main/skills/engineering/retro/SKILL.md)）：人在「比预期难」的会话结束时手动调；读这场会话的记录；出按严重度排的候选清单，只提议、人挑了才改；改的是环境不是代码；机械性的问题做成确定性检查，要判断的才写成文字。没有次数门槛，不清理旧规则（作者自己承认）。
- poteto：没找到叫 writing-verifiable-skill 的。最接近的是 cursor/plugins pstack 的 [`/correct`](https://github.com/cursor/plugins/blob/main/pstack/skills/correct/SKILL.md)：同类出现两次才算数；修法按层级尽量往上（架构 > 类型 > lint > 测试 > 文档）；每个新检查要在一次真实的历史错误上失败过；维护「规则 ↔ 由什么强制」的表。
- 提了四题：迭代哪一层（推荐三层都要、按问题出在哪定落点）；从哪采集（推荐会话记录为主）；什么时候跑（推荐 issue 会话收尾时自动跑 + 人随时手动调）；poteto 那个 skill 的链接。

## U2

Q1 没问题

Q2 我觉得可以通过读会话记录来判断

Q3 同意

Q4 应该是create-verification-skill这个

## A2

- 读了 [`create-verification-skill`](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md) 与它的 formal 变体，借的是两条原则：生成的 skill 端到端跑通一次才算交付（「没跑过的是草稿」）；没见它失败过的检查什么也证明不了（每条性质先在改坏的代码上失败）。
- 提了四题：规则写进去之后拿什么证明（推荐能机械判定的做成检查、在历史错误上先失败；要判断的留回放用例，改前改后各跑一次）；采哪些信号（纠正与追问、对摆好的题的选择、人自己说的方向）；几次成候选；新 skill 叫什么（推荐 `retro`）。

## U3

Q5 claude -p 起的是什么样的会话，我觉得夜里跑没有问题，但是我们不能只嘴上说说，我觉得更核心的是怎么跑？比如创建一个一次性的routine，在本机时间的00:00-07:00跑？

Q6 同意

Q7 同意

Q8 同意

## A3

- `claude -p` 是一场无头、一次性的 Claude Code 会话：prompt 只给一次，agent 自己跑到结束退出。现有先例 `idea-loop/evals/uiux-research/run.mjs`：每个 case 在 `/tmp` 下拷一份干净项目，`--plugin-dir` 指工作树的 `idea-loop/`，`--dangerously-skip-permissions`，输出 `stream-json`。跟交互会话吃同一份 5 小时额度。
- 桌面 app 的一次性计划任务（`fireAt`）触发时起一场无人值守的会话；app 关着时会推到下次启动才跑，所以 runner 自己要守时间窗。
- 提了四题：批了的候选怎么落地（推荐开成待验证的 issue 走正常 loop）；一次回放的构成；谁判「改后不再出现」（推荐判定会话答一道从人原话写出的是/否题，人可推翻）；夜里怎么跑（推荐先建一个几分钟后触发的探测任务验证）。

## U4

Q9 这里有个问题，就是回到`claude -p`我们的目的是验证我们在skill新增的规则候选（某个分支上，还没有合并）需要进行验证和修改。我想的是是否可以让subagent来跑（我理解跟claude -p是一样的，二者的区别能跟我讲一下吗？）

Q10 同意

Q11 同意

Q12 可以，你验证之后，我们再讨论routine(你说的一次性计划任务)、subagent以及claude -p

## A4

验证（2026-10-22，Claude Code 2.1.299）：

| 试了什么 | 结果 |
|---|---|
| 起一个子代理，让它加载 `idea-loop:spec-status` | 加载的是装好的 `~/.claude/plugins/cache/harold-skills/idea-loop/0.1.1/`，不是分支 |
| 本会话 Bash 里 `claude -p … --plugin-dir <工作树>/idea-loop`（加允许规则 `Bash(claude -p:*)` 之后） | 第一次报 OAuth 过期（人重新登录后好了）；第二次通过，加载的是工作树里的 skill，$0.33 |
| 一次性计划任务里跑 `OUT=…; {…}; claude -p …` | 命令没执行：不以 `claude -p` 开头，没匹配上允许规则，auto 分类器以「Create Unsafe Agents」拦下 |
| 一次性计划任务里只跑一条以 `claude -p` 开头的命令 | 通过，加载工作树里的 skill，$0.48 |

另外两条事实：空跑一次 `claude -p` 就要 $0.3–0.5（每次先载入约 3.8 万 token 的系统提示与插件）；计划任务起的无人值守会话改不了计划任务（工具说明：没人打开那次运行时，改计划任务这类操作被拒），所以「不在窗口就改到下一个 01:00」做不到。

子代理与 `claude -p` 的区别：子代理加载装好的插件、只能在一场正在跑的会话里起、结果回到父会话上下文；`claude -p` 能用 `--plugin-dir` 指分支、是一条命令谁都能触发、结果落文件。要验的是分支上的规则，所以回放只能用 `claude -p`。

提了三题：三者怎么组合；一个 PR 一个一次性任务，还是本机一个每晚的循环任务读队列；runner 怎么过权限检查（推荐 setup 打印一条允许规则、人自己加）。

## U5

Q13 关于skills修改的验证，我觉得应该是立马验证，不是像我们之前的大任务，避免影响正常白天工作。只有大任务的修改（比如之前ui相关的agent和skills），我们需要放到晚上；

Q14 两个都可能需要，小的任务，比如(to-spec的修改)，我觉得可以是A（立马就跑了），如果是大任务那我觉得就需要进入队列放到晚上跑

Q15 同意

## A5

- 核了一条依赖：会话被压缩后，本机的会话记录文件（`~/.claude/projects/<项目>/<会话>.jsonl`）里仍有从开场起的全部原话，所以 retro 读文件、不靠上下文。
- 提了两题：大小怎么机械地判（回放中途起插件 agent、开浏览器、调付费外部服务，碰任何一样就是大）；小的回放什么时候由谁跑（执行方实现完当场跑，大的进队列，PR 等早上的结果再进 review）。

## U6

Q16-Q17都同意

## U7

一致

## 本轮决议

| 议题 | 决议 |
|---|---|
| 要做的是什么 | 新 skill `retro`（idea-loop `productivity`）：从实际决策里把问题和决策点整理成规则、迭代 skill。dreaming 不参与 |
| 迭代哪一层 | 插件 skill、目标仓库规则文件、确定性检查三层都要，按问题出在哪定落点 |
| 读什么 | 会话本机的会话记录文件；不读 PR 归档 |
| 什么时候跑 | issue 会话收尾、归档前自动跑；人在任何会话里也能手动调 |
| 采哪些信号、几次成候选 | 纠正与追问：一次就提；对摆好的题的选择：跨会话同类 ≥2 次、无反例；人自己说的方向：一次就提，问落哪层 |
| 怎么落地 | 只出候选，人挑；批了的每条开成对应仓库的待验证 issue，走正常 loop |
| 怎么证明生效 | 能机械判定的：检查先在历史错误上失败过；要判断的：回放用例，`claude -p` 改前改后各跑一次，判定会话答从人原话写出的是/否题，人可推翻；改前复现不出的先修用例 |
| 子代理 | 不做回放（加载的是装好的旧版） |
| 大小与时机 | 不起插件 agent、不开浏览器、不调付费服务的是小，执行方当场跑；碰任何一样是大，进 `~/.idea-loop/` 的队列，由 setup 建的每晚 01:07 循环计划任务跑 |
| 权限 | runner 装在固定位置；setup 打印它的允许规则，人自己加进 `~/.claude/settings.json` |
