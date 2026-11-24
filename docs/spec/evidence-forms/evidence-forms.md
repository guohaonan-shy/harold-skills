---
type: spec
tags: [idea-loop, evidence, evals]
summary: evidence 按五种形态分支（加录屏），从 home「证据」往下展开，配一组取自真实交付物的回放样本
related: ["[[edge-case-known-limit]]", "[[skill-rewrite]]", "[[438]]"]
issues: [438]
---

# evidence 按证据形态分支，配一组真实交付物的回放样本

> #438 存在：#280 搬完之后的 `idea-loop:evidence` 只有四种形态、没有录屏，三份做法里两份（截图标注、图表）只有一行字，跟 home 固定文案「证据」一节有重复和冲突，也没有任何样本能看出一段交付物的证据写得好不好；详情在「问题陈述」（2026-11-23 对着 `release/idea-loop-0.2.0` 的 `7dbf641a` 和 #280 定稿的 spec `16e6cd18` 查）

## 问题陈述

起点是 #280 合入之后的样子：`decision-rules` 删掉，它的「证据是什么」「整体风格」「配什么图」三节和 `references/ui-flow.md`、`gif.md` 一字不改搬进 `idea-loop:evidence`（`skills/productivity/evidence/`）；home 的 `AGENTS.md` 由 setup 写进固定文案，其中「证据」一节三条（#280 spec「固定文案的原文」）。下面每条现状都对着 `release/idea-loop-0.2.0` 上 `decision-rules/SKILL.md` 的这三节查（#280 原样搬，搬完内容不变）。

### 1. 想用录屏的地方没有做法，动图一超 10MB 就只能裁短

「配什么图」列了五种：UI 页面标注、UI flow、图表、动图、表或一行例子。没有录屏。动图的做法（`gif.md`）写着「超过 10MB 就裁短、降到 8–10fps，或者缩小宽度」；上传命令 `dyna pr evidence publish` 只收 `.png .gif .jpg .jpeg .webp`、单个文件 10MB 封顶（`dyna/internal/pr/evidence.go` 的 `Extensions`、`MaxBytes`）。一段走十几步的流程（比如登录 → 选题 → 作答 → 提交 → 看结果），录成动图要么超限，要么裁到只剩一截。

人的方向（#280 triage 会话，2026-11-20）：「evidence就变成了对于证据的定义，以及不同类型的证据，比如图片、UI flow图表甚至动图、视频」。

历史记录里没有一次是人因为缺录屏而追问的（`docs/raw/decisions/` 75 份、`docs/records/retro-candidates/` 35 份里搜「视频」「录屏」，只在设计素材生成的讨论里出现，2026-11-23 查）：录屏是按人的方向加的能力，不是修一次复现过的问题。

### 2. 五种形态里两种只有一行字，模型要自己猜怎么做

| 形态 | 现在写了什么 | 缺什么 |
|---|---|---|
| UI 页面标注 | 一行：只截组件、2 倍像素密度、390 宽、红色光圈加一两句 | 用什么截、光圈用什么画；UI flow 那份明说「拼图只用 `dyna design flow compose`，同一组图才长得一样」，单张却没说 |
| UI flow | `ui-flow.md` 61 行：构图规则、JSON、命令 | 不缺 |
| 图表 | 一行：七个 excalidrawer 入口名，没装时用 mermaid | 哪种判断该用哪种图；mermaid 退路跟这台设备的人手写规则「图表类用 `excalidrawer`，不用 mermaid 或 ASCII 图」冲突 |
| 动图 | `gif.md` 13 行 | 不缺 |
| 表或一行例子 | 一行 | 不缺：它本来就是正文里的一张表 |

### 3. 跟 home 固定文案「证据」「沟通」两节有重复，也有一处冲突

#280 之后每个会话、每个子代理都加载 home 的固定文案，evidence 只在调用时才读。两边对比：

