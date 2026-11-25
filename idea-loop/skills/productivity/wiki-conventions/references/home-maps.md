# home 里的两份地图

home（`~/home`）里有两份给 agent 看的地图：设备地图写在 `~/home/AGENTS.md` 的 `## 设备地图` 一节，项目地图写在每个项目的 `~/home/projects/<名字>/AGENTS.md`。`/idea-loop:setup` 建 home、登记项目时起草第一版，`idea-loop:dreaming` 每周重写；两边用的是下面这同一份模板，各自不抄第二份。

## 设备地图模板

填进 `~/home/AGENTS.md` 的 `## 设备地图` 一节，≤ 2000 字。

```markdown
## 设备地图

回答关于过去决定或项目事实的问题前，先按地图去查。

home 里每一层放什么：

- `AGENTS.md`（本文件）：设备地图、项目清单，以及人写的跨项目规矩。
- `memory/`：跨项目的记忆，`memory/MEMORY.md` 是它的索引。
- `projects/<名字>/`：`AGENTS.md` 是这个项目的项目地图，指出它的知识放在哪几层（会话开在已登记项目里时已经注入）；`memory/MEMORY.md` 是这个项目自己的记忆索引。
- `runtime/`：这台设备的运行环境说明，`<运行环境>.md` 一份，`selected` 写默认用哪个；开场已注入当前环境的做法，`dyna runtime show` 取到的是同一份，不用另读。
- `.backup/`：setup 改用户级配置前的备份，不进 git，不用读。

什么问题去哪查：

- 项目事实、过去的决定：在 `## 项目` 里找到项目，读它的项目地图，再去地图指的那几层。
- 跨项目的规矩和偏好：先读记忆索引，按行取对应的记忆文件。
- `docs/raw/`（原始讨论和决定记录）：不每轮读，上面几层查不到才 grep。
```

## 项目地图模板

写成 `~/home/projects/<名字>/AGENTS.md`，≤ 2000 字：几层、每层放什么、什么问题去哪查。层只写项目实际有的。

```markdown
# <名字> 项目地图

<是什么，一句>。代码仓库：<本地路径>。

## 几层

- 记忆索引：`~/home/projects/<名字>/memory/MEMORY.md`，这个项目自己的记忆。
- spec（每个需求的方案与 User Stories）：`~/home/projects/<名字>/docs/spec/`
- 决策记录（为什么这样定）：`~/home/projects/<名字>/docs/adr/`
- 设计档案（页面与状态现在长什么样）：`~/home/projects/<名字>/docs/design/prod/`
- 领域文档：`~/home/projects/<名字>/docs/domain/`
- 原始记录（讨论与决定的原话）：`~/home/projects/<名字>/docs/raw/`，不每轮读。

## 什么问题去哪查

- 「为什么这样做」「过去怎么决定的」：先读决策记录和 spec，查不到再 grep 原始记录。
- 「某个页面现在长什么样」：设计档案。
- 「这个词指什么」：领域文档。
- 「我之前跟你说过什么偏好」：记忆索引。
```
