---
type: spec
tags: [idea-loop, browser]
summary: agent 用无头浏览器点着走完要麦克风的流程，授权与拒绝都能测，并往假麦克风里喂指定音频
issues: [231]
related: []
---

# 要麦克风的流程由 agent 点着走完，并往假麦克风里喂音频

> #231 存在：默认的精简版无头浏览器调 `getUserMedia` 直接抛 `NotSupportedError`，`idea-loop:browser` 和 `idea-loop:runtime` 的『浏览器』都没写怎么办，执行方就把这一步交给人手测；详情在「问题陈述」

目标（Harold，2026-11-16，本会话）：「让agent通过点击测试麦克风权限，然后将音频注入进假麦克风的音频流内，从而将自动化测试的最后一块补齐」。

## 问题陈述

### 1. 麦克风这一步被当成「无头测不了」交给人

Tofelair#738 工单 03 的执行方用 Playwright 默认的精简版无头浏览器（chrome-headless-shell）走「Interview 点 Begin」，页面卡在「Checking Mic...」，执行方把这一步写成人验项交给人手测。后来改用完整 Chromium 加假麦克风参数、再授予 microphone 权限，在本地真实前后端上全自动走通。

本次复测（2026-11-16，本机 macOS，playwright-core 1.62.1，本地静态页里调 `getUserMedia({audio:true})`）：

| 浏览器 | 授权 | 参数 | 结果 |
|---|---|---|---|
| 精简版无头（chrome-headless-shell 151） | 给 | 假设备 | 失败：`NotSupportedError` |
| 完整 Chromium（`channel: 'chromium'`，151，headless） | 给 | 假设备 | 成功，拿到「Fake Default Audio Input」 |
| 完整 Chromium | 不给 | 假设备 | 失败：`NotAllowedError`（就是「拒绝授权」该有的样子） |
| 完整 Chromium | 不给 | 假设备 + 假授权弹窗 | 成功：`--use-fake-ui-for-media-stream` 无视权限直接放行，测不了「拒绝」 |
| Chrome 正式版（158，headless） | 给 | 假设备 | 成功，拿到假麦克风 |

