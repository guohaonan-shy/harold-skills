# CLI usage

底层 npm 包 `excalidrawer`（已发布到 npm registry）。当前 plugin 锁定 **`excalidrawer@^0.5.3`**——所有 skill 调用都带版本约束，老 npx 缓存不匹配会自动 fetch。

## 版本 pin 维护约定（写给 plugin 维护者）

每次 npm 包发版且包含 **user-visible 行为变化**（渲染默认值、新参数、新子命令等），同步操作：

1. 升 plugin 版本（`.claude-plugin/plugin.json` 的 `version`）
2. 把所有 SKILL.md 和本文件里的 `excalidrawer@^X.Y.Z` 改成新版本号
3. commit、走 marketplace 升级流程

**只是 npm 改 bug 修复 / 内部重构**（用户感知不到）→ 不需要升 plugin。

## 前置检查（每个会话首次用时）

```bash
npx excalidrawer@^0.5.3 --version
```

失败处理：
- 卡在 npx 下载提示（`Need to install the following packages: excalidrawer`）→ 直接 `y` 确认
- 离线环境 / npm registry 访问失败 → 提示用户 `npm install -g excalidrawer` 或检查代理

## 生成命令

```bash
npx excalidrawer@^0.5.3 generate \
  --type <type> \
  --input <data.json> \
  --output <out-prefix> \
  [--format excalidraw,svg,png] \
  [--seed 100000]
```

| flag | 短 | 说明 |
|---|---|---|
| `--type` | `-t` | `flowchart` / `timeline` / `architecture` / `sequence` |
| `--input` | `-i` | 输入 JSON 路径；省略时从 stdin 读 |
| `--output` | `-o` | 输出前缀（**不带后缀**），CLI 自动加 `.excalidraw` / `.svg` / `.png` |
| `--format` | `-f` | 逗号分隔，默认全输出三种 |
| `--seed` | `-s` | 整数，用于稳定 element ID（diff 友好） |

## 输出文件命名约定（跨 skill 一致）

skill 默认写到**用户当前工作目录**：

```
./<diagram-name>.excalidraw
./<diagram-name>.svg
./<diagram-name>.png
```

`<diagram-name>` 默认值：
- 若用户没指定 → 用图类型 + 关键词，如 `flowchart-form-submit` / `timeline-2026-roadmap`
- 用户提供主题词 → 优先用用户的词

不要写到 `outputs/<timestamp>/` 子目录——gstack 风格。

## 文件已存在时

如果 `./<name>.svg` 已存在：
1. 先读现有文件确认是不是用户上次产物
2. 用 AskUserQuestion 三选一：覆盖 / 改文件名（追加 `-v2`）/ 取消
3. 不要静默覆盖

## stdin 用法（少用，只在数据量很小或脚本化场景）

```bash
echo '{"title":"X","items":[...]}' | npx excalidrawer@^0.5.3 generate -t timeline -o ./out
```

skill 默认走 `--input <file>`：先 Write JSON 文件再调 CLI，便于排错和复用。

## --seed 推荐值

- `100000` for flowchart
- `200000` for timeline
- `300000` for architecture
- `400000` for sequence

不同图用不同 seed 避免 ID 冲突；同一图反复迭代用同一 seed，diff 才稳定。
