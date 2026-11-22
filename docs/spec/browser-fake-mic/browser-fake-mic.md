---
type: spec
tags: [idea-loop, browser]
summary: agent 在 playwright-cli 的独立会话里点着走完要麦克风的流程，授权与拒绝都能测，并往假麦克风里喂指定音频
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
| MCP 配置里再关掉 Chromium 沙箱（`chromiumSandbox: false`） | 授权后录到整句话、放完静音；换成「Hi」后不重启录到「Hi」；不授权得 `NotAllowedError`（证明是沙箱的原因；方案没走这条，见「实现决策」第一条） |

MCP 静音的原因：MCP 启动浏览器时默认打开 Chromium 沙箱，沙箱里的音频服务读不到这个文件，只剩静音。同一个 Chrome 用脚本起、沙箱开着时也是全静音，关掉就正常（`out6.txt`）。Playwright 自己起浏览器默认就不开沙箱，所以 ui-measure 这类自起的脚本不受影响。

复现材料：`.tmp/to-spec/browser-fake-mic/repro/` 下的 `t2.mjs`–`t8.mjs`、`mcp-drive.mjs` 与对应的 `out*.txt`

### 根因

- 问题 1：两份浏览器文档都没写麦克风流程怎么进到对的状态，执行方碰到精简版的 `NotSupportedError` 就把它当成工具的极限。
- 问题 2：MCP 浏览器的启动参数从来没考虑过媒体设备，没有假设备参数，授权后落到系统默认输入设备上。
- 问题 3：没有喂音频的约定（文件放哪、什么时候读），MCP 的沙箱又挡住了读文件；MCP 一个会话只有一个浏览器、启动参数在装机时写死，没法按需求换一个不同配置的实例。

## 方案

改完以后，执行方、审查方、分拣方碰到要麦克风的流程（录音、语音面试、「检查麦克风」这类页面），不用 MCP 浏览器，而是用 Playwright 官方命令行 `playwright-cli` 起一个**自己名字的浏览器会话**，带一份假麦克风配置，在里面一步步点着走：要测「能用」就先授权，要测「拒绝」就不授权；要测录音之后的环节，就先把一段说话声的 WAV 放到这个会话自己的音频文件位置，再点开始录音，页面录到的就是这段话。全程用假麦克风，结果是截图和断言写进文件，不写成人验项，也不会打开本机真麦克风。其余浏览器的活（截图、测量、复现、SEO 审计）照旧走 MCP，MCP 的沙箱、配置都不动。

![时序](assets/sequence-browser-fake-mic.png)

用户（执行方）得到的结果只由三样东西决定：授不授权（走「能用」还是「拒绝」），自己会话的音频文件位置上放的是哪段音频（录到什么；没放就是静音），以及点到哪一步。

`playwright-cli` 是 Playwright MCP 的命令行版：同一套命令（打开、快照、点击、`eval`、截图、`run-code`），从终端调；`-s=<名字>` 起一个有名字的浏览器会话，每个会话启动时带自己的 `--config`，几个会话同时开着互不干扰（本会话实测，见「实现决策」第一条）。不是新组件：它跟已在用的 Playwright MCP 同一个包家族，`npx -y @playwright/cli` 就能用，不用另装。

改动落在两处给 agent 读的文档：

- **`idea-loop:browser`**（不管哪个运行环境都读）：「进到对的状态」加一条，跟登录、慢网络并列，因为它也是把页面带到要测的状态（杠杆：就近归置）。写成正向的目标行为：要麦克风的流程在一个带假麦克风的独立浏览器会话里点着走完，「能用」先授权，「拒绝」不授权；要录到指定的话，先把音频放到『浏览器』写的位置，每开始一次录音就从头放一遍。只写能力，不写工具（AGENTS.md 的约定：skill 写能力名，具体工具在 runtime）。
- **runtime claude-desktop 的『浏览器』**：加一小节「要麦克风的流程」，写命令行会话怎么做：
  - 会话名取自己的名字（子代理用自己的任务名），文件放在 worktree 的 `.tmp/fake-mic/<会话名>/`（`idea-loop:wiki-conventions` 的「中间产物」）：`config.json` 和 `mic.wav`；命令在这个目录里跑，`playwright-cli` 写出的快照目录也落在这里。
  - `config.json` 的内容（给出模板）：关沙箱（`chromiumSandbox: false`）、假设备参数、音频文件参数指向同目录 `mic.wav` 的绝对路径并带 `%noloop`。
  - 起会话：`npx -y @playwright/cli -s=<会话名> open <url> --config config.json`；之后 `snapshot` 找按钮、`click`、`eval` 读结果、`screenshot`；收工 `close`。
  - 授权：`run-code "async page => { await page.context().grantPermissions(['microphone']) }"`；「拒绝」不授权，已授权的用 `clearPermissions()` 撤回。
  - 音频：16 位 PCM 的 WAV，覆盖 `mic.wav` 就换了，不用重启会话；没有文件就是静音。
  - 坑（环境里靠看找不到的）：MCP 浏览器开着沙箱，喂的音频全是静音；MCP 里授权拿到的是本机真麦克风，所以麦克风流程不走 MCP。精简版无头（chrome-headless-shell）调 `getUserMedia` 抛 `NotSupportedError`，是它不支持麦克风，不是麦克风测不了。