| evidence 里的一条 | home 固定文案里 | 关系 |
|---|---|---|
| 关于现状的话带出处和规模数字，查不到写明 | 「证据」：关于现状的话带出处和数字；查不到就说查不到 | 重复（evidence 多一句「出题前对最新基准再核一次」） |
| 图文结合，图放在它支撑的那句话旁边 | 「证据」：能用图、截图、改前改后、一个真实例子说清的就用它，放在它支撑的那句话旁边 | 重复 |
| 结论在前：先说对读者来说什么变了 | 「沟通」：每条消息按「问题是什么、解法是什么、要对方什么」三句话的框架写 | **冲突**：一个要先说结论，一个要先说问题 |
| 比对类证据同条件、复现才是证据、证据取自要判断的那个东西本身、叠上去的东西要说明、陌生叫法说清 | 没有 | evidence 独有 |

同一个意思写两处，改一处另一处就过期（`writing-for-agents`「剪枝」的单一事实来源）；冲突那条，模型读了 evidence 就会照「结论在前」写，跟人 2026-11-22 定的三句话框架打架。

### 4. 没有样本能看出一段证据写得好不好

`idea-loop/evals/` 只有 `uiux-research`、`retro` 两组；retro 的 15 个回放用例里，没有一个问的是交付物里的证据（2026-11-23 数）。可历史上人追问证据的现场不少，每次都是交付物里该摆的东西没摆：

- **对话**（#128 triage，`docs/raw/decisions/128.md`）：题里一个选项写「现在的做法」，只有一行文字。人：「现在的做法，比如listen & repeat 那个滚动驱动是做成什么样的？」，AI 才把设计档案里的两张真实截图摆出来。
- **spec**（#65，`docs/raw/decisions/65.md` 候选 2）：待定题的两个选项只有文字，人不熟前端，判断不了档案最后长什么样，整题交出去了。人：「我觉得对于这种我不熟悉的领域（比如前端css）我觉得需要在套路的过程中明确交付目标，这个明确可以用图文」。
- **spec**（#68，候选池 `2026-10-26-examples-from-real-material.md`）：选项的例子写「假设列表段 2000 高」，目标项目设计档案里已经有写着真实高度的页面文件，没取。人追问是哪些页面。
- **PR review 汇报**（#180 的 PR #213 第 1 轮，`docs/raw/decisions/180.md` 题 4）：S2 用了「通用文档」没说是什么。人：「S2 通用文档指的是什么？」
- **PR review**（#55，候选 #100）：spec 照抄 issue 里「靠每周 dreaming 兜底」，没核；PR 审核时人问「dreaming现在是这样做的吗？」才发现 dreaming 没有定时任务。

改了 evidence 之后，这几个现场会不会写得不一样，现在没有办法看。

### 根因

证据的规则和形态做法是 #340 并进 `decision-rules` 时一起开场注入的一段文字，只要短；#280 把它原样搬出来，没改内容（#280 spec「证据原样搬，不改字」）。所以形态做法还停在一行字的粒度（问题 1、2），也还没跟 #280 新写的 home 固定文案对过（问题 3）。评测上，`AGENTS.md` §5 默认不做 eval，只有两个刻意例外，都不覆盖交付物（问题 4）。

## 方案

改完人得到什么：给人看的东西里，模型按「要人判断的是什么」挑一种形态，每种形态有一份照着做就能出图的做法；流程太长、动图装不下时，PR 里直接内嵌一段能播放的录屏。evidence 不再重复 home 的那几句，也不再要求「结论在前」。改了 evidence，跑一遍五个真实现场的回放，就看得出这五处写得是不是比当时好。

```
会话 / 子代理 ──加载──→ home 固定文案「证据」三条（#280，不动）
要给人看的东西里放证据
  └─→ Skill: idea-loop:evidence
        SKILL.md：home 之外的规则 + 「配什么图」一张形态表（判断什么 → 选哪种 → 读哪份）
          ├─ 截图标注   → references/screenshot.md（新）：单张也走 dyna design flow compose
          ├─ UI 流程图  → references/ui-flow.md（原样）
          ├─ 图表       → references/chart.md（新）：判断什么 → 哪个 excalidrawer 入口
          ├─ 动图       → references/gif.md（原样，加一句何时改用录屏）
          ├─ 录屏       → references/video.md（新）
          └─ 表或一行例子 → 正文里写
  图放哪、要不要上传 ──→ 调用方定（pr 的 delivery-evidence、to-spec 的 figures，不变）
        dyna pr evidence publish ──→ 多收 .mp4（扩展），PR 里用 <video> 内嵌（新）
改了 evidence ──→ retro-replay.mjs --cases-root idea-loop/evals/evidence（复用 runner）
                 五个样本改前、改后各跑一遍 → 判定 → 人在 annotations.md 标注
```

