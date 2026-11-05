# 动图

1. **录**：Playwright 打开页面，注入一个叠加层（鼠标位置点，需要计时就加一个秒表），然后按步骤操作。节奏靠网络拦截控制：慢下载用 `page.route` 先等再 `continue`，失败用 `route.fulfill({ status: 500 })` 或 `route.abort()`。录法二选一：
   - **帧序列**：对组件循环截图，每张记下时间戳。截得到的就是看到的，最稳。**动效太快截不住时**（一张截图要几十毫秒，一个 200ms 的过渡只能截到几帧）：用 CDP 的 `Animation.setPlaybackRate`（如 0.1）把页面的动画放慢再截帧，帧率按放慢后的时长算，**在图说里写明放慢的倍率**（「10 倍慢放」），不要让人以为这是真实速度；正常与减少动效各录一个并排放时，两个用同一个倍率。
   - **录屏**：context 开 `recordVideo`，录完用 ffmpeg 裁出组件所在区域。帧序列截不住的快速过渡用这种。
2. **转**：ffmpeg 两遍调色板，控制体积：

   ```
   ffmpeg -y -framerate <帧率> -i frames/%04d.png -vf "fps=12,scale=<宽>:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" <名字>.gif
   ```

   帧率按时间戳算（帧数 ÷ 时长），这样「停留 5 秒」在动图里才是 5 秒。超过 10MB 就裁短、降到 8–10fps，或者缩小宽度。
3. **一个动图只讲一件事**：「气泡进场、停留 5 秒、退场」是一个，「悬停时暂停计时」是另一个。动效里有 `prefers-reduced-motion` 分支的，正常和减弱各录一个，并排放。