同一行为的其他入口：

- **纳入** `idea-loop:implementer` 的人验项判断：它在「每一格标『人看』的验收」那里决定什么交给人。它已经按 `idea-loop:browser` 用浏览器，browser 里写清了它就照做，implementer 本身不改。实现时核一遍它读到 browser 的路径还在。
- **纳入** 项目自己的端到端测试：规则只管 agent 怎么走，项目自己的 Playwright 测试要不要用同样的参数由项目定；reference 里的配置模板照抄即可。
- **排除** magi：Harold 2026-11-16 定的，「magi的浏览器暂时不需要这个需求」。magi 的 reference 不动。
- **排除** 其余浏览器活迁到命令行：MCP 照旧，见 Out of scope。
- **排除** 摄像头、屏幕共享：同一组假设备参数也管摄像头，但还没有真实流程碰到过。见 Out of scope。
- **排除** 无头浏览器里的系统授权弹窗：headless 下浏览器不画「允许使用麦克风」的弹窗，「点击授权」只能是点页面自己的按钮，授权结果由事先授不授权决定；这就是测「能用 / 拒绝」两条路的做法，不另找办法点弹窗。

## User Stories

只修问题，不另加能力：

1. 期望行为（问题 1）：执行方或审查方碰到要麦克风的流程，用假麦克风点着走完「能用」「拒绝」两条路，结果是截图和断言文件，不出现「麦克风无头测不了，交给人验」的人验项。
2. 期望行为（问题 2）：照 idea-loop 的浏览器文档走麦克风流程，任何一次 `getUserMedia` 拿到的都是假麦克风，不是本机真麦克风。
3. 期望行为（问题 3）：执行方把一段说话声的 WAV 放到自己会话的音频文件位置后点开始录音，页面录到的就是这段话、放完不循环；换一段音频不用重启浏览器；几个会话同时喂不同的音频互不影响。

## 实现决策

- **麦克风流程走 `playwright-cli` 的命名会话，MCP 不动**：依据是 Harold 2026-11-16 的原话：「考虑到有无沙箱对于我们来说都是正常的需求，自动化需求、验证真实浏览器问题我倾向是否可以用playwright命令行，这样不同需求我可以用不同的命令启动不同的浏览器实例」，以及随后的「用命令行会话」。本会话实测（2026-11-16，`@playwright/cli` 0.1.24，本地静态页上点「开始录音」录 3 秒、每 100ms 量一次音量）：

  | 会话 | 启动方式 | 点「开始录音」后 |
  |---|---|---|
  | `media` | 带假麦克风配置、授权 | 音轨「Fake Default Audio Input」，录到整句话的起伏，放完静音 |
  | `plain`，跟 `media` 同时开着 | 不带配置 | `NotAllowedError` |
  | `media`，不重启 | 覆盖音频文件成「Hi」再点 | 录到一声「Hi」，之后静音 |
  | `m2` | 带配置、不授权 → `run-code` 授权 → `clearPermissions` | `NotAllowedError` → 录到整句 → `NotAllowedError` |

  另一条路（关 MCP 的沙箱）被放弃：MCP 还要打开外部网站，有沙箱是正常需求。
