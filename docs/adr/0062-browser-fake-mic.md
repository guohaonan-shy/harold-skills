---
type: adr
status: 生效
tags: [idea-loop, browser, runtime, browser-fake-mic]
summary: 要麦克风的流程用 playwright-cli 命名会话加假麦克风自己点着走完，能测授权与拒绝，并往假麦克风喂指定音频
related: ["[[231]]", "[[0026-runtime]]"]
---

# ADR-0062 — 要麦克风的流程由 agent 点着走完，并往假麦克风里喂音频

> 由 spec `browser-fake-mic` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#231 之前，执行方碰到要麦克风的页面（录音、语音面试、「检查麦克风」）会把这一步写成人验项交给人手测。根源是两份浏览器文档（`idea-loop:browser`、`idea-loop:runtime` 的『浏览器』）都没写怎么办，执行方遇到默认精简版无头浏览器（chrome-headless-shell）调 `getUserMedia` 抛 `NotSupportedError`，就当成工具的极限。

2026-11-16 在本机（macOS，playwright-core 1.62.1）复测的几个事实：

- 精简版无头：`NotSupportedError`。完整 Chromium 加假设备参数且授权：拿到「Fake Default Audio Input」；不授权：`NotAllowedError`，正是「拒绝」该有的样子。加了 `--use-fake-ui-for-media-stream` 就无视权限直接放行，测不了「拒绝」。
- 桌面端用户级配的 Playwright MCP（Chrome 正式版 headless）一授权，拿到的是这台 Mac 的真麦克风（音轨名「Default - MacBook Pro Microphone (Built-in)」），因为 MCP 的启动参数里没有假设备。
- 往假麦克风喂音频，用 `--use-file-for-fake-audio-capture=<WAV>`：录到的是整句话的起伏；路径末尾加 `%noloop` 放完就静音；每次开始录音都重新读文件，换文件不用重启浏览器；没有文件就是静音。但同样的参数放进 MCP 的启动配置，录到的全是静音：MCP 默认开着 Chromium 沙箱，沙箱里的音频服务读不到文件，关沙箱（`chromiumSandbox: false`）就正常。

Harold 的目标（2026-11-16）：让 agent 通过点击测试麦克风权限，再把音频注入假麦克风，补上自动化测试最后一块。

## 2 决策（how）

- **麦克风流程走 `playwright-cli`（`@playwright/cli`，Playwright MCP 的命令行版）的命名会话，MCP 不动。** Harold 的理由：有沙箱、无沙箱都是正常需求，不同需求用不同命令起不同的浏览器实例。实测命名会话各带自己的 `--config` 可同时开着互不影响。放弃的两条路：关掉 MCP 的沙箱（MCP 还要打开外部网站，要沙箱）、自写 Playwright 脚本起浏览器（点不着走，也不覆盖喂音频）。
- **一个会话一份配置、一个音频文件**，放在 worktree 的 `.tmp/fake-mic/<会话名>/`（`config.json`、`mic.wav`），几个子代理可同时测、音频互不覆盖。配置：关沙箱、假设备参数、音频文件参数指向同目录 `mic.wav` 并带 `%noloop`。
- **授不授权决定走哪条路**：测「能用」用 `run-code` 的 `grantPermissions(['microphone'])`，测「拒绝」不授权（已授权的用 `clearPermissions()` 撤回），不加 `--use-fake-ui-for-media-stream`。
- **规则分两处写**：`idea-loop:browser` 在「进到对的状态」下加一条，只写能力、不写工具；具体命令和配置写在 runtime 的 claude-desktop reference。不改装机（`npx -y @playwright/cli` 不用预装）。精简版的 `NotSupportedError` 写成一句原因而非禁令，让碰到的 agent 认得它。音频怎么来不规定（16 位 PCM 的 WAV；没有样本用本机语音合成）。
- 取舍（没做）：magi 暂不需要（Harold 定）；其余浏览器活（截图、测量、复现、SEO 审计）不迁到命令行，要迁另开 issue；摄像头、屏幕共享还没有真实流程碰到；headless 下不画授权弹窗，授权只靠事先授不授权。
- **「规则有没有改变执行方的选择」没有验收。** 原定用 `idea-loop/evals/retro/` 回放验，做了、两次实跑都测不到这条规则：一次执行方用项目自带的假麦克风测试走完，一次两边都因缺 `DEVELOPMENT.md` 开工第一步就停。没有一个历史提交同时满足「已有 `DEVELOPMENT.md`」和「还没有自带假麦克风测试」。人 2026-11-22 定撤掉回放用例，以四项实测证明做法能跑；以后在别的项目碰到要麦克风的工单，再看执行方是否照做。

## 3 结果（result）

- `idea-loop/skills/engineering/browser/SKILL.md` 有麦克风那一条（「要麦克风的流程……带假麦克风的独立浏览器会话」）。
- 做法落点跟起草时不同：`idea-loop/skills/productivity/runtime/references/claude-desktop.md` 的『浏览器』下只留「要麦克风的流程」一小节作指针，步骤全在新拆出的 `idea-loop/skills/productivity/runtime/references/claude-desktop-mic.md`（会话命名、`config.json` 模板、命令、授权与撤回、音频、坑）。原因是开场注入的 reference 有字数上限。
- `idea-loop/skills/productivity/wiki-conventions/references/tmp-layout.md` 登记了 `fake-mic/<会话名>/` 这个中间产物目录。
- 合并在 PR #439（要麦克风的流程由 agent 点着走完，并往假麦克风里喂音频），#231 已关闭；决定记录 [[231]]；runtime 的整体结构见 [[0026-runtime]]。
- 守护：`idea-loop/scripts/runtime-skill-doc.test.mjs`（核『浏览器』提到 `@playwright/cli`、指向 `claude-desktop-mic.md`，且 magi 的 reference 没有这一节），本次对账 15 条全过。