### evidence 的正文：只写 home 之外的，按形态分支

照 `writing-for-agents`「信息层级」：每个分支都要的内联，只有部分分支走到的放到指针后面。所有调用方都要「什么算证据、整体怎么写、选哪种」，只有选中的那种才要具体做法。

- **开头一句**：home 固定文案「证据」一节是总纲，这里只写它之外的。
- **「证据是什么」**：留比对同条件、复现才是证据、证据取自要判断的那个东西本身；「带出处和数字」一条只留 home 没有的那半句（出题前对最新基准再核一次）。
- **「整体风格」**：删「结论在前」（跟 home「沟通」的三句话框架冲突，home 是人 2026-11-22 定的）；删「图文结合，图放旁边」（home 已有）；留「用能说清要点的最小一种视图」「陌生叫法说清」「叠上去的东西要说明」。
- **「配什么图」**：节名不改（8 份文档按这个节名指过来：`issue-triager`、`uiux-refine` 的 freeze、`design-archive` 的 review-walkthrough、`grill`、`pr` 的 description 与 review-report、`pr-review` 的 review-standards 与 run-a-round，另有 2 个文档测试，2026-11-23 数）。改成一张表：要人判断的是什么 → 选哪种 → 用什么工具 → 读哪份。

| 要人判断的是什么 | 形态 | 工具 | 做法 |
|---|---|---|---|
| 一个画面上某处对不对 | 截图标注 | 浏览器截组件，`dyna design flow compose` 单格加光圈 | `screenshot.md` |
| 几个画面之间怎么走、之前 / 之后 | UI 流程图 | `dyna design flow compose` | `ui-flow.md` |
| 结构、时序、状态、数量对比 | 图表 | excalidrawer 的入口 skill | `chart.md` |
| 动起来哪里不对、动效顺不顺（一件事，10MB 装得下） | 动图 | Playwright 帧序列或录屏 + ffmpeg | `gif.md` |
| 一段多步流程整体走下来对不对，或动图超 10MB | 录屏 | Playwright `recordVideo` / 模拟器录屏 + ffmpeg 转 mp4 | `video.md` |
| 规则覆盖了谁、数值对不对 | 表或一行例子 | 正文 | 正文 |

### 三份新做法写什么

- **`screenshot.md`（截图标注）**：只截那个组件（连同它弹出的浮层），2 倍像素密度、产物的主语言、手机宽默认 390；光圈和图说用 `dyna design flow compose` 的一行一格（第一格没有箭头，`circles` 画光圈，`caption` 写一两句），这样单张和流程图长得一样，不手画。截图用『浏览器』能力（无头那个）。
- **`chart.md`（图表）**：按要人判断的东西选入口：谁跟谁按什么顺序说话 → `excalidrawer:sequence`；一个对象的状态怎么流转 → `state-machine`；分支判断 → `flowchart`；层级 → `tree`；左右两种做法 → `comparison`；数量对比、趋势、占比 → `chart`；分层组件 → `architecture`。excalidrawer 没装时停下告诉人装上（照『装与设置』），不退到 mermaid。
- **`video.md`（录屏）**：
  - **什么时候选**：一段多步流程要整体看、动图装不下（超 10MB）或裁短就丢了要看的那段。只讲一个动效的，仍用动图。
  - **怎么录**：网页用 Playwright 的 `recordVideo`（webm），录前注入跟动图同样的叠加层（鼠标位置点、秒表）；iOS 模拟器用 `xcrun simctl io <设备> recordVideo`。节奏靠网络拦截控制，同 `gif.md`。
  - **怎么转**：ffmpeg 转 H.264 mp4（`-movflags +faststart`，浏览器边下边播），裁出要看的区域，宽度、码率控在 10MB 内；超了就分段，一段讲一步。
  - **一段录屏开头一句说明**：它在讲哪条流程、有没有加速、叠了什么。
  - 已知限制：Playwright 和模拟器录屏都不带声音。要听声音对不对的场景（比如音频自动播放），录屏证明不了，写明「录屏不含声音」，声音的证据用日志或接口响应。