- **一个会话一份配置、一个音频文件，放在 `.tmp/fake-mic/<会话名>/`**：每个会话的音频互不覆盖，几个子代理可以同时测麦克风；`.tmp/` 是 worktree 的中间产物位置，不进提交。依据：上表 `media`、`plain` 同时开着互不影响；`idea-loop:wiki-conventions` 的「中间产物」。
- **音频文件参数带 `%noloop`**：一段回答放完就静音，像人说完一句停下；要循环的流程很少，不为它留开关。依据：问题 3 表第三行。
- **规则写在 browser 的「进到对的状态」下，一条**；具体工具、路径、配置写在 runtime claude-desktop 的『浏览器』。依据：browser 现有结构、AGENTS.md「skill 写能力名」的约定、writing-for-agents 的「单一事实来源」。
- **「拒绝授权」只靠不授权**：不授权、不加 `--use-fake-ui-for-media-stream`，页面拿到 `NotAllowedError`。依据：问题 1 表第三、四行，上表 `m2`。
- **不预放音频文件**：没有文件时假麦克风是静音（问题 3 表第五行），对不需要声音的流程刚好合适。
- **音频怎么来不规定**：WAV、16 位 PCM 即可；项目有录好的样本就用样本，没有就用本机的语音合成生成（macOS 的 `say -o x.wav --data-format=LEI16@48000 "…"` 是一个例子，写进 reference 时标明是 macOS 的做法）。
- **不改装机**：`playwright-cli` 走 `npx -y @playwright/cli`，跟 MCP 一样不用预装；『装与设置』不加项。
- **精简版写成一句原因，不写成禁令**：写「精简版不支持麦克风，`getUserMedia` 会抛 `NotSupportedError`」，让碰到这个错误的 agent 认得它。依据：Tofelair#738 的执行方正是被这个错误误导的。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | 不做 | 原定用 `idea-loop/evals/retro/` 的回放验，做了、跑了两次都测不到这条规则，人 2026-11-22 定撤掉，见下面「已知限制」；规则能不能跑由上一行四项实测证明 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 文档里写的做法本身要能跑：照 reference 的新小节起命令行会话，跑一遍下面四条增量测试，贴结果 |

另有一条文档守卫：`runtime-skill-doc.test.mjs` 现在核 claude-desktop reference 里的桌面端工具名，再加一项 `@playwright/cli`，防止麦克风的做法被删掉或改回 MCP。

- **seam**：命令行会话里的一页本地静态页（一个「开始录音」按钮，录 3 秒、把音量包络写到页面上），抓得到「能用 / 拒绝 / 喂音频 / 并行」在本机是不是真的成立，抓不到真实项目页面的业务逻辑。
- **增量功能测试**（都在 `playwright-cli` 会话里、本地静态页上点「开始录音」）：
  - 授权 + 会话的 `mic.wav` 放一句话 → 录到整句的起伏、放完静音，音轨名含「Fake」；覆盖：期望行为 1、2、3。
  - 不授权 → `NotAllowedError`；覆盖：期望行为 1。
  - 不重启，覆盖 `mic.wav` 成另一段 → 下一次录音录到新的那段；覆盖：期望行为 3。
  - 两个会话同时开、各放不同的音频 → 各录到各自的；覆盖：期望行为 3。
- **照着谁写**：文档守卫照 `runtime-skill-doc.test.mjs` 现有的断言；测试页照本次 `click.html` / `rms.js`（`.tmp/to-spec/browser-fake-mic/repro/`）。
- **已知限制：「规则有没有改变执行方的选择」这次没有验收**。回放要一个历史输入，同时满足「项目已有 `DEVELOPMENT.md`，执行方才肯开工」和「项目还没有自带的假麦克风测试，规则才有用武之地」。Tofelair 的假麦克风端到端测试 2026-10-12 加入，`DEVELOPMENT.md` 2026-10-22 才加入，没有一个提交两条都满足。两次实跑：输入取工单 03（`15726d8e`）时，两边执行方都用项目自带的假麦克风测试走完，差别与规则无关（run `20261122T025744`）；输入取录音上传工单 08（`3290f759`）时，两边都因缺 `DEVELOPMENT.md` 开工第一步就停（run `20261122T045358`）。回放复制项目时也不带 `.env`，真实前后端起不稳。人 2026-11-22 定撤掉回放用例，以四项实测为证明；以后在别的项目碰到要麦克风的工单，再看执行方是否照做。

## Out of scope

- 摄像头、屏幕共享：同一组假设备参数也管它们，但还没有真实流程碰到过。
- 把截图、测量、复现、SEO 审计这些浏览器活也迁到命令行会话：这次只动麦克风流程；要不要整体迁，另开 issue 再议。
- magi：Harold 定的暂不需要。

## 关联

- #295（runtime 没有「本机覆盖」的落点）：相邻，不重叠。这次不改装机、不加本机配置，跟 #295 无先后。
- #192（design-archive-sections-browser 测试在本机卡住）：同在浏览器这块，不重叠。
- 相关 spec、ADR：查过 `docs/spec/`、`docs/adr/`，没有浏览器或媒体设备的。
