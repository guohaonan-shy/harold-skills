# 录屏

## 什么时候选

- 一段多步流程要整体看（登录 → 选题 → 作答 → 提交 → 看结果），或者动图超 10MB、裁短又会丢掉要看的那段：录屏。
- 只讲一个动效的：仍用动图（`${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/gif.md`）。

## 1. 录

- **网页**：用 Playwright 起 chromium，context 开 `recordVideo`，`size` 跟 viewport 一致；页面和 context 关掉之后视频文件才写完整：

  ```js
  const context = await browser.newContext({
    viewport: { width: 800, height: 560 },
    recordVideo: { dir: 'raw', size: { width: 800, height: 560 } },
  });
  // 录前注入叠加层、拦截网络，然后按步骤操作
  await context.close(); // raw/ 里得到 webm
  ```

  叠加层（鼠标位置点，需要计时就加秒表）和慢下载、失败的造法跟动图一样，读 `gif.md` 的第 1 步。鼠标要先移到目标再点，圆点才看得出点的是哪；每一步之后停够 1 到 2 秒，让人看清页面变成了什么。
- **iOS 模拟器**：`xcrun simctl io <设备> recordVideo <名字>.mov`，结束时发 SIGINT（Ctrl-C）。模拟器录屏没有叠加层，开头那句说明里写明。

## 2. 转

ffmpeg 转 H.264 的 mp4，`-movflags +faststart` 让浏览器边下边播，`-pix_fmt yuv420p` 让所有浏览器都能播，`-an` 去掉空音轨：

```
ffmpeg -y -i raw/<录屏>.webm -vf "crop=<宽>:<高>:<x>:<y>,fps=24" -c:v libx264 -pix_fmt yuv420p -crf 28 -movflags +faststart -an <名字>.mp4
```

- **裁出要看的区域**：`crop` 只留组件和秒表所在的那块；缩小用 `scale=<宽>:-2`（高取偶数）。
- **控在 10MB 内**（上传命令的上限，同动图）：`ls -l` 看大小，超了先把 `-crf` 调到 30 到 34、降 `fps`、缩宽；还超就**分段**，用 `-ss <起点秒> -t <时长>` 切开，一段讲一步，文件名 `<名字>-1.mp4`、`<名字>-2.mp4`。
- 等待的那几秒可以加速：`setpts=PTS/<倍速>`，倍速写进开头那句说明。

## 3. 开头一句说明

一段录屏（或一组分段）前面写一句：它在讲哪条流程、有没有加速（几倍、加速了哪几秒）、叠了什么（鼠标位置点、角落秒表不属于产品）。

## 4. 放进 PR 和会话

- **PR 里**：用 `<video>` 内嵌，下一行放一个同地址的链接（播不了时点开下载）：

  ```markdown
  <video src="<地址>" controls></video>

  [登录到提交的完整流程（mp4）](<地址>)
  ```

  上传和地址的形状照调用方（`idea-loop:pr` 的交付证据参考）。
- **会话里**：用『发文件给人』发 mp4（`dyna runtime show 发文件给人`）。

## 已知限制

Playwright 和模拟器的录屏都不带声音。要听声音对不对的场景（比如音频自动播放），录屏证明不了，开头那句写明「录屏不含声音」，声音的证据用日志或接口响应。