分拣在 2026-11-13 也复现了前两行（[分拣评论](https://github.com/guohaonan-shy/harold-skills/issues/231)）。issue 原文里「拒绝授权时不授权、也不加 `--use-fake-ui-for-media-stream`」这句分拣没验，本次第三、四行验了，成立。

现在 `idea-loop:browser` 的正文（2026-11-16 主分支 a032e45）只讲无头和给人看两种用途、登录态、慢网络，全文没有麦克风、假设备的字样；`idea-loop:runtime` 的两份 reference 也没有。

复现材料：`.tmp/to-spec/browser-fake-mic/repro/t.mjs`、`out.txt`

### 2. 桌面端的 Playwright MCP 一授权就拿到本机真麦克风

issue 没写、本次查到的：桌面端用户级配的 Playwright MCP（`--headless --isolated`，由 `/idea-loop:setup` 照 runtime 的『装与设置』装）跑的是 Chrome 正式版 158 的 headless，不是精简版。在它的页面上不授权时拿到 `NotAllowedError`；用 `browser_run_code_unsafe` 授权 microphone 之后，`getUserMedia` 成功，音轨名是「Default - MacBook Pro Microphone (Built-in)」：**拿到的是这台 Mac 的真麦克风**。MCP 的启动参数里没有假设备，所以执行方照「授权就行」去做，会在人不知情时打开真麦克风；放到 CI 或没有麦克风的机器上又会失败。

复现材料：本会话 2026-11-16 在 MCP 浏览器里对 `.tmp/to-spec/browser-fake-mic/repro/mic.html` 的两次 `getUserMedia` 调用

### 3. 拿到麦克风之后，喂不进指定的声音

只解决「拿到麦克风」还不够：录音、语音面试这类流程，后面的环节（录到的音频能不能上传、识别出来的文字对不对）要一段指定的说话声才能测。假麦克风默认只放每 0.5 秒一下的蜂鸣。

本次实测往假麦克风里喂音频（2026-11-16，用 macOS `say` 生成两段 16 位 PCM 的 WAV：一句约 2.8 秒的英文句子、一个约 0.4 秒的「Hi」；页面每 100ms 量一次录到的音量）：

| 做法 | 录到的 |
|---|---|
| 只加假设备参数 | 每 0.5 秒一个尖峰：默认蜂鸣 |
| 再加 `--use-file-for-fake-audio-capture=<WAV>` | 一整句话的起伏，跟喂的句子一致 |
| 文件路径末尾加 `%noloop` | 放完一遍就静音，不循环 |
| 浏览器不重启，把同一路径的文件换成「Hi」，再开一次录音 | 录到的变成「Hi」：**每次开始录音都重新读文件** |
| 路径上没有文件 | 静音，浏览器照常 |
| 同样的参数放进 Playwright MCP 的启动配置 | **全是静音**，见下一行 |
| MCP 配置里再关掉 Chromium 沙箱（`chromiumSandbox: false`） | 授权后录到整句话、放完静音；换成「Hi」后不重启录到「Hi」；不授权得 `NotAllowedError` |

MCP 静音的原因：MCP 启动浏览器时默认打开 Chromium 沙箱，沙箱里的音频服务读不到这个文件，只剩静音。同一个 Chrome 用脚本起、沙箱开着时也是全静音，关掉就正常（`out6.txt`）。Playwright 自己起浏览器默认就不开沙箱，所以 ui-measure 这类自起的脚本不受影响。

复现材料：`.tmp/to-spec/browser-fake-mic/repro/` 下的 `t2.mjs`–`t8.mjs`、`mcp-drive.mjs` 与对应的 `out*.txt`

### 根因

- 问题 1：两份浏览器文档都没写麦克风流程怎么进到对的状态，执行方碰到精简版的 `NotSupportedError` 就把它当成工具的极限。
- 问题 2：MCP 浏览器的启动参数从来没考虑过媒体设备，没有假设备参数，授权后落到系统默认输入设备上。
- 问题 3：没有喂音频的约定（文件放哪、什么时候读），MCP 的沙箱又挡住了读文件。

## 方案

改完以后，执行方、审查方、分拣方碰到要麦克风的流程（录音、语音面试、「检查麦克风」这类页面），在 MCP 浏览器里一步步点着走：要测「能用」就先授权，要测「拒绝」就不授权；要测录音之后的环节，就先把一段说话声的 WAV 放到约定的位置，再点开始录音，页面录到的就是这段话。全程用假麦克风，结果是截图和断言写进文件，不写成人验项，也不会打开本机真麦克风。

![时序](assets/sequence-browser-fake-mic.png)

用户（执行方）得到的结果只由三样东西决定：授不授权（走「能用」还是「拒绝」），约定位置上放的是哪段音频（录到什么；没放就是静音），以及点到哪一步。

改动落在三处给 agent 读的文档、外加装机：

- **`idea-loop:browser`**（不管哪个运行环境都读）：「进到对的状态」加一条，跟登录、慢网络并列，因为它也是把页面带到要测的状态（杠杆：就近归置）。写成正向的目标行为：要麦克风的流程用假麦克风点着走完，「能用」先授权，「拒绝」不授权；要录到指定的话，先把音频放到『浏览器』写的位置，每开始一次录音就从头放一遍。只写能力，不写工具（AGENTS.md 的约定：skill 写能力名，具体工具在 runtime）。
- **runtime claude-desktop 的『浏览器』**：写 MCP 浏览器怎么做：假麦克风已在装机时配好；授权用 `browser_run_code_unsafe` 里的 `page.context().grantPermissions(['microphone'], { origin })`，「拒绝」不授权（已授权过的用 `clearPermissions()` 撤回）；音频放在 `~/.idea-loop/fake-mic.wav`（16 位 PCM 的 WAV），换段音频不用重启浏览器；坑：没按新配置重装 MCP 的机器上，授权拿到的是真麦克风（杠杆：环境里靠看找不到的坑）。
- **runtime claude-desktop 的『装与设置』**（`/idea-loop:setup` 照它装 MCP）：Playwright MCP 多带 `--config ~/.idea-loop/playwright-mcp.json`，配置里写假设备参数、音频文件参数（带 `%noloop`）和关沙箱；检查项同步加上 `--config`。不预先放音频文件：没有文件就是静音假麦克风。
- **runtime magi 的『浏览器』**：magi 自带的浏览器不能授权、不能跑任意 JS，麦克风流程在 magi 里写一段自起的 Playwright 脚本，参数同上（自起脚本本来就不开沙箱）。加一句指向这个做法。

同一行为的其他入口：

- **纳入** `idea-loop:implementer` 的人验项判断：它在「每一格标『人看』的验收」那里决定什么交给人。它已经按 `idea-loop:browser` 用浏览器，browser 里写清了它就照做，implementer 本身不改。实现时核一遍它读到 browser 的路径还在。
- **纳入** 项目自己的端到端测试：规则只管 agent 怎么走，项目自己的 Playwright 测试要不要用同样的参数由项目定；browser 里那一条写的参数照抄即可。
- **排除** 摄像头、屏幕共享：同一组假设备参数也管摄像头，但还没有真实流程碰到过。见 Out of scope。
- **排除** 无头浏览器里的系统授权弹窗：headless 下浏览器不画「允许使用麦克风」的弹窗，「点击授权」只能是点页面自己的按钮，授权结果由事先授不授权决定；这就是测「能用 / 拒绝」两条路的做法，不另找办法点弹窗。

## User Stories

只修问题，不另加能力：

1. 期望行为（问题 1）：执行方或审查方碰到要麦克风的流程，用假麦克风点着走完「能用」「拒绝」两条路，结果是截图和断言文件，不出现「麦克风无头测不了，交给人验」的人验项。
2. 期望行为（问题 2）：照 idea-loop 的浏览器文档走麦克风流程，任何一次 `getUserMedia` 拿到的都是假麦克风，不是本机真麦克风。
3. 期望行为（问题 3）：执行方把一段说话声的 WAV 放到约定位置后点开始录音，页面录到的就是这段话、放完不循环；换一段音频不用重启浏览器。

## 实现决策

- **走 MCP 浏览器，点着走**：依据是目标原话「通过点击测试麦克风权限，然后将音频注入进假麦克风」，加上本次 MCP 全程实测通过（问题 3 表的最后一行）。magi 没有 MCP，用自起脚本，参数相同。
- **规则写在 browser 的「进到对的状态」下，一条**；具体工具、路径、配置写在 runtime 的两份 reference。依据：browser 现有结构、AGENTS.md「skill 写能力名」的约定、writing-for-agents 的「单一事实来源」。
- **「拒绝授权」只靠不授权**：不授权、不加 `--use-fake-ui-for-media-stream`，页面拿到 `NotAllowedError`。依据：问题 1 表第三、四行。
- **音频放一个固定位置 `~/.idea-loop/fake-mic.wav`，带 `%noloop`**：MCP 的启动参数在装机时写死，只能指一个固定路径；每次开始录音都重读文件，所以换音频就是覆盖这个文件。`%noloop` 让一段回答放完就静音，像人说完一句停下；要循环的流程很少，不为它留开关。依据：问题 3 表第三、四行。放在 `~/.idea-loop/` 是因为它跨会话、不绑定项目（AGENTS.md「跨会话持久的用户数据」）。已知限制：几个会话同时用 MCP 喂不同的音频会互相覆盖；现在没有并行测麦克风的真实流程，记在这里，碰到再说。
- **不预放音频文件**：没有文件时假麦克风是静音（问题 3 表第五行），对不需要声音的流程刚好合适。
- **音频怎么来不规定**：WAV、16 位 PCM 即可；项目有录好的样本就用样本，没有就用本机的语音合成生成（macOS 的 `say -o x.wav --data-format=LEI16@48000 "…"` 是一个例子，写进 claude-desktop reference 时标明是 macOS 的做法）。
- **精简版写成一句原因，不写成禁令**：写「精简版不支持麦克风，`getUserMedia` 会抛 `NotSupportedError`」，让碰到这个错误的 agent 认得它。依据：Tofelair#738 的执行方正是被这个错误误导的。

### 待定：MCP 浏览器关掉 Chromium 沙箱

要往假麦克风里喂音频，MCP 浏览器得关沙箱（问题 3 的根因）。关了以后，MCP 浏览器跟 Playwright 自己起的浏览器（ui-measure、flow-compose 用的）一样不开沙箱；代价是它打开外部网站时少一层隔离：idea-loop 的 seo 审计、复现线上问题都会用它打开线上页面。

**A（推荐）：关沙箱，一份配置管所有会话**
- 走一遍：执行方在 MCP 里打开 Interview 页 → 授权 → 把一段「My favorite city is Tokyo…」的 WAV 写到 `~/.idea-loop/fake-mic.wav` → 点 Begin → 截到录音中的状态 → 页面上传、识别出这句话 → 断言识别结果。全在 MCP 里点完。
- 代价：MCP 浏览器打开外部网站时没有沙箱。它本来就是 `--isolated`，没有登录态、没有你的 cookie，打开的是线上公开页面；Playwright 自起的浏览器一直是这样跑的。

**B：沙箱开着，喂音频只在自起脚本里做**
- 走一遍：执行方在 MCP 里能点、能测「能用 / 拒绝」，但录到的永远是静音；要测识别结果，就把「授权 → 点 Begin → 录音 → 断言」写成一段自起的 Playwright 脚本跑。
- 代价：最后一块（喂音频）还是不能在 MCP 里点着走，跟你说的「通过点击」不一致；两种做法要分开写。

推荐 A：它是唯一能让「点着走 + 喂音频」在同一个浏览器里完成的做法，多出来的风险只在打开外部网站时，而 MCP 浏览器本来就没有登录态。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改的是给 agent 读的文档。用 `idea-loop/evals/retro/` 的回放：取 Tofelair#738 工单 03 执行方把麦克风交给人的那个决策点做一个用例，是/否题「执行方是否自己用假麦克风走完了麦克风这一步、没写成人验项」；改前「否」、改后「是」才算过。决策发生在 Tofelair 仓库，跑时用 runner 的 `--repo` 指本机的 Tofelair 仓库；要开浏览器、起前后端，按大用例算 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 文档里写的做法本身要能跑：按『装与设置』的新命令重装 MCP 后，在 MCP 里跑一遍下面三条增量测试，贴结果 |

另有一条文档守卫：`runtime-skill-doc.test.mjs` 现在核 claude-desktop reference 里还有 `--headless --isolated` 等桌面端工具名，再加一项 `playwright-mcp.json`，防止装机命令被改回去。

- **seam**：两个。一是规则回放的那个决策点（执行方读到 browser 后交出的工单产物），抓得到「规则有没有改变执行方的选择」，抓不到做法能不能跑；二是 MCP 浏览器里的一页本地静态页，抓得到「能用 / 拒绝 / 喂音频」三件事在装好的 MCP 上是不是真的成立，抓不到真实项目页面的业务逻辑。
- **增量功能测试**（都在 MCP 浏览器里、本地静态页上量录到的音量）：
  - 授权 + `~/.idea-loop/fake-mic.wav` 放一句话 → 录到整句的起伏、放完静音，音轨名含「Fake」；覆盖：期望行为 1、2、3。
  - 不授权 → `NotAllowedError`；覆盖：期望行为 1。
  - 不重启，把文件换成另一段 → 下一次录音录到新的那段；覆盖：期望行为 3。
- **照着谁写**：回放用例照 `idea-loop/evals/retro/cases/` 里已有的；文档守卫照 `runtime-skill-doc.test.mjs` 现有的『装与设置』断言；量音量的页面照本次 `rms.html`。

## Out of scope

- 摄像头、屏幕共享：同一组假设备参数也管它们，但还没有真实流程碰到过。
- 几个会话同时用 MCP 喂不同的音频：见「实现决策」的已知限制。

## 关联

- #295（runtime 没有「本机覆盖」的落点）：相邻，不重叠。MCP 的配置文件是 idea-loop 装机的一部分、每台机器都一样，不是本机覆盖，跟 #295 无先后。
- #192（design-archive-sections-browser 测试在本机卡住）：同在浏览器这块，不重叠。
- 相关 spec、ADR：查过 `docs/spec/`、`docs/adr/`，没有浏览器或媒体设备的。