### 录屏在 PR 里内嵌可播放

人的决定（2026-11-23，本会话）：PR 里内嵌可播放视频。

- **扩展 `dyna pr evidence publish`，不新做命令**：`Extensions` 加 `.mp4`；10MB 上限不变（超了分段，`video.md` 写明）。上传到的还是这个 PR 的素材分支，地址形状不变。
- **PR 里的写法**：`<video src="<地址>" controls></video>`，下一行一个同地址的链接（播不了时点开下载）。GitHub 的 markdown 渲染接口保留这个标签（2026-11-23 用 `gh api markdown` 实测：`<video src="https://github.com/o/r/blob/b/a.mp4?raw=true" controls>` 原样输出）。
- **会话里**：照旧用『发文件给人』发 mp4。
- **要在实现时核的一件事**：私有仓库素材分支的 `blob/…?raw=true` 地址在 `<video>` 里能不能播（要登录态的跳转）。实现的工单在 harold-skills 的一个真实 PR 上传一段录屏，人在自己的浏览器里点一次；播不了，PR 里改成「链接 + 一张关键段的动图」，`video.md` 和 `delivery-evidence.md` 按这个写，记成已知限制。

### 评测样本：五个真实现场的回放

人的决定（2026-11-23，本会话）：回放 + 判定 + 人标注；`AGENTS.md` §5 由 #438 写一条通用的「标注样本」例外，#451、#452 往里加自己的样本组。

- **样本是什么**：一个现场一个用例，放 `idea-loop/evals/evidence/cases/<名字>/`，格式就是 retro 回放用例（`case.json`：当时的提交、让 skill 产出那段的 prompt、停在哪、一道从人当时原话写出的是/否题、原话；旁边 `annotations.md`）。多一个 `sample.md`：当时产出的那段原文、人指出的问题、好的长什么样。
- **怎么跑**：复用 `retro-replay.mjs`，用它已有的 `--cases-root idea-loop/evals/evidence` 指到这组，不新做 runner。改前用当时提交的插件，改后用新插件，判定会话答是/否并引出处；改前「否」、改后「是」才算这处写好了。人不同意判定，在 `annotations.md` 记推翻。跟 retro 回放一样不打分。
- **什么时候跑**：改了 evidence（正文、做法、调用它的地方讲证据的写法）就跑一遍，当场跑（记忆「retro 回放当场跑」，2026-11-13 起）。
- **第一组五个**：「问题陈述」4 的五个现场，覆盖对话、spec、PR 三处：

| 样本 | 出自 | 是/否题（从人的原话写） |
|---|---|---|
| `option-current-state-shown` | 对话：#128 triage 的那道题 | 选项提到「现在的做法」时，有没有当场摆出现在的样子（截图或档案里的图），而不是只写一行字？ |
| `spec-option-goal-figure` | spec：#65 那道待定 | 每个选项做完之后人面前变了什么，有没有用图摆出来？ |
| `example-from-real-material` | spec：#68 那道待定 | 选项的例子是不是取自目标项目已有的真实材料、写明是哪一页，而不是假设的数字？ |
| `review-term-defined` | PR：#180 的 PR #213 第 1 轮 S2 | 「通用文档」这类叫法第一次出现时，有没有说清它指哪些文件？ |
| `review-current-state-verified` | PR：#55 审核那一轮 | 汇报里对「dreaming 定时兜底」这类现状的说法，有没有带出处、核过代码？ |

  每个样本的提交和 prompt 实现时从决定记录、PR 历史、会话记录里取；取不到当时输入的，换一个同类现场，在 `sample.md` 写明换了哪个、为什么。

- **`AGENTS.md` §5 加第三个例外「标注样本」**：理由是交付物写得好不好没法先写成断言，只能拿人当时追问的真实现场，改前改后各跑一遍、人标注；它不是质量基线（不打分），也不是单条规则的验收（retro 那条），是一组跟着某个 skill 的常驻样本，这个 skill 改了就重跑。写明样本组的位置约定（`idea-loop/evals/<skill>/cases/`）、复用 retro runner、人怎么推翻。列出第一组 evidence；#451（to-spec）、#452（pr）往这一条里加自己的组，不另写。

