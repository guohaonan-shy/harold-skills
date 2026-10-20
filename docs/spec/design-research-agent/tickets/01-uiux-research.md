# 01 — 人能调 uiux-research 拿到一页调研 HTML，imagine 和 refine 不再自己调研

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件多一个由人调起的设计调研能力，并把 imagine / refine 里原来各自带的调研流程拿掉。

**人调调研。** 人在任何会话里调 `/idea-loop:uiux-research <一句具名问题>`。imagine / refine 之外的普通对话里，人说「查一下别人怎么做」时，模型也可以自己调这个 skill；imagine / refine 的编排者只在人说要查时才调。skill 把人的话收成一句具名问题（一句话、一个决定），定好落图目录，起一个新的调研 agent。

**调研 agent 做什么。** 它拿到具名问题、产品上下文（项目的 `DESIGN.md` 在哪、一句话说明当前在做什么）和落图目录，用 Refero 的 screens / flows 层去查，把参考截图下载进落图目录，写一页单文件 `index.html`，只交回这页的路径和一句结论；Refero 的调用和截图都不进调用方的上下文。它钉在 `opus` 模型、medium 思考强度；工具只有 Refero、下载截图用的命令行下载、在落图目录里写文件，不给浏览器，不起子代理，不下方向结论，不改画布，不跟人对话。

**HTML 长什么样。** `file://` 直接能打开，图用相对路径。顶部写具名问题、一句结论、这次调研**不能回答什么**（时间 / 行为维度的问题——某个动效、某个状态何时出现——静态截图往往答不了，照实写，不硬凑参考）。每个来源一节：一组按 flow 顺序横排的截图，每步下面标这一步在做什么；旁边三段解构——**场景**（哪个产品、什么用户、要完成什么）、**设计逻辑**（用了什么 pattern / flow、它解决了什么问题、所以 UI 长成这样）、**对我们**（能回答什么、不能回答什么；保留 / 修改 / 不要照抄）。几个来源对不上时写成一个要人做的取舍，不取中间值（reference-averaging 禁令保留）。

**调研的范围。** 查 UX pattern、user flow、某一类页面的通常做法、文案语气。不查视觉风格：不用 Refero 的 styles 层，研究契约里「选定语言后可选的 styles 压力测试」删掉。原来「第一批变种出现之前绝不读」这条硬规则删掉——调研回答的是 UX 问题，UI 的发散交给随机种子。

**落在哪。** 有 spec 时放这份 spec 设计过程目录（设计档案的 tmp 下按 spec 分的那个目录）里的 `research/<问题短名>/`，imagine 和 refine 用同一处；没有 spec 时放设计档案 tmp 下的 `research/<问题短名>/`。都不进 git，随 tmp 目录的生命周期删。

**接回 imagine / refine。** 编排者把 HTML 以文件发给人。人看完说要转哪些，编排者才把对应的解构**文字**（不给图）作为这一轮的意见转给 uiux-imaginer 或 designer；人不说就不转。人在 imagine 开工前查到的结论，编排者在起 uiux-imaginer 时带上，uiux-imaginer 写进交给种子子代理的需求；种子子代理不接触参考图。用上的结论照现有规矩记：imagine 进方向说明的「约束与素材」，refine 进冻结记录。

**执行者不再自己调研。** uiux-imaginer、designer、静态 UI 协议 C 段的执行者都不调 Refero、不起调研 agent。碰到凭判断定不了的 UX 问题（uiux-imaginer 想 UX 时要拍脑袋的地方；designer 的 `pattern` 类 finding 先凭判断改、改不了的；C 段遇到的具名问题），写成「建议调研的问题」——一句具名问题加推荐做法——放进这一轮的交回，不停下等人，先按推荐做法往下做；编排者把它和这一轮其它要人判的取舍一起摆给人。uiux-imaginer 原来「自己起一个调研 agent」那句、它工作目录里的 `research/`、收工时清 `research/` 的那一步、交回里「参考图路径」那一项都去掉，换成「建议调研的问题」；凡是提到 imagine 工作目录里 `research/` 的说明（设计法总纲、浏览器用法、designer 里「不读 research/」那句）跟着改。研究契约改成写给调研 agent 读，「什么时候查」不再由它规定。

**文档。** idea-loop 的 README 和本仓库 `CLAUDE.md` 里 idea-loop 那一段：skill 数和 agent 列表加上这一对，写清 imagine / refine 不再自己调研、由人调；插件版本号加一。

