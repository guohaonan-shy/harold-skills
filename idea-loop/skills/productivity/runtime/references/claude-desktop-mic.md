# 要麦克风的流程（claude-desktop）

[`claude-desktop.md`](claude-desktop.md) 『浏览器』的「要麦克风的流程」指到这里：开场注入的那份 reference 有字数上限，只放指针，步骤在这份。

录音、语音面试、「检查麦克风」这类页面不走 `mcp__playwright__browser_*`，用 `playwright-cli`（`@playwright/cli`，Playwright MCP 的命令行版，`npx -y @playwright/cli` 就能跑，不用装）起一个自己名字的命名会话，带假麦克风配置，在里面点着走。每个会话有自己的浏览器，几个会话同时开着互不干扰，也不用抢锁。

- **会话名**取自己的名字（子代理用自己的任务名）。文件放在 worktree 的 `.tmp/fake-mic/<会话名>/`（`idea-loop:wiki-conventions` 的「中间产物」）：`config.json` 和 `mic.wav`。下面的命令都在这个目录里跑，`playwright-cli` 写出的快照目录 `.playwright-cli/` 也落在这里。
- **`config.json`**，`<目录>` 换成上面那个目录的绝对路径：

  ```json
  {
    "browser": {
      "launchOptions": {
        "chromiumSandbox": false,
        "args": [
          "--use-fake-device-for-media-stream",
          "--use-file-for-fake-audio-capture=<目录>/mic.wav%noloop"
        ]
      }
    }
  }
  ```

  沙箱关着，假麦克风才读得到音频文件；`%noloop` 让一段音频放完就静音。「拒绝」只靠不授权来测，所以不加 `--use-fake-ui-for-media-stream`：它无视权限直接放行。
- **命令**（`S` 是会话名；`--raw` 只印值）：

  ```
  npx -y @playwright/cli -s=S open <url> --config config.json   # 起会话
  npx -y @playwright/cli -s=S snapshot                           # 找按钮，拿 ref
  npx -y @playwright/cli -s=S click <ref>                        # 点按钮
  npx -y @playwright/cli -s=S --raw eval "() => window.<变量>"    # 读页面上的结果
  npx -y @playwright/cli -s=S screenshot --filename=<路径>        # 截图
  npx -y @playwright/cli -s=S close                              # 收工
  ```
- **授权与撤回**：`run-code "async page => { await page.context().grantPermissions(['microphone']) }"` 授权；已授权的用 `clearPermissions()` 撤回（同一个写法，把 `grantPermissions([...])` 换成 `clearPermissions()`）。没授权的会话里 `getUserMedia` 得到 `NotAllowedError`，这就是「拒绝」该有的样子。
- **音频**：16 位 PCM 的 WAV，放在 `mic.wav`。每次开始录音浏览器都重新读这个文件，所以覆盖它就换了音频，不用重启会话；没有这个文件就是静音。项目有录好的样本就用样本；没有就用本机的语音合成生成，如 macOS 的做法 `say -o mic.wav --data-format=LEI16@48000 "<要说的话>"`。
- **坑**（靠看环境找不到的）：
  - MCP 浏览器开着 Chromium 沙箱，沙箱里的音频服务读不到音频文件，喂进去的全是静音。
  - 在 MCP 浏览器里授权麦克风，`getUserMedia` 拿到的是这台机器的真麦克风（它的启动参数里没有假设备），所以麦克风流程不走 MCP。
  - 精简版无头浏览器（chrome-headless-shell）调 `getUserMedia` 抛 `NotSupportedError`：是它不支持麦克风，不是麦克风测不了；换成上面的命名会话。