### 调用方

- **纳入**：按「配什么图」节名指过来的 8 份文档不用改（节名不变）。括号里把形态列一遍的两处（`to-spec` 的 `figures.md`「图怎么做（UI 标注、UI flow、excalidrawer 图表）」、`pr` 的 `delivery-evidence.md`「图怎么做（UI 标注、UI flow、图表、动图）」）加了录屏就过期，删掉括号，只写「照 `idea-loop:evidence` 的『配什么图』」。
- **纳入**：`delivery-evidence.md` 的「单个文件不超过 10MB」后补「录屏同样，超了分段」和 `<video>` 的写法，一两句。
- **排除**：spec、PR 描述、review 汇报的结构（开头「现状 → 本次修改的目标」、讲证据处只写「照 evidence」）：#451、#452。
- **排除**：home 固定文案「证据」一节的文字：#280 写定、人批过，本 issue 不改它，只让 evidence 不跟它重复、不冲突。

## User Stories

只修问题，不加能力（录屏是按人的方向加的一种形态，归在问题 1）：

1. **期望行为**（对应问题 1）：一段流程动图装不下时，模型照 `video.md` 录成 mp4，PR 里是一个点开就播的视频，会话里收到同一个文件。
2. **期望行为**（对应问题 2）：要一张单张截图标注时，模型用 `dyna design flow compose` 的一格出图，光圈和图说跟流程图一个样；要一张图表时，按要人判断的东西选对 excalidrawer 入口，没装就停下让人装。
3. **期望行为**（对应问题 3）：evidence 里没有一句跟 home 固定文案重复，没有「结论在前」；按 evidence 写的消息开头照 home 的三句话框架。
4. **期望行为**（对应问题 4）：改了 evidence，跑一条命令，五个真实现场改前、改后各跑一遍，判定结果和产出留给人标注。

## 实现决策

- **起点是 #280 合入后的集成分支**：#280 删 `decision-rules`、把证据原样搬进 `skills/productivity/evidence/`；本 issue 在它之上改，实现要等 #280 合入（GitHub 上标「被 #280 挡着」）。两者都改 evidence，先 #280 再本 issue，不改同一段文字的同时版本。
- **「配什么图：你来判断」改名「证据的几种形态」**：人的决定（2026-11-24，本会话）：这一节是纵览，每种形态写它让人看到什么——截图标注是单个画面的问题，UI 流程图把用户路径整体摆出来，动图是构思、设计、修改过程中看交互和动效，录屏是端到端交付、放进 PR 验收。按节名指过来的 9 处一起改。「证据是什么」「整体风格」不改名。
- **叫法**：人的决定（2026-11-24）：「整体风格」去掉「陌生叫法」一条，改成叫法取术语表或会话里说过的，都没有才解释清。
- **description**：人的决定（2026-11-24）：不只列交付物，写成跟人说判断或结论、交付任何给人看的东西时都调。
- **单张截图标注也走 `dyna design flow compose`**：已在用的命令一行一格就能出单张（第一格没有箭头），不为单张另做工具（home「做方案」：先扩展已在用的工具）；UI flow 那份已有「同一组图才长得一样」的理由，单张同理。
- **不再退到 mermaid**：人手写的 home 规则「图表类用 `excalidrawer`，不用 mermaid 或 ASCII 图」；插件不带项目信息，但这是人对所有项目的规矩，evidence 照「没装就停下让人装」写，跟 Playwright 没装时的做法一致（『浏览器』：「不在，停下，告诉人跑 `/idea-loop:setup`」）。
- **录屏 10MB 上限不放开**：跟动图同一个上限，素材分支同一套校验；超了分段。理由同 `dyna pr evidence publish` 现在的报错文案：太大的文件在 PR 里加载不出来。
- **样本复用 retro 回放的格式和 runner**：`case.json` 字段、`annotations.md` 的推翻写法、`--cases-root` 都已有；样本只多一个给人看的 `sample.md`。`cases.mjs` 的格式校验（拒绝 prompt 里出现「回放」「评测」等词）照样适用。
- **跟 #456 的交界**：#456（triage）要给回放 runner 加只跑改后的 `goal` 用例；本 issue 的样本走现有的改前改后，不依赖它。#456 落地后样本要不要改成 goal 用例，由 #456 定。
- **插件里不出现项目信息**：`video.md`、`chart.md`、`screenshot.md` 的例子用通用场景（登录、作答这类），不写 Toeflair 的页面名；样本在 `evals/` 下，跟 retro 用例一样取自本仓库的真实现场（`no-project-leak.test.mjs` 现在扫哪些目录，实现时照它）。
- **`plugin.json` 升 minor**：加了一种证据形态、`dyna pr evidence publish` 多收一种文件、新增一组评测样本（档位规则见 `REVIEW.md`「额外要求」）。改了 `dyna/` 就升 `dyna/internal/version/version.go`。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `dyna pr evidence`：`.mp4` 收、10MB 以上的 mp4 拒并给分段的提示、别的扩展名照旧拒；`CheckAssets` 的文件名归属规则对 mp4 同样适用 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | 改了 evidence 的正文和做法：新建的五个样本改前、改后各跑一遍（`AGENTS.md` §5 新的「标注样本」例外） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及；私有仓库里 `<video>` 能不能播由人在浏览器里核一次（见「方案」） |

