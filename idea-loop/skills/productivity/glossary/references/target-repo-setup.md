# 在项目里接上术语表

项目第一次有 `GLOSSARY.md`（建在项目目录里）、或人要求接入时用这份。

## 读取规则

读取规则靠两处，都不手写进代码仓库的 `AGENTS.md`：`GLOSSARY.md` 在项目目录里，代码仓库里的相对链接指不到它。

- 项目地图（项目目录的 `AGENTS.md`，会话开场注入）列出 `GLOSSARY.md`；地图由 dreaming 每周重写，不往里手加规则。
- 产出命名的地方，各 skill 和 agent 按本 skill 的「读」去项目目录读它。

## 手改之后的检查

格式检查由 plugin 的 PostToolUse hook 跑，只管 agent 的写入：每次 Write / Edit 落到名为 `GLOSSARY.md` 的文件，不论它在哪个目录，都会自动查，违规当场改到通过。人手改、别的工具改的，没有代码仓库的 CI 能挡（文件不在那里）：这样的改动在下一次 agent 往这份文件写入时被查出。
