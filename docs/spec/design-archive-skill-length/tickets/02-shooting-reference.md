# 02 — 拍档案截图改写成一份按情形排步骤的参考，删掉 sections.md

**Blocked by**：01 — design-archive 的主体只讲图的实体，写法与命令走 references
**设计冻结**：不涉及 UI

**先读写法**：这张工单改的全是给 agent 读的文档（skill、references、agent 定义）。开工前用 Skill 工具调 `idea-loop:writing-for-agents`，SKILL.md 和它指向的 `SKILL-MECHANICS.md` 都读；重排、改写、删句都照它做：信息层级与渐进披露、就近归置、引导词、单一事实来源、剪枝（环境缓存、空操作）。仓库 `CODING_STANDARDS.md` 的「链接」把它列为 skill 与 agent 定义的写法规范，review 的 Standards 轴按它审。

## 要建什么

`idea-loop:design-archive` 的设计档案每个状态要存截图，拍法靠插件的分段脚本（七个子命令 `time` / `step` / `measure` / `attribute` / `shoot` / `pinned` / `screen`）加无头 Playwright。现在拍法写在 `references/sections.md` 的后半（工单 01 已把前半「写分段的规范」挪走），约 1 万字，大半是脚本内部做了什么、常量、检出算法和由来，同一句话重复三四遍，真实的先后顺序散在 7 个带长子项的编号里。单屏状态的 `screen` 也挂在「长页面的分段」这个标题下。

做完之后：要拍档案截图的调用方（ui-reviewer 归档与对账、dreaming 初扫与对账）读一份新的拍图参考，按情形照步骤跑，知道下一条命令是什么、输出里哪些要处理、怎么处理。`references/sections.md` 删掉。

具体（spec `design-archive-skill-length` 的「方案」）：

- 新的拍图参考：
  - 四种情形各一串步骤，每步写完成条件：单屏状态（装时间 → 走到状态，要等就 `step` 拨小步 → `screen`）；长页面入口（装时间 → `measure` → 用 `browser_evaluate` 存结果 → `attribute`，退出码 1 就清零重测 → `shoot` → 放进入口状态同目录的 `assets/`）；段内交互的状态（点出状态 → `measure --for` → `attribute` → `shoot` 只拍那一段）；滚动驱动的段（`attribute` 检出 → 声明 `scrollDriven: true` → 每一步建段内状态和边，滚轮驱动的写 `user` 边、按位置切换的写 `system` 边，结构相同的步骤只记第一个 → `shoot` 拍第 1 步、`pinned` 拍后面每一步）。
  - 一张「看到什么 → 做什么」表，只收要 agent 处理的输出：`attribute` 退出码 1 的各个列表（落空、定位失败、顺序不对、重叠、`undeclaredScrollDriven`）与清零办法；`uncontrolled: true`（看 `diffBox`，状态文件「这一屏」里写明，对账按「应看到什么」核）；`heightDrift` 不为 0（长页面重新 `measure`；单屏状态改成声明分段）；`clock` 是「装晚了」（从入口重来：`browser_navigate`、`time`、再点出状态）；`scroller.others` 不空（另一个窗格拍不到，文字写明）；`declaredNotDetected`（只提示）。
  - 共用的规矩各写一次：一个标签页装一次时间，换标签页或换入口页再装；代码文件与 `--out` 要在 Playwright 工作区根目录里；视口、主题、动效模式取 `prod/index.md`、可用参数覆盖、缺了退出码 2，语言要先按 `locale` 打开页面；截图不带 `animations: 'disabled'`，不往页面注入关动画与过渡的样式；拍之前关掉开发服务器的调试浮层；几页一起扫时一页一页拍，不穿插；页面时钟停在固定的一天，按「今天」算的内容会固定。
  - 已知限制只留碰到时要换做法的：一段不要跨过滚动容器的顶边（在容器顶切成两段）；长文章侧边随滚动变的进度标签会被认成滚动驱动（在「这一屏」里用文字写明整段内容）；一段高过约 16000px 要拆成两段；两个窗格各自滚动只认一个、横向滚动不管。
- 删去：每个子命令「代码做的事」的逐步描述、常量、钉子检出的两条判据、滚动容器的识别算法、「以前页面时钟冻在……」的由来（脚本源码与 `--help` 是事实来源）；重复的句子；只给维护者看的（浏览器侧代码由哪个测试覆盖，插件 README 的脚本清单已有）；两段「比对」（ui-reviewer 对账模式自己写了 `ui-png-compare.mjs` 的比对）。子命令、选项、退出码、输出字段名一个不改。删掉的每一句在 PR 描述里写去处或理由。
- 主体「按需读」表里拍档案截图那一行改成指新的拍图参考。
- 指到拍图的外部入口同一个提交里改成新参考的标题：ui-reviewer 定义「开工」（现在按路径读 `references/sections.md`，改成按名字加标题）、归档模式与对账模式里的「长页面的分段」「拍图：分段脚本」；ui-measure 里「设计档案的拍图……拍法见『长页面的分段』」；dreaming 初扫参考的拍图步骤。

## 验收标准

- [x] 开工前读过 `idea-loop:writing-for-agents`；PR 描述里每条删句的理由引它的条目名（「单一事实来源」「环境缓存」「空操作」），每处重排说明依据（「信息层级」「就近归置」）
- [x] 新的拍图参考按四种情形各有一串带完成条件的步骤，有一张「看到什么 → 做什么」表，共用规矩各只出现一次
- [x] `references/sections.md` 不存在；它原来的每一句，要么在主体、写法参考、`check.md`、拍图参考里，要么在 PR 描述里有去处或删的理由
- [x] 子命令、选项、退出码、输出字段名跟改前逐一对得上（对着旧文 diff 核）
- [x] `design-archive-sections-doc` 测试通过：文档里每条分段脚本命令行的子命令与选项都是脚本认的，七个子命令都出现过；它按路径读 `references/sections.md` 的那条换成新的拍图参考
- [x] `ui-reviewer-archive-doc` 测试断言的两个标题换成新的拍图参考的标题后通过；归档模式里仍然不出现 `references/...md` 的路径
- [x] `skill-private-references` 测试通过；dreaming 初扫改成按名字指之后，它 `KNOWN` 里那条豁免要是不再用得上就删掉
- [x] 工单 01 加的「外部节名都指得到」测试与主体长度测试照旧通过；插件 `scripts/` 下全部测试通过
- [x] `idea-loop/README.md` 里提到 `sections.md` 的地方同步改

## 选中的存量回归

- `design-archive-sections-doc.test.mjs`：扫全部 skills 与 agents 里分段脚本的命令行，改写拍法时最容易写错子命令或选项；也钉着不注入关动画样式、单屏状态用 `screen`
- `ui-reviewer-archive-doc.test.mjs`：钉着 ui-reviewer 归档模式按名字加标题指拍法
- `skill-private-references.test.mjs`：dreaming 初扫按路径读 design-archive 的 references 是一条已登记的豁免，这次要改成按名字
- `design-archive-sections.test.mjs`、`design-archive-sections-browser.test.mjs`：脚本本身不改，跑一遍确认没被碰到