- **seam**：两个。evidence 样本回放（`idea-loop/evals/evidence/`）抓「那五个现场按新 evidence 写出来的那段有没有摆出该摆的证据」，漏掉五个现场以外的写法和图本身画得好不好；`dyna pr evidence` 单测抓上传准入，漏掉 GitHub 上能不能播。
- **增量功能测试**：
  - 前置：五个样本各自的提交；步骤：`retro-replay.mjs --cases-root idea-loop/evals/evidence` 跑全组；期望：每个样本改前「否」、改后「是」，判定引出处；改前就「是」的样本没抓住问题，换现场；覆盖：期望行为 3、4。
  - 前置：本仓库一个 open PR；步骤：照 `video.md` 录一段 20 秒以上的多步流程，`dyna pr evidence publish` 上传，PR 描述里写 `<video>`；期望：人在自己的浏览器里点开就播；播不了走「方案」的退路；覆盖：期望行为 1。
  - 文档测试：evidence 的 `SKILL.md` 里没有「结论在前」，形态表有六行、每行指向的参考文件都在；覆盖：期望行为 2、3。
- **照着谁写**：`idea-loop/evals/retro/cases/review-no-decision-report/`（用例格式）；`dyna/internal/pr/evidence_test.go`；`idea-loop/scripts/decision-evidence-principles-doc.test.mjs`（#280 会把它改到 evidence）。

## Out of scope

- spec、PR 描述、review 汇报的结构，和各 skill 里讲证据处统一写「照 evidence」：#451、#452。
- home 固定文案「证据」「沟通」两节的文字：#280 定稿。
- 候选池里落点在 evidence 的两条：「交付目标配图」（`2026-10-26-goal-figures-for-human.md`）是「现状 → 本次修改的目标」那一组，归 #451 / #452；「例子从真实材料取」（`2026-10-26-examples-from-real-material.md`）的落点「要人定的写成一道题」已随 #280 进了 home「沟通」，人定过那里「各配一个真实例子……暂时不需要写」。两条在这里只做成样本，不改规则。
- 声音的证据：录屏不带声音，记成已知限制。
- 回放 runner 的 `goal` 用例：#456。

## 关联

- 决定记录：[[438]]。
- [[edge-case-known-limit]]（#280）：删 `decision-rules`，证据原样搬进 evidence，home 固定文案写「证据」一节；本 spec 在它之后。
- [[skill-rewrite]]（#340，PR #432）：把 evidence 并进 decision-rules 的那次。
- ADR-0035（证据与决策原则）：本 spec 不改它的证据原则，只改形态做法。
- 相邻：#451（spec 结构）、#452（PR 结构）被本 issue 挡着，往 §5「标注样本」里加自己的样本组；#456（triage）回放 runner 的 goal 用例，不重叠，见「实现决策」；#299、#216 已并进本 issue 后又随格式部分挪到 #451 / #452。
- 父 issue：#331（idea-loop 0.2.0）。