> 人的决定（2026-10-20）：不划掉 baseline 那一格，改成给 `uiux-research` 建一个 baseline：一组 default prompt（取以前真实会话里调研过的那几个问题），配一份最小的产品上下文，跑调研 agent，看最后的产出是否服务诉求。原文：「我们来创建一个baseline吧，对于这个skill 我觉得核心是准备一个default prompt，然后看agent 最后的输出是否服务我们的诉求。可以参考那几个会话的research 问题看看输出的内容是不是我想要的」。判法：「先把产物给我，我来进行人工review，标注问题，然后我们可以逐渐确定这个产物应该包含什么」——不预设内容断言，产物（能在内嵌浏览器里打开的那页 HTML）交给人看、人标注问题，标注留档，逐步收敛产物该包含什么。实现时只跑 1 个 case 冒烟，全量的命令交给人晚上跑。

## 验收标准

- [ ] 在 Toeflair 的一份碰 UI 的 spec 上，人调一次 `uiux-research`：调用方会话里只出现 HTML 路径和一句结论，没有 Refero 的调用记录、没有整张截图。⏭ 延后 → PR 交付验收：要在真实会话里起 Refero 才能证明；实现时只核了提示词、校验脚本和 Refero 返回的形状（搜索结果带 `thumbnail_url`，curl 能下）。
- [ ] 那页 HTML 用 `file://` 打开，能看到顶部的具名问题、结论、「不能回答什么」，以及每个来源一组按 flow 排的截图和三段解构；引用的每张图都在落图目录里。⏭ 延后 → PR 交付验收：页面形状已由 `research-check` 机械校验（契约里的模板和单测都过），真实 researcher 产出的那一页要人打开看。
- [ ] 落图目录符合「有 spec / 没 spec」两种约定，且不在 git 的跟踪里。⏭ 延后 → PR 交付验收：约定已写进 `uiux-research` §2 与 wiki-conventions，合并拦截（`merge-gate-hook`）已放行 `research/`，真实调一次才能证明目录落对。
- [ ] 在一份没有 spec 的普通对话里，人说「查一下别人的退出确认弹窗怎么做」，模型自己调起 `uiux-research`。⏭ 延后 → PR 交付验收：模型自调取决于 description 在真实对话里是否触发。
- [ ] 跑一轮 imagine 和一轮 refine：uiux-imaginer 与 designer 的会话记录里没有 Refero 调用；有拿不准的地方时，交回里出现「建议调研的问题」并带推荐做法，执行者没有停下等人。⏭ 延后 → PR 交付验收：要真实跑一轮 imagine 和 refine。
- [ ] 人看完 HTML 不表态时，编排者不转；人说转某几条时，执行者收到的是文字，没有图。⏭ 延后 → PR 交付验收：编排者的转不转规则已写进 uiux-research §5 与两个编排 skill，要真实会话验证。
- [ ] 人在 imagine 开工前调过一次：种子子代理收到的需求里有调研的文字结论，没有图。⏭ 延后 → PR 交付验收：要真实跑 imagine 开工前调研再起 uiux-imaginer。
- [x] 插件里不再有地方要求执行者自己查 Refero、不再提「第一批变种之前不读」和 styles 压力测试；imagine 工作目录里不再有 `research/`。
- [x] idea-loop 自带的脚本单测全量通过。
- [ ] 人的决定（2026-10-20）：有一组 `uiux-research` 的 baseline case——每个 case 一句 default prompt（取自以前真实会话里调研过的问题：退出确认弹窗入口用 X 还是箭头 / 弹窗怎么摆；暂停后怎么接着练；失败页要不要卡片；错误卡标题怎么写得轻松；进行中的条目失败后留在原位还是归档；弹窗出现时要不要暂停），附一句「上次真实会话里这次调研实际帮了什么 / 没帮上什么」作人工对照，配一份最小的产品上下文；一条命令能跑全部或指定 case，产物落到固定位置，每个 case 旁有一个留给人标注问题的文件。
- [ ] 人的决定（2026-10-20）：执行方实跑 1 个 case 冒烟，产出的那页 HTML 能在内嵌浏览器里打开，交回它的路径；全量 6 个 case 的命令写进交回，由人晚上跑。
- [ ] 人的决定（2026-10-20）：仓库 `CLAUDE.md` 的 eval 策略一节写明这是有意例外——这个 skill 的产物形状还在跟人一起收敛，baseline 用来让人逐次标注，不判好坏分数。

## 选中的存量回归

无 test-cases 库。这张票碰到的是 idea-loop 的提示词与说明，有风险的是：

- **idea-loop 脚本单测（全量）**：方向说明校验、设计档案检查这类脚本会读 imagine / refine 的产物形状，`research/` 与交回项的改动可能碰到它们。
- **idea-loop 的 imagine / refine baseline eval**：断言 imagine → refine 的环还接着、方向说明七节契约还守着；这次改了两边的说明，最可能在这里断。
