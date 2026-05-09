# harold-skills

Harold's personal collection of Claude Code skills, organized as a **Claude Code marketplace** of independently installable plugins.

## What's here

| Plugin | Purpose | Status |
|---|---|---|
| [`clinical-research/`](./clinical-research/) | 临床医学回顾性队列研究工作流（study-design / variable-coding / stat-analysis / paper-draft）| ✅ Ready |
| [`excalidrawer/`](./excalidrawer/) | Code-first Excalidraw 图表生成（flowchart / timeline / architecture / sequence）| ✅ Ready |

更多 plugin 会陆续迁过来。

## Install

```text
/plugin marketplace add guohaonan-shy/harold-skills    # 加入 marketplace
/plugin install <plugin-name>                          # 装某个 plugin
/reload-plugins                                        # 让 skill 生效
```

例如：

```text
/plugin install clinical-research    # 临床研究工作流（4 skill）
/plugin install excalidrawer         # 图表生成（4 skill：flowchart / timeline / architecture / sequence）
```

## Repository structure

```
harold-skills/
├── .claude-plugin/
│   └── marketplace.json     # marketplace metadata
├── CLAUDE.md                 # 仓库级维护约定
├── README.md                 # 本文件
└── <plugin-name>/            # 每个目录 = 一个 plugin
    ├── .claude-plugin/plugin.json
    ├── README.md
    ├── references/           # plugin 级共享（按需，如 conventions.md / cli-usage.md）
    └── skills/
        └── <skill-name>/
            ├── SKILL.md
            └── references/   # skill 自己的深度参考（按需，如 cases.md）
```

`references/` 灵活布局——只 plugin 级（excalidrawer 模式）或两级都有（clinical-research 模式），看内容是否需要 skill 特异性。

每个 plugin 独立可装。维护约定见 [CLAUDE.md](./CLAUDE.md)。

## License

MIT
