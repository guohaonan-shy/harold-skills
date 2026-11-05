# UI flow：用 flow-compose.mjs 拼截图

**核心就是 UI 截图 + 截图之间的箭头 + 必要、简洁的文字**，问题、设计、交付都这样画。

## 构图规则

- **一个场景一张图。**
- **一行一步**：截图横排，箭头上写触发条件（「点播放」「下载失败」「5 秒后」），截图下写那一步的样子（一句）。
- **分支另起一行**，从分叉的那一步拐下来（比如「下载中」之后分成「下完自动播」和「下载失败」两行）。
- **同一规则的另一种形态**（不是从上一步流转过来的）不画箭头，在那一行上方标「同一规则 · ……」；并排对照（之前 / 之后，静止 / 悬停，宽 / 窄）也是这样一行。
- **红色光圈**圈出要看的位置：问题图里是出问题的地方，设计图里是改动的地方，交付图里是点击处、出错的那一步。
- 图下一两句话，补充截图里看不出来的规则（比如「后台预取失败只换按钮，不弹气泡」）。不写长段落。

## JSON

excalidrawer 没有图片节点，UI flow 只用这个脚本拼。输入是一份 JSON，描述一张图：

```json
{
  "title": "点一段还没下完的音频",
  "scale": 0.5,
  "rows": [
    {
      "steps": [
        { "image": "shots/idle.png", "caption": "可播放" },
        { "image": "shots/loading.png", "trigger": "点播放", "caption": "图标原位换成转圈",
          "circles": [{ "x": 40, "y": 40, "r": 36 }] },
        { "image": "shots/playing.png", "trigger": "下载完成", "caption": "自动开始播放" }
      ]
    },
    {
      "branchFrom": { "row": 0, "step": 1 },
      "steps": [
        { "image": "shots/failed.png", "trigger": "下载失败", "caption": "按钮换成重试，弹出说明气泡" }
      ]
    },
    {
      "label": "同一规则 · 后台预取失败",
      "connected": false,
      "steps": [{ "image": "shots/failed-bg.png", "caption": "只换按钮，不弹气泡" }]
    }
  ],
  "note": "每个失败只有一个可点的重试目标。"
}
```

- `image` 相对 JSON 文件所在目录；`scale` 是截图显示的缩放（2 倍像素密度的截图填 0.5）。
- `circles` 用截图的**原始像素坐标**（圆心 x、y，半径 r），脚本按 `scale` 换算。
- `trigger` 写在指向这一步的箭头上；一行的第一步没有箭头，除非这一行是分支（`branchFrom`），这时箭头从分叉的那一步拐下来。
- `connected: false` 的行不画箭头，必须带 `label`。
- `state`（可选，每一步一个）：这一步展示的设计档案状态名（如 `cookbook--search-loading`）。脚本把它印在截图下的小字里、写进 HTML 的 `data-state`，并在 PNG 旁多存一份同名的 `.states.json`（哪一行哪一步是哪个状态）。没有档案的项目、问题图不带。

## 运行

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-compose.mjs" flow.json out.png [--archive <仓库根> [--delta <spec-slug>]]
```

- 脚本先校验，不合规就退出码 2，逐条列出问题。
- 输出文件按 `flow-<n>-…` 起名时，脚本要求名字就是 `flow-<n>-<第一格的状态名>.png`，对不上退出码 2；别的名字不受限。带 `--archive <仓库根> --delta <spec-slug>` 时，还会核对每个 `state` 在档案（叠上这个需求的 `delta/`）里是否存在。
- 脚本生成一个自包含的 HTML（截图内联），用目标项目的 playwright 截成 PNG。目标项目解析不到 playwright 时，只写出 `out.html`，截图改用 Playwright MCP：它只开 http 地址，所以在 HTML 所在目录起一个静态服务器（`python3 -m http.server <port>`），打开 `http://127.0.0.1:<port>/out.html`，等 `document.body.dataset.ready === "1"`，对 `#flow` 截图，截完关掉服务器。MCP 只能往工作区里写文件，截图先存进工作区再挪到目标位置。
